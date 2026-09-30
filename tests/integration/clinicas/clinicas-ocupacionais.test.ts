import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Permissao } from "@padaria/shared";
import { permissoesPorCargo, regrasPermissoes } from "@padaria/db/referencia-permissoes";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste, type PerfilTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

describe("clinicas ocupacionais: catalogo do DP", () => {
  let contexto: ContextoApiTeste;
  let cookieDp: string;
  let cookieSemPermissao: string;
  let sequencia = 0;

  function nomeUnico(prefixo: string) {
    return `${prefixo} ${++sequencia}`;
  }

  async function vestirCargo(perfil: PerfilTeste, cargo: string) {
    const usuario = await consultarUm<{ id: string }>(`select u.id from "user" u where u.email = $1`, [
      usuariosTeste[perfil].email
    ]);
    if (!usuario) throw new Error(`usuario de teste ausente: ${perfil}`);
    const permissoes: Permissao[] = permissoesPorCargo[cargo] ?? [];
    await executarSql(
      `insert into permissoes_usuarios (usuario_id, regras) values ($1, $2::jsonb)
       on conflict (usuario_id) do update set regras = excluded.regras`,
      [usuario.id, JSON.stringify(regrasPermissoes(permissoes))]
    );
  }

  function listar(cookie: string, empresaId = idsTeste.empresaA) {
    return contexto.app.inject({
      method: "GET",
      url: `/api/clinicas-ocupacionais?empresaId=${empresaId}`,
      headers: { cookie }
    });
  }

  function criarClinica(cookie: string, nome: string, empresaId = idsTeste.empresaA) {
    return contexto.app.inject({
      method: "POST",
      url: "/api/clinicas-ocupacionais",
      headers: { cookie },
      payload: { empresaId, nome, email: null, whatsapp: null, contatoNome: null, observacoes: null, ativo: true }
    });
  }

  function editarClinica(cookie: string, id: string, nome: string, empresaId = idsTeste.empresaA) {
    return contexto.app.inject({
      method: "PUT",
      url: `/api/clinicas-ocupacionais/${id}`,
      headers: { cookie },
      payload: { empresaId, nome, email: null, whatsapp: null, contatoNome: null, observacoes: null, ativo: true }
    });
  }

  async function clinicaDoDp(nome: string) {
    const resposta = await criarClinica(cookieDp, nome);
    expect(resposta.statusCode, resposta.body).toBe(201);
    return json<{ data: { id: string } }>(resposta).data.id;
  }

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    await vestirCargo("caixa", "DP");
    cookieDp = await cookieSessao(contexto.app, "caixa");
    cookieSemPermissao = await cookieSessao(contexto.app, "semPermissao");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_O_DpCadastrarEditarEListarClinicaEUnidade", async () => {
    const clinicaId = await clinicaDoDp(nomeUnico("Clinica Sintetica"));
    const unidade = await contexto.app.inject({
      method: "POST",
      url: `/api/clinicas-ocupacionais/${clinicaId}/unidades`,
      headers: { cookie: cookieDp },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: "Centro",
        email: "centro@example.test",
        whatsapp: "32999998888",
        cep: "36000000",
        logradouro: "Rua Teste",
        numero: "100",
        complemento: null,
        bairro: "Centro",
        municipio: "Juiz de Fora",
        uf: "MG",
        ativo: true
      }
    });
    expect(unidade.statusCode, unidade.body).toBe(201);

    const lista = await listar(cookieDp);
    assertOk(lista, 200);
    const clinicas = json<{ data: Array<{ id: string; unidades: Array<{ nome: string; ativo: boolean }> }> }>(
      lista
    ).data;
    const clinica = clinicas.find((linha) => linha.id === clinicaId);
    expect(clinica?.unidades).toEqual(
      expect.arrayContaining([expect.objectContaining({ nome: "Centro", ativo: true })])
    );

    expect((await editarClinica(cookieDp, clinicaId, "Clinica Atualizada")).statusCode).toBe(204);
    expect(
      json<{ data: Array<{ id: string; nome: string }> }>(await listar(cookieDp)).data.find(
        (linha) => linha.id === clinicaId
      )?.nome
    ).toBe("Clinica Atualizada");
  });

  it("Deve_RecusarDuplicidadeEQuemNaoTemPermissao", async () => {
    const nome = nomeUnico("Clinica Unica");
    await clinicaDoDp(nome);
    const repetida = await criarClinica(cookieDp, nome);
    expect(repetida.statusCode, repetida.body).toBe(409);
    expect(repetida.json().code).toBe("CLINICA_DUPLICADA");

    expect((await listar(cookieSemPermissao)).statusCode).toBe(403);
    expect((await criarClinica(cookieSemPermissao, "Nao permitida")).statusCode).toBe(403);
  });

  it("Deve_IsolarClinicasEntreEmpresasInclusiveNaEdicao", async () => {
    const clinicaB = "55555555-5555-4555-8555-555555550754";
    await executarSql(
      "insert into clinicas_ocupacionais (id, empresa_id, nome) values ($1, $2, $3) on conflict do nothing",
      [clinicaB, idsTeste.empresaB, "CLINICA DA EMPRESA B"]
    );

    const listandoB = await listar(cookieDp, idsTeste.empresaB);
    expect(listandoB.statusCode, listandoB.body).toBe(403);
    expect(listandoB.json().code).toBe("FORBIDDEN_COMPANY");

    const editandoAlheia = await editarClinica(cookieDp, clinicaB, "Sequestrada");
    expect(editandoAlheia.statusCode, editandoAlheia.body).toBe(404);
    const intacta = await consultarUm<{ nome: string }>("select nome from clinicas_ocupacionais where id = $1", [
      clinicaB
    ]);
    expect(intacta?.nome).toBe("CLINICA DA EMPRESA B");
  });

  it("Deve_NaoExporRotaDeExclusao", async () => {
    const clinicaId = await clinicaDoDp(nomeUnico("Sem Exclusao"));
    const exclusao = await contexto.app.inject({
      method: "DELETE",
      url: `/api/clinicas-ocupacionais/${clinicaId}`,
      headers: { cookie: cookieDp }
    });
    expect(exclusao.statusCode).toBe(404);
  });
});
