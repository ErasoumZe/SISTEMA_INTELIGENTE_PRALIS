import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql } from "../../setup/integracao.js";
import { pool } from "../../../api/src/banco/conexao.js";

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

const alvos = [alvoB, alvoAB, alvoABLegitimo, alvoComumA, alvoPromocaoA, alvoAdminA, alvoAdminOperacao, alvoOperacaoA];

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

  // Falha tecnica na carga do alvo nao pode virar negacao. Hoje o teste fica vermelho por um motivo
  // honesto e diferente do futuro: a consulta que o mock derruba NAO EXISTE — o service nunca le o
  // alvo — entao o PUT responde 204. Depois da correcao ele responde 500, logado e sem detalhe.
  //
  // O `pool.query` e substituido de forma seletiva (molde de saude.test.ts e metadados-cross-tenant):
  // filtrar por parametro, e nao so pelo texto do SQL, e o que impede derrubar junto a consulta de
  // perfil do proprio ator no preHandler de autenticacao — que tambem le `perfis_usuarios`.
  it("Deve_Retornar500_Quando_OBancoFalhaAoCarregarOAlvoDaEdicao", async () => {
    const consultaOriginal = pool.query.bind(pool);
    pool.query = ((texto: unknown, ...resto: unknown[]) => {
      const sql = typeof texto === "string" ? texto : String((texto as { text?: string })?.text ?? "");
      const parametros = Array.isArray(resto[0]) ? (resto[0] as unknown[]) : [];
      if (sql.includes('from "perfis_usuarios"') && parametros.includes(alvoComumA.usuarioId)) {
        return Promise.reject(new Error("banco fora do ar (simulado)"));
      }
      return (consultaOriginal as (...args: unknown[]) => unknown)(texto, ...resto);
    }) as typeof pool.query;

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
      pool.query = consultaOriginal;
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
});
