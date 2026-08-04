import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

describe("usuarios integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_CriarEAtualizarUsuario_Quando_EmpresaPermitida", async () => {
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/usuarios",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaIds: [idsTeste.empresaA],
        nome: "Usuario criado por integracao",
        email: "usuario.crud.integracao@padaria.local",
        role: "usuario_comum",
        senha: "Teste#2026!crud",
        novoColaborador: {
          empresaId: idsTeste.empresaA,
          nome: "Colaborador usuario CRUD",
          setorId: idsTeste.setorA,
          cargoId: idsTeste.cargoGerente
        }
      }
    });
    expect(criado.statusCode).toBe(201);
    const usuarioId = json<{ data: { id: string } }>(criado).data.id;
    const colaborador = await consultarUm<{ id: string }>("select id from colaboradores where usuario_id = $1", [
      usuarioId
    ]);
    expect(colaborador?.id).toBeTruthy();

    const editado = await contexto.app.inject({
      method: "PUT",
      url: `/api/usuarios/${usuarioId}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaIds: [idsTeste.empresaA],
        nome: "Usuario editado por integracao",
        email: "usuario.crud.editado@padaria.local",
        role: "usuario_comum",
        senha: "",
        colaboradorId: colaborador?.id
      }
    });
    expect(editado.statusCode).toBe(204);
  });

  it("Deve_Retornar403_Quando_CriarUsuarioEmEmpresaNaoPermitida", async () => {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/usuarios",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaIds: [idsTeste.empresaB],
        nome: "Usuario proibido",
        email: "usuario.proibido@padaria.local",
        senha: "Teste#2026!proibido",
        novoColaborador: { empresaId: idsTeste.empresaB, nome: "Colaborador proibido", cargoId: idsTeste.cargoAdmin }
      }
    });

    assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
  });
});
