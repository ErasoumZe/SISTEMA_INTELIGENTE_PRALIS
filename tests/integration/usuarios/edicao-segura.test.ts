import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql } from "../../setup/integracao.js";
import { pool } from "../../../api/src/banco/conexao.js";
import { salvarUsuario } from "../../../api/src/usuarios/usuarios.service.js";

// P-01 / S-01. `PUT /api/usuarios/:id` decidia TUDO pelo corpo: quem e o alvo, em que empresas ele
// esta e que papel ele passa a ter. O `:id` so era usado como chave de escrita.
//
// As duas consequencias, provadas aqui:
//
//   1. TAKEOVER — um ator ligado so a empresa A informa no `:id` um usuario real da empresa B e
//      manda no corpo apenas dados da A. O gate do controller (usuarios.controller.ts:11-14) le
//      `empresasDoUsuarioPayload(body)`, que nao conhece o alvo; o gate do service
//      (usuarios.service.ts:178-181) valida o mesmo conjunto vindo do corpo. Nenhum dos dois toca em
//      `perfis_usuarios`, `usuarios_empresas` ou `colaboradores` do alvo. O PUT entao reescreve
//      e-mail, empresa principal, vinculo de empresa e colaborador de um usuario de outra empresa.
//
//   2. ESCALADA — `role` e um campo livre do mesmo schema de create e update
//      (shared/src/usuarios/index.ts:22), gravado verbatim em usuarios.service.ts:264 e :308 sob o
//      unico guard `cadastro_usuarios_editar`. Quem edita usuarios promove qualquer um — inclusive a
//      si mesmo — a `usuario_admin`, que faz short-circuit para `permissoesAcessoTotal`
//      (api/src/auth/perfil.service.ts:11-13).
//
// Politica aplicada (23 §1 e §3):
//   - `usuario_admin` e o papel de acesso total; o role legado `admin` nao concede nada de especial;
//   - so `usuario_admin` cria `usuario_admin`, altera role ou edita um alvo que ja e `usuario_admin`;
//   - o escopo de empresa vale para TODO ator, inclusive `usuario_admin` (perfil.service.ts:7): editar
//     exige acesso a todas as empresas REAIS atuais do alvo e a todas as empresas enviadas no corpo;
//   - negacao de empresa -> 403 FORBIDDEN_COMPANY; negacao de privilegio -> 403 FORBIDDEN_PRIVILEGE;
//   - falha tecnica -> 500 logado, sem mensagem interna no corpo.

const CODIGO_PRIVILEGIO = "FORBIDDEN_PRIVILEGE";

// Empresa B: setor e cargo proprios, para o alvo da empresa B ter um vinculo operacional completo
// (o service exige cargo ativo no colaborador informado).
const setorB = "33333333-3333-4333-8333-0000000000e0";
const cargoB = "33333333-3333-4333-8333-0000000000e1";

type Alvo = {
  usuarioId: string;
  nome: string;
  email: string;
  role: "usuario_comum" | "usuario_admin";
  empresaPrincipal: string;
  empresas: string[];
  colaboradorId: string;
  colaboradorEmpresaId: string;
  colaboradorCargoId: string;
};

// Alvo real da empresa B. E o unico do arquivo cujo vinculo inteiro (perfil, empresa e colaborador)
// mora fora do escopo do editor da empresa A.
const alvoB: Alvo = {
  usuarioId: "alvo-empresa-b",
  nome: "ALVO-EMPRESA-B",
  email: "alvo.b@padaria.local",
  role: "usuario_comum",
  empresaPrincipal: idsTeste.empresaB,
  empresas: [idsTeste.empresaB],
  colaboradorId: "33333333-3333-4333-8333-0000000000e2",
  colaboradorEmpresaId: idsTeste.empresaB,
  colaboradorCargoId: "33333333-3333-4333-8333-0000000000e3"
};

// Alvo A+B. `substituirEmpresasUsuarioRepository` (usuarios.repository.ts:187-196) apaga TODAS as
// linhas de `usuarios_empresas` do alvo e reinsere so o que veio no corpo — entao um ator so da A
// que mande `empresaIds: [A]` remove o vinculo com a B sem nunca mencionar a B.
const alvoAB: Alvo = {
  usuarioId: "alvo-empresa-a-b",
  nome: "ALVO-EMPRESA-A-B",
  email: "alvo.ab@padaria.local",
  role: "usuario_comum",
  empresaPrincipal: idsTeste.empresaA,
  empresas: [idsTeste.empresaA, idsTeste.empresaB],
  colaboradorId: "11111111-1111-4111-8111-0000000000d1",
  colaboradorEmpresaId: idsTeste.empresaA,
  colaboradorCargoId: "11111111-1111-4111-8111-0000000000d2"
};

// Gemeo do anterior, para a contraprova: quem TEM as duas empresas continua editando o alvo A+B.
const alvoABLegitimo: Alvo = {
  usuarioId: "alvo-empresa-a-b-legitimo",
  nome: "ALVO-EMPRESA-A-B-LEGITIMO",
  email: "alvo.ab.legitimo@padaria.local",
  role: "usuario_comum",
  empresaPrincipal: idsTeste.empresaA,
  empresas: [idsTeste.empresaA, idsTeste.empresaB],
  colaboradorId: "11111111-1111-4111-8111-0000000000d3",
  colaboradorEmpresaId: idsTeste.empresaA,
  colaboradorCargoId: "11111111-1111-4111-8111-0000000000d4"
};

// Usuario comum da propria empresa do editor: a edicao legitima que a correcao NAO pode quebrar.
const alvoComumA: Alvo = {
  usuarioId: "alvo-comum-empresa-a",
  nome: "ALVO-COMUM-EMPRESA-A",
  email: "alvo.comum.a@padaria.local",
  role: "usuario_comum",
  empresaPrincipal: idsTeste.empresaA,
  empresas: [idsTeste.empresaA],
  colaboradorId: "11111111-1111-4111-8111-0000000000d5",
  colaboradorEmpresaId: idsTeste.empresaA,
  colaboradorCargoId: "11111111-1111-4111-8111-0000000000d6"
};

// Alvo dedicado da elevacao de terceiro: separado do `alvoComumA` para que o teste da edicao
// legitima nao dependa da ordem de execucao.
const alvoPromocaoA: Alvo = {
  usuarioId: "alvo-promocao-empresa-a",
  nome: "ALVO-PROMOCAO-EMPRESA-A",
  email: "alvo.promocao.a@padaria.local",
  role: "usuario_comum",
  empresaPrincipal: idsTeste.empresaA,
  empresas: [idsTeste.empresaA],
  colaboradorId: "11111111-1111-4111-8111-0000000000d7",
  colaboradorEmpresaId: idsTeste.empresaA,
  colaboradorCargoId: "11111111-1111-4111-8111-0000000000d8"
};

// Alvo que JA e usuario_admin, na mesma empresa do editor: o escopo de empresa passa e so o
// privilegio separa os dois.
const alvoAdminA: Alvo = {
  usuarioId: "alvo-admin-empresa-a",
  nome: "ALVO-ADMIN-EMPRESA-A",
  email: "alvo.admin.a@padaria.local",
  role: "usuario_admin",
  empresaPrincipal: idsTeste.empresaA,
  empresas: [idsTeste.empresaA],
  colaboradorId: "11111111-1111-4111-8111-0000000000d9",
  colaboradorEmpresaId: idsTeste.empresaA,
  colaboradorCargoId: "11111111-1111-4111-8111-0000000000da"
};

// Gemeo do anterior para a contraprova do `usuario_admin` editando um alvo `usuario_admin`.
const alvoAdminOperacao: Alvo = {
  usuarioId: "alvo-admin-operacao",
  nome: "ALVO-ADMIN-OPERACAO",
  email: "alvo.admin.operacao@padaria.local",
  role: "usuario_admin",
  empresaPrincipal: idsTeste.empresaA,
  empresas: [idsTeste.empresaA],
  colaboradorId: "11111111-1111-4111-8111-0000000000db",
  colaboradorEmpresaId: idsTeste.empresaA,
  colaboradorCargoId: "11111111-1111-4111-8111-0000000000dc"
};

// Alvo da promocao legitima feita por `usuario_admin`.
const alvoOperacaoA: Alvo = {
  usuarioId: "alvo-operacao-empresa-a",
  nome: "ALVO-OPERACAO-EMPRESA-A",
  email: "alvo.operacao.a@padaria.local",
  role: "usuario_comum",
  empresaPrincipal: idsTeste.empresaA,
  empresas: [idsTeste.empresaA],
  colaboradorId: "11111111-1111-4111-8111-0000000000dd",
  colaboradorEmpresaId: idsTeste.empresaA,
  colaboradorCargoId: "11111111-1111-4111-8111-0000000000de"
};

// Alvos da prova de fail-closed sem ator. Separados dos demais porque, no RED, a chamada sem ator
// EXECUTA a escrita — e corromperia o alvo de outro teste.
const alvoSemAtorAdmin: Alvo = {
  usuarioId: "alvo-sem-ator-admin",
  nome: "ALVO-SEM-ATOR-ADMIN",
  email: "alvo.sem.ator.admin@padaria.local",
  role: "usuario_admin",
  empresaPrincipal: idsTeste.empresaA,
  empresas: [idsTeste.empresaA],
  colaboradorId: "11111111-1111-4111-8111-0000000000f1",
  colaboradorEmpresaId: idsTeste.empresaA,
  colaboradorCargoId: "11111111-1111-4111-8111-0000000000f2"
};

const alvoSemAtorComum: Alvo = {
  usuarioId: "alvo-sem-ator-comum",
  nome: "ALVO-SEM-ATOR-COMUM",
  email: "alvo.sem.ator.comum@padaria.local",
  role: "usuario_comum",
  empresaPrincipal: idsTeste.empresaA,
  empresas: [idsTeste.empresaA],
  colaboradorId: "11111111-1111-4111-8111-0000000000f3",
  colaboradorEmpresaId: idsTeste.empresaA,
  colaboradorCargoId: "11111111-1111-4111-8111-0000000000f4"
};

// Alvos das corridas. Um por sentido do lock, porque o teste do sentido 1 COMMITA a mudanca de
// escopo e deixa o alvo na empresa B para sempre.
const alvoCorridaPerdida: Alvo = {
  usuarioId: "alvo-corrida-perdida",
  nome: "ALVO-CORRIDA-PERDIDA",
  email: "alvo.corrida.perdida@padaria.local",
  role: "usuario_comum",
  empresaPrincipal: idsTeste.empresaA,
  empresas: [idsTeste.empresaA],
  colaboradorId: "11111111-1111-4111-8111-0000000000f5",
  colaboradorEmpresaId: idsTeste.empresaA,
  colaboradorCargoId: "11111111-1111-4111-8111-0000000000f6"
};

const alvoCorridaGanha: Alvo = {
  usuarioId: "alvo-corrida-ganha",
  nome: "ALVO-CORRIDA-GANHA",
  email: "alvo.corrida.ganha@padaria.local",
  role: "usuario_comum",
  empresaPrincipal: idsTeste.empresaA,
  empresas: [idsTeste.empresaA],
  colaboradorId: "11111111-1111-4111-8111-0000000000f7",
  colaboradorEmpresaId: idsTeste.empresaA,
  colaboradorCargoId: "11111111-1111-4111-8111-0000000000f8"
};

// Alvos das corridas do COLABORADOR informado no corpo (um por caso, para nenhum depender da ordem).
function alvoDaCorridaDoColaborador(sufixo: string, indice: string): Alvo {
  return {
    usuarioId: `alvo-corrida-colab-${sufixo}`,
    nome: `ALVO-CORRIDA-COLAB-${sufixo.toUpperCase()}`,
    email: `alvo.corrida.colab.${sufixo}@padaria.local`,
    role: "usuario_comum",
    empresaPrincipal: idsTeste.empresaA,
    empresas: [idsTeste.empresaA],
    // O ultimo grupo do uuid tem 12 hex: 7 zeros + 4 do indice + 1 do papel.
    colaboradorId: `11111111-1111-4111-8111-0000000${indice}1`,
    colaboradorEmpresaId: idsTeste.empresaA,
    colaboradorCargoId: `11111111-1111-4111-8111-0000000${indice}2`
  };
}

const alvoColabMovido = alvoDaCorridaDoColaborador("movido", "0100");
const alvoColabRoubado = alvoDaCorridaDoColaborador("roubado", "0101");
const alvoColabBloqueio = alvoDaCorridaDoColaborador("bloqueio", "0102");
const alvoColabLegitimo = alvoDaCorridaDoColaborador("legitimo", "0103");

// Quem "ganha" o colaborador livre durante a corrida. Nascem SEM colaborador de proposito:
// `colaboradores_usuario_id_unico` (app.schema.ts:336-338) da no maximo um colaborador por usuario.
//
// Um dono por teste, e nao um compartilhado: com a correcao a recusa PRESERVA o vinculo que a
// concorrente criou, entao o segundo teste nao conseguiria dar um segundo colaborador ao mesmo dono.
// (No RED o vinculo era roubado de volta e o dono ficava livre — fixture que so funcionava enquanto o
// defeito existisse.)
const donoDoColaboradorRoubado = "usuario-dono-colab-roubado";
const donoDoColaboradorCriacao = "usuario-dono-colab-criacao";
const donosSemColaborador = [
  { id: donoDoColaboradorRoubado, nome: "DONO-COLAB-ROUBADO", email: "dono.colab.roubado@padaria.local" },
  { id: donoDoColaboradorCriacao, nome: "DONO-COLAB-CRIACAO", email: "dono.colab.criacao@padaria.local" }
];

const alvos = [
  alvoB,
  alvoAB,
  alvoABLegitimo,
  alvoComumA,
  alvoPromocaoA,
  alvoAdminA,
  alvoAdminOperacao,
  alvoOperacaoA,
  alvoSemAtorAdmin,
  alvoSemAtorComum,
  alvoCorridaPerdida,
  alvoCorridaGanha,
  alvoColabMovido,
  alvoColabRoubado,
  alvoColabBloqueio,
  alvoColabLegitimo
];

// Colaborador da empresa A, com cargo ativo e SEM usuario vinculado. E a peca que torna o payload do
// takeover 100% "empresa A": sem ele o atacante teria de citar o colaborador da empresa B e esbarraria
// na checagem de empresa do colaborador (usuarios.service.ts:166), provando outra regra.
const colaboradorLivreA = "11111111-1111-4111-8111-0000000000c1";
const colaboradorCargoLivreA = "11111111-1111-4111-8111-0000000000c2";

// Segundo colaborador livre, exclusivo do caso do alvo inexistente. Reusar o de cima tornava aquele
// teste dependente da ordem: no RED o takeover ja rouba o `colaboradorLivreA`, e o PUT seguinte
// morria em "Colaborador ja vinculado a outro usuario" (400) — vermelho pela regra errada, escondendo
// o defeito real, que e o perfil fantasma.
const colaboradorLivreFantasmaA = "11111111-1111-4111-8111-0000000000c3";
const colaboradorCargoLivreFantasmaA = "11111111-1111-4111-8111-0000000000c4";

// Colaboradores livres das corridas: um por caso, porque cada teste muda o estado do seu.
const colaboradorCorridaMovido = "11111111-1111-4111-8111-0000000000c5";
const colaboradorCorridaRoubado = "11111111-1111-4111-8111-0000000000c6";
const colaboradorCorridaCriacao = "11111111-1111-4111-8111-0000000000c7";
const colaboradorCorridaBloqueio = "11111111-1111-4111-8111-0000000000c8";
const colaboradorCorridaLegitimo = "11111111-1111-4111-8111-0000000000c9";
const colaboradoresLivresDaCorrida = [
  { id: colaboradorCorridaMovido, cargo: "11111111-1111-4111-8111-0000000000e5", nome: "COLAB-CORRIDA-MOVIDO" },
  { id: colaboradorCorridaRoubado, cargo: "11111111-1111-4111-8111-0000000000e6", nome: "COLAB-CORRIDA-ROUBADO" },
  { id: colaboradorCorridaCriacao, cargo: "11111111-1111-4111-8111-0000000000e7", nome: "COLAB-CORRIDA-CRIACAO" },
  { id: colaboradorCorridaBloqueio, cargo: "11111111-1111-4111-8111-0000000000e8", nome: "COLAB-CORRIDA-BLOQUEIO" },
  { id: colaboradorCorridaLegitimo, cargo: "11111111-1111-4111-8111-0000000000e9", nome: "COLAB-CORRIDA-LEGITIMO" }
];

// Id que nao existe em `perfis_usuarios`. `perfis_usuarios.usuario_id` e um `text` primary key SEM
// FK para a tabela de autenticacao (db/src/schema/app.schema.ts:120-132), entao o upsert de
// usuarios.repository.ts:168-185 INSERE um perfil novo em vez de falhar.
const alvoInexistente = "alvo-que-nunca-existiu";

async function criarCargoESetorDaEmpresaB() {
  await executarSql("insert into setores (id, empresa_id, nome) values ($1, $2, $3)", [
    setorB,
    idsTeste.empresaB,
    "SETOR-EMPRESA-B"
  ]);
  await executarSql("insert into cargos (id, empresa_id, nome) values ($1, $2, $3)", [
    cargoB,
    idsTeste.empresaB,
    "CARGO-EMPRESA-B"
  ]);
}

function cargoDaEmpresa(empresaId: string) {
  return empresaId === idsTeste.empresaB ? cargoB : idsTeste.cargoGerente;
}

function setorDaEmpresa(empresaId: string) {
  return empresaId === idsTeste.empresaB ? setorB : idsTeste.setorA;
}

async function criarAlvo(alvo: Alvo) {
  await executarSql(
    "insert into perfis_usuarios (usuario_id, empresa_id, nome, email, role) values ($1, $2, $3, $4, $5)",
    [alvo.usuarioId, alvo.empresaPrincipal, alvo.nome, alvo.email, alvo.role]
  );
  for (const empresaId of alvo.empresas) {
    await executarSql("insert into usuarios_empresas (usuario_id, empresa_id) values ($1, $2)", [
      alvo.usuarioId,
      empresaId
    ]);
  }
  await executarSql(
    "insert into colaboradores (id, empresa_id, nome, setor_id, usuario_id) values ($1, $2, $3, $4, $5)",
    [
      alvo.colaboradorId,
      alvo.colaboradorEmpresaId,
      `COLABORADOR-${alvo.nome}`,
      setorDaEmpresa(alvo.colaboradorEmpresaId),
      alvo.usuarioId
    ]
  );
  await executarSql(
    `insert into colaboradores_cargos
       (id, empresa_id, colaborador_id, setor_id, cargo_id, remuneracao_minuto, data_inicio, ativo)
     values ($1, $2, $3, $4, $5, $6, $7, true)`,
    [
      alvo.colaboradorCargoId,
      alvo.colaboradorEmpresaId,
      alvo.colaboradorId,
      setorDaEmpresa(alvo.colaboradorEmpresaId),
      cargoDaEmpresa(alvo.colaboradorEmpresaId),
      "1.000000",
      "2026-01-01"
    ]
  );
}

async function criarColaboradorLivreDaEmpresaA(colaboradorId: string, colaboradorCargoId: string, nome: string) {
  await executarSql(
    "insert into colaboradores (id, empresa_id, nome, setor_id, usuario_id) values ($1, $2, $3, $4, null)",
    [colaboradorId, idsTeste.empresaA, nome, idsTeste.setorA]
  );
  await executarSql(
    `insert into colaboradores_cargos
       (id, empresa_id, colaborador_id, setor_id, cargo_id, remuneracao_minuto, data_inicio, ativo)
     values ($1, $2, $3, $4, $5, $6, $7, true)`,
    [
      colaboradorCargoId,
      idsTeste.empresaA,
      colaboradorId,
      idsTeste.setorA,
      idsTeste.cargoGerente,
      "1.000000",
      "2026-01-01"
    ]
  );
}

async function usuarioDoColaborador(colaboradorId: string) {
  const linha = await consultarUm<{ usuario_id: string | null }>("select usuario_id from colaboradores where id = $1", [
    colaboradorId
  ]);
  return linha?.usuario_id ?? null;
}

async function usuarioIdPorEmail(email: string) {
  const linha = await consultarUm<{ usuario_id: string }>("select usuario_id from perfis_usuarios where email = $1", [
    email
  ]);
  if (!linha) throw new Error(`Perfil de teste nao encontrado: ${email}`);
  return linha.usuario_id;
}

// O `gerente` do seed e `usuario_comum` da empresa A e NAO tem as permissoes de escrita de usuarios
// (tests/setup/seed.ts:92-112). Concede-las aqui — e so elas — produz exatamente o ator do achado:
// alguem que pode editar usuarios e nao e `usuario_admin`. A camada `usuario` vence as demais
// (shared/src/autenticacao/index.ts:324-345), entao o merge no jsonb basta.
async function darAoGerenteAPermissaoDeEscreverUsuarios(gerenteId: string) {
  await executarSql(
    `update permissoes_usuarios
        set regras = regras || '{"cadastro_usuarios_criar": true, "cadastro_usuarios_editar": true}'::jsonb
      where usuario_id = $1`,
    [gerenteId]
  );
}

async function perfilDe(usuarioId: string) {
  return consultarUm<{ nome: string; email: string; role: string; empresa_id: string | null }>(
    "select nome, email, role, empresa_id from perfis_usuarios where usuario_id = $1",
    [usuarioId]
  );
}

async function empresasDe(usuarioId: string) {
  const linhas = await consultarTodos<{ empresa_id: string }>(
    "select empresa_id from usuarios_empresas where usuario_id = $1 order by empresa_id",
    [usuarioId]
  );
  return linhas.map((linha) => linha.empresa_id);
}

async function colaboradorVinculadoA(usuarioId: string) {
  const linha = await consultarUm<{ id: string }>("select id from colaboradores where usuario_id = $1", [usuarioId]);
  return linha?.id ?? null;
}

describe("edicao segura de usuarios integration", () => {
  let contexto: ContextoApiTeste;
  let cookieGerente: string;
  let cookieAdmin: string;
  let cookieMultiempresa: string;
  let gerenteId: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    await criarCargoESetorDaEmpresaB();
    for (const alvo of alvos) await criarAlvo(alvo);
    await criarColaboradorLivreDaEmpresaA(colaboradorLivreA, colaboradorCargoLivreA, "COLABORADOR-LIVRE-EMPRESA-A");
    await criarColaboradorLivreDaEmpresaA(
      colaboradorLivreFantasmaA,
      colaboradorCargoLivreFantasmaA,
      "COLABORADOR-LIVRE-FANTASMA-EMPRESA-A"
    );
    for (const livre of colaboradoresLivresDaCorrida) {
      await criarColaboradorLivreDaEmpresaA(livre.id, livre.cargo, livre.nome);
    }
    for (const dono of donosSemColaborador) {
      await executarSql(
        "insert into perfis_usuarios (usuario_id, empresa_id, nome, email, role) values ($1, $2, $3, $4, 'usuario_comum')",
        [dono.id, idsTeste.empresaA, dono.nome, dono.email]
      );
      await executarSql("insert into usuarios_empresas (usuario_id, empresa_id) values ($1, $2)", [
        dono.id,
        idsTeste.empresaA
      ]);
    }
    gerenteId = await usuarioIdPorEmail(usuariosTeste.gerente.email);
    await darAoGerenteAPermissaoDeEscreverUsuarios(gerenteId);
    cookieGerente = await cookieSessao(contexto.app, "gerente");
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    cookieMultiempresa = await cookieSessao(contexto.app, "multiempresa");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  // O caso central. Corpo 100% da empresa A — `empresaIds: [A]` e um colaborador livre da A — e no
  // `:id` um usuario real da empresa B. Hoje responde 204 e reescreve o alvo inteiro.
  it("Deve_Retornar403_Quando_EditorDaEmpresaAInformaAlvoDaEmpresaB", async () => {
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/usuarios/${alvoB.usuarioId}`,
      headers: { cookie: cookieGerente },
      payload: {
        empresaIds: [idsTeste.empresaA],
        nome: "SEQUESTRADO PELA EMPRESA A",
        email: "sequestrado.pela.a@padaria.local",
        colaboradorId: colaboradorLivreA
      }
    });

    assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
    // Nao basta o status: o alvo tem de continuar INTEIRO. Cada campo abaixo e um dos quatro
    // vetores de escrita do PUT (perfil, empresa principal, vinculo de empresa, colaborador).
    expect(await perfilDe(alvoB.usuarioId)).toMatchObject({
      nome: alvoB.nome,
      email: alvoB.email,
      role: "usuario_comum",
      empresa_id: idsTeste.empresaB
    });
    expect(await empresasDe(alvoB.usuarioId)).toEqual([idsTeste.empresaB]);
    expect(await colaboradorVinculadoA(alvoB.usuarioId)).toBe(alvoB.colaboradorId);
    // Contraparte do vinculo: `vincularUsuarioColaboradorRepository` mexe nos DOIS lados, entao o
    // colaborador livre da empresa A tambem tem de continuar livre.
    expect(await usuarioDoColaborador(colaboradorLivreA)).toBeNull();
  });

  // Vinculo A+B e substituicao total: o editor so da A manda `[A]` e a linha da B some sem que a B
  // apareca em lugar nenhum do pedido.
  it("Deve_Retornar403_Quando_EditorDaEmpresaAEditaAlvoVinculadoAsEmpresasAEB", async () => {
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/usuarios/${alvoAB.usuarioId}`,
      headers: { cookie: cookieGerente },
      payload: {
        empresaIds: [idsTeste.empresaA],
        nome: alvoAB.nome,
        email: alvoAB.email,
        colaboradorId: alvoAB.colaboradorId
      }
    });

    assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
    expect(await empresasDe(alvoAB.usuarioId)).toEqual([idsTeste.empresaA, idsTeste.empresaB]);
  });

  // Contraprova do caso acima: a regra e "o ator precisa alcancar todas as empresas reais do alvo",
  // e nao "alvo multiempresa e intocavel". O `multiempresa` do seed e usuario_admin com A e B.
  it("Deve_Editar_Quando_AtorComAsDuasEmpresasEditaAlvoVinculadoAsEmpresasAEB", async () => {
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/usuarios/${alvoABLegitimo.usuarioId}`,
      headers: { cookie: cookieMultiempresa },
      payload: {
        empresaIds: [idsTeste.empresaA, idsTeste.empresaB],
        nome: "ALVO A+B EDITADO PELO ATOR A+B",
        email: alvoABLegitimo.email,
        colaboradorId: alvoABLegitimo.colaboradorId
      }
    });

    expect(resposta.statusCode).toBe(204);
    expect(await perfilDe(alvoABLegitimo.usuarioId)).toMatchObject({ nome: "ALVO A+B EDITADO PELO ATOR A+B" });
    expect(await empresasDe(alvoABLegitimo.usuarioId)).toEqual([idsTeste.empresaA, idsTeste.empresaB]);
  });

  // Autoelevacao: o proprio editor no `:id`, com `role: usuario_admin`. E o caminho mais curto para
  // acesso irrestrito, porque `usuario_admin` faz short-circuit para `permissoesAcessoTotal`.
  it("Deve_Retornar403_Quando_EditorNaoAdminPromoveASiProprioParaUsuarioAdmin", async () => {
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/usuarios/${gerenteId}`,
      headers: { cookie: cookieGerente },
      payload: {
        empresaIds: [idsTeste.empresaA],
        nome: usuariosTeste.gerente.nome,
        email: usuariosTeste.gerente.email,
        role: "usuario_admin",
        colaboradorId: idsTeste.colaboradorGerente
      }
    });

    try {
      assertProblem(resposta, 403, CODIGO_PRIVILEGIO);
      expect(await perfilDe(gerenteId)).toMatchObject({ role: "usuario_comum" });
    } finally {
      // No RED este teste elege o ator a usuario_admin de verdade e todos os casos seguintes que
      // dependem de ele NAO ser privilegiado ficariam verdes pelo motivo errado. A restauracao roda
      // depois da assercao, entao ela nao esconde a falha — so impede o falso verde em cascata.
      await executarSql("update perfis_usuarios set role = 'usuario_comum' where usuario_id = $1", [gerenteId]);
    }
  });

  // Elevacao de terceiro. Mesmo vetor, alvo diferente: o corpo e legitimo em tudo menos no `role`.
  it("Deve_Retornar403_Quando_EditorNaoAdminPromoveTerceiroParaUsuarioAdmin", async () => {
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/usuarios/${alvoPromocaoA.usuarioId}`,
      headers: { cookie: cookieGerente },
      payload: {
        empresaIds: [idsTeste.empresaA],
        nome: alvoPromocaoA.nome,
        email: alvoPromocaoA.email,
        role: "usuario_admin",
        colaboradorId: alvoPromocaoA.colaboradorId
      }
    });

    assertProblem(resposta, 403, CODIGO_PRIVILEGIO);
    expect(await perfilDe(alvoPromocaoA.usuarioId)).toMatchObject({ role: "usuario_comum" });
  });

  // `cadastro_usuarios_criar` nao pode fabricar um acesso total. Sem esta trava a de edicao seria
  // contornavel em um pedido: cria-se o admin e loga-se com ele.
  it("Deve_Retornar403_Quando_EditorNaoAdminCriaUsuarioAdmin", async () => {
    const email = "usuario.admin.indevido@padaria.local";
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/usuarios",
      headers: { cookie: cookieGerente },
      payload: {
        empresaIds: [idsTeste.empresaA],
        nome: "USUARIO ADMIN INDEVIDO",
        email,
        role: "usuario_admin",
        senha: "Teste#2026!indevido",
        novoColaborador: {
          empresaId: idsTeste.empresaA,
          nome: "COLABORADOR ADMIN INDEVIDO",
          setorId: idsTeste.setorA,
          cargoId: idsTeste.cargoGerente
        }
      }
    });

    assertProblem(resposta, 403, CODIGO_PRIVILEGIO);
    // A recusa tem de ser ANTES de qualquer escrita: nem perfil, nem usuario de autenticacao.
    expect(
      await consultarUm<{ usuario_id: string }>("select usuario_id from perfis_usuarios where email = $1", [email])
    ).toBeNull();
    expect(
      await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [email])
    ).toBeNull();
  });

  // Editar um alvo que JA e `usuario_admin` — sem sequer mexer no `role`. Trocar o e-mail dele e
  // suficiente para tomar a conta pelo fluxo de recuperacao de senha, entao a trava e sobre o ALVO,
  // nao sobre o campo.
  it("Deve_Retornar403_Quando_EditorNaoAdminEditaAlvoQueJaEUsuarioAdmin", async () => {
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/usuarios/${alvoAdminA.usuarioId}`,
      headers: { cookie: cookieGerente },
      payload: {
        empresaIds: [idsTeste.empresaA],
        nome: "ADMIN COM E-MAIL TROCADO",
        email: "admin.roubado@padaria.local",
        colaboradorId: alvoAdminA.colaboradorId
      }
    });

    assertProblem(resposta, 403, CODIGO_PRIVILEGIO);
    expect(await perfilDe(alvoAdminA.usuarioId)).toMatchObject({
      nome: alvoAdminA.nome,
      email: alvoAdminA.email,
      role: "usuario_admin"
    });
  });

  // A contraprova que impede a sobrecorrecao. O trabalho normal do cargo — editar um usuario comum
  // da propria empresa — continua funcionando, INCLUSIVE mandando o `role` atual de volta, que e o
  // que a tela faz (o formulario preenche o campo com o valor vindo do GET).
  it("Deve_Editar_Quando_EditorNaoAdminEditaUsuarioComumDaPropriaEmpresaSemMudarRole", async () => {
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/usuarios/${alvoComumA.usuarioId}`,
      headers: { cookie: cookieGerente },
      payload: {
        empresaIds: [idsTeste.empresaA],
        nome: "ALVO COMUM EDITADO LEGITIMAMENTE",
        email: "alvo.comum.a.editado@padaria.local",
        role: "usuario_comum",
        colaboradorId: alvoComumA.colaboradorId
      }
    });

    expect(resposta.statusCode).toBe(204);
    expect(await perfilDe(alvoComumA.usuarioId)).toMatchObject({
      nome: "ALVO COMUM EDITADO LEGITIMAMENTE",
      email: "alvo.comum.a.editado@padaria.local",
      role: "usuario_comum"
    });
    expect(await empresasDe(alvoComumA.usuarioId)).toEqual([idsTeste.empresaA]);
  });

  // Operacao autorizada: `usuario_admin` da empresa A altera o role de um usuario da empresa A.
  it("Deve_AlterarRole_Quando_UsuarioAdminPromoveUsuarioDaPropriaEmpresa", async () => {
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/usuarios/${alvoOperacaoA.usuarioId}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaIds: [idsTeste.empresaA],
        nome: alvoOperacaoA.nome,
        email: alvoOperacaoA.email,
        role: "usuario_admin",
        colaboradorId: alvoOperacaoA.colaboradorId
      }
    });

    expect(resposta.statusCode).toBe(204);
    expect(await perfilDe(alvoOperacaoA.usuarioId)).toMatchObject({ role: "usuario_admin" });
  });

  // Contraparte da trava do alvo privilegiado: quem E `usuario_admin` continua editando outro
  // `usuario_admin`. Sem este caso, travar o alvo admin para todo mundo passaria despercebido.
  it("Deve_Editar_Quando_UsuarioAdminEditaAlvoQueJaEUsuarioAdmin", async () => {
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/usuarios/${alvoAdminOperacao.usuarioId}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaIds: [idsTeste.empresaA],
        nome: "ALVO ADMIN EDITADO PELO ADMIN",
        email: alvoAdminOperacao.email,
        colaboradorId: alvoAdminOperacao.colaboradorId
      }
    });

    expect(resposta.statusCode).toBe(204);
    expect(await perfilDe(alvoAdminOperacao.usuarioId)).toMatchObject({
      nome: "ALVO ADMIN EDITADO PELO ADMIN",
      role: "usuario_admin"
    });
  });

  // Alvo inexistente. Hoje o upsert INSERE um perfil novo com o id inventado, grava as empresas e
  // rouba o colaborador livre — um usuario fantasma que a tela lista e que ninguem criou.
  it("Deve_Retornar404_Quando_AlvoDoPutNaoExiste", async () => {
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/usuarios/${alvoInexistente}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaIds: [idsTeste.empresaA],
        nome: "USUARIO FANTASMA",
        email: "usuario.fantasma@padaria.local",
        colaboradorId: colaboradorLivreFantasmaA
      }
    });

    assertProblem(resposta, 404);
    expect(await perfilDe(alvoInexistente)).toBeNull();
    expect(await empresasDe(alvoInexistente)).toEqual([]);
    expect(await colaboradorVinculadoA(alvoInexistente)).toBeNull();
    // O colaborador continua livre: nenhum vinculo parcial ficou para tras.
    expect(await usuarioDoColaborador(colaboradorLivreFantasmaA)).toBeNull();
  });

  // Negacao de empresa pelo colaborador informado tambem e negacao de empresa: hoje o service usa
  // `falharValidacao("Empresa nao permitida")`, que o controller mapeia para 403 SEM `code`
  // (utils.ts:24-28 + shared/src/api/index.ts:274). O contrato da rota tem de ser um so.
  it("Deve_Retornar403ComCodigoDeEmpresa_Quando_ColaboradorInformadoEDeOutraEmpresa", async () => {
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/usuarios/${alvoComumA.usuarioId}`,
      headers: { cookie: cookieGerente },
      payload: {
        empresaIds: [idsTeste.empresaA],
        nome: alvoComumA.nome,
        email: "alvo.comum.a.editado@padaria.local",
        colaboradorId: alvoB.colaboradorId
      }
    });

    assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
  });

  // Falha tecnica na carga do alvo nao pode virar negacao.
  //
  // A carga do alvo passou a rodar DENTRO da transacao, e o Drizzle abre transacao com
  // `pool.connect()` — as consultas de dentro nao passam por `pool.query`. Por isso a substituicao
  // aqui e no `connect`, embrulhando o `query` do cliente entregue. O filtro continua por PARAMETRO,
  // e nao so pelo texto do SQL: e o que impede derrubar junto a consulta de perfil do proprio ator no
  // preHandler de autenticacao, que tambem le `perfis_usuarios`.
  //
  // Cada cliente embrulhado e restaurado no `finally`, um a um: o pool reusa clientes, e deixar o
  // embrulho ligado envenenaria os proximos testes do processo.
  it("Deve_Retornar500_Quando_OBancoFalhaAoCarregarOAlvoDaEdicao", async () => {
    const conectarOriginal = pool.connect.bind(pool);
    const embrulhados: { cliente: pg.PoolClient; original: pg.PoolClient["query"] }[] = [];
    pool.connect = ((...args: unknown[]) => {
      // `connect` tem duas formas. Com callback e a que o PROPRIO `pool.query` usa por dentro, e ela
      // nao devolve promessa — embrulhar essa forma quebrava toda consulta fora de transacao. So a
      // forma sem argumento interessa aqui: e a que o Drizzle usa para abrir transacao.
      if (args.length) return (conectarOriginal as (...a: unknown[]) => unknown)(...args);
      return (conectarOriginal as () => Promise<pg.PoolClient>)().then((cliente) => {
        // Guarda a versao JA LIGADA ao cliente: e o que se devolve no `finally`, e restaurar uma
        // referencia ligada mantem o `this` certo sem depender do metodo solto do prototipo.
        const queryOriginal = cliente.query.bind(cliente);
        embrulhados.push({ cliente, original: queryOriginal });
        cliente.query = ((texto: unknown, ...resto: unknown[]) => {
          const sql = typeof texto === "string" ? texto : String((texto as { text?: string })?.text ?? "");
          const parametros = Array.isArray(resto[0]) ? (resto[0] as unknown[]) : [];
          if (sql.includes('from "perfis_usuarios"') && parametros.includes(alvoComumA.usuarioId)) {
            return Promise.reject(new Error("banco fora do ar (simulado)"));
          }
          return (queryOriginal as (...a: unknown[]) => unknown)(texto, ...resto);
        }) as typeof cliente.query;
        return cliente;
      });
    }) as typeof pool.connect;

    try {
      const resposta = await contexto.app.inject({
        method: "PUT",
        url: `/api/usuarios/${alvoComumA.usuarioId}`,
        headers: { cookie: cookieGerente },
        payload: {
          empresaIds: [idsTeste.empresaA],
          nome: alvoComumA.nome,
          email: "alvo.comum.a.editado@padaria.local",
          role: "usuario_comum",
          colaboradorId: alvoComumA.colaboradorId
        }
      });

      expect(resposta.statusCode).toBe(500);
      const corpo = JSON.stringify(resposta.json());
      expect(corpo).not.toContain("FORBIDDEN_COMPANY");
      expect(corpo).not.toContain(CODIGO_PRIVILEGIO);
      expect(corpo).not.toContain("banco fora do ar (simulado)");
    } finally {
      pool.connect = conectarOriginal;
      for (const { cliente, original } of embrulhados) cliente.query = original;
    }
  });

  // Sem isto o teste acima envenenaria os proximos arquivos se deixasse o pool quebrado.
  it("Deve_VoltarAEditar_Quando_OBancoResponderDeNovo", async () => {
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/usuarios/${alvoComumA.usuarioId}`,
      headers: { cookie: cookieGerente },
      payload: {
        empresaIds: [idsTeste.empresaA],
        nome: "ALVO COMUM DEPOIS DA FALHA",
        email: "alvo.comum.a.editado@padaria.local",
        role: "usuario_comum",
        colaboradorId: alvoComumA.colaboradorId
      }
    });

    expect(resposta.statusCode).toBe(204);
    expect(await perfilDe(alvoComumA.usuarioId)).toMatchObject({ nome: "ALVO COMUM DEPOIS DA FALHA" });
  });

  // --- Fail-closed sem ator ---------------------------------------------------------------------
  //
  // `temAcessoTotal` devolvia `true` quando o perfil era `undefined`, e o escopo de empresa tambem
  // liberava tudo nesse caso. Hoje o controller autenticado sempre passa um perfil, entao nada
  // explode — mas a rota confia num invariante que o TIPO nao garante (`perfil?: PerfilAtor`), e
  // qualquer chamador interno futuro herdaria acesso total sem pedir. Ausencia de ator nao pode ser
  // sinonimo de administrador; tem de ser sinonimo de nenhuma autorizacao.
  //
  // A prova e por chamada DIRETA ao service, porque pela rota o perfil nunca falta — e e exatamente
  // o caminho que um chamador interno usaria.
  describe("sem ator autenticado", () => {
    it("Deve_Recusar_Quando_ChamadaSemAtorTentaEditarAlvoQueJaEUsuarioAdmin", async () => {
      await expect(
        salvarUsuario(alvoSemAtorAdmin.usuarioId, {
          empresaIds: [idsTeste.empresaA],
          nome: "ADMIN EDITADO SEM ATOR",
          email: "admin.sem.ator@padaria.local",
          colaboradorId: alvoSemAtorAdmin.colaboradorId
        })
      ).rejects.toMatchObject({ status: 403, code: "PROFILE_NOT_CONFIGURED" });

      expect(await perfilDe(alvoSemAtorAdmin.usuarioId)).toMatchObject({
        nome: alvoSemAtorAdmin.nome,
        email: alvoSemAtorAdmin.email,
        role: "usuario_admin"
      });
    });

    it("Deve_Recusar_Quando_ChamadaSemAtorAlteraRole", async () => {
      await expect(
        salvarUsuario(alvoSemAtorComum.usuarioId, {
          empresaIds: [idsTeste.empresaA],
          nome: alvoSemAtorComum.nome,
          email: alvoSemAtorComum.email,
          role: "usuario_admin",
          colaboradorId: alvoSemAtorComum.colaboradorId
        })
      ).rejects.toMatchObject({ status: 403, code: "PROFILE_NOT_CONFIGURED" });

      expect(await perfilDe(alvoSemAtorComum.usuarioId)).toMatchObject({ role: "usuario_comum" });
    });

    it("Deve_Recusar_Quando_ChamadaSemAtorCriaUsuarioAdmin", async () => {
      const email = "criado.sem.ator@padaria.local";
      await expect(
        salvarUsuario(null, {
          empresaIds: [idsTeste.empresaA],
          nome: "CRIADO SEM ATOR",
          email,
          role: "usuario_admin",
          senha: "Teste#2026!semator",
          novoColaborador: {
            empresaId: idsTeste.empresaA,
            nome: "COLABORADOR CRIADO SEM ATOR",
            setorId: idsTeste.setorA,
            cargoId: idsTeste.cargoGerente
          }
        })
      ).rejects.toMatchObject({ status: 403, code: "PROFILE_NOT_CONFIGURED" });

      // Recusa antes de qualquer escrita, inclusive a do Better Auth.
      expect(
        await consultarUm<{ usuario_id: string }>("select usuario_id from perfis_usuarios where email = $1", [email])
      ).toBeNull();
      expect(
        await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [email])
      ).toBeNull();
    });
  });

  // --- Corrida entre a autorizacao e a escrita (TOCTOU) -----------------------------------------
  //
  // A autorizacao lia o alvo FORA da transacao e sem travar nada. Entre "o alvo esta na empresa A,
  // pode editar" e o `UPDATE`, outra transacao move o alvo para a empresa B: a edicao antiga escreve
  // assim mesmo, com um veredito que ja nao vale — e ainda por cima devolve o alvo para a empresa A,
  // porque a substituicao de empresas e total.
  //
  // A serializacao e por lock de linha em `perfis_usuarios`, dentro da MESMA transacao das escritas.
  // A linha do perfil e a raiz certa porque as duas escritas que mudam escopo —
  // `substituirEmpresasUsuarioRepository` e `vincularUsuarioColaboradorRepository` — so tem chamador
  // em `usuarios.service.ts`, nos dois ramos, e ambos passam por ela.
  //
  // Os dois testes sao deterministicos: quem manda na ordem e o `FOR UPDATE` que o PROPRIO teste
  // segura, nao o relogio.
  describe("corrida com mudanca de escopo do alvo", () => {
    async function clienteDireto() {
      const cliente = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
      await cliente.connect();
      return cliente;
    }

    // Espera ate existir uma sessao BLOQUEADA em lock no banco — o sinal observavel de que a
    // requisicao da API chegou na linha travada. Sem isto o teste dependeria de `sleep`.
    async function esperarSessaoBloqueadaEmLock(cliente: pg.Client, limiteMs = 20_000) {
      const inicio = Date.now();
      while (Date.now() - inicio < limiteMs) {
        const { rows } = await cliente.query<{ total: number }>(
          `select count(*)::int as total
             from pg_stat_activity
            where datname = current_database()
              and pid <> pg_backend_pid()
              and wait_event_type = 'Lock'`
        );
        if ((rows[0]?.total ?? 0) > 0) return true;
        await new Promise((resolver) => setTimeout(resolver, 25));
      }
      return false;
    }

    async function aindaPendente(promessa: Promise<unknown>) {
      const marcador = Symbol("pendente");
      return (await Promise.race([promessa.then(() => "resolvida"), Promise.resolve(marcador)])) === marcador;
    }

    async function moverAlvoParaEmpresaB(cliente: pg.Client, usuarioId: string) {
      await cliente.query("delete from usuarios_empresas where usuario_id = $1", [usuarioId]);
      await cliente.query("insert into usuarios_empresas (usuario_id, empresa_id) values ($1, $2)", [
        usuarioId,
        idsTeste.empresaB
      ]);
      await cliente.query("update perfis_usuarios set empresa_id = $2 where usuario_id = $1", [
        usuarioId,
        idsTeste.empresaB
      ]);
    }

    // Sentido 1 — a concorrente ganha o lock. A edicao tem de acordar, reler o alvo JA movido e
    // recusar, sem escrever nada.
    it("Deve_Retornar403SemEscrever_Quando_OutraTransacaoMoveOAlvoParaForaDoEscopoPrimeiro", async () => {
      const cliente = await clienteDireto();
      try {
        await cliente.query("begin");
        await cliente.query("select usuario_id from perfis_usuarios where usuario_id = $1 for update", [
          alvoCorridaPerdida.usuarioId
        ]);
        await moverAlvoParaEmpresaB(cliente, alvoCorridaPerdida.usuarioId);

        const promessa = contexto.app.inject({
          method: "PUT",
          url: `/api/usuarios/${alvoCorridaPerdida.usuarioId}`,
          headers: { cookie: cookieGerente },
          payload: {
            empresaIds: [idsTeste.empresaA],
            nome: "EDITADO COM ESTADO VELHO",
            email: "editado.com.estado.velho@padaria.local",
            colaboradorId: alvoCorridaPerdida.colaboradorId
          }
        });

        expect(await esperarSessaoBloqueadaEmLock(cliente)).toBe(true);
        // Prova que a requisicao NAO passou por cima do lock.
        expect(await aindaPendente(promessa)).toBe(true);

        await cliente.query("commit");
        const resposta = await promessa;

        assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
        // O alvo continua exatamente como a transacao concorrente o deixou. Se a edicao tivesse
        // escrito com o veredito velho, `nome`/`email` seriam os do atacante e `usuarios_empresas`
        // voltaria para a empresa A — que e o dano real da corrida.
        expect(await perfilDe(alvoCorridaPerdida.usuarioId)).toMatchObject({
          nome: alvoCorridaPerdida.nome,
          email: alvoCorridaPerdida.email,
          empresa_id: idsTeste.empresaB
        });
        expect(await empresasDe(alvoCorridaPerdida.usuarioId)).toEqual([idsTeste.empresaB]);
        expect(await colaboradorVinculadoA(alvoCorridaPerdida.usuarioId)).toBe(alvoCorridaPerdida.colaboradorId);
      } finally {
        await cliente.query("rollback").catch(() => undefined);
        await cliente.end();
      }
    });

    // Sentido 2 — contraprova de que a contencao nao quebra a edicao: ela espera o lock, acorda e
    // executa INTEIRA sobre o estado que leu; a movimentacao seguinte se aplica por cima sem perder o
    // que foi editado.
    //
    // O que este teste NAO prova, e antes o nome dizia que provava: que uma transacao concorrente
    // ficou bloqueada ATRAS da edicao. Aqui a concorrente solta o lock e so DEPOIS a movimentacao
    // roda — isso e ordem sequencial, nao bloqueio. Quem prova o bloqueio e o teste seguinte, com
    // `FOR UPDATE NOWAIT`.
    it("Deve_EditarInteiro_Quando_EsperaOLockDoAlvoEAMovimentacaoRodaEmSeguida", async () => {
      const cliente = await clienteDireto();
      try {
        await cliente.query("begin");
        await cliente.query("select usuario_id from perfis_usuarios where usuario_id = $1 for update", [
          alvoCorridaGanha.usuarioId
        ]);

        const promessa = contexto.app.inject({
          method: "PUT",
          url: `/api/usuarios/${alvoCorridaGanha.usuarioId}`,
          headers: { cookie: cookieGerente },
          payload: {
            empresaIds: [idsTeste.empresaA],
            nome: "EDITADO SOB CONTENCAO",
            email: alvoCorridaGanha.email,
            role: "usuario_comum",
            colaboradorId: alvoCorridaGanha.colaboradorId
          }
        });

        expect(await esperarSessaoBloqueadaEmLock(cliente)).toBe(true);
        expect(await aindaPendente(promessa)).toBe(true);

        // A concorrente solta o lock SEM mudar nada: a edicao acorda, le o estado original e vale.
        await cliente.query("rollback");
        const resposta = await promessa;
        expect(resposta.statusCode).toBe(204);
        expect(await perfilDe(alvoCorridaGanha.usuarioId)).toMatchObject({ nome: "EDITADO SOB CONTENCAO" });
        expect(await empresasDe(alvoCorridaGanha.usuarioId)).toEqual([idsTeste.empresaA]);

        // Agora a mudanca concorrente roda DEPOIS. A ordem serial e edicao -> movimentacao: o nome
        // editado sobrevive e a empresa nova vale. Nada de estado misturado.
        await cliente.query("begin");
        await cliente.query("select usuario_id from perfis_usuarios where usuario_id = $1 for update", [
          alvoCorridaGanha.usuarioId
        ]);
        await moverAlvoParaEmpresaB(cliente, alvoCorridaGanha.usuarioId);
        await cliente.query("commit");

        expect(await perfilDe(alvoCorridaGanha.usuarioId)).toMatchObject({
          nome: "EDITADO SOB CONTENCAO",
          empresa_id: idsTeste.empresaB
        });
        expect(await empresasDe(alvoCorridaGanha.usuarioId)).toEqual([idsTeste.empresaB]);
      } finally {
        await cliente.query("rollback").catch(() => undefined);
        await cliente.end();
      }
    });
  });

  // --- Corrida no COLABORADOR informado pelo corpo ----------------------------------------------
  //
  // O lock do alvo fechou a corrida do lado do usuario editado. Sobrava a outra ponta: o colaborador
  // vinha de `buscarColaboradorUsuarioRepository`, lido ANTES da transacao, e o objeto guardado era
  // reusado la dentro como se ainda valesse. Entre a leitura e o vinculo cabe outra transacao mover o
  // colaborador de empresa ou vincula-lo a outro usuario — e a requisicao antiga gravava assim mesmo,
  // com a autorizacao vencida.
  //
  // Agora a pre-leitura serve so para responder rapido, e quem autoriza e a releitura com
  // `FOR UPDATE` dentro da transacao. A ordem dos locks e sempre perfil -> colaborador, para duas
  // edicoes simultaneas nao se travarem em cruz.
  describe("corrida no colaborador informado pelo corpo", () => {
    async function clienteDireto() {
      const cliente = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
      await cliente.connect();
      return cliente;
    }

    async function esperarSessaoBloqueadaEmLock(cliente: pg.Client, limiteMs = 20_000) {
      const inicio = Date.now();
      while (Date.now() - inicio < limiteMs) {
        const { rows } = await cliente.query<{ total: number }>(
          `select count(*)::int as total
             from pg_stat_activity
            where datname = current_database()
              and pid <> pg_backend_pid()
              and wait_event_type = 'Lock'`
        );
        if ((rows[0]?.total ?? 0) > 0) return true;
        await new Promise((resolver) => setTimeout(resolver, 25));
      }
      return false;
    }

    async function aindaPendente(promessa: Promise<unknown>) {
      const marcador = Symbol("pendente");
      return (await Promise.race([promessa.then(() => "resolvida"), Promise.resolve(marcador)])) === marcador;
    }

    // Segura a linha do colaborador e devolve o cliente com a transacao ABERTA.
    async function travarColaborador(cliente: pg.Client, colaboradorId: string) {
      await cliente.query("begin");
      await cliente.query("select id from colaboradores where id = $1 for update", [colaboradorId]);
    }

    // Sentido 1 do enunciado: o colaborador estava na empresa A na pre-leitura e vai para a B antes da
    // validacao transacional.
    it("Deve_Retornar403SemEscrever_Quando_OColaboradorEMovidoParaOutraEmpresaAntesDaValidacaoTransacional", async () => {
      const cliente = await clienteDireto();
      try {
        await travarColaborador(cliente, colaboradorCorridaMovido);
        await cliente.query("update colaboradores set empresa_id = $2 where id = $1", [
          colaboradorCorridaMovido,
          idsTeste.empresaB
        ]);

        const promessa = contexto.app.inject({
          method: "PUT",
          url: `/api/usuarios/${alvoColabMovido.usuarioId}`,
          headers: { cookie: cookieGerente },
          payload: {
            empresaIds: [idsTeste.empresaA],
            nome: "EDITADO COM COLABORADOR VELHO",
            email: alvoColabMovido.email,
            colaboradorId: colaboradorCorridaMovido
          }
        });

        expect(await esperarSessaoBloqueadaEmLock(cliente)).toBe(true);
        expect(await aindaPendente(promessa)).toBe(true);

        await cliente.query("commit");
        const resposta = await promessa;

        assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
        // Nada foi escrito: nem no alvo, nem no colaborador.
        expect(await perfilDe(alvoColabMovido.usuarioId)).toMatchObject({ nome: alvoColabMovido.nome });
        expect(await colaboradorVinculadoA(alvoColabMovido.usuarioId)).toBe(alvoColabMovido.colaboradorId);
        expect(await usuarioDoColaborador(colaboradorCorridaMovido)).toBeNull();
      } finally {
        await cliente.query("rollback").catch(() => undefined);
        await cliente.end();
      }
    });

    // Sentido 2 do enunciado: o colaborador estava livre na pre-leitura e ganha dono antes da
    // validacao transacional. A requisicao antiga nao pode ROUBAR o vinculo.
    it("Deve_RecusarSemRoubarVinculo_Quando_OColaboradorEVinculadoAOutroUsuarioAntesDaValidacaoTransacional", async () => {
      const cliente = await clienteDireto();
      try {
        await travarColaborador(cliente, colaboradorCorridaRoubado);
        await cliente.query("update colaboradores set usuario_id = $2 where id = $1", [
          colaboradorCorridaRoubado,
          donoDoColaboradorRoubado
        ]);

        const promessa = contexto.app.inject({
          method: "PUT",
          url: `/api/usuarios/${alvoColabRoubado.usuarioId}`,
          headers: { cookie: cookieGerente },
          payload: {
            empresaIds: [idsTeste.empresaA],
            nome: "EDITADO ROUBANDO COLABORADOR",
            email: alvoColabRoubado.email,
            colaboradorId: colaboradorCorridaRoubado
          }
        });

        expect(await esperarSessaoBloqueadaEmLock(cliente)).toBe(true);
        expect(await aindaPendente(promessa)).toBe(true);

        await cliente.query("commit");
        const resposta = await promessa;

        assertProblem(resposta, 400);
        // O vinculo continua com quem o ganhou na corrida.
        expect(await usuarioDoColaborador(colaboradorCorridaRoubado)).toBe(donoDoColaboradorRoubado);
        expect(await perfilDe(alvoColabRoubado.usuarioId)).toMatchObject({ nome: alvoColabRoubado.nome });
      } finally {
        await cliente.query("rollback").catch(() => undefined);
        await cliente.end();
      }
    });

    // Criacao que perde a corrida. Aqui o `signUpEmail` ja commitou numa transacao PROPRIA antes de a
    // nossa abrir, entao recusar depois exige compensacao — senao sobra um usuario de autenticacao
    // orfao que ainda por cima bloqueia toda nova tentativa com o mesmo e-mail.
    it("Deve_NaoDeixarOrfao_Quando_ACriacaoPerdeACorridaDoColaborador", async () => {
      const email = "criacao.perde.corrida@padaria.local";
      const cliente = await clienteDireto();
      try {
        await travarColaborador(cliente, colaboradorCorridaCriacao);
        await cliente.query("update colaboradores set usuario_id = $2 where id = $1", [
          colaboradorCorridaCriacao,
          donoDoColaboradorCriacao
        ]);

        const promessa = contexto.app.inject({
          method: "POST",
          url: "/api/usuarios",
          headers: { cookie: cookieGerente },
          payload: {
            empresaIds: [idsTeste.empresaA],
            nome: "USUARIO QUE PERDE A CORRIDA",
            email,
            senha: "Teste#2026!corrida",
            colaboradorId: colaboradorCorridaCriacao
          }
        });

        expect(await esperarSessaoBloqueadaEmLock(cliente)).toBe(true);
        expect(await aindaPendente(promessa)).toBe(true);

        await cliente.query("commit");
        const resposta = await promessa;

        assertProblem(resposta, 400);
        // Compensacao completa: nem autenticacao, nem credencial, nem perfil, nem vinculo de empresa.
        expect(
          await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [email])
        ).toBeNull();
        expect(
          await consultarUm<{ id: string }>(
            'select a.id from account a join "user" u on u.id = a."userId" where lower(u.email) = lower($1)',
            [email]
          )
        ).toBeNull();
        expect(
          await consultarUm<{ usuario_id: string }>("select usuario_id from perfis_usuarios where email = $1", [email])
        ).toBeNull();
        expect(
          await consultarUm<{ usuario_id: string }>(
            "select ue.usuario_id from usuarios_empresas ue join perfis_usuarios p on p.usuario_id = ue.usuario_id where p.email = $1",
            [email]
          )
        ).toBeNull();
        // E o colaborador continua com o dono que ganhou a corrida.
        expect(await usuarioDoColaborador(colaboradorCorridaCriacao)).toBe(donoDoColaboradorCriacao);
      } finally {
        await cliente.query("rollback").catch(() => undefined);
        await cliente.end();
      }
    });

    // O teste que prova BLOQUEIO, e nao apenas ordem: enquanto a edicao espera o lock do colaborador,
    // ela JA SEGURA o lock do alvo. Uma terceira transacao pedindo esse mesmo lock com `NOWAIT` tem de
    // ser recusada na hora, com o codigo 55P03 (`lock_not_available`) do Postgres.
    it("Deve_BloquearOutraTransacao_Quando_AEdicaoJaSeguraOLockDoAlvo", async () => {
      const seguraColaborador = await clienteDireto();
      const tentaAlvo = await clienteDireto();

      async function pedirLockDoAlvoSemEsperar() {
        try {
          await tentaAlvo.query("begin");
          await tentaAlvo.query("select usuario_id from perfis_usuarios where usuario_id = $1 for update nowait", [
            alvoColabBloqueio.usuarioId
          ]);
          await tentaAlvo.query("rollback");
          return null;
        } catch (erro) {
          await tentaAlvo.query("rollback").catch(() => undefined);
          return (erro as { code?: string }).code ?? "erro-sem-codigo";
        }
      }

      try {
        await travarColaborador(seguraColaborador, colaboradorCorridaBloqueio);

        const promessa = contexto.app.inject({
          method: "PUT",
          url: `/api/usuarios/${alvoColabBloqueio.usuarioId}`,
          headers: { cookie: cookieGerente },
          payload: {
            empresaIds: [idsTeste.empresaA],
            nome: "EDICAO SEGURANDO O LOCK",
            email: alvoColabBloqueio.email,
            colaboradorId: colaboradorCorridaBloqueio
          }
        });

        // A edicao ja pegou o lock do alvo e agora espera o do colaborador.
        expect(await esperarSessaoBloqueadaEmLock(seguraColaborador)).toBe(true);
        expect(await aindaPendente(promessa)).toBe(true);

        // 55P03 = lock_not_available. E a prova direta de que a linha do alvo esta travada POR ela.
        expect(await pedirLockDoAlvoSemEsperar()).toBe("55P03");

        await seguraColaborador.query("rollback");
        expect((await promessa).statusCode).toBe(204);

        // Solto o lock e concluida a edicao, a mesma transacao concorrente passa.
        expect(await pedirLockDoAlvoSemEsperar()).toBeNull();
        expect(await perfilDe(alvoColabBloqueio.usuarioId)).toMatchObject({ nome: "EDICAO SEGURANDO O LOCK" });
      } finally {
        await seguraColaborador.query("rollback").catch(() => undefined);
        await seguraColaborador.end();
        await tentaAlvo.end();
      }
    });

    // Contraprova: contencao no colaborador nao pode quebrar a edicao legitima. A concorrente solta o
    // lock sem mudar nada e a edicao segue normalmente.
    it("Deve_Editar_Quando_OLockDoColaboradorELiberadoSemMudanca", async () => {
      const cliente = await clienteDireto();
      try {
        await travarColaborador(cliente, colaboradorCorridaLegitimo);

        const promessa = contexto.app.inject({
          method: "PUT",
          url: `/api/usuarios/${alvoColabLegitimo.usuarioId}`,
          headers: { cookie: cookieGerente },
          payload: {
            empresaIds: [idsTeste.empresaA],
            nome: "EDICAO LEGITIMA SOB CONTENCAO",
            email: alvoColabLegitimo.email,
            role: "usuario_comum",
            colaboradorId: colaboradorCorridaLegitimo
          }
        });

        expect(await esperarSessaoBloqueadaEmLock(cliente)).toBe(true);
        await cliente.query("rollback");

        expect((await promessa).statusCode).toBe(204);
        expect(await perfilDe(alvoColabLegitimo.usuarioId)).toMatchObject({ nome: "EDICAO LEGITIMA SOB CONTENCAO" });
        // O vinculo trocou para o colaborador informado, e o antigo ficou livre.
        expect(await usuarioDoColaborador(colaboradorCorridaLegitimo)).toBe(alvoColabLegitimo.usuarioId);
        expect(await usuarioDoColaborador(alvoColabLegitimo.colaboradorId)).toBeNull();
      } finally {
        await cliente.query("rollback").catch(() => undefined);
        await cliente.end();
      }
    });
  });
});
