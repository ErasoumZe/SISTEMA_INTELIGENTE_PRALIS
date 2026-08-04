import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { diaNegocio } from "@padaria/shared/datas";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

// Ciclo de vida R7/R10 (Fase 1) — matriz de permissoes ENFORCAVEIS hoje sobre despesas (as mesmas
// regras valem para mercadorias/retiradas). Domínios sem dataPagamento (transferencia) e as acoes
// sem rota (efetuar/conferir/excluir) ficam para o M3 e nao entram na matriz.
//
// caixaCiclo: opera caixa, lanca/edita despesa — NAO paga, NAO ve/edita pago.
// financeiroCiclo: opera caixa + ciclo de pagamento completo (pagar + *_dpago + visualizar_dpago).
// R-129: data de pagamento nao pode ser retroativa. Esta matriz e sobre PERMISSAO — a data so
// precisa ser aceitavel para o teste chegar ao gate que ele quer medir. A unica data literal que
// sobra e a do lancamento marcado como pago DIRETO NO BANCO: ali a edicao repete a mesma data, que
// e o caso que a R-129 libera de proposito (editar registro antigo sem mexer no pagamento).
const PAGO_EM = diaNegocio(new Date());

describe("permissoes - ciclo de vida do lancamento (pagar / D-Pago / visualizar_dpago)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieCaixa: string;
  let cookieFinanceiro: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    cookieCaixa = await cookieSessao(contexto.app, "caixaCiclo");
    cookieFinanceiro = await cookieSessao(contexto.app, "financeiroCiclo");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  const empresaId = idsTeste.empresaA;

  async function usuarioId(email: string) {
    const usuario = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [email]);
    if (!usuario) throw new Error(`Usuario nao encontrado: ${email}`);
    return usuario.id;
  }

  function post(cookie: string, url: string, payload: object) {
    return contexto.app.inject({ method: "POST", url, headers: { cookie }, payload });
  }

  function put(cookie: string, url: string, payload: object) {
    return contexto.app.inject({ method: "PUT", url, headers: { cookie }, payload });
  }

  async function criarComoAdmin(url: string, payload: object) {
    const resposta = await post(cookieAdmin, url, payload);
    expect(resposta.statusCode, `${url} -> ${resposta.body}`).toBe(201);
    return json<{ data: { id: string } }>(resposta).data.id;
  }

  // Abre um caixa proprio (conta + PDV frescos, criados pelo admin) para o usuario do cookie operar.
  async function abrirCaixa(cookie: string, email: string, nome: string, dataHora: string) {
    const contaId = await criarComoAdmin("/api/contas", { empresaId, nome: `Conta ${nome}` });
    const pdvId = await criarComoAdmin("/api/pdvs", { empresaId, nome: `PDV ${nome}`, contaId, ativo: true });
    const abrir = await post(cookie, "/api/caixa/abrir", {
      empresaId,
      pdvId,
      usuarioCaixaId: await usuarioId(email),
      dataHoraAbertura: dataHora
    });
    expect(abrir.statusCode, abrir.body).toBe(201);
    return { contaId, caixaId: json<{ data: { id: string } }>(abrir).data.id };
  }

  function despesaPayload(contaId: string, extra: Record<string, unknown> = {}) {
    return {
      empresaId,
      dataReferencia: "2026-05-01",
      dataVencimento: "2026-05-10",
      descricao: "Despesa ciclo",
      valorOriginal: 30,
      contaOrigemId: contaId,
      grupoDespesaId: idsTeste.grupoDespesaOperacional,
      itensDespesa: [],
      ...extra
    };
  }

  it("Caixa (sem pagar): cria despesa NAO paga (201), mas definir dataPagamento da 403", async () => {
    const { contaId } = await abrirCaixa(
      cookieCaixa,
      usuariosTeste.caixaCiclo.email,
      "caixa-pagar",
      "2026-05-01T08:00"
    );

    const semPagamento = await post(
      cookieCaixa,
      "/api/despesas",
      despesaPayload(contaId, { descricao: "Sem pagamento" })
    );
    expect(semPagamento.statusCode, semPagamento.body).toBe(201);

    const comPagamento = await post(
      cookieCaixa,
      "/api/despesas",
      despesaPayload(contaId, { descricao: "Tentando pagar", dataPagamento: PAGO_EM })
    );
    assertProblem(comPagamento, 403, "INSUFFICIENT_PERMISSION");
    expect(comPagamento.body).toContain("despesas_pagar");
  });

  it("Financeiro (com pagar): cria despesa JA paga (201) e a dataPagamento persiste", async () => {
    const { contaId } = await abrirCaixa(
      cookieFinanceiro,
      usuariosTeste.financeiroCiclo.email,
      "fin-pagar",
      "2026-05-02T08:00"
    );
    const resposta = await post(
      cookieFinanceiro,
      "/api/despesas",
      despesaPayload(contaId, { descricao: "Despesa paga", dataPagamento: PAGO_EM })
    );
    expect(resposta.statusCode, resposta.body).toBe(201);
    const id = json<{ data: { id: string } }>(resposta).data.id;
    const linha = await consultarUm<{ data_pagamento: string }>(
      "select to_char(data_pagamento, 'YYYY-MM-DD') as data_pagamento from despesas where id = $1",
      [id]
    );
    expect(linha?.data_pagamento).toBe(PAGO_EM);
  });

  it("Editar lancamento JA PAGO: 403 sem *_editar_dpago (Caixa) / 200 com (Financeiro)", async () => {
    // Caixa: cria NAO paga, marcamos como paga no banco, e a edicao cai no gate _dpago (403).
    const caixa = await abrirCaixa(cookieCaixa, usuariosTeste.caixaCiclo.email, "caixa-dpago", "2026-05-03T08:00");
    const criada = await post(cookieCaixa, "/api/despesas", despesaPayload(caixa.contaId, { descricao: "Vira paga" }));
    expect(criada.statusCode, criada.body).toBe(201);
    const idCaixa = json<{ data: { id: string } }>(criada).data.id;
    await executarSql("update despesas set data_pagamento = '2026-05-03' where id = $1", [idCaixa]);

    const edicaoCaixa = await put(
      cookieCaixa,
      `/api/despesas/${idCaixa}`,
      despesaPayload(caixa.contaId, { descricao: "Editando pago", dataPagamento: "2026-05-03" })
    );
    assertProblem(edicaoCaixa, 403, "INSUFFICIENT_PERMISSION");
    expect(edicaoCaixa.body).toContain("despesas_editar_dpago");

    // Financeiro: cria JA paga e edita mantendo a dataPagamento -> passa pelo gate _dpago (200).
    const fin = await abrirCaixa(
      cookieFinanceiro,
      usuariosTeste.financeiroCiclo.email,
      "fin-dpago",
      "2026-05-04T08:00"
    );
    const criadaFin = await post(
      cookieFinanceiro,
      "/api/despesas",
      despesaPayload(fin.contaId, { descricao: "Paga editavel", dataPagamento: PAGO_EM })
    );
    expect(criadaFin.statusCode, criadaFin.body).toBe(201);
    const idFin = json<{ data: { id: string } }>(criadaFin).data.id;
    const edicaoFin = await put(
      cookieFinanceiro,
      `/api/despesas/${idFin}`,
      despesaPayload(fin.contaId, { descricao: "Pago editado", dataPagamento: PAGO_EM })
    );
    assertOk(edicaoFin);
  });

  it("Listagem: sem *_visualizar_dpago nao traz pagos (Caixa); com, traz (Financeiro)", async () => {
    // Caixa cria duas despesas; uma vira paga no banco. A listagem do Caixa esconde a paga.
    const caixa = await abrirCaixa(cookieCaixa, usuariosTeste.caixaCiclo.email, "caixa-lista", "2026-05-05T08:00");
    const naoPaga = await post(
      cookieCaixa,
      "/api/despesas",
      despesaPayload(caixa.contaId, { descricao: "LISTA-NAO-PAGA" })
    );
    const paga = await post(cookieCaixa, "/api/despesas", despesaPayload(caixa.contaId, { descricao: "LISTA-PAGA" }));
    expect(naoPaga.statusCode, naoPaga.body).toBe(201);
    expect(paga.statusCode, paga.body).toBe(201);
    await executarSql("update despesas set data_pagamento = '2026-05-05' where id = $1", [
      json<{ data: { id: string } }>(paga).data.id
    ]);

    const listaCaixa = await contexto.app.inject({
      method: "GET",
      url: `/api/despesas?empresaId=${empresaId}`,
      headers: { cookie: cookieCaixa }
    });
    assertOk(listaCaixa);
    const corpoCaixa = JSON.stringify(listaCaixa.json());
    expect(corpoCaixa).toContain("LISTA-NAO-PAGA");
    expect(corpoCaixa).not.toContain("LISTA-PAGA"); // paga escondida (sem visualizar_dpago)

    // Financeiro (tem visualizar_dpago) enxerga a paga que ele mesmo lancou.
    const fin = await abrirCaixa(
      cookieFinanceiro,
      usuariosTeste.financeiroCiclo.email,
      "fin-lista",
      "2026-05-06T08:00"
    );
    const pagaFin = await post(
      cookieFinanceiro,
      "/api/despesas",
      despesaPayload(fin.contaId, { descricao: "LISTA-FIN-PAGA", dataPagamento: PAGO_EM })
    );
    expect(pagaFin.statusCode, pagaFin.body).toBe(201);
    const listaFin = await contexto.app.inject({
      method: "GET",
      url: `/api/despesas?empresaId=${empresaId}`,
      headers: { cookie: cookieFinanceiro }
    });
    assertOk(listaFin);
    expect(JSON.stringify(listaFin.json())).toContain("LISTA-FIN-PAGA");
  });
});
