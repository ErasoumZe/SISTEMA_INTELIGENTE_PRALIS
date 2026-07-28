import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

async function usuarioIdPorEmail(email: string): Promise<string> {
  const linha = await consultarUm<{ usuario_id: string }>("select usuario_id from perfis_usuarios where email = $1", [
    email
  ]);
  if (!linha) throw new Error(`Usuario de teste nao encontrado: ${email}`);
  return linha.usuario_id;
}

describe("contas-usuarios integration", () => {
  let contexto: ContextoApiTeste;
  let cookieGerente: string;
  let usuarioCaixaId: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieGerente = await cookieSessao(contexto.app, "gerente");
    usuarioCaixaId = await usuarioIdPorEmail(usuariosTeste.caixa.email);
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_CriarListarEExcluirVinculo_Quando_GerenteComPermissao", async () => {
    const criar = await contexto.app.inject({
      method: "POST",
      url: "/api/contas-usuarios",
      headers: { cookie: cookieGerente },
      payload: { empresaId: idsTeste.empresaA, contaId: idsTeste.contaCaixa, usuarioId: usuarioCaixaId }
    });
    expect(criar.statusCode).toBe(201);
    const corpo = json<{ data: { id: string } }>(criar);

    const registro = await consultarUm<{ conta_id: string; usuario_id: string; empresa_id: string }>(
      "select conta_id, usuario_id, empresa_id from contas_usuarios where id = $1",
      [corpo.data.id]
    );
    expect(registro).toMatchObject({
      conta_id: idsTeste.contaCaixa,
      usuario_id: usuarioCaixaId,
      empresa_id: idsTeste.empresaA
    });

    const listar = await contexto.app.inject({
      method: "GET",
      url: `/api/contas-usuarios?empresaId=${idsTeste.empresaA}&contaId=${idsTeste.contaCaixa}`,
      headers: { cookie: cookieGerente }
    });
    assertOk(listar);
    expect(JSON.stringify(listar.json())).toContain(usuarioCaixaId);

    const excluir = await contexto.app.inject({
      method: "DELETE",
      url: `/api/contas-usuarios/${corpo.data.id}`,
      headers: { cookie: cookieGerente }
    });
    expect(excluir.statusCode).toBe(204);

    await expect(consultarUm("select id from contas_usuarios where id = $1", [corpo.data.id])).resolves.toBeNull();
  });

  it("Deve_Retornar400_Quando_VinculoDuplicado", async () => {
    const payload = { empresaId: idsTeste.empresaA, contaId: idsTeste.contaBanco, usuarioId: usuarioCaixaId };
    const primeiro = await contexto.app.inject({
      method: "POST",
      url: "/api/contas-usuarios",
      headers: { cookie: cookieGerente },
      payload
    });
    expect(primeiro.statusCode).toBe(201);

    const segundo = await contexto.app.inject({
      method: "POST",
      url: "/api/contas-usuarios",
      headers: { cookie: cookieGerente },
      payload
    });
    assertProblem(segundo, 400, "VINCULO_DUPLICADO");
  });

  it("Deve_Retornar404_Quando_ContaInexistente", async () => {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas-usuarios",
      headers: { cookie: cookieGerente },
      payload: {
        empresaId: idsTeste.empresaA,
        contaId: "99999999-9999-4999-8999-999999999999",
        usuarioId: usuarioCaixaId
      }
    });
    assertProblem(resposta, 404, "CONTA_NAO_ENCONTRADA");
  });

  it("Deve_Retornar403_Quando_UsuarioSemPermissaoDeVinculo", async () => {
    const cookie = await cookieSessao(contexto.app, "caixa");

    const listar = await contexto.app.inject({
      method: "GET",
      url: `/api/contas-usuarios?empresaId=${idsTeste.empresaA}`,
      headers: { cookie }
    });
    assertProblem(listar, 403, "INSUFFICIENT_PERMISSION");

    const criar = await contexto.app.inject({
      method: "POST",
      url: "/api/contas-usuarios",
      headers: { cookie },
      payload: { empresaId: idsTeste.empresaA, contaId: idsTeste.contaCaixa, usuarioId: usuarioCaixaId }
    });
    assertProblem(criar, 403, "INSUFFICIENT_PERMISSION");
  });
});
