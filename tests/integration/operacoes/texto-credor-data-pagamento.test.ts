import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { diaNegocio, somarDias } from "@padaria/shared/datas";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

const HOJE = diaNegocio(new Date());
const ONTEM = somarDias(HOJE, -1);
const AMANHA = somarDias(HOJE, 1);

type Detalhe = { descricao: string | null; observacao: string | null; credorTipo: string | null };

describe("R-127 / R-128 / R-129 no lancamento", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto?.fechar();
  });

  async function criarDespesa(payload: Record<string, unknown>) {
    return contexto.app.inject({
      method: "POST",
      url: "/api/despesas",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: HOJE,
        dataVencimento: HOJE,
        valorOriginal: 30,
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        contaOrigemId: idsTeste.contaBanco,
        ...payload
      }
    });
  }

  async function detalheDespesa(id: string) {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/despesas/${id}`,
      headers: { cookie: cookieAdmin }
    });
    expect(resposta.statusCode, resposta.body).toBe(200);
    return json<{ data: Detalhe }>(resposta).data;
  }

  // --- R-127: o texto do movimento e a OBSERVACAO -------------------------------------------------
  it("grava a observacao e devolve o mesmo texto no detalhe", async () => {
    const criada = await criarDespesa({ observacao: "Farinha e fermento" });
    expect(criada.statusCode, criada.body).toBe(201);
    const id = json<{ data: { id: string } }>(criada).data.id;

    const detalhe = await detalheDespesa(id);
    expect(detalhe.observacao).toBe("Farinha e fermento");
    // O detalhe monta `descricao` a partir do texto do movimento (coalesce) — a tela antiga que le
    // esse campo continua mostrando a frase certa em vez de ficar vazia.
    expect(detalhe.descricao).toBe("Farinha e fermento");
  });

  it("aceita chamada antiga (so descricao) e guarda o texto em observacao", async () => {
    const criada = await criarDespesa({ descricao: "Chamada antiga" });
    expect(criada.statusCode, criada.body).toBe(201);
    const id = json<{ data: { id: string } }>(criada).data.id;

    expect((await detalheDespesa(id)).observacao).toBe("Chamada antiga");
  });

  it("recusa o lancamento sem texto nenhum", async () => {
    const criada = await criarDespesa({ observacao: "   " });
    expect(criada.statusCode).toBe(400);
  });

  it("nao sobra despesa com texto so na descricao (o backfill da 0027)", async () => {
    const linha = await consultarUm<{ total: string }>(
      `select count(*)::text as total from despesas where observacao is null and descricao is not null`
    );
    expect(linha?.total).toBe("0");
  });

  it("a listagem mostra o texto do movimento", async () => {
    const criada = await criarDespesa({ observacao: "Aparece na lista" });
    const id = json<{ data: { id: string } }>(criada).data.id;
    const lista = await contexto.app.inject({
      method: "GET",
      url: `/api/despesas?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    expect(lista.statusCode, lista.body).toBe(200);
    const itens = json<{ data: { id: string; descricao: string }[] }>(lista).data;
    expect(itens.find((item) => item.id === id)?.descricao).toBe("Aparece na lista");
  });

  // Grupo e itens deixaram de ser exigidos em 04/08/2026: o campo Grupo saiu do modal de despesa e
  // mercadoria (vive so na discriminacao) e discriminar continua OPCIONAL. Antes o servidor recusava
  // com "Grupo ou itens da despesa obrigatorios" — o que, sem o campo na tela, deixaria o lancamento
  // simples impossivel. Este teste guarda a decisao contra um "conserto" futuro da validacao.
  it("despesa salva sem grupo e sem itens", async () => {
    const semGrupo = await contexto.app.inject({
      method: "POST",
      url: "/api/despesas",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: HOJE,
        dataVencimento: HOJE,
        observacao: "Despesa simples, sem classificacao",
        valorOriginal: 30,
        contaOrigemId: idsTeste.contaBanco
      }
    });
    expect(semGrupo.statusCode, semGrupo.body).toBe(201);
  });

  it("mercadoria salva sem grupo e sem itens (fornecedor continua obrigatorio)", async () => {
    const semGrupo = await contexto.app.inject({
      method: "POST",
      url: "/api/mercadorias",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: HOJE,
        dataVencimento: HOJE,
        observacao: "Mercadoria simples, sem classificacao",
        valorOriginal: 40,
        fornecedorId: idsTeste.fornecedor,
        contaOrigemId: idsTeste.contaBanco
      }
    });
    expect(semGrupo.statusCode, semGrupo.body).toBe(201);
  });

  // A transferencia entrou na R-127 junto com as tres saidas: o contrato dela tambem afrouxou
  // `descricao`, entao e o servidor que precisa exigir o texto — senao passaria movimento sem frase
  // nenhuma, que e o contrario do que a regra pediu.
  it("transferencia sem texto nenhum e recusada", async () => {
    const semTexto = await contexto.app.inject({
      method: "POST",
      url: "/api/transferencias",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: HOJE,
        valorOriginal: 10,
        contaOrigemId: idsTeste.contaCaixa,
        contaDestinoId: idsTeste.contaBanco,
        nLacreDoc: "LACRE-R127-VAZIO"
      }
    });
    expect(semTexto.statusCode, semTexto.body).toBe(400);
  });

  // --- R-128: credor da retirada e fornecedor ou socio/gestor -------------------------------------
  it("cria retirada para FORNECEDOR e devolve o credor no detalhe", async () => {
    const criada = await contexto.app.inject({
      method: "POST",
      url: "/api/retiradas",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: HOJE,
        dataVencimento: HOJE,
        observacao: "Retirada para fornecedor",
        valorOriginal: 40,
        fornecedorId: idsTeste.fornecedor,
        contaOrigemId: idsTeste.contaBanco,
        grupoRetiradaId: idsTeste.grupoRetiradaSangria
      }
    });
    expect(criada.statusCode, criada.body).toBe(201);
    const id = json<{ data: { id: string } }>(criada).data.id;

    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/retiradas/${id}`,
      headers: { cookie: cookieAdmin }
    });
    expect(detalhe.statusCode, detalhe.body).toBe(200);
    const dados = json<{ data: Detalhe & { fornecedorId: string | null } }>(detalhe).data;
    expect(dados.fornecedorId).toBe(idsTeste.fornecedor);
    expect(dados.credorTipo).toBe("fornecedor");
  });

  // O historico e o ponto sensivel da R-128: retirada gravada com colaborador nao pode virar linha
  // sem credor na tela so porque o leque de opcoes mudou.
  it("retirada ANTIGA com colaborador continua legivel e ainda salva", async () => {
    // Criada pelo MESMO caminho que um cliente antigo usaria (payload com colaboradorId): o servidor
    // continua aceitando, senao a retirada historica nao teria como ser salva de novo.
    const criada = await contexto.app.inject({
      method: "POST",
      url: "/api/retiradas",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: HOJE,
        dataVencimento: HOJE,
        descricao: "Retirada historica",
        valorOriginal: 25,
        colaboradorId: idsTeste.colaboradorCaixa,
        contaOrigemId: idsTeste.contaCaixa,
        grupoRetiradaId: idsTeste.grupoRetiradaSangria
      }
    });
    expect(criada.statusCode, criada.body).toBe(201);
    const id = json<{ data: { id: string } }>(criada).data.id;

    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/retiradas/${id}`,
      headers: { cookie: cookieAdmin }
    });
    expect(detalhe.statusCode, detalhe.body).toBe(200);
    const dados = json<{ data: Detalhe & { colaboradorId: string | null } }>(detalhe).data;
    expect(dados.colaboradorId).toBe(idsTeste.colaboradorCaixa);
    expect(dados.credorTipo).toBe("colaborador");
    expect(dados.descricao).toBe("Retirada historica");

    // Reabrir e salvar sem trocar o credor tem de continuar valendo: o CHECK do banco aceita o tipo
    // legado e o servidor nao converte o registro por conta propria.
    const salva = await contexto.app.inject({
      method: "PUT",
      url: `/api/retiradas/${id}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: HOJE,
        dataVencimento: HOJE,
        observacao: "Retirada historica corrigida",
        valorOriginal: 26,
        colaboradorId: idsTeste.colaboradorCaixa,
        contaOrigemId: idsTeste.contaCaixa,
        grupoRetiradaId: idsTeste.grupoRetiradaSangria
      }
    });
    expect(salva.statusCode, salva.body).toBe(200);

    const depois = await consultarUm<{ colaborador_id: string | null; credor_tipo: string | null }>(
      `select colaborador_id, credor_tipo from retiradas where id = $1`,
      [id]
    );
    expect(depois?.colaborador_id).toBe(idsTeste.colaboradorCaixa);
    expect(depois?.credor_tipo).toBe("colaborador");

    // E a retirada de ANTES da 0028, que nem credor_tipo tinha: o CHECK novo e tolerante a tipo
    // nulo e o detalhe continua entregando o colaborador. Sem isso a linha viraria "sem credor".
    await executarSql(`update retiradas set credor_tipo = null where id = $1`, [id]);
    const semTipo = await contexto.app.inject({
      method: "GET",
      url: `/api/retiradas/${id}`,
      headers: { cookie: cookieAdmin }
    });
    expect(semTipo.statusCode, semTipo.body).toBe(200);
    expect(json<{ data: { colaboradorId: string | null } }>(semTipo).data.colaboradorId).toBe(
      idsTeste.colaboradorCaixa
    );
  });

  it("recusa retirada com dois credores", async () => {
    const criada = await contexto.app.inject({
      method: "POST",
      url: "/api/retiradas",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: HOJE,
        dataVencimento: HOJE,
        observacao: "Dois credores",
        valorOriginal: 10,
        fornecedorId: idsTeste.fornecedor,
        colaboradorId: idsTeste.colaboradorCaixa,
        contaOrigemId: idsTeste.contaBanco,
        grupoRetiradaId: idsTeste.grupoRetiradaSangria
      }
    });
    expect(criada.statusCode).toBe(400);
  });

  // --- R-129: data de pagamento nao pode ser retroativa -------------------------------------------
  it("recusa criacao com data de pagamento de ontem", async () => {
    const criada = await criarDespesa({ observacao: "Pagamento retroativo", dataPagamento: ONTEM });
    expect(criada.statusCode, criada.body).toBe(400);
    expect(criada.body).toMatch(/anterior a hoje/i);
  });

  it("aceita hoje e o futuro", async () => {
    const hoje = await criarDespesa({ observacao: "Pago hoje", dataPagamento: HOJE });
    expect(hoje.statusCode, hoje.body).toBe(201);
    const amanha = await criarDespesa({ observacao: "Pago amanha", dataPagamento: AMANHA });
    expect(amanha.statusCode, amanha.body).toBe(201);
  });

  it("deixa editar lancamento antigo sem tocar na data de pagamento, e barra a troca por outra retroativa", async () => {
    // Nasce valida (paga hoje) e o tempo passa: o UPDATE direto empurra a data para ontem sem
    // recriar o registro por fora do fluxo — e essa despesa que a regra nova nao pode travar.
    const criada = await criarDespesa({ observacao: "Despesa paga ontem", dataPagamento: HOJE });
    expect(criada.statusCode, criada.body).toBe(201);
    const id = json<{ data: { id: string } }>(criada).data.id;
    await executarSql(`update despesas set data_pagamento = $2 where id = $1`, [id, ONTEM]);

    const corpo = {
      empresaId: idsTeste.empresaA,
      dataReferencia: HOJE,
      dataVencimento: HOJE,
      valorOriginal: 16,
      grupoDespesaId: idsTeste.grupoDespesaOperacional,
      contaOrigemId: idsTeste.contaBanco
    };

    const mesmaData = await contexto.app.inject({
      method: "PUT",
      url: `/api/despesas/${id}`,
      headers: { cookie: cookieAdmin },
      payload: { ...corpo, observacao: "Corrigindo o valor", dataPagamento: ONTEM }
    });
    expect(mesmaData.statusCode, mesmaData.body).toBe(200);

    const outraRetroativa = await contexto.app.inject({
      method: "PUT",
      url: `/api/despesas/${id}`,
      headers: { cookie: cookieAdmin },
      payload: { ...corpo, observacao: "Voltando mais ainda", dataPagamento: somarDias(HOJE, -3) }
    });
    expect(outraRetroativa.statusCode, outraRetroativa.body).toBe(400);
  });
});
