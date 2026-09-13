import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

describe("permissoes integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_CriarListarAtualizarEExcluirRegraDePermissao", async () => {
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/permissoes",
      headers: { cookie: cookieAdmin },
      payload: { tipoPermissao: "cargo", cargoId: idsTeste.cargoGerente, regras: { cadastro_contas_visualizar: true } }
    });
    expect(criado.statusCode).toBe(201);

    const regras = await contexto.app.inject({
      method: "GET",
      url: `/api/permissoes/regras?empresaId=${idsTeste.empresaA}&tipoPermissao=cargo&alvoId=${idsTeste.cargoGerente}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(regras);
    expect(JSON.stringify(regras.json())).toContain("cadastro_contas_visualizar");

    const editado = await contexto.app.inject({
      method: "PUT",
      url: `/api/permissoes/${idsTeste.cargoGerente}`,
      headers: { cookie: cookieAdmin },
      payload: { tipoPermissao: "cargo", cargoId: idsTeste.cargoGerente, regras: { cadastro_contas_visualizar: false } }
    });
    expect(editado.statusCode).toBe(204);

    const excluido = await contexto.app.inject({
      method: "DELETE",
      url: `/api/permissoes/regras?empresaId=${idsTeste.empresaA}&tipoPermissao=cargo&alvoId=${idsTeste.cargoGerente}&permissao=cadastro_contas_visualizar`,
      headers: { cookie: cookieAdmin }
    });
    expect(excluido.statusCode).toBe(204);
  });

  it("Deve_ResumirAcessoEfetivoDoUsuarioComIdTextual", async () => {
    const gerente = await consultarUm<{ usuario_id: string }>(
      "select usuario_id from perfis_usuarios where email = $1",
      [usuariosTeste.gerente.email]
    );
    expect(gerente?.usuario_id).toBeTruthy();

    const regraHerdada = await contexto.app.inject({
      method: "POST",
      url: "/api/permissoes",
      headers: { cookie: cookieAdmin },
      payload: {
        tipoPermissao: "cargo",
        cargoId: idsTeste.cargoGerente,
        regras: { cadastro_contas_visualizar: true }
      }
    });
    expect(regraHerdada.statusCode).toBe(201);

    try {
      const resposta = await contexto.app.inject({
        method: "GET",
        url: `/api/permissoes/usuarios/${encodeURIComponent(gerente!.usuario_id)}/efetivas`,
        headers: { cookie: cookieAdmin }
      });

      assertOk(resposta);
      const corpo = json<{
        data: {
          usuarioId: string;
          role: string;
          permissoesHerdadas: string[];
          permissoesEfetivas: string[];
        };
      }>(resposta).data;
      expect(corpo.usuarioId).toBe(gerente!.usuario_id);
      expect(corpo.role).toBe("usuario_comum");
      expect(corpo.permissoesHerdadas).toContain("cadastro_contas_visualizar");
      expect(corpo.permissoesEfetivas).toContain("transferencias_conferir");
    } finally {
      await contexto.app.inject({
        method: "DELETE",
        url: `/api/permissoes/regras?empresaId=${idsTeste.empresaA}&tipoPermissao=cargo&alvoId=${idsTeste.cargoGerente}&permissao=cadastro_contas_visualizar`,
        headers: { cookie: cookieAdmin }
      });
    }
  });

  it("Deve_NegarResumoDeUsuarioComEmpresaForaDoEscopoDoAtor", async () => {
    const multiempresa = await consultarUm<{ usuario_id: string }>(
      "select usuario_id from perfis_usuarios where email = $1",
      [usuariosTeste.multiempresa.email]
    );
    expect(multiempresa?.usuario_id).toBeTruthy();

    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/permissoes/usuarios/${encodeURIComponent(multiempresa!.usuario_id)}/efetivas`,
      headers: { cookie: cookieAdmin }
    });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.body).not.toContain(usuariosTeste.multiempresa.email);
  });

  it("Deve_ExigirAutenticacaoParaResumoEfetivo", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: "/api/permissoes/usuarios/qualquer-id-textual/efetivas"
    });

    expect(resposta.statusCode).toBe(401);
  });
});
