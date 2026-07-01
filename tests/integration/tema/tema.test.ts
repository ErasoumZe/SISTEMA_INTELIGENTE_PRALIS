import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { consultarUm } from "../../setup/integracao.js";
import { idsTeste } from "../../setup/contexto.js";

const temaPayload = {
  empresaId: idsTeste.empresaA,
  tela: "padrao",
  corPrimaria: "#005f73",
  corSecundaria: "#0a9396",
  corFundo: "#f8fafc",
  corCartao: "#ffffff",
  corSucesso: "#16a34a",
  corAviso: "#d97706",
  corErro: "#dc2626"
};

describe("tema integration", () => {
  let contexto: ContextoApiTeste;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_CarregarTemaDaEmpresa_Quando_EmpresaPermitida", async () => {
    const cookie = await cookieSessao(contexto.app, "gerente");

    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/tema?empresaId=${idsTeste.empresaA}&tela=padrao`,
      headers: { cookie }
    });

    assertOk(resposta);
    expect(resposta.json()).toMatchObject({ ok: true, data: { corPrimaria: expect.any(String) } });
  });

  it("Deve_Retornar403_Quando_CarregarTemaDeEmpresaNaoPermitida", async () => {
    const cookie = await cookieSessao(contexto.app, "gerente");

    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/tema?empresaId=${idsTeste.empresaB}&tela=padrao`,
      headers: { cookie }
    });

    assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
  });

  it("Deve_AtualizarTemaDaEmpresa_Quando_TiverPermissao", async () => {
    const cookie = await cookieSessao(contexto.app, "gerente");

    const resposta = await contexto.app.inject({
      method: "PUT",
      url: "/api/tema",
      headers: { cookie },
      payload: temaPayload
    });

    expect(resposta.statusCode).toBe(204);
    const empresa = await consultarUm<{ configuracoes_aparencia: { padrao: { corPrimaria: string } } }>(
      "select configuracoes_aparencia from empresas where id = $1",
      [idsTeste.empresaA]
    );
    expect(empresa?.configuracoes_aparencia.padrao.corPrimaria).toBe(temaPayload.corPrimaria);
  });

  it("Deve_Retornar403_Quando_AtualizarTemaSemPermissao", async () => {
    const cookie = await cookieSessao(contexto.app, "semPermissao");

    const resposta = await contexto.app.inject({
      method: "PUT",
      url: "/api/tema",
      headers: { cookie },
      payload: temaPayload
    });

    assertProblem(resposta, 403, "INSUFFICIENT_PERMISSION");
  });
});

