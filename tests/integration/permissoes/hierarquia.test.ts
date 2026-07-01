import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LightMyRequestResponse } from "fastify";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";

// Prova a hierarquia de permissoes usuario > cargo > setor (e o short-circuit do usuario_admin),
// criando setor/cargo/usuario proprios via API (nao depende do seed base).

const empresaId = idsTeste.empresaA;
const senhaForte = "QaHierarquia#2026!";

// Permissoes (visualizar, inofensivas) usadas nos cenarios de conflito.
const P = {
  clientes: "cadastro_clientes_visualizar",
  fornecedores: "cadastro_fornecedores_visualizar",
  produtos: "cadastro_produtos_visualizar",
  contas: "cadastro_contas_visualizar",
  grupos: "cadastro_grupos_visualizar",
  unidades: "cadastro_unidades_medida_visualizar"
} as const;

describe("hierarquia de permissoes (usuario > cargo > setor)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  function dados(resposta: LightMyRequestResponse): { id?: string } {
    return (resposta.json() as { data?: { id?: string } }).data ?? {};
  }

  async function criar(url: string, payload: Record<string, unknown>): Promise<string> {
    const resposta = await contexto.app.inject({ method: "POST", url, headers: { cookie: cookieAdmin }, payload });
    expect([200, 201], `${url} -> ${resposta.statusCode} ${resposta.payload}`).toContain(resposta.statusCode);
    const id = dados(resposta).id;
    expect(id, `sem id em ${url}`).toBeTruthy();
    return id ?? "";
  }

  async function definirRegras(
    tipoPermissao: "setor" | "cargo" | "usuario",
    alvo: Record<string, string>,
    regras: Record<string, boolean>
  ): Promise<void> {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/permissoes",
      headers: { cookie: cookieAdmin },
      payload: { tipoPermissao, ...alvo, regras }
    });
    expect([200, 201]).toContain(resposta.statusCode);
  }

  async function logar(email: string): Promise<string> {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email, password: senhaForte }
    });
    expect(resposta.statusCode).toBe(200);
    const bruto = resposta.headers["set-cookie"];
    const lista = Array.isArray(bruto) ? bruto : bruto ? [bruto] : [];
    return lista.map((cookie) => cookie.split(";")[0]).join("; ");
  }

  async function permissoesEfetivas(cookie: string): Promise<Set<string>> {
    const resposta = await contexto.app.inject({ method: "GET", url: "/api/me", headers: { cookie } });
    expect(resposta.statusCode).toBe(200);
    const perfil = (resposta.json() as { data?: { perfil?: { permissoes?: string[] } } }).data?.perfil;
    return new Set(perfil?.permissoes ?? []);
  }

  async function statusRota(cookie: string, url: string): Promise<number> {
    const resposta = await contexto.app.inject({ method: "GET", url: `${url}?empresaId=${empresaId}`, headers: { cookie } });
    return resposta.statusCode;
  }

  it("usuario_comum: resolve na ordem usuario > cargo > setor", async () => {
    const setorId = await criar("/api/setores", { empresaId, nome: `QA Setor ${Date.now()}` });
    const cargoId = await criar("/api/cargos", { empresaId, nome: `QA Cargo ${Date.now()}` });

    // SETOR: clientes/fornecedores/grupos = PERMITIR, produtos = NEGAR
    await definirRegras("setor", { setorId }, { [P.clientes]: true, [P.fornecedores]: true, [P.produtos]: false, [P.grupos]: true });
    // CARGO: fornecedores = NEGAR, produtos = PERMITIR, contas = NEGAR
    await definirRegras("cargo", { cargoId }, { [P.fornecedores]: false, [P.produtos]: true, [P.contas]: false });

    const email = `qa.hierarquia.${Date.now()}@padaria.local`;
    await criar("/api/usuarios", {
      empresaId,
      nome: "QA Hierarquia",
      email,
      senha: senhaForte,
      role: "usuario_comum",
      novoColaborador: { empresaId, nome: "QA Hierarquia", cargoId, setorId }
    });

    const cookie = await logar(email);
    const usuarioId = ((await contexto.app.inject({ method: "GET", url: "/api/me", headers: { cookie } })).json() as {
      data?: { perfil?: { usuarioId?: string } };
    }).data?.perfil?.usuarioId;
    expect(usuarioId).toBeTruthy();

    // USUARIO: contas = PERMITIR, grupos = NEGAR
    await definirRegras("usuario", { usuarioId: usuarioId ?? "" }, { [P.contas]: true, [P.grupos]: false });

    const efetivas = await permissoesEfetivas(cookie);
    expect(efetivas.has(P.clientes), "clientes: so setor concede -> tem").toBe(true);
    expect(efetivas.has(P.fornecedores), "fornecedores: cargo NEGA sobre setor PERMITE -> nao tem").toBe(false);
    expect(efetivas.has(P.produtos), "produtos: cargo PERMITE sobre setor NEGA -> tem").toBe(true);
    expect(efetivas.has(P.contas), "contas: usuario PERMITE sobre cargo NEGA -> tem").toBe(true);
    expect(efetivas.has(P.grupos), "grupos: usuario NEGA sobre setor PERMITE -> nao tem").toBe(false);
    expect(efetivas.has(P.unidades), "unidades: ninguem concede -> nao tem").toBe(false);

    // Guards reagem igual as permissoes efetivas
    expect(await statusRota(cookie, "/api/clientes")).toBe(200);
    expect(await statusRota(cookie, "/api/fornecedores")).toBe(403);
    expect(await statusRota(cookie, "/api/produtos")).toBe(200);
    expect(await statusRota(cookie, "/api/contas")).toBe(200);
    expect(await statusRota(cookie, "/api/grupos")).toBe(403);
    expect(await statusRota(cookie, "/api/unidades_medida")).toBe(403);
  });

  it("usuario_admin: concede tudo e ignora NEGAR de cargo/setor", async () => {
    const cargoId = await criar("/api/cargos", { empresaId, nome: `QA CargoAdmin ${Date.now()}` });
    // cargo NEGA clientes explicitamente
    await definirRegras("cargo", { cargoId }, { [P.clientes]: false });

    const email = `qa.admin.hierarquia.${Date.now()}@padaria.local`;
    await criar("/api/usuarios", {
      empresaId,
      nome: "QA Admin Hierarquia",
      email,
      senha: senhaForte,
      role: "usuario_admin",
      novoColaborador: { empresaId, nome: "QA Admin Hierarquia", cargoId }
    });

    const cookie = await logar(email);
    const efetivas = await permissoesEfetivas(cookie);
    // usuario_admin recebe todas -> tem clientes mesmo com o cargo NEGANDO
    expect(efetivas.has(P.clientes), "usuario_admin ignora NEGAR do cargo").toBe(true);
    expect(efetivas.size).toBeGreaterThanOrEqual(190);
    expect(await statusRota(cookie, "/api/clientes")).toBe(200);
  });
});
