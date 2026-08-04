import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { json } from "../../setup/integracao.js";

// Cadastro de patrimonio (PROJECT_BRAIN/17, D2): grupos com sigla + itens com marca/setor.
describe("patrimonio integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieSemPermissao: string;
  let grupoId: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    cookieSemPermissao = await cookieSessao(contexto.app, "semPermissao");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  function listar(cookie = cookieAdmin) {
    return contexto.app.inject({
      method: "GET",
      url: `/api/patrimonio?empresaId=${idsTeste.empresaA}`,
      headers: { cookie }
    });
  }

  it("cria grupo com sigla e lista", async () => {
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/patrimonio-grupos",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, sig: "MAQ", nome: "Maquinas e equipamentos" }
    });
    expect(criado.statusCode, criado.body).toBe(201);
    grupoId = json<{ data: { id: string } }>(criado).data.id;

    const listagem = await listar();
    assertOk(listagem);
    const dados = json<{ data: { gruposPatrimonio: Array<{ id: string; sig: string }> } }>(listagem).data;
    expect(dados.gruposPatrimonio.find((grupo) => grupo.id === grupoId)?.sig).toBe("MAQ");
  });

  it("normaliza a sigla para maiusculas e recusa formato invalido", async () => {
    const minuscula = await contexto.app.inject({
      method: "POST",
      url: "/api/patrimonio-grupos",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, sig: "mob", nome: "Mobiliarios" }
    });
    expect(minuscula.statusCode).toBe(201);

    const invalida = await contexto.app.inject({
      method: "POST",
      url: "/api/patrimonio-grupos",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, sig: "MAQUINARIO", nome: "Sigla longa demais" }
    });
    assertProblem(invalida, 400);
  });

  it("cria item ligado ao grupo, com marca e setor", async () => {
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/patrimonio-itens",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        grupoPatrimonioId: grupoId,
        setorId: idsTeste.setorA,
        nome: "Forno turbo",
        marca: "Venancio"
      }
    });
    expect(criado.statusCode, criado.body).toBe(201);

    const listagem = await listar();
    const itens = json<{
      data: { patrimonioItens: Array<{ nome: string; marca: string | null; sig: string; setor: string | null }> };
    }>(listagem).data.patrimonioItens;
    const forno = itens.find((item) => item.nome === "Forno turbo");
    expect(forno).toMatchObject({ marca: "Venancio", sig: "MAQ" });
  });

  it("nao exclui grupo com item vinculado (o item ficaria sem classificacao)", async () => {
    const resposta = await contexto.app.inject({
      method: "DELETE",
      url: `/api/patrimonio-grupos/${grupoId}`,
      headers: { cookie: cookieAdmin }
    });
    assertProblem(resposta, 400, "GRUPO_EM_USO");
  });

  it("exige permissao para ver o cadastro", async () => {
    assertProblem(await listar(cookieSemPermissao), 403);
  });
});
