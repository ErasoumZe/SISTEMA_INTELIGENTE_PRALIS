import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, type PerfilTeste } from "../../setup/contexto.js";

// Matriz cargo x operacao de caixa (Fase 3). Prova os GATES DE PERMISSAO por rota, por perfil
// do seed. Perfis: admin (todas), caixa (caixa_operar + entradas), gerente/tesouraria (sem
// caixa), semPermissao (nenhuma). Complementa a prova generica de hierarquia (usuario>cargo>
// setor) com a cobertura especifica das rotas de caixa que faltava.
describe("caixa permissoes por cargo integration", () => {
  let contexto: ContextoApiTeste;
  const cookies = new Map<PerfilTeste, string>();

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    for (const perfil of ["admin", "caixa", "gerente", "tesouraria", "semPermissao"] as const) {
      cookies.set(perfil, await cookieSessao(contexto.app, perfil));
    }
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  // GET /api/caixa/status — gate: caixa_operar.
  it.each([
    ["admin", 200],
    ["caixa", 200],
    ["gerente", 403],
    ["tesouraria", 403],
    ["semPermissao", 403]
  ] as const)("status do caixa: perfil %s espera %i", async (perfil, status) => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookies.get(perfil)! }
    });
    if (status === 200) assertOk(resposta);
    else assertProblem(resposta, 403, "INSUFFICIENT_PERMISSION");
  });

  // GET /api/caixa/historico — gate: caixas_gerenciar (so admin/gerencia; operador de caixa nao).
  it.each([
    ["admin", 200],
    ["caixa", 403],
    ["gerente", 403],
    ["semPermissao", 403]
  ] as const)("historico do caixa: perfil %s espera %i", async (perfil, status) => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/historico?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookies.get(perfil)! }
    });
    if (status === 200) assertOk(resposta);
    else assertProblem(resposta, 403, "INSUFFICIENT_PERMISSION");
  });

  it("Deve_Bloquear_Quando_GerenteTentaAbrirCaixaSemCaixaOperar", async () => {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/caixa/abrir",
      headers: { cookie: cookies.get("gerente")! },
      payload: {
        empresaId: idsTeste.empresaA,
        pdvId: idsTeste.pdvA,
        usuarioCaixaId: "qualquer",
        dataHoraAbertura: "2026-07-03T08:00"
      }
    });
    assertProblem(resposta, 403, "INSUFFICIENT_PERMISSION");
  });

  it("Deve_Bloquear_Quando_SemPermissaoTentaRetornarSaldo", async () => {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${idsTeste.caixaAberto}/transferencia-cofre`,
      headers: { cookie: cookies.get("semPermissao")! },
      payload: { tipo: "retorno", valor: 1 }
    });
    assertProblem(resposta, 403, "INSUFFICIENT_PERMISSION");
  });

  it("Deve_PermitirCriarVenda_Mas_BloquearDespesa_Quando_PerfilCaixa", async () => {
    // O perfil caixa tem entradas_criar mas nao despesas_criar. A venda passa o gate de
    // permissao (e para em "abra um caixa" 400, pois o caixa do operador esta fechado);
    // a despesa e barrada no gate (403). Prova que a permissao e granular por tipo.
    const venda = await contexto.app.inject({
      method: "POST",
      url: "/api/vendas",
      headers: { cookie: cookies.get("caixa")! },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-07-03",
        descricao: "Venda do operador",
        valorOriginal: 10,
        contaOrigemId: idsTeste.contaCaixa,
        pdvId: idsTeste.pdvA,
        itensVenda: [],
        tiposPagamento: []
      }
    });
    // passou o gate de permissao; barra por falta de caixa aberto do operador
    expect(venda.statusCode).toBe(400);

    const despesa = await contexto.app.inject({
      method: "POST",
      url: "/api/despesas",
      headers: { cookie: cookies.get("caixa")! },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-07-03",
        dataVencimento: "2026-07-03",
        descricao: "Despesa proibida",
        valorOriginal: 10,
        contaOrigemId: idsTeste.contaCaixa,
        grupoDespesaId: idsTeste.grupoDespesaOperacional
      }
    });
    assertProblem(despesa, 403, "INSUFFICIENT_PERMISSION");
  });
});
