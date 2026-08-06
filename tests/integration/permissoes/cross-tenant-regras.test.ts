import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, expectNaoConterJson } from "../../setup/integracao.js";

// A empresa B do seed nasce praticamente vazia (so o vinculo do perfil multiempresa e dois itens de
// patrimonio). Sem alvo proprio nela, um vazamento cross-tenant passaria despercebido: a resposta
// viria vazia e o teste ficaria verde por falta de dado, nao por isolamento. Estas fixtures criam um
// cargo, um setor e um usuario que existem SOMENTE na empresa B, cada um com uma regra marcada por
// uma permissao que nenhum perfil da empresa A possui.
const cargoSegredoB = "33333333-3333-4333-8333-0000000000c1";
const setorSegredoB = "33333333-3333-4333-8333-0000000000e1";
const usuarioSegredoB = "usuario-segredo-empresa-b";
const nomeCargoB = "CARGO-SEGREDO-EMPRESA-B";
const nomeSetorB = "SETOR-SEGREDO-EMPRESA-B";
const nomeUsuarioB = "USUARIO-SEGREDO-EMPRESA-B";
const emailUsuarioB = "segredo.empresa.b@padaria.local";
// O marcador precisa ser um codigo que NENHUM alvo da empresa A possua, senao encontra-lo na
// resposta nao prova vazamento. Isso exclui quase todo o catalogo: `admin` e `multiempresa` recebem
// `permissoesAcessoTotal` (seed.ts:59,140), que e o catalogo inteiro menos as flags
// `_somente_caixa_aberto`. Sobram as restricoes — e destas, o seed so concede mercadorias, despesas
// e entradas. `menu_fechamento_somente_caixa_aberto` nao e concedida a ninguem.
const permissaoMarcadora = "menu_fechamento_somente_caixa_aberto";

async function criarAlvosExclusivosDaEmpresaB() {
  await executarSql("insert into cargos (id, empresa_id, nome) values ($1, $2, $3)", [
    cargoSegredoB,
    idsTeste.empresaB,
    nomeCargoB
  ]);
  await executarSql("insert into setores (id, empresa_id, nome) values ($1, $2, $3)", [
    setorSegredoB,
    idsTeste.empresaB,
    nomeSetorB
  ]);
  await executarSql(
    "insert into perfis_usuarios (usuario_id, empresa_id, nome, email, role) values ($1, $2, $3, $4, $5)",
    [usuarioSegredoB, idsTeste.empresaB, nomeUsuarioB, emailUsuarioB, "usuario_comum"]
  );
  await executarSql("insert into usuarios_empresas (usuario_id, empresa_id) values ($1, $2)", [
    usuarioSegredoB,
    idsTeste.empresaB
  ]);

  const regras = JSON.stringify({ [permissaoMarcadora]: true });
  await executarSql("insert into permissoes_cargos (cargo_id, regras) values ($1, $2::jsonb)", [cargoSegredoB, regras]);
  await executarSql("insert into permissoes_setores (setor_id, regras) values ($1, $2::jsonb)", [
    setorSegredoB,
    regras
  ]);
  await executarSql("insert into permissoes_usuarios (usuario_id, regras) values ($1, $2::jsonb)", [
    usuarioSegredoB,
    regras
  ]);
}

function esperarNenhumDadoDaEmpresaB(resposta: { json: () => unknown }) {
  expectNaoConterJson(resposta, nomeCargoB);
  expectNaoConterJson(resposta, nomeSetorB);
  expectNaoConterJson(resposta, nomeUsuarioB);
  expectNaoConterJson(resposta, emailUsuarioB);
  expectNaoConterJson(resposta, cargoSegredoB);
  expectNaoConterJson(resposta, setorSegredoB);
  expectNaoConterJson(resposta, usuarioSegredoB);
  expectNaoConterJson(resposta, permissaoMarcadora);
}

describe("permissoes cross-tenant integration", () => {
  let contexto: ContextoApiTeste;
  let cookieGerente: string;
  let cookieAdmin: string;
  let cookieMultiempresa: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    await criarAlvosExclusivosDaEmpresaB();
    cookieGerente = await cookieSessao(contexto.app, "gerente");
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    cookieMultiempresa = await cookieSessao(contexto.app, "multiempresa");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_Retornar403_Quando_UsuarioDaEmpresaAConsultaRegrasDaEmpresaB", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/permissoes/regras?empresaId=${idsTeste.empresaB}&pageSize=100`,
      headers: { cookie: cookieGerente }
    });

    esperarNenhumDadoDaEmpresaB(resposta);
    assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
  });

  // usuario_admin concede todas as permissoes, mas NAO alarga o escopo de empresas
  // (api/src/auth/perfil.service.ts:7). O admin da empresa A tem que bater no mesmo 403.
  it("Deve_Retornar403_Quando_AdminDaEmpresaAConsultaRegrasDaEmpresaB", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/permissoes/regras?empresaId=${idsTeste.empresaB}&pageSize=100`,
      headers: { cookie: cookieAdmin }
    });

    esperarNenhumDadoDaEmpresaB(resposta);
    assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
  });

  // O filtro direcionado nao pode virar uma segunda porta: mesmo apontando o alvo exato da empresa B,
  // o escopo tem que barrar antes.
  it("Deve_Retornar403_Quando_FiltrarAlvoEspecificoDaEmpresaB", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/permissoes/regras?empresaId=${idsTeste.empresaB}&tipoPermissao=cargo&alvoId=${cargoSegredoB}`,
      headers: { cookie: cookieGerente }
    });

    esperarNenhumDadoDaEmpresaB(resposta);
    assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
  });

  it("Deve_ListarRegrasDaPropriaEmpresa_Quando_UsuarioTemAcesso", async () => {
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/permissoes",
      headers: { cookie: cookieAdmin },
      payload: { tipoPermissao: "cargo", cargoId: idsTeste.cargoGerente, regras: { cadastro_contas_visualizar: true } }
    });
    expect(criado.statusCode).toBe(201);

    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/permissoes/regras?empresaId=${idsTeste.empresaA}&tipoPermissao=cargo&alvoId=${idsTeste.cargoGerente}`,
      headers: { cookie: cookieGerente }
    });

    assertOk(resposta);
    expect(JSON.stringify(resposta.json())).toContain("cadastro_contas_visualizar");
    esperarNenhumDadoDaEmpresaB(resposta);
  });

  // Sem empresaId o escopo cai para todas as empresas do perfil (api/src/auth/empresa.ts:23).
  // Para quem so tem a empresa A, isso nunca pode incluir a empresa B.
  it("Deve_EscoparApenasNasEmpresasDoPerfil_Quando_ConsultaSemEmpresaId", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: "/api/permissoes/regras?pageSize=100",
      headers: { cookie: cookieGerente }
    });

    assertOk(resposta);
    expect(JSON.stringify(resposta.json())).toContain(usuariosTeste.gerente.nome);
    esperarNenhumDadoDaEmpresaB(resposta);
  });

  // Contraprova: a correcao nao pode virar um 403 universal. Quem tem vinculo legitimo com a
  // empresa B continua enxergando os alvos dela.
  it("Deve_ListarRegrasDaEmpresaB_Quando_UsuarioTemVinculoComEla", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/permissoes/regras?empresaId=${idsTeste.empresaB}&pageSize=100`,
      headers: { cookie: cookieMultiempresa }
    });

    assertOk(resposta);
    const corpo = JSON.stringify(resposta.json());
    expect(corpo).toContain(nomeCargoB);
    expect(corpo).toContain(nomeSetorB);
    expect(corpo).toContain(nomeUsuarioB);
  });

  // Ultimo do arquivo de proposito: revoga o vinculo do multiempresa com a empresa B e nao o repoe.
  // O perfil e relido a cada request (api/src/auth/guards.ts:31-39), entao o mesmo cookie ja vale
  // menos na requisicao seguinte, sem novo login.
  it("Deve_Retornar403_Quando_AcessoAEmpresaBFoiRevogado", async () => {
    const perfil = await consultarUm<{ usuario_id: string }>(
      "select usuario_id from perfis_usuarios where email = $1",
      [usuariosTeste.multiempresa.email]
    );
    expect(perfil?.usuario_id).toBeTruthy();

    await executarSql("delete from usuarios_empresas where usuario_id = $1 and empresa_id = $2", [
      perfil?.usuario_id,
      idsTeste.empresaB
    ]);

    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/permissoes/regras?empresaId=${idsTeste.empresaB}&pageSize=100`,
      headers: { cookie: cookieMultiempresa }
    });

    esperarNenhumDadoDaEmpresaB(resposta);
    assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
  });
});
