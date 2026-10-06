import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";

const estrutura = {
  versao: 1 as const,
  secoes: [
    { id: "operacao", titulo: "Operação", cor: "transferencias", corRgb: { r: 18, g: 76, b: 210 }, ids: ["caixa", "entradas", "transferencias"] },
    { id: "resultados", titulo: "Resultados", ids: ["relatorio_vendas", "relatorio_dre"] }
  ]
};

describe("menu da empresa integration", () => {
  let contexto: ContextoApiTeste;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_RetornarFallbackNulo_QuandoEmpresaAindaNaoMontouMenu", async () => {
    const cookie = await cookieSessao(contexto.app, "gerente");
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/menu-empresa?empresaId=${idsTeste.empresaA}`,
      headers: { cookie }
    });

    assertOk(resposta);
    expect(resposta.json()).toMatchObject({ ok: true, data: null });
  });

  it("Deve_SalvarEConsultarMenuDaEmpresa_QuandoTiverPermissao", async () => {
    const cookie = await cookieSessao(contexto.app, "gerente");
    const salvar = await contexto.app.inject({
      method: "PUT",
      url: "/api/menu-empresa",
      headers: { cookie },
      payload: { empresaId: idsTeste.empresaA, estrutura }
    });
    expect(salvar.statusCode).toBe(204);

    const consultar = await contexto.app.inject({
      method: "GET",
      url: `/api/menu-empresa?empresaId=${idsTeste.empresaA}`,
      headers: { cookie }
    });
    assertOk(consultar);
    expect(consultar.json()).toMatchObject({ ok: true, data: estrutura });
  });

  it("Deve_ImpedirEdicaoSemPermissaoDeAcessos", async () => {
    const cookie = await cookieSessao(contexto.app, "semPermissao");
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: "/api/menu-empresa",
      headers: { cookie },
      payload: { empresaId: idsTeste.empresaA, estrutura }
    });

    assertProblem(resposta, 403, "INSUFFICIENT_PERMISSION");
  });

  it("Deve_PermitirConsultaDoMenuDaPropriaEmpresa_SemPermissaoAdministrativa", async () => {
    const cookie = await cookieSessao(contexto.app, "semPermissao");
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/menu-empresa?empresaId=${idsTeste.empresaA}`,
      headers: { cookie }
    });

    assertOk(resposta);
  });

  it("Deve_ImpedirConsultarEmpresaForaDoEscopo", async () => {
    const cookie = await cookieSessao(contexto.app, "gerente");
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/menu-empresa?empresaId=${idsTeste.empresaB}`,
      headers: { cookie }
    });

    assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
  });
});
