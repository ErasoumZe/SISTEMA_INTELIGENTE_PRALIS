import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm } from "../../setup/integracao.js";

// "Excluir" usuario, conta ou PDV (Marco, 13/11/2026) = desativar. So o administrador; o historico fica; o item sai
// das listas e o nome/e-mail ficam livres para um cadastro novo.
describe("excluir cadastros (desativar)", () => {
  const empresaId = idsTeste.empresaA;
  const senha = "QaExcluir#2026!";
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieGerente: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    [cookieAdmin, cookieGerente] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "gerente")
    ]);
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  const post = (url: string, payload: object = {}, cookie = cookieAdmin) =>
    contexto.app.inject({ method: "POST", url, headers: { cookie }, payload });
  const get = (url: string, cookie = cookieAdmin) => contexto.app.inject({ method: "GET", url, headers: { cookie } });

  async function criarConta(nome: string) {
    const resposta = await post("/api/contas", { empresaId, nome });
    expect(resposta.statusCode, resposta.body).toBe(201);
    return resposta.json().data.id as string;
  }

  async function criarPdv(nome: string) {
    const contaId = await criarConta(`Conta ${nome}`);
    const resposta = await post("/api/pdvs", { empresaId, nome, contaId, ativo: true });
    expect(resposta.statusCode, resposta.body).toBe(201);
    return { pdvId: resposta.json().data.id as string, contaId };
  }

  async function logar(email: string) {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email, password: senha },
      remoteAddress: "127.0.0.251"
    });
    expect(resposta.statusCode, resposta.body).toBe(200);
    const bruto = resposta.headers["set-cookie"];
    const lista = Array.isArray(bruto) ? bruto : bruto ? [bruto] : [];
    return lista.map((cookie) => cookie.split(";")[0]).join("; ");
  }

  it("so o administrador exclui", async () => {
    const { pdvId } = await criarPdv(`PDV QA Gerente ${Date.now()}`);
    expect((await post(`/api/pdvs/${pdvId}/desativar`, {}, cookieGerente)).statusCode).toBe(403);
  });

  it("PDV: sai do cadastro, o nome fica livre e a conta dele so sai depois", async () => {
    const nome = `PDV QA Excluir ${Date.now()}`;
    const { pdvId, contaId } = await criarPdv(nome);
    const contaAntes = await post(`/api/contas/${contaId}/desativar`);
    expect(contaAntes.statusCode).toBe(409);
    expect(contaAntes.body).toContain("CONTA_DE_PDV_ATIVO");

    const resposta = await post(`/api/pdvs/${pdvId}/desativar`);
    expect(resposta.statusCode, resposta.body).toBe(200);
    const lista = await get(`/api/pdvs?empresaId=${empresaId}&pageSize=100`);
    // A API manda o PDV excluido de proposito (filtros de historico); a tela de cadastro e quem esconde.
    const doExcluido = (lista.json().data as Array<{ id: string; ativo: boolean }>).find((item) => item.id === pdvId);
    expect(doExcluido?.ativo).toBe(false);
    const linha = await consultarUm<{ ativo: boolean; nome: string }>("select ativo, nome from pdvs where id = $1", [
      pdvId
    ]);
    expect(linha).toMatchObject({ ativo: false });
    expect(linha!.nome).toContain(" (excluido ");
    expect((await post(`/api/pdvs/${pdvId}/desativar`)).statusCode).toBe(404);

    // O nome ficou livre: da para criar outro PDV igual.
    await criarPdv(nome);
    // E agora a conta do PDV excluido pode sair.
    expect((await post(`/api/contas/${contaId}/desativar`)).statusCode).toBe(200);
  });

  it("conta: zerada sai das listas; o Cofre nao sai", async () => {
    const contaId = await criarConta(`Conta QA Excluir ${Date.now()}`);
    const resposta = await post(`/api/contas/${contaId}/desativar`);
    expect(resposta.statusCode, resposta.body).toBe(200);
    expect((await get(`/api/contas?empresaId=${empresaId}&pageSize=100`)).body).not.toContain(contaId);
    expect((await get(`/api/contas-usuarios/minhas-contas?empresaId=${empresaId}`)).body).not.toContain(contaId);

    const cofre = await post(`/api/contas/${idsTeste.contaCofre}/desativar`);
    expect(cofre.statusCode).toBe(409);

    // Conta excluida nao recebe transferencia nova, nem pela API direta.
    const transferencia = await post("/api/transferencias", {
      empresaId,
      dataReferencia: "2026-11-13",
      descricao: "Para conta excluida",
      valorOriginal: 10,
      contaOrigemId: idsTeste.contaCofre,
      contaDestinoId: contaId,
      nLacreDoc: `EXC-${Date.now()}`
    });
    expect(transferencia.statusCode).toBeGreaterThanOrEqual(400);
    expect(transferencia.body).toContain("Conta excluida");
  });

  it("PDV excluido nao e editado (nem reativado) pelo cadastro", async () => {
    const { pdvId, contaId } = await criarPdv(`PDV QA Editar ${Date.now()}`);
    expect((await post(`/api/pdvs/${pdvId}/desativar`)).statusCode).toBe(200);
    const editar = await contexto.app.inject({
      method: "PUT",
      url: `/api/pdvs/${pdvId}`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId, nome: "Reativado", contaId, ativo: true }
    });
    expect(editar.statusCode).toBeGreaterThanOrEqual(400);
    const linha = await consultarUm<{ ativo: boolean }>("select ativo from pdvs where id = $1", [pdvId]);
    expect(linha!.ativo).toBe(false);
  });

  it("administrador nao e excluido por aqui", async () => {
    const outroAdmin = await consultarUm<{ usuario_id: string }>(
      "select usuario_id from perfis_usuarios where role <> 'usuario_comum' and desativado_em is null and usuario_id <> (select id from \"user\" where lower(email) = lower($1)) limit 1",
      ["admin.integracao@padaria.local"]
    );
    if (outroAdmin) expect((await post(`/api/usuarios/${outroAdmin.usuario_id}/desativar`)).statusCode).toBe(403);
  });

  it("usuario: perde o acesso na hora, sai da lista e o e-mail fica livre", async () => {
    const email = `qa.excluir.${Date.now()}@padaria.local`;
    const novo = () =>
      post("/api/usuarios", {
        empresaId,
        nome: "QA Excluir",
        email,
        senha,
        role: "usuario_comum",
        novoColaborador: { empresaId, nome: `QA Excluir ${Date.now()}`, cargoId: idsTeste.cargoCaixa }
      });
    const criado = await novo();
    expect([200, 201], criado.body).toContain(criado.statusCode);
    const perfil = await consultarUm<{ usuario_id: string }>(
      "select usuario_id from perfis_usuarios where lower(email) = lower($1)",
      [email]
    );
    const usuarioId = perfil!.usuario_id;
    const cookieUsuario = await logar(email);
    expect((await get("/api/me", cookieUsuario)).statusCode).toBe(200);

    const resposta = await post(`/api/usuarios/${usuarioId}/desativar`);
    expect(resposta.statusCode, resposta.body).toBe(200);
    expect((await get("/api/me", cookieUsuario)).statusCode).toBeGreaterThanOrEqual(400);
    expect((await get(`/api/usuarios?empresaId=${empresaId}&pageSize=100`)).body).not.toContain(usuarioId);
    const sessoes = await consultarUm<{ total: number }>(
      'select count(*)::int total from "session" where "userId" = $1',
      [usuarioId]
    );
    expect(sessoes!.total).toBe(0);

    // O e-mail ficou livre para um cadastro novo.
    const deNovo = await novo();
    expect([200, 201], deNovo.body).toContain(deNovo.statusCode);
  });

  it("o administrador nao exclui o proprio usuario", async () => {
    const eu = await get("/api/me");
    const usuarioId = eu.json().data?.perfil?.usuarioId as string;
    const resposta = await post(`/api/usuarios/${usuarioId}/desativar`);
    expect(resposta.statusCode).toBe(400);
  });
});
