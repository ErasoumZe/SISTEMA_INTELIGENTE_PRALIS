import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { executarSql, expectNaoConterJson, json } from "../../setup/integracao.js";

// O PR #137 fechou QUAIS LINHAS aparecem (escopoEmpresaAtiva). Ficou de fora QUAIS CAMPOS de cada
// linha: `filtrarUsuariosPorEmpresas` (usuarios.service.ts:27-33 e a gemea em permissoes.service.ts:
// 48-54) mantem a linha INTEIRA quando qualquer empresa do usuario esta no escopo, e
// listarUsuariosRepository (usuarios.repository.ts:27-74) monta essa linha lendo as quatro tabelas
// SEM nenhum `where` de empresa. Um usuario com vinculo em A e B entrega, na consulta escopada em A,
// os metadados da B.
//
// A mesma funcao alimenta as duas rotas: permissoes.repository.ts:34 chama listarUsuariosRepository()
// e permissoes.service.ts:83 devolve `usuarios` verbatim. Causa raiz unica, dois vazamentos.
const usuarioCompartilhado = "usuario-compartilhado-empresa-a-b";
const nomeUsuarioCompartilhado = "USUARIO-COMPARTILHADO-A-B";
const emailUsuarioCompartilhado = "compartilhado.a.b@padaria.local";
// Metadados que existem SOMENTE na empresa B. Sao os identificadores que a resposta escopada na
// empresa A nao pode conter — nem o uuid, nem o nome legivel.
const setorSegredoB = "33333333-3333-4333-8333-0000000000f1";
const cargoSegredoB = "33333333-3333-4333-8333-0000000000f2";
const colaboradorSegredoB = "33333333-3333-4333-8333-0000000000f3";
const colaboradorCargoSegredoB = "33333333-3333-4333-8333-0000000000f4";
const nomeSetorB = "SETOR-EXCLUSIVO-EMPRESA-B";
const nomeCargoB = "CARGO-EXCLUSIVO-EMPRESA-B";
const nomeColaboradorB = "COLABORADOR-EXCLUSIVO-EMPRESA-B";

// O colaborador nasce na empresa B de proposito: `colaboradores_usuario_id_unico`
// (app.schema.ts:336-338) garante que um usuario tem no maximo UM colaborador em todo o banco, e
// `colaboradores.empresa_id` (app.schema.ts:324) e notNull. Entao o vinculo operacional do usuario
// compartilhado mora inteiro na empresa B — e hoje sai na consulta escopada na empresa A.
async function criarUsuarioCompartilhadoComMetadadosDaEmpresaB() {
  await executarSql("insert into setores (id, empresa_id, nome) values ($1, $2, $3)", [
    setorSegredoB,
    idsTeste.empresaB,
    nomeSetorB
  ]);
  await executarSql("insert into cargos (id, empresa_id, nome) values ($1, $2, $3)", [
    cargoSegredoB,
    idsTeste.empresaB,
    nomeCargoB
  ]);
  // `perfis_usuarios.empresa_id` guarda a empresa "principal" e e um valor unico e global
  // (app.schema.ts:120-132). Apontar para a B cobre tambem o campo `empresaId` da resposta.
  await executarSql(
    "insert into perfis_usuarios (usuario_id, empresa_id, nome, email, role) values ($1, $2, $3, $4, $5)",
    [usuarioCompartilhado, idsTeste.empresaB, nomeUsuarioCompartilhado, emailUsuarioCompartilhado, "usuario_comum"]
  );
  // O vinculo com a empresa A e o que faz a linha passar pelo filtro do escopo A. Sem ele o usuario
  // nem apareceria, e o teste ficaria verde por ausencia de dado em vez de por isolamento.
  await executarSql("insert into usuarios_empresas (usuario_id, empresa_id) values ($1, $2), ($1, $3)", [
    usuarioCompartilhado,
    idsTeste.empresaA,
    idsTeste.empresaB
  ]);
  await executarSql(
    "insert into colaboradores (id, empresa_id, nome, setor_id, usuario_id) values ($1, $2, $3, $4, $5)",
    [colaboradorSegredoB, idsTeste.empresaB, nomeColaboradorB, setorSegredoB, usuarioCompartilhado]
  );
  await executarSql(
    `insert into colaboradores_cargos
       (id, empresa_id, colaborador_id, setor_id, cargo_id, remuneracao_minuto, data_inicio, ativo)
     values ($1, $2, $3, $4, $5, $6, $7, true)`,
    [
      colaboradorCargoSegredoB,
      idsTeste.empresaB,
      colaboradorSegredoB,
      setorSegredoB,
      cargoSegredoB,
      "1.000000",
      "2026-01-01"
    ]
  );
}

// Os oito identificadores que pertencem exclusivamente a empresa B. Nenhum deles pode aparecer numa
// resposta escopada na empresa A — nem como uuid (util para mirar outras rotas) nem como nome
// legivel (estrutura organizacional alheia).
function esperarNenhumMetadadoDaEmpresaB(resposta: { json: () => unknown }) {
  expectNaoConterJson(resposta, idsTeste.empresaB);
  expectNaoConterJson(resposta, colaboradorSegredoB);
  expectNaoConterJson(resposta, setorSegredoB);
  expectNaoConterJson(resposta, cargoSegredoB);
  expectNaoConterJson(resposta, nomeCargoB);
  expectNaoConterJson(resposta, nomeSetorB);
  expectNaoConterJson(resposta, nomeColaboradorB);
  expectNaoConterJson(resposta, colaboradorCargoSegredoB);
}

describe("metadados de usuario cross-tenant integration", () => {
  let contexto: ContextoApiTeste;
  let cookieGerente: string;
  let cookieAdmin: string;
  let cookieMultiempresa: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    await criarUsuarioCompartilhadoComMetadadosDaEmpresaB();
    cookieGerente = await cookieSessao(contexto.app, "gerente");
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    cookieMultiempresa = await cookieSessao(contexto.app, "multiempresa");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  // O caso central. O gerente so tem vinculo com a empresa A (seed.ts:308), consulta escopada em A, e
  // a linha do usuario compartilhado volta com empresaIds [A, B], colaboradorId, setorId, cargoIds e
  // cargos que sao todos da empresa B.
  it("Deve_NaoVazarMetadadosDaEmpresaB_Quando_ListarUsuariosEscopadoNaEmpresaA", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/usuarios?empresaId=${idsTeste.empresaA}&pageSize=100`,
      headers: { cookie: cookieGerente }
    });

    assertOk(resposta);
    // Contraprova positiva: a correcao e de projecao de campos, nao de omissao de linha. O usuario
    // compartilhado TEM vinculo com a empresa A e precisa continuar listavel a partir dela — some-lo
    // apagaria as regras de permissao dele na tela (permissoes.service.ts:84,136-137) e criaria
    // vinculo fantasma na grade "quem pode movimentar" da tela de contas.
    expect(JSON.stringify(resposta.json())).toContain(nomeUsuarioCompartilhado);
    // Sem esta ancora o teste passaria por paginacao: o pageSize default da rota e 10
    // (shared/src/api/index.ts:67) e o alvo cairia na pagina 2, provando nada.
    expect(json<{ meta: { pagination: { total: number } } }>(resposta).meta.pagination.total).toBeLessThan(100);
    esperarNenhumMetadadoDaEmpresaB(resposta);
  });

  // Mesma causa raiz, outra rota: permissoes.repository.ts:34 reusa listarUsuariosRepository() e
  // permissoes.service.ts:83 devolve a linha verbatim no campo `usuarios`.
  it("Deve_NaoVazarMetadadosDaEmpresaB_Quando_ListarPermissoesEscopadoNaEmpresaA", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/permissoes?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieGerente }
    });

    assertOk(resposta);
    expect(JSON.stringify(resposta.json())).toContain(nomeUsuarioCompartilhado);
    esperarNenhumMetadadoDaEmpresaB(resposta);
  });

  // `usuario_admin` concede o catalogo inteiro de permissoes, mas NAO alarga o escopo de empresas
  // (api/src/auth/perfil.service.ts:7). O admin da empresa A tem que receber a mesma linha recortada.
  it("Deve_NaoVazarMetadadosDaEmpresaB_Quando_AdminDaEmpresaAListaUsuarios", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/usuarios?empresaId=${idsTeste.empresaA}&pageSize=100`,
      headers: { cookie: cookieAdmin }
    });

    assertOk(resposta);
    esperarNenhumMetadadoDaEmpresaB(resposta);
  });

  // Sem empresaId o escopo cai para todas as empresas do perfil (api/src/auth/empresa.ts:23). Para
  // quem so tem a empresa A, isso nunca pode incluir a B — nem em campo agregado.
  it("Deve_NaoVazarMetadadosDaEmpresaB_Quando_ListarUsuariosSemEmpresaId", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: "/api/usuarios?pageSize=100",
      headers: { cookie: cookieGerente }
    });

    assertOk(resposta);
    expect(json<{ meta: { pagination: { total: number } } }>(resposta).meta.pagination.total).toBeLessThan(100);
    esperarNenhumMetadadoDaEmpresaB(resposta);
  });

  // Contraprova: o recorte nao pode virar cegueira universal. Quem tem vinculo legitimo com a B
  // continua vendo os metadados dela quando escopa na B.
  it("Deve_ListarMetadadosDaEmpresaB_Quando_UsuarioTemVinculoComEla", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/usuarios?empresaId=${idsTeste.empresaB}&pageSize=100`,
      headers: { cookie: cookieMultiempresa }
    });

    assertOk(resposta);
    const corpo = JSON.stringify(resposta.json());
    expect(corpo).toContain(nomeUsuarioCompartilhado);
    expect(corpo).toContain(colaboradorSegredoB);
    expect(corpo).toContain(nomeCargoB);
    expect(corpo).toContain(setorSegredoB);
  });

  // Ator com vinculo em A e B escopando em A: e o unico ator capaz de provar o recorte de
  // `empresaIds`, porque para quem so tem a empresa A a lista permitida e o escopo sao iguais. Ele
  // enxerga a empresa B legitimamente, mas nao NESTA consulta.
  it("Deve_RecortarEmpresaIds_Quando_MultiempresaEscopaNaEmpresaA", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/usuarios?empresaId=${idsTeste.empresaA}&pageSize=100`,
      headers: { cookie: cookieMultiempresa }
    });

    assertOk(resposta);
    expect(JSON.stringify(resposta.json())).toContain(nomeUsuarioCompartilhado);
    esperarNenhumMetadadoDaEmpresaB(resposta);
  });

  // Informar a empresa B sem vinculo continua sendo negacao de escopo, nao lista vazia.
  it("Deve_Retornar403_Quando_GerenteDaEmpresaAListaUsuariosDaEmpresaB", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/usuarios?empresaId=${idsTeste.empresaB}&pageSize=100`,
      headers: { cookie: cookieGerente }
    });

    esperarNenhumMetadadoDaEmpresaB(resposta);
    assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
  });

  // O ZodError da query tem de continuar virando 400 pelo handler global. O catch da rota classifica
  // por mensagem, entao este caso trava a fronteira entre negacao de escopo e erro de validacao.
  it("Deve_Retornar400_Quando_EmpresaIdNaoEUuidNaRotaDeUsuarios", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: "/api/usuarios?empresaId=nao-e-uuid",
      headers: { cookie: cookieGerente }
    });

    assertProblem(resposta, 400);
  });
});
