import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

describe("empresas integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_ListarEmpresasPermitidas_Quando_UsuarioTemPermissao", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: "/api/empresas",
      headers: { cookie: cookieAdmin }
    });

    assertOk(resposta);
    expect(JSON.stringify(resposta.json())).toContain("Padaria Integracao A");
  });

  it("Deve_AtualizarEmpresaPermitida_Quando_PayloadValido", async () => {
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/empresas/${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin },
      payload: { nome: "Padaria Integracao A Editada", cnpj: "00.000.000/0001-91" }
    });

    expect(resposta.statusCode).toBe(204);
    const empresa = await consultarUm<{ nome: string; cnpj: string }>("select nome, cnpj from empresas where id = $1", [
      idsTeste.empresaA
    ]);
    expect(empresa).toMatchObject({ nome: "Padaria Integracao A Editada", cnpj: "00000000000191" });
  });

  it("Deve_VincularCriadorEManterEmpresaVisivel_Quando_CriarEmpresa", async () => {
    const criar = await contexto.app.inject({
      method: "POST",
      url: "/api/empresas",
      headers: { cookie: cookieAdmin },
      payload: { nome: "Padaria Integracao Nova", cnpj: "00.000.000/0003-53" }
    });
    expect(criar.statusCode).toBe(201);
    const empresaId = json<{ data: { id: string } }>(criar).data.id;

    try {
      const vinculo = await consultarUm<{ empresa_id: string }>(
        `select ue.empresa_id
           from usuarios_empresas ue
           join perfis_usuarios pu on pu.usuario_id = ue.usuario_id
          where pu.email = 'admin.integracao@padaria.local' and ue.empresa_id = $1`,
        [empresaId]
      );
      expect(vinculo?.empresa_id).toBe(empresaId);

      const listar = await contexto.app.inject({
        method: "GET",
        url: "/api/empresas",
        headers: { cookie: cookieAdmin }
      });
      assertOk(listar);
      expect(JSON.stringify(listar.json())).toContain("Padaria Integracao Nova");
    } finally {
      await executarSql("delete from empresas where id = $1", [empresaId]);
    }
  });
});
