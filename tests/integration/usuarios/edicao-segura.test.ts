import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql } from "../../setup/integracao.js";
import { pool } from "../../../api/src/banco/conexao.js";
import { auth } from "../../../api/src/auth/config.js";
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

// --- Papel legado `admin` ----------------------------------------------------------------------
//
// Ele NAO concede permissoes (auth/perfil.service.ts), mas concede poder de verdade em dois lugares:
// `podeLancarSemCaixa` (shared/src/autenticacao/index.ts) e `podeLiberarTravaTransferencia`
// (api/src/transferencias/transferencias.service.ts). Enquanto isso for verdade, ele e um papel
// PRIVILEGIADO para a seguranca de usuarios — tanto como alvo quanto como papel concedivel.
const alvoAdminLegado = alvoDaCorridaDoColaborador("adminlegado", "0110");
const alvoAdminLegadoOperacao = alvoDaCorridaDoColaborador("adminlegadoop", "0111");
const alvoPromocaoLegado = alvoDaCorridaDoColaborador("promolegado", "0112");
const alvoOperadoPorLegado = alvoDaCorridaDoColaborador("operadolegado", "0113");

// --- Troca simultanea de colaboradores (deadlock) ----------------------------------------------
const alvoTrocaUm = alvoDaCorridaDoColaborador("trocaum", "0120");
const alvoTrocaDois = alvoDaCorridaDoColaborador("trocadois", "0121");

// Alvo da corrida do CARGO. O colaborador dele e o que tem o cargo desativado — e ele precisa estar
// REALMENTE vinculado a um usuario, senao o guard "colaborador com usuario precisa ter ao menos um
// cargo ativo" nunca dispara e a invariante final fica inatingivel por construcao.
const alvoColabCargo = alvoDaCorridaDoColaborador("cargo", "0130");

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
  alvoColabLegitimo,
  alvoAdminLegado,
  alvoAdminLegadoOperacao,
  alvoPromocaoLegado,
  alvoOperadoPorLegado,
  alvoTrocaUm,
  alvoTrocaDois,
  alvoColabCargo
];

// Os dois alvos do papel legado nascem `usuario_comum` (o tipo `Alvo` so aceita os dois papeis do
// seed) e sao promovidos a `admin` por SQL no beforeAll — o papel legado nao existe em fixture nenhuma.
const alvosPromovidosAAdminLegado = [alvoAdminLegado.usuarioId, alvoAdminLegadoOperacao.usuarioId];

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

// --- Ferramental das corridas -----------------------------------------------------------------
//
// Antes havia duas copias deste bloco, e o detector era `wait_event_type = 'Lock'` — "existe ALGUM
// waiter no banco". Isso e falso positivo esperando para acontecer: qualquer outra sessao travada,
// inclusive de outro teste, satisfazia a condicao e o teste passava sem provar nada.
//
// Agora a transacao bloqueadora informa o proprio `pg_backend_pid()` e o teste exige que a sessao
// esperando esteja bloqueada ESPECIFICAMENTE por ela, via `pg_blocking_pids(pid)` (core do Postgres
// desde a 9.6; nao precisa de extensao nem de superusuario).
type ClienteBloqueador = { cliente: pg.Client; pid: number };

async function abrirBloqueador(): Promise<ClienteBloqueador> {
  const cliente = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
  await cliente.connect();
  try {
    // Teto de espera por lock NESTA conexao: se um teste for interrompido (timeout do vitest) o
    // `finally` dele nao roda, e sem teto a transacao ficaria segurando a linha e cada teste seguinte
    // queimaria os 60s do `testTimeout`. Um erro limpo e melhor que uma cascata.
    await cliente.query("set lock_timeout = '15s'");
    const { rows } = await cliente.query<{ pid: number }>("select pg_backend_pid() as pid");
    const pid = rows[0]?.pid;
    if (pid === undefined) throw new Error("nao foi possivel obter o pid da conexao bloqueadora");
    return { cliente, pid };
  } catch (erro) {
    // Sem isto a conexao vazava para o resto do processo quando a preparacao falhava.
    await cliente.end().catch(() => undefined);
    throw erro;
  }
}

async function sessoesBloqueadasPor({ cliente, pid }: ClienteBloqueador) {
  const { rows } = await cliente.query<{ total: number }>(
    `select count(*)::int as total
       from pg_stat_activity
      where datname = current_database()
        and pid <> pg_backend_pid()
        and $1 = any(pg_blocking_pids(pid))`,
    [pid]
  );
  return rows[0]?.total ?? 0;
}

async function esperarBloqueioPor(bloqueador: ClienteBloqueador, minimo = 1, limiteMs = 20_000) {
  const inicio = Date.now();
  while (Date.now() - inicio < limiteMs) {
    if ((await sessoesBloqueadasPor(bloqueador)) >= minimo) return true;
    await new Promise((resolver) => setTimeout(resolver, 25));
  }
  return false;
}

// O sentinela precisa de um TICK de macrotask, nao de uma microtask. Com `Promise.resolve(marcador)`
// a corrida era decidida antes de `promessa.then(...)` sequer executar o callback — a funcao devolvia
// `true` inclusive para uma promessa JA RESOLVIDA, e as sete assercoes que dependiam dela nao provavam
// nada. `setTimeout(0)` deixa toda a fila de microtasks drenar primeiro.
async function aindaPendente(promessa: Promise<unknown>) {
  const marcador = Symbol("pendente");
  return (
    (await Promise.race([
      promessa.then(
        () => "resolvida",
        () => "rejeitada"
      ),
      new Promise((resolver) => setTimeout(() => resolver(marcador), 0))
    ])) === marcador
  );
}

// Higiene de teste concorrente: mesmo que uma assercao estoure no meio, a requisicao em voo precisa
// terminar antes do proximo teste — senao ela acorda no meio dele e contamina o estado. Sempre depois
// de soltar o lock, e com teto, para um bug nao virar suite pendurada.
//
// O teto torna isto BEST-EFFORT, nao garantia: se ele estourar, a requisicao abandonada ainda pode
// acordar depois. Na pratica o lock ja foi solto antes, entao a drenagem e imediata.
async function encerrarRequisicao(promessa: Promise<unknown> | null, limiteMs = 30_000) {
  if (!promessa) return;
  // O timer e limpo no fim: sem isso cada chamada deixava um `setTimeout` de 30s armado segurando o
  // event loop depois que a suite ja terminou.
  let temporizador: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      Promise.allSettled([promessa]),
      new Promise((resolver) => {
        temporizador = setTimeout(resolver, limiteMs);
      })
    ]);
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }
}

async function liberarBloqueador({ cliente }: ClienteBloqueador) {
  await cliente.query("rollback").catch(() => undefined);
  await cliente.end().catch(() => undefined);
}

describe("edicao segura de usuarios integration", () => {
  let contexto: ContextoApiTeste;
  let cookieGerente: string;
  let cookieAdmin: string;
  let cookieMultiempresa: string;
  let cookieAdminLegado: string;
  let gerenteId: string;
  let atorLegadoId: string;

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

    // Alvos com o papel LEGADO. Nenhuma fixture do seed tem `admin` — o tipo do seed nem aceita —
    // entao a promocao e por SQL.
    for (const usuarioId of alvosPromovidosAAdminLegado) {
      await executarSql("update perfis_usuarios set role = 'admin' where usuario_id = $1", [usuarioId]);
    }
    // ATOR com o papel legado: a `tesouraria` do seed vira `admin` e ganha as permissoes de escrita.
    // Ela nao e usada por nenhum outro teste deste arquivo, e o banco e recriado por arquivo.
    atorLegadoId = await usuarioIdPorEmail(usuariosTeste.tesouraria.email);
    await executarSql("update perfis_usuarios set role = 'admin' where usuario_id = $1", [atorLegadoId]);
    await darAoGerenteAPermissaoDeEscreverUsuarios(atorLegadoId);

    cookieGerente = await cookieSessao(contexto.app, "gerente");
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    cookieMultiempresa = await cookieSessao(contexto.app, "multiempresa");
    cookieAdminLegado = await cookieSessao(contexto.app, "tesouraria");
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
      const bloqueador = await abrirBloqueador();
      const { cliente } = bloqueador;
      let emVoo: Promise<unknown> | null = null;
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

        emVoo = promessa;
        expect(await esperarBloqueioPor(bloqueador)).toBe(true);
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
        // Solta o lock ANTES de esperar a requisicao: na ordem inversa a suite penduraria.
        await liberarBloqueador(bloqueador);
        await encerrarRequisicao(emVoo);
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
      const bloqueador = await abrirBloqueador();
      const { cliente } = bloqueador;
      let emVoo: Promise<unknown> | null = null;
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

        emVoo = promessa;
        expect(await esperarBloqueioPor(bloqueador)).toBe(true);
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
        // Solta o lock ANTES de esperar a requisicao: na ordem inversa a suite penduraria.
        await liberarBloqueador(bloqueador);
        await encerrarRequisicao(emVoo);
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
    // Segura a linha do colaborador e devolve o cliente com a transacao ABERTA.
    async function travarColaborador(cliente: pg.Client, colaboradorId: string) {
      await cliente.query("begin");
      await cliente.query("select id from colaboradores where id = $1 for update", [colaboradorId]);
    }

    // Sentido 1 do enunciado: o colaborador estava na empresa A na pre-leitura e vai para a B antes da
    // validacao transacional.
    it("Deve_Retornar403SemEscrever_Quando_OColaboradorEMovidoParaOutraEmpresaAntesDaValidacaoTransacional", async () => {
      const bloqueador = await abrirBloqueador();
      const { cliente } = bloqueador;
      let emVoo: Promise<unknown> | null = null;
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

        emVoo = promessa;
        expect(await esperarBloqueioPor(bloqueador)).toBe(true);
        expect(await aindaPendente(promessa)).toBe(true);

        await cliente.query("commit");
        const resposta = await promessa;

        assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
        // Nada foi escrito: nem no alvo, nem no colaborador.
        expect(await perfilDe(alvoColabMovido.usuarioId)).toMatchObject({ nome: alvoColabMovido.nome });
        expect(await colaboradorVinculadoA(alvoColabMovido.usuarioId)).toBe(alvoColabMovido.colaboradorId);
        expect(await usuarioDoColaborador(colaboradorCorridaMovido)).toBeNull();
      } finally {
        // Solta o lock ANTES de esperar a requisicao: na ordem inversa a suite penduraria.
        await liberarBloqueador(bloqueador);
        await encerrarRequisicao(emVoo);
      }
    });

    // Sentido 2 do enunciado: o colaborador estava livre na pre-leitura e ganha dono antes da
    // validacao transacional. A requisicao antiga nao pode ROUBAR o vinculo.
    it("Deve_RecusarSemRoubarVinculo_Quando_OColaboradorEVinculadoAOutroUsuarioAntesDaValidacaoTransacional", async () => {
      const bloqueador = await abrirBloqueador();
      const { cliente } = bloqueador;
      let emVoo: Promise<unknown> | null = null;
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

        emVoo = promessa;
        expect(await esperarBloqueioPor(bloqueador)).toBe(true);
        expect(await aindaPendente(promessa)).toBe(true);

        await cliente.query("commit");
        const resposta = await promessa;

        assertProblem(resposta, 400);
        // O vinculo continua com quem o ganhou na corrida.
        expect(await usuarioDoColaborador(colaboradorCorridaRoubado)).toBe(donoDoColaboradorRoubado);
        expect(await perfilDe(alvoColabRoubado.usuarioId)).toMatchObject({ nome: alvoColabRoubado.nome });
      } finally {
        // Solta o lock ANTES de esperar a requisicao: na ordem inversa a suite penduraria.
        await liberarBloqueador(bloqueador);
        await encerrarRequisicao(emVoo);
      }
    });

    // Criacao que perde a corrida. Aqui o `signUpEmail` ja commitou numa transacao PROPRIA antes de a
    // nossa abrir, entao recusar depois exige compensacao — senao sobra um usuario de autenticacao
    // orfao que ainda por cima bloqueia toda nova tentativa com o mesmo e-mail.
    it("Deve_NaoDeixarOrfao_Quando_ACriacaoPerdeACorridaDoColaborador", async () => {
      const email = "criacao.perde.corrida@padaria.local";
      const bloqueador = await abrirBloqueador();
      const { cliente } = bloqueador;
      let emVoo: Promise<unknown> | null = null;
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

        emVoo = promessa;
        expect(await esperarBloqueioPor(bloqueador)).toBe(true);
        expect(await aindaPendente(promessa)).toBe(true);

        // ANTES de soltar o lock: o `signUpEmail` ja commitou na transacao dele, entao `user` e
        // `account` desta requisicao TEM de existir agora. Sem esta prova, os `toBeNull` do final
        // seriam satisfeitos por um cadastro que nunca chegou a acontecer — o teste passaria sem
        // exercitar compensacao nenhuma. O id capturado aqui e o alvo das verificacoes finais.
        const criado = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
          email
        ]);
        expect(criado?.id).toBeTruthy();
        const idCriado = criado!.id;
        expect(
          await consultarUm<{ id: string }>('select id from account where "userId" = $1', [idCriado])
        ).not.toBeNull();

        await cliente.query("commit");
        const resposta = await promessa;

        assertProblem(resposta, 400);
        // Compensacao completa, verificada POR ID. As consultas por e-mail ou com join em
        // `perfis_usuarios` escondem exatamente a linha orfa que interessa.
        expect(await consultarUm<{ id: string }>('select id from "user" where id = $1', [idCriado])).toBeNull();
        expect(await consultarUm<{ id: string }>('select id from account where "userId" = $1', [idCriado])).toBeNull();
        expect(
          await consultarUm<{ usuario_id: string }>("select usuario_id from perfis_usuarios where usuario_id = $1", [
            idCriado
          ])
        ).toBeNull();
        expect(
          await consultarUm<{ usuario_id: string }>("select usuario_id from usuarios_empresas where usuario_id = $1", [
            idCriado
          ])
        ).toBeNull();
        // E o colaborador continua com o dono que ganhou a corrida.
        expect(await usuarioDoColaborador(colaboradorCorridaCriacao)).toBe(donoDoColaboradorCriacao);
      } finally {
        // Solta o lock ANTES de esperar a requisicao: na ordem inversa a suite penduraria.
        await liberarBloqueador(bloqueador);
        await encerrarRequisicao(emVoo);
      }
    });

    // O teste que prova BLOQUEIO, e nao apenas ordem: enquanto a edicao espera o lock do colaborador,
    // ela JA SEGURA o lock do alvo. Uma terceira transacao pedindo esse mesmo lock com `NOWAIT` tem de
    // ser recusada na hora, com o codigo 55P03 (`lock_not_available`) do Postgres.
    it("Deve_BloquearOutraTransacao_Quando_AEdicaoJaSeguraOLockDoAlvo", async () => {
      const bloqueador = await abrirBloqueador();
      const seguraColaborador = bloqueador.cliente;
      const { cliente: tentaAlvo } = await abrirBloqueador();
      let emVoo: Promise<unknown> | null = null;

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

        // A edicao ja pegou o lock do alvo e agora espera o do colaborador — bloqueada POR esta
        // transacao, e nao por qualquer waiter do banco.
        emVoo = promessa;
        expect(await esperarBloqueioPor(bloqueador)).toBe(true);
        expect(await aindaPendente(promessa)).toBe(true);

        // 55P03 = lock_not_available. E a prova direta de que a linha do alvo esta travada POR ela.
        expect(await pedirLockDoAlvoSemEsperar()).toBe("55P03");

        await seguraColaborador.query("rollback");
        expect((await promessa).statusCode).toBe(204);

        // Solto o lock e concluida a edicao, a mesma transacao concorrente passa.
        expect(await pedirLockDoAlvoSemEsperar()).toBeNull();
        expect(await perfilDe(alvoColabBloqueio.usuarioId)).toMatchObject({ nome: "EDICAO SEGURANDO O LOCK" });
      } finally {
        await liberarBloqueador(bloqueador);
        await encerrarRequisicao(emVoo);
        await tentaAlvo.end().catch(() => undefined);
      }
    });

    // Contraprova: contencao no colaborador nao pode quebrar a edicao legitima. A concorrente solta o
    // lock sem mudar nada e a edicao segue normalmente.
    it("Deve_Editar_Quando_OLockDoColaboradorELiberadoSemMudanca", async () => {
      const bloqueador = await abrirBloqueador();
      const { cliente } = bloqueador;
      let emVoo: Promise<unknown> | null = null;
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

        emVoo = promessa;
        expect(await esperarBloqueioPor(bloqueador)).toBe(true);
        await cliente.query("rollback");

        expect((await promessa).statusCode).toBe(204);
        expect(await perfilDe(alvoColabLegitimo.usuarioId)).toMatchObject({ nome: "EDICAO LEGITIMA SOB CONTENCAO" });
        // O vinculo trocou para o colaborador informado, e o antigo ficou livre.
        expect(await usuarioDoColaborador(colaboradorCorridaLegitimo)).toBe(alvoColabLegitimo.usuarioId);
        expect(await usuarioDoColaborador(alvoColabLegitimo.colaboradorId)).toBeNull();
      } finally {
        // Solta o lock ANTES de esperar a requisicao: na ordem inversa a suite penduraria.
        await liberarBloqueador(bloqueador);
        await encerrarRequisicao(emVoo);
      }
    });
  });

  // --- Papel legado `admin` como papel PRIVILEGIADO ---------------------------------------------
  //
  // A rodada anterior tratou so `usuario_admin` como privilegiado, com o argumento de que `admin`
  // "nao tem efeito especial". Isso vale para a RESOLUCAO DE PERMISSOES e so para ela. Na pratica o
  // papel legado concede dois poderes reais:
  //
  //   - `podeLancarSemCaixa` (shared/src/autenticacao/index.ts) -> status de retaguarda nas quatro
  //     saidas e no fluxo do cofre;
  //   - `podeLiberarTravaTransferencia` (api/src/transferencias/transferencias.service.ts).
  //
  // Enquanto isso for verdade, quem cria ou vira `admin` ganha acesso que nao tinha. Esta entrega NAO
  // remove o papel nem mexe nesses poderes — apenas para de tratar `admin` como se fosse inofensivo
  // dentro da seguranca de usuarios.
  describe("papel legado admin", () => {
    it("Deve_Retornar403_Quando_AtorNaoPrivilegiadoCriaAdminLegado", async () => {
      const email = "admin.legado.indevido@padaria.local";
      const resposta = await contexto.app.inject({
        method: "POST",
        url: "/api/usuarios",
        headers: { cookie: cookieGerente },
        payload: {
          empresaIds: [idsTeste.empresaA],
          nome: "ADMIN LEGADO INDEVIDO",
          email,
          role: "admin",
          senha: "Teste#2026!legado",
          novoColaborador: {
            empresaId: idsTeste.empresaA,
            nome: "COLABORADOR ADMIN LEGADO",
            setorId: idsTeste.setorA,
            cargoId: idsTeste.cargoGerente
          }
        }
      });

      assertProblem(resposta, 403, CODIGO_PRIVILEGIO);
      expect(
        await consultarUm<{ usuario_id: string }>("select usuario_id from perfis_usuarios where email = $1", [email])
      ).toBeNull();
      expect(
        await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [email])
      ).toBeNull();
    });

    it("Deve_Retornar403_Quando_AtorNaoPrivilegiadoPromoveParaAdminLegado", async () => {
      const resposta = await contexto.app.inject({
        method: "PUT",
        url: `/api/usuarios/${alvoPromocaoLegado.usuarioId}`,
        headers: { cookie: cookieGerente },
        payload: {
          empresaIds: [idsTeste.empresaA],
          nome: alvoPromocaoLegado.nome,
          email: alvoPromocaoLegado.email,
          role: "admin",
          colaboradorId: alvoPromocaoLegado.colaboradorId
        }
      });

      assertProblem(resposta, 403, CODIGO_PRIVILEGIO);
      expect(await perfilDe(alvoPromocaoLegado.usuarioId)).toMatchObject({ role: "usuario_comum" });
    });

    // Alvo privilegiado e alvo privilegiado, seja qual for o papel: trocar o e-mail dele ja toma a
    // conta pelo fluxo de recuperacao de senha.
    it("Deve_Retornar403_Quando_AtorNaoPrivilegiadoEditaAlvoAdminLegado", async () => {
      const resposta = await contexto.app.inject({
        method: "PUT",
        url: `/api/usuarios/${alvoAdminLegado.usuarioId}`,
        headers: { cookie: cookieGerente },
        payload: {
          empresaIds: [idsTeste.empresaA],
          nome: "ADMIN LEGADO COM E-MAIL TROCADO",
          email: "admin.legado.roubado@padaria.local",
          colaboradorId: alvoAdminLegado.colaboradorId
        }
      });

      assertProblem(resposta, 403, CODIGO_PRIVILEGIO);
      expect(await perfilDe(alvoAdminLegado.usuarioId)).toMatchObject({
        nome: alvoAdminLegado.nome,
        email: alvoAdminLegado.email,
        role: "admin"
      });
    });

    // A assimetria que importa: `admin` e papel PROTEGIDO (como alvo e como papel concedivel), mas
    // NAO e papel que AUTORIZA. Se ele autorizasse, poderia cunhar `usuario_admin` — inclusive para si
    // — e `usuario_admin` da acesso total. Como ate esta branch qualquer um com
    // `cadastro_usuarios_criar` conseguia criar uma conta `admin` com a senha que quisesse, isso
    // reabriria exatamente a escalada que a entrega veio fechar.
    it("Deve_Retornar403_Quando_AtorAdminLegadoTentaPromoverAlguemParaUsuarioAdmin", async () => {
      const resposta = await contexto.app.inject({
        method: "PUT",
        url: `/api/usuarios/${alvoOperadoPorLegado.usuarioId}`,
        headers: { cookie: cookieAdminLegado },
        payload: {
          empresaIds: [idsTeste.empresaA],
          nome: alvoOperadoPorLegado.nome,
          email: alvoOperadoPorLegado.email,
          role: "usuario_admin",
          colaboradorId: alvoOperadoPorLegado.colaboradorId
        }
      });

      assertProblem(resposta, 403, CODIGO_PRIVILEGIO);
      expect(await perfilDe(alvoOperadoPorLegado.usuarioId)).toMatchObject({ role: "usuario_comum" });
    });

    it("Deve_Retornar403_Quando_AtorAdminLegadoEditaOutroAlvoPrivilegiado", async () => {
      const resposta = await contexto.app.inject({
        method: "PUT",
        url: `/api/usuarios/${alvoAdminLegadoOperacao.usuarioId}`,
        headers: { cookie: cookieAdminLegado },
        payload: {
          empresaIds: [idsTeste.empresaA],
          nome: "ALVO LEGADO EDITADO PELO LEGADO",
          email: alvoAdminLegadoOperacao.email,
          colaboradorId: alvoAdminLegadoOperacao.colaboradorId
        }
      });

      assertProblem(resposta, 403, CODIGO_PRIVILEGIO);
      expect(await perfilDe(alvoAdminLegadoOperacao.usuarioId)).toMatchObject({
        nome: alvoAdminLegadoOperacao.nome,
        role: "admin"
      });
    });

    // Contraprova: o endurecimento nao pode paralisar o ator legado no trabalho normal dele. Editar
    // usuario COMUM da propria empresa continua funcionando.
    it("Deve_Editar_Quando_AtorAdminLegadoEditaUsuarioComumDaPropriaEmpresa", async () => {
      const resposta = await contexto.app.inject({
        method: "PUT",
        url: `/api/usuarios/${alvoPromocaoLegado.usuarioId}`,
        headers: { cookie: cookieAdminLegado },
        payload: {
          empresaIds: [idsTeste.empresaA],
          nome: "COMUM EDITADO PELO LEGADO",
          email: alvoPromocaoLegado.email,
          role: "usuario_comum",
          colaboradorId: alvoPromocaoLegado.colaboradorId
        }
      });

      expect(resposta.statusCode, resposta.body).toBe(204);
      expect(await perfilDe(alvoPromocaoLegado.usuarioId)).toMatchObject({
        nome: "COMUM EDITADO PELO LEGADO",
        role: "usuario_comum"
      });
    });

    // E o `usuario_admin` continua sendo o unico que cunha papel privilegiado.
    it("Deve_CriarAdminLegado_Quando_OAtorEUsuarioAdmin", async () => {
      const email = "admin.legado.legitimo@padaria.local";
      const resposta = await contexto.app.inject({
        method: "POST",
        url: "/api/usuarios",
        headers: { cookie: cookieAdmin },
        payload: {
          empresaIds: [idsTeste.empresaA],
          nome: "ADMIN LEGADO LEGITIMO",
          email,
          role: "admin",
          senha: "Teste#2026!legitimo",
          novoColaborador: {
            empresaId: idsTeste.empresaA,
            nome: "COLABORADOR ADMIN LEGADO LEGITIMO",
            setorId: idsTeste.setorA,
            cargoId: idsTeste.cargoGerente
          }
        }
      });

      expect(resposta.statusCode, resposta.body).toBe(201);
      expect(
        await consultarUm<{ role: string }>("select role from perfis_usuarios where email = $1", [email])
      ).toMatchObject({ role: "admin" });
    });
  });

  // --- Fail-closed ANTES do Zod -----------------------------------------------------------------
  //
  // O comentario dizia "antes de tudo, inclusive do Zod ter qualquer efeito", mas o codigo fazia o
  // `parse` primeiro. Com corpo invalido a resposta virava 400 de validacao — ou seja, a validacao
  // respondia ANTES da autorizacao e virava oraculo para quem chama sem ator.
  it("Deve_Retornar403_Quando_ChamadaSemAtorTemCorpoInvalido", async () => {
    await expect(salvarUsuario(alvoSemAtorComum.usuarioId, { nome: 123, email: "nao-e-email" })).rejects.toMatchObject({
      status: 403,
      code: "PROFILE_NOT_CONFIGURED"
    });
  });

  // --- Compensacao cobrindo TUDO depois do signUp -----------------------------------------------
  describe("compensacao do cadastro", () => {
    // A consulta que busca o usuario recem-criado ficava FORA do bloco compensado: se ela falhasse, o
    // `signUpEmail` ja tinha commitado e o usuario de autenticacao ficava orfao — bloqueando toda nova
    // tentativa com o mesmo e-mail, que e exatamente o B-01 que esta branch veio fechar.
    it("Deve_RemoverUsuarioDeAutenticacao_Quando_FalhaTecnicaAposOSignUp", async () => {
      const email = "falha.pos.signup@padaria.local";
      const consultaOriginal = pool.query.bind(pool);
      let jaCriou = false;
      pool.query = ((texto: unknown, ...resto: unknown[]) => {
        const sql = typeof texto === "string" ? texto : String((texto as { text?: string })?.text ?? "");
        if (sql.includes('insert into "user"')) jaCriou = true;
        // `ilike` isola a consulta do NOSSO repositorio: o Better Auth procura o usuario por igualdade.
        if (jaCriou && sql.includes('from "user"') && sql.includes("ilike")) {
          return Promise.reject(new Error("banco fora do ar (simulado)"));
        }
        return (consultaOriginal as (...args: unknown[]) => unknown)(texto, ...resto);
      }) as typeof pool.query;

      try {
        const resposta = await contexto.app.inject({
          method: "POST",
          url: "/api/usuarios",
          headers: { cookie: cookieAdmin },
          payload: {
            empresaIds: [idsTeste.empresaA],
            nome: "USUARIO COM FALHA POS SIGNUP",
            email,
            senha: "Teste#2026!posSignup",
            novoColaborador: {
              empresaId: idsTeste.empresaA,
              nome: "COLABORADOR FALHA POS SIGNUP",
              setorId: idsTeste.setorA,
              cargoId: idsTeste.cargoGerente
            }
          }
        });

        expect(resposta.statusCode).toBe(500);
        expect(JSON.stringify(resposta.json())).not.toContain("banco fora do ar (simulado)");
      } finally {
        pool.query = consultaOriginal;
      }

      // O usuario de autenticacao criado pelo signUp nao pode ter sobrado.
      expect(
        await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [email])
      ).toBeNull();
    });

    // Em producao `requireEmailVerification` e true e o Better Auth NAO lanca para e-mail repetido:
    // devolve 200 com um usuario SINTETICO, de id que nunca foi gravado. A compensacao passou a cobrir
    // este trecho, entao ela precisa mirar o id DESTA requisicao — nunca a conta real ja existente.
    it("Deve_PreservarAContaReal_Quando_OSignUpDevolveUsuarioSintetico", async () => {
      const emailReal = usuariosTeste.discriminador.email;
      const antes = await consultarUm<{ id: string; email: string }>(
        'select id, email from "user" where lower(email) = lower($1)',
        [emailReal]
      );
      expect(antes?.id).toBeTruthy();

      // Id sintetico: no formato do gerador do projeto, e que NAO existe no banco. E o que o Better
      // Auth devolve em producao para e-mail repetido, com `requireEmailVerification: true`
      // (api/src/auth/config.ts) — combinacao que o harness de teste nao consegue montar, porque o
      // `NODE_ENV` e fixado em "test" no setup.
      const idSintetico = "01930000-0000-7000-8000-000000000001";
      const espiao = vi
        .spyOn(auth.api, "signUpEmail")
        .mockResolvedValue({ token: null, user: { id: idSintetico } } as never);

      try {
        const resposta = await contexto.app.inject({
          method: "POST",
          url: "/api/usuarios",
          headers: { cookie: cookieAdmin },
          payload: {
            empresaIds: [idsTeste.empresaA],
            nome: "TENTATIVA COM E-MAIL REPETIDO",
            email: emailReal,
            senha: "Teste#2026!repetido",
            novoColaborador: {
              empresaId: idsTeste.empresaA,
              nome: "COLABORADOR REPETIDO",
              setorId: idsTeste.setorA,
              cargoId: idsTeste.cargoGerente
            }
          }
        });

        assertProblem(resposta, 409, "EMAIL_ALREADY_REGISTERED");
      } finally {
        espiao.mockRestore();
      }

      // A conta real continua exatamente onde estava — e o perfil dela tambem.
      expect(
        await consultarUm<{ id: string; email: string }>('select id, email from "user" where id = $1', [antes!.id])
      ).toMatchObject({ id: antes!.id, email: antes!.email });
      expect(
        await consultarUm<{ usuario_id: string }>("select usuario_id from perfis_usuarios where usuario_id = $1", [
          antes!.id
        ])
      ).not.toBeNull();
    });
  });

  // --- Preservacao de empresas: `empresaIds` ausente = preservar --------------------------------
  //
  // A tela de edicao NAO conhece as empresas reais do alvo: a listagem recorta `empresaIds` ao escopo
  // da tela, por isolamento. Tratar a ausencia do campo como "lista vazia" e cair na empresa ativa
  // apagava, em silencio, todo vinculo que a tela nao enxergava — a substituicao e TOTAL.
  describe("preservacao de empresas do alvo", () => {
    it("Deve_PreservarVinculosEEmpresaPrincipal_Quando_OPutOmiteEmpresaIds", async () => {
      const antes = await perfilDe(alvoABLegitimo.usuarioId);
      const resposta = await contexto.app.inject({
        method: "PUT",
        url: `/api/usuarios/${alvoABLegitimo.usuarioId}`,
        headers: { cookie: cookieMultiempresa },
        // Corpo de "editei so o nome": sem `empresaIds` e sem `empresaId`.
        payload: {
          nome: "NOME EDITADO SEM MEXER EM EMPRESAS",
          email: alvoABLegitimo.email,
          colaboradorId: alvoABLegitimo.colaboradorId
        }
      });

      expect(resposta.statusCode, resposta.body).toBe(204);
      // A empresa B continua vinculada, e a principal nao foi trocada pela empresa da tela.
      expect(await empresasDe(alvoABLegitimo.usuarioId)).toEqual([idsTeste.empresaA, idsTeste.empresaB]);
      expect(await perfilDe(alvoABLegitimo.usuarioId)).toMatchObject({
        nome: "NOME EDITADO SEM MEXER EM EMPRESAS",
        empresa_id: antes?.empresa_id ?? idsTeste.empresaA
      });
    });

    it("Deve_SubstituirVinculos_Quando_OPutEnviaEmpresaIdsExplicitamente", async () => {
      const resposta = await contexto.app.inject({
        method: "PUT",
        url: `/api/usuarios/${alvoColabLegitimo.usuarioId}`,
        headers: { cookie: cookieMultiempresa },
        payload: {
          empresaIds: [idsTeste.empresaA, idsTeste.empresaB],
          nome: alvoColabLegitimo.nome,
          email: alvoColabLegitimo.email,
          colaboradorId: alvoColabLegitimo.colaboradorId
        }
      });

      expect(resposta.statusCode, resposta.body).toBe(204);
      expect(await empresasDe(alvoColabLegitimo.usuarioId)).toEqual([idsTeste.empresaA, idsTeste.empresaB]);
    });

    // A preservacao NAO e uma porta lateral: o ator continua precisando alcancar todo o escopo real
    // do alvo, mesmo sem mandar `empresaIds`.
    it("Deve_Retornar403_Quando_AtorSoDaEmpresaAOmiteEmpresaIdsEmAlvoAB", async () => {
      const resposta = await contexto.app.inject({
        method: "PUT",
        url: `/api/usuarios/${alvoAB.usuarioId}`,
        headers: { cookie: cookieGerente },
        payload: {
          nome: "TENTATIVA SEM EMPRESAS",
          email: alvoAB.email,
          colaboradorId: alvoAB.colaboradorId
        }
      });

      assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
      expect(await empresasDe(alvoAB.usuarioId)).toEqual([idsTeste.empresaA, idsTeste.empresaB]);
    });

    // E a listagem continua sem expor empresa fora do escopo da tela.
    it("Deve_NaoExporEmpresaForaDoEscopo_Quando_ListaUsuariosEscopadoNaEmpresaA", async () => {
      const resposta = await contexto.app.inject({
        method: "GET",
        url: `/api/usuarios?empresaId=${idsTeste.empresaA}&pageSize=100`,
        headers: { cookie: cookieMultiempresa }
      });

      expect(resposta.statusCode).toBe(200);
      expect(JSON.stringify(resposta.json())).not.toContain(idsTeste.empresaB);
    });
  });

  // --- Corrida no CARGO ATIVO -------------------------------------------------------------------
  //
  // A linha do colaborador passou a ser travada, mas `colaboradores_cargos` continuava fora da
  // serializacao: `atualizarStatusCargoColaborador` (api/src/colaboradores/colaboradores.service.ts)
  // abre transacao e NAO trava `colaboradores`, entao ela desativa o ultimo cargo no meio da
  // vinculacao. O guard dela le `colaboradores.usuario_id` sem lock — e enquanto a vinculacao nao
  // commitou, esse campo ainda e nulo, entao o guard nem dispara.
  //
  // Resultado possivel: usuario vinculado a colaborador com zero cargos ativos.
  describe("corrida no cargo ativo do colaborador", () => {
    // O colaborador destes testes esta REALMENTE vinculado a um usuario e tem UM cargo ativo. Sem o
    // vinculo, o guard "colaborador com usuario precisa ter ao menos um cargo ativo" nunca dispara e a
    // invariante final fica inatingivel por construcao — foi o defeito da versao anterior deste teste.
    const alvoDoCargo = alvoColabCargo;
    const colaboradorDoAlvo = alvoColabCargo.colaboradorId;
    const cargoDoAlvo = alvoColabCargo.colaboradorCargoId;

    // Sentido 1 — a desativacao vence primeiro. A vinculacao acorda, rele os cargos e recusa.
    it("Deve_RecusarVinculo_Quando_OUltimoCargoEDesativadoAntesDaValidacaoTransacional", async () => {
      const bloqueador = await abrirBloqueador();
      const { cliente } = bloqueador;
      let emVoo: Promise<unknown> | null = null;
      try {
        await cliente.query("begin");
        await cliente.query("select id from colaboradores where id = $1 for update", [colaboradorDoAlvo]);
        await cliente.query("update colaboradores_cargos set ativo = false where colaborador_id = $1", [
          colaboradorDoAlvo
        ]);

        const promessa = contexto.app.inject({
          method: "PUT",
          url: `/api/usuarios/${alvoDoCargo.usuarioId}`,
          headers: { cookie: cookieGerente },
          payload: {
            nome: "REVINCULO COM CARGO DESATIVADO",
            email: alvoDoCargo.email,
            colaboradorId: colaboradorDoAlvo
          }
        });

        emVoo = promessa;
        expect(await esperarBloqueioPor(bloqueador)).toBe(true);
        expect(await aindaPendente(promessa)).toBe(true);

        await cliente.query("commit");
        const resposta = await promessa;

        // A releitura sob lock enxerga o cargo desativado e recusa. O motivo e fixado: um 400 de Zod
        // ou de "colaborador nao encontrado" passaria por este assert sem provar nada.
        assertProblem(resposta, 400);
        expect(JSON.stringify(resposta.json())).toContain("cargo ativo");
        expect(await perfilDe(alvoDoCargo.usuarioId)).toMatchObject({ nome: alvoDoCargo.nome });
      } finally {
        await liberarBloqueador(bloqueador);
        await encerrarRequisicao(emVoo);
        // DENTRO do finally, e depois de drenar a requisicao. Fora dele, um assert que estourasse
        // depois do `commit` deixaria o cargo desativado e cascatearia falso vermelho nos dois testes
        // seguintes — inclusive na invariante, que e a assercao de maior sinal do bloco.
        await executarSql("update colaboradores_cargos set ativo = true where id = $1", [cargoDoAlvo]);
      }
    });

    // Sentido 2 — a desativacao espera o lock raiz, acorda e recusa, porque o colaborador tem usuario
    // vinculado e um unico cargo ativo. E o teste que faz o guard DISPARAR de verdade.
    //
    // Honestidade sobre o alcance: o vinculo ja existe antes da transacao concorrente, entao o 409
    // seria alcancado mesmo sem a corrida. O que a corrida acrescenta e a prova de que a desativacao
    // passou a esperar o MESMO lock de `colaboradores` que a vinculacao segura — sem isso ela corria
    // por fora e derrubava o ultimo cargo no meio de uma vinculacao em andamento.
    it("Deve_RecusarDesativacao_Quando_EsperaOLockEOColaboradorTemUsuarioVinculado", async () => {
      const bloqueador = await abrirBloqueador();
      const { cliente } = bloqueador;
      let emVoo: Promise<unknown> | null = null;
      try {
        await cliente.query("begin");
        await cliente.query("select id from colaboradores where id = $1 for update", [colaboradorDoAlvo]);

        const promessa = contexto.app.inject({
          method: "PUT",
          url: `/api/colaboradores/${colaboradorDoAlvo}/cargos/${cargoDoAlvo}`,
          headers: { cookie: cookieAdmin },
          payload: { empresaId: idsTeste.empresaA, ativo: false }
        });

        emVoo = promessa;
        // Bloqueada POR ESTA transacao — nao por "algum lock" do banco.
        expect(await esperarBloqueioPor(bloqueador)).toBe(true);
        expect(await aindaPendente(promessa)).toBe(true);

        await cliente.query("commit");
        const resposta = await promessa;

        // 409, e nao 500: e regra de negocio, nao queda.
        assertProblem(resposta, 409, "ULTIMO_CARGO_ATIVO");
      } finally {
        await liberarBloqueador(bloqueador);
        await encerrarRequisicao(emVoo);
      }

      // O cargo continua ativo e o vinculo continua de pe.
      expect(
        await consultarUm<{ ativo: boolean }>("select ativo from colaboradores_cargos where id = $1", [cargoDoAlvo])
      ).toMatchObject({ ativo: true });
      expect(await usuarioDoColaborador(colaboradorDoAlvo)).toBe(alvoDoCargo.usuarioId);
    });

    // A invariante, agora alcancavel: existe pelo menos um colaborador COM usuario neste banco, e
    // nenhum deles pode estar sem cargo ativo.
    it("Deve_NuncaTerUsuarioVinculadoAColaboradorSemCargoAtivo", async () => {
      // Guarda de NAO-VACUIDADE. `expect.any(Number)` aceitaria zero, e ai a consulta abaixo passaria
      // por ausencia de dado em vez de por invariante respeitada — que e exatamente o que esta guarda
      // existe para impedir.
      const comUsuario = await consultarUm<{ total: number }>(
        "select count(*)::int as total from colaboradores where usuario_id is not null"
      );
      expect(comUsuario?.total ?? 0).toBeGreaterThan(0);

      expect(
        await consultarUm<{ id: string }>(
          `select c.id from colaboradores c
            where c.usuario_id is not null
              and not exists (
                select 1 from colaboradores_cargos cc where cc.colaborador_id = c.id and cc.ativo = true
              )`
        )
      ).toBeNull();
    });
  });

  // --- Troca simultanea de colaboradores -------------------------------------------------------
  //
  // A hipotese investigada era um deadlock em cruz: cada edicao trava o perfil proprio, depois o
  // colaborador NOVO (do corpo) e so no fim toca o ANTIGO, pelo `update ... where usuario_id = $1` de
  // `vincularUsuarioColaboradorRepository`. Como a ordem dos dois colaboradores vem do CORPO, e nao de
  // um criterio global, duas edicoes trocando C1 por C2 formariam ciclo.
  //
  // **A hipotese NAO se confirmou, e o motivo importa.** O par cruzado nem chega a disputar lock: um
  // colaborador que ja pertence a OUTRO usuario e recusado — na pre-validacao e de novo sob lock, em
  // `validarColaboradorParaVinculo`. E a unica edicao que trava DOIS colaboradores e a do par
  // {colaborador livre, colaborador proprio}, e "livre" exclui, por definicao, o colaborador do outro.
  // Nao existe, hoje, edicao alcancavel que trave dois colaboradores em ordem cruzada.
  //
  // Este teste prova exatamente isso — e nada alem. Ele NAO prova que a ordem de locks impede
  // deadlock; prova que a regra de vinculo impede a corrida que produziria um. Se um dia a regra
  // afrouxar (permitir roubar colaborador de outro usuario), ele fica vermelho e o deadlock volta a
  // ser possivel — que e o alarme que interessa.
  describe("troca simultanea de colaboradores", () => {
    it("Deve_RecusarSemDeadlockNem500_Quando_DuasEdicoesTentamTrocarColaboradoresEmCruz", async () => {
      let vooUm: Promise<unknown> | null = null;
      let vooDois: Promise<unknown> | null = null;
      try {
        // U1 quer o colaborador de U2, e vice-versa, ao mesmo tempo.
        const pedidoUm = contexto.app.inject({
          method: "PUT",
          url: `/api/usuarios/${alvoTrocaUm.usuarioId}`,
          headers: { cookie: cookieGerente },
          payload: {
            empresaIds: [idsTeste.empresaA],
            nome: alvoTrocaUm.nome,
            email: alvoTrocaUm.email,
            colaboradorId: alvoTrocaDois.colaboradorId
          }
        });
        vooUm = pedidoUm;

        const pedidoDois = contexto.app.inject({
          method: "PUT",
          url: `/api/usuarios/${alvoTrocaDois.usuarioId}`,
          headers: { cookie: cookieGerente },
          payload: {
            empresaIds: [idsTeste.empresaA],
            nome: alvoTrocaDois.nome,
            email: alvoTrocaDois.email,
            colaboradorId: alvoTrocaUm.colaboradorId
          }
        });
        vooDois = pedidoDois;

        const [respostaUm, respostaDois] = await Promise.all([pedidoUm, pedidoDois]);

        // Nenhuma resposta 500: sem deadlock (40P01) e sem erro interno de nenhuma outra especie.
        expect([respostaUm.statusCode, respostaDois.statusCode]).not.toContain(500);
        // As duas sao recusadas pela regra de vinculo, que e o que de fato impede a corrida.
        assertProblem(respostaUm, 400);
        assertProblem(respostaDois, 400);

        // Estado final intacto: cada um continua com o seu.
        expect(await colaboradorVinculadoA(alvoTrocaUm.usuarioId)).toBe(alvoTrocaUm.colaboradorId);
        expect(await colaboradorVinculadoA(alvoTrocaDois.usuarioId)).toBe(alvoTrocaDois.colaboradorId);
        // E nenhum usuario ficou com dois colaboradores.
        expect(
          await consultarUm<{ usuario_id: string }>(
            `select usuario_id from colaboradores
              where usuario_id is not null
              group by usuario_id having count(*) > 1`
          )
        ).toBeNull();
      } finally {
        await encerrarRequisicao(vooUm);
        await encerrarRequisicao(vooDois);
      }
    });
  });
});
