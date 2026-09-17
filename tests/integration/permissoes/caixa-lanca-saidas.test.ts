import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

// R-121/R-122/R-123 — "Operador de caixa deve ter permissao de lancar todas as saidas, desde que
// saia da conta do caixa aberto" (Jose, 01/08/2026).
//
// O buraco que isto fecha: o total do caixa soma despesa/mercadoria/retirada por `caixa_id` e
// IGNORA a conta; o saldo da conta soma por `conta_origem_id` e IGNORA o caixa. Sem amarrar os
// dois, uma despesa lancada dentro do caixa apontando outra conta debita as DUAS coisas ao mesmo
// tempo — divergencia silenciosa que volta como quebra de caixa falsa no operador (R-015).
describe("R-121 - operador de caixa lanca saidas amarradas a conta do PDV", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieCaixa: string;
  let caixaId = "";
  let contaDoPdv = "";
  const hoje = "2026-08-01";

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    [cookieAdmin, cookieCaixa] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "caixa")
    ]);
    const usuario = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
      usuariosTeste.caixa.email
    ]);
    if (!usuario) throw new Error("Usuario caixa nao encontrado");

    // Conta + PDV proprios: o pdvA do seed ja tem caixa e o periodo colidiria.
    const conta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: cookieAdmin },
      // R-165: fundo para as saidas da R-121; o que o arquivo prova e o AMARRE a conta do PDV.
      payload: { empresaId: idsTeste.empresaA, nome: "Conta R-121", saldoInicial: 100_000 }
    });
    expect(conta.statusCode, conta.body).toBe(201);
    contaDoPdv = json<{ data: { id: string } }>(conta).data.id;
    const pdv = await contexto.app.inject({
      method: "POST",
      url: "/api/pdvs",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "PDV R-121", contaId: contaDoPdv, ativo: true }
    });
    expect(pdv.statusCode, pdv.body).toBe(201);

    const abertura = await contexto.app.inject({
      method: "POST",
      url: "/api/caixa/abrir",
      headers: { cookie: cookieCaixa },
      payload: {
        empresaId: idsTeste.empresaA,
        pdvId: json<{ data: { id: string } }>(pdv).data.id,
        usuarioCaixaId: usuario.id,
        dataHoraAbertura: "2026-07-31T08:00"
      }
    });
    expect(abertura.statusCode, abertura.body).toBe(201);
    caixaId = json<{ data: { id: string } }>(abertura).data.id;
  }, 120_000);

  afterAll(async () => contexto.fechar());

  function post(cookie: string, url: string, payload: object) {
    const corpo = url.endsWith("/fechar") ? { lacreFechamento: `FCH-SAIDAS-${url}`, ...payload } : payload;
    return contexto.app.inject({ method: "POST", url, headers: { cookie }, payload: corpo });
  }
  function put(cookie: string, url: string, payload: object) {
    return contexto.app.inject({ method: "PUT", url, headers: { cookie }, payload });
  }

  const despesaBase = (extras: Record<string, unknown> = {}) => ({
    empresaId: idsTeste.empresaA,
    dataReferencia: hoje,
    dataVencimento: hoje,
    descricao: "Despesa do operador",
    valorOriginal: 10,
    grupoDespesaId: idsTeste.grupoDespesaOperacional,
    ...extras
  });

  // --- criacao das TRES saidas com a conta certa --------------------------------------------
  it.each([
    ["despesa", "/api/despesas", { grupoDespesaId: idsTeste.grupoDespesaOperacional }],
    [
      "mercadoria",
      "/api/mercadorias",
      { grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos, fornecedorId: idsTeste.fornecedor }
    ],
    [
      "retirada",
      "/api/retiradas",
      // R-128: retirada NOVA e de fornecedor ou socio/gestor. Usar colaborador aqui transformaria o
      // caminho que a regra proibe em contrato de teste.
      { grupoRetiradaId: idsTeste.grupoRetiradaSangria, fornecedorId: idsTeste.fornecedor }
    ]
  ] as const)("Deve_Criar_Quando_OperadorUsaAContaDoPdv (%s)", async (_nome, rota, grupo) => {
    const resposta = await post(cookieCaixa, rota, {
      empresaId: idsTeste.empresaA,
      dataReferencia: hoje,
      dataVencimento: hoje,
      descricao: `Saida do operador em ${rota}`,
      valorOriginal: 10,
      contaOrigemId: contaDoPdv,
      ...grupo
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
  });

  it.each([
    ["despesa", "/api/despesas", { grupoDespesaId: idsTeste.grupoDespesaOperacional }],
    [
      "mercadoria",
      "/api/mercadorias",
      { grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos, fornecedorId: idsTeste.fornecedor }
    ],
    [
      "retirada",
      "/api/retiradas",
      // R-128: retirada NOVA e de fornecedor ou socio/gestor. Usar colaborador aqui transformaria o
      // caminho que a regra proibe em contrato de teste.
      { grupoRetiradaId: idsTeste.grupoRetiradaSangria, fornecedorId: idsTeste.fornecedor }
    ]
  ] as const)("Deve_Retornar400_Quando_OperadorUsaOutraConta (%s)", async (_nome, rota, grupo) => {
    const resposta = await post(cookieCaixa, rota, {
      empresaId: idsTeste.empresaA,
      dataReferencia: hoje,
      dataVencimento: hoje,
      descricao: "Saida apontando o Banco",
      valorOriginal: 10,
      // Conta que NAO e a do PDV aberto: e aqui que nascia a divergencia conta x caixa.
      contaOrigemId: idsTeste.contaBanco,
      ...grupo
    });
    assertProblem(resposta, 400);
    expect(resposta.body).toContain("conta do PDV aberto");
  });

  it("Deve_PreencherComAContaDoPdv_Quando_OperadorNaoInformaConta", async () => {
    const resposta = await post(cookieCaixa, "/api/despesas", despesaBase({ descricao: "Despesa sem conta" }));
    expect(resposta.statusCode, resposta.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(resposta).data;
    // Payload sem conta nao pode virar lancamento orfao: o servidor completa com a do PDV.
    const gravada = await consultarUm<{ conta_origem_id: string; caixa_id: string }>(
      "select conta_origem_id, caixa_id from despesas where id = $1",
      [id]
    );
    expect(gravada).toMatchObject({ conta_origem_id: contaDoPdv, caixa_id: caixaId });
  });

  // --- R-122: corrigir o proprio lancamento ---------------------------------------------------
  it("Deve_PermitirEditar_Quando_LancamentoDoProprioCaixaAberto", async () => {
    const criada = await post(cookieCaixa, "/api/despesas", despesaBase({ descricao: "Valor errado" }));
    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(criada).data;

    const editada = await put(
      cookieCaixa,
      `/api/despesas/${id}`,
      despesaBase({ descricao: "Valor corrigido", valorOriginal: 42, contaOrigemId: contaDoPdv })
    );
    expect(editada.statusCode, editada.body).toBe(200);
    expect(
      await consultarUm<{ descricao: string }>("select descricao from despesas where id = $1", [id])
    ).toMatchObject({ descricao: "Valor corrigido" });
  });

  it("Deve_Retornar403_Quando_OperadorEditaTrocandoAConta", async () => {
    const criada = await post(cookieCaixa, "/api/despesas", despesaBase({ descricao: "Nao pode virar Banco" }));
    const { id } = json<{ data: { id: string } }>(criada).data;

    // Editar nao pode ser a porta dos fundos para trocar a conta que a criacao travou.
    const editada = await put(
      cookieCaixa,
      `/api/despesas/${id}`,
      despesaBase({ descricao: "Nao pode virar Banco", contaOrigemId: idsTeste.contaBanco })
    );
    assertProblem(editada, 403);
    expect(editada.body).toContain("conta do PDV aberto");
  });

  // O `admin` faz o papel da retaguarda aqui: ele tem caixa aberto proprio no seed (pdvA, conta
  // `contaCaixa`), entao a despesa nasce presa a um caixa que NAO e o do operador. A tesouraria nao
  // serve — hoje ela tambem depende de caixa aberto (D-11) e o POST dela nao passa de 400, o que
  // antes fazia este teste sair pela porta dos fundos com um `if (...) return` e nao asserir nada.
  //
  // A conta e informada EXPLICITAMENTE desde a A-4. Sem ela o payload ia sem conta, `caixaIdDaSaida`
  // gravava `caixa_id` NULO e o 403 passava a vir de "lancamento sem caixa" — o teste continuava
  // verde provando outra regra, e o cenario "lancamento de OUTRO caixa" sumia da suite.
  it("Deve_Retornar403_Quando_OperadorEditaLancamentoDeOutroCaixa", async () => {
    const deOutro = await post(
      cookieAdmin,
      "/api/despesas",
      despesaBase({ descricao: "Despesa da retaguarda", contaOrigemId: idsTeste.contaCaixa })
    );
    expect(deOutro.statusCode, deOutro.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(deOutro).data;
    // A pre-condicao do caso: o registro pertence mesmo a um caixa, e nao e o do operador.
    const gravado = await consultarUm<{ caixa_id: string | null }>("select caixa_id from despesas where id = $1", [id]);
    expect(gravado).toMatchObject({ caixa_id: idsTeste.caixaAberto });
    expect(gravado?.caixa_id).not.toBe(caixaId);

    const editada = await put(cookieCaixa, `/api/despesas/${id}`, despesaBase({ descricao: "Tentativa" }));
    assertProblem(editada, 403);

    // A recusa preserva o registro INTEIRO, nao so a contagem.
    expect(
      await consultarUm<{ descricao: string; caixa_id: string | null }>(
        "select descricao, caixa_id from despesas where id = $1",
        [id]
      )
    ).toMatchObject({ descricao: "Despesa da retaguarda", caixa_id: idsTeste.caixaAberto });
  });

  // --- R-123: recorrencia e ato de retaguarda --------------------------------------------------
  it("Deve_Retornar400_Quando_OperadorTentaLancamentoRecorrente", async () => {
    const resposta = await post(
      cookieCaixa,
      "/api/despesas",
      despesaBase({
        descricao: "Aluguel todo mes",
        recorrencia: { frequencia: "mes", repeticoes: 3 }
      })
    );
    assertProblem(resposta, 400);
    expect(resposta.body).toContain("Tesouraria/Financeiro");
  });

  // --- R-122: fechado o caixa, acabou ---------------------------------------------------------
  it("Deve_Retornar403_Quando_OperadorEditaDepoisDeFecharOCaixa", async () => {
    const criada = await post(cookieCaixa, "/api/despesas", despesaBase({ descricao: "Antes do fechamento" }));
    const { id } = json<{ data: { id: string } }>(criada).data;

    // Zera o caixa e fecha. Depois disso corrigir vira ato de tesouraria — e o que protege os
    // totais congelados em `fechamentos_caixa`.
    const status = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieCaixa }
    });
    const proposta = json<{ data: { resumo: { propostaRetorno: number } } }>(status).data.resumo.propostaRetorno;
    if (proposta > 0) {
      const retorno = await post(cookieCaixa, `/api/caixa/${caixaId}/transferencia-cofre`, {
        tipo: "retorno",
        valor: proposta,
        idempotenciaChave: randomUUID()
      });
      expect(retorno.statusCode, retorno.body).toBe(200);
    }
    const fechar = await post(cookieCaixa, `/api/caixa/${caixaId}/fechar`, { observacao: "Fechamento do teste" });
    expect(fechar.statusCode, fechar.body).toBe(204);

    const editada = await put(cookieCaixa, `/api/despesas/${id}`, despesaBase({ descricao: "Tarde demais" }));
    assertProblem(editada, 403);
    expect(editada.body).toContain("Tesouraria");
  });
});
