import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";
import { pool } from "../../../api/src/banco/conexao.js";
import { salvarColaborador } from "../../../api/src/colaboradores/colaboradores.service.js";

// CX-M05. O modulo de colaboradores decidia TUDO pelo `empresaId` do CORPO. O `:id` da URL era
// apenas chave de escrita, e nenhuma rota lia a empresa REAL do alvo.
//
// As consequencias, todas reproduzidas aqui:
//
//   1. TAKEOVER PARCIAL — `PUT /api/colaboradores/:id` com alvo real da empresa B e corpo 100% da A.
//      O UPDATE de `colaboradores` nao casa (`where id AND empresa_id`, repository:54) e a rota
//      responde 204 mesmo assim, porque o repositorio devolve um objeto FABRICADO a partir do input
//      (repository:55-61) em vez do que o banco afetou. Falso 204.
//
//   2. ESCRITA CROSS-TENANT DE VERDADE — no mesmo PUT, se o colaborador da B nao tiver cargo ativo,
//      `contarCargosAtivosColaboradorRepository` (repository:246-252, sem `empresa_id`) devolve 0 e
//      `salvarCargoColaboradorRepository` INSERE em `colaboradores_cargos` uma linha com
//      `empresa_id` = A e `colaborador_id` = colaborador da B. A FK de `colaborador_id`
//      (app.schema.ts:485-487) nao e composta com a empresa, entao o INSERT passa.
//
//   3. PONTEIRO ESTRANGEIRO — `setorId` e `turnoPadraoId` nunca sao validados contra a empresa
//      (service:109-110). As FKs apontam para `setores.id` e `turnos.id` sem compor `empresa_id`
//      (app.schema.ts:327,330), entao gravar setor/turno da B num colaborador da A e aceito — e o
//      UUID da B volta pelo `GET /api/colaboradores`.
//
//   4. FALSO 204 EM CASCATA — `PUT /api/cargos/:id` e
//      `PUT /api/colaboradores/:cid/cargos/:ccid` descartam o resultado do UPDATE e respondem 204
//      com zero linhas afetadas (controller:174 e :249).
//
//   5. CPF PARA QUEM SO OPERA CAIXA — a rota aceita `caixa_operar` como alternativa
//      (controller:70) e devolve os 7 campos para todo mundo, inclusive CPF.
//
// Politica aplicada:
//   - alvo do PATH inalcancavel (inexistente OU de empresa fora do escopo) -> 404, o MESMO codigo
//     nos dois casos, de proposito: codigos distintos virariam oraculo de existencia sobre pessoa
//     fisica de outro tenant;
//   - referencia do CORPO (cargoId/setorId/turnoPadraoId) fora da empresa real -> 400;
//   - `empresaId` do CORPO fora do escopo do ator, ou divergente da empresa real do alvo ->
//     403 FORBIDDEN_COMPANY;
//   - ausencia de ator -> 403 PROFILE_NOT_CONFIGURED, antes de qualquer leitura;
//   - falha tecnica -> 500 logado, sem mensagem interna no corpo.

const CODIGO_EMPRESA = "FORBIDDEN_COMPANY";
const CODIGO_COLABORADOR_AUSENTE = "COLLABORATOR_NOT_FOUND";
const CODIGO_CARGO_AUSENTE = "CARGO_NOT_FOUND";
const CODIGO_VINCULO_AUSENTE = "COLLABORATOR_ROLE_NOT_FOUND";
const CODIGO_SEM_ATOR = "PROFILE_NOT_CONFIGURED";

// --- Fixtures proprias -------------------------------------------------------------------------
//
// Nada aqui toca `tests/setup/seed.ts`: aquele arquivo esta congelado para a branch #101 do Ze
// (08-FILA-GITHUB-ATUAL.md). O seed de integracao TRUNCA o banco a cada arquivo
// (tests/setup/seed.ts:276), entao estas linhas nascem e morrem dentro deste arquivo.

const setorB = "33333333-3333-4333-8333-00000000c001";
const cargoB = "33333333-3333-4333-8333-00000000c002";
const turnoB = "33333333-3333-4333-8333-00000000c003";

// Alvo da B COM cargo ativo: exercita o falso 204 puro (o INSERT do cargo nao dispara).
const colaboradorBComCargo = "33333333-3333-4333-8333-00000000c004";
const vinculoBComCargo = "33333333-3333-4333-8333-00000000c005";

// Alvo da B SEM cargo ativo: exercita a escrita cross-tenant de verdade. E a unica fixture cuja
// ausencia de vinculo importa — com um cargo ativo o `if` de service:115 nem seria avaliado.
const colaboradorBSemCargo = "33333333-3333-4333-8333-00000000c006";

const cargoAExtra = "11111111-1111-4111-8111-00000000c101";
const turnoA = "11111111-1111-4111-8111-00000000c102";

// Colaborador comum da empresa A: o alvo da edicao legitima que a correcao NAO pode quebrar.
const colaboradorALegitimo = "11111111-1111-4111-8111-00000000c103";
const vinculoALegitimo = "11111111-1111-4111-8111-00000000c104";

// Colaborador da A que JA aponta para setor e turno da B. Simula o estrago que a ausencia de
// validacao permitiu ate aqui: o dado ja esta gravado e a LEITURA nao pode devolve-lo.
const colaboradorAComPonteiroB = "11111111-1111-4111-8111-00000000c105";
const vinculoAComPonteiroB = "11111111-1111-4111-8111-00000000c106";

// Colaborador da A cujo VINCULO aponta para um cargo da B (`colaboradores_cargos.empresa_id` = A,
// `cargo_id` = cargo da B). O `innerJoin` de repository:144 traria o NOME do cargo da B.
const colaboradorAComCargoB = "11111111-1111-4111-8111-00000000c107";
const vinculoAComCargoB = "11111111-1111-4111-8111-00000000c108";

// Contraprova: colaborador sem setor precisa continuar aparecendo.
const colaboradorASemSetor = "11111111-1111-4111-8111-00000000c109";
const vinculoASemSetor = "11111111-1111-4111-8111-00000000c10a";

// Alvo dedicado das mudancas de status de vinculo, para nao depender da ordem de execucao.
const colaboradorAStatus = "11111111-1111-4111-8111-00000000c10b";
const vinculoAStatus = "11111111-1111-4111-8111-00000000c10c";

const colaboradorInexistente = "99999999-9999-4999-8999-00000000c999";
const vinculoInexistente = "99999999-9999-4999-8999-00000000c998";
const cargoInexistente = "99999999-9999-4999-8999-00000000c997";

// P1-B da revisao do Codex. As sub-rotas GET recortavam por `empresa_id` da TABELA FILHA e nunca
// confrontavam com a empresa real do colaborador do path. Uma linha historica corrompida —
// colaborador da B, registro filho marcado como A — passava pelo filtro e aparecia para o ator da A.
// Estas fixtures sao exatamente esse estado, plantado por SQL (a CX-M05 impede CRIAR isso hoje; o
// que ela nao faz e apagar o que ja esta gravado).
//
// Colaborador DEDICADO: os filhos mentirosos nao podem pendurar em `colaboradorBComCargo`, que ja e
// alvo de contagens exatas em outros testes deste arquivo ("nenhum vinculo novo nasceu",
// "continua com exatamente um"). Fixture que perturba a contagem de outro teste transforma o
// arquivo num campo minado de ordem.
const colaboradorBComFilhosMentirosos = "33333333-3333-4333-8333-00000000c200";
const vinculoMentindoEmpresa = "33333333-3333-4333-8333-00000000c201";
const jornadaMentindoEmpresa = "33333333-3333-4333-8333-00000000c202";
const faltaMentindoEmpresa = "33333333-3333-4333-8333-00000000c203";
const vinculoLegitimoDaB = "33333333-3333-4333-8333-00000000c204";

type ColaboradorLista = {
  id: string;
  empresaId?: string;
  nome?: string;
  cpf?: string | null;
  setorId?: string | null;
  turnoPadraoId?: string | null;
  usuarioId?: string | null;
};

async function criarColaborador(input: {
  id: string;
  empresaId: string;
  nome: string;
  cpf: string | null;
  setorId: string | null;
  turnoPadraoId: string | null;
}) {
  await executarSql(
    `insert into colaboradores (id, empresa_id, nome, cpf, setor_id, turno_padrao_id, usuario_id)
     values ($1, $2, $3, $4, $5, $6, null)`,
    [input.id, input.empresaId, input.nome, input.cpf, input.setorId, input.turnoPadraoId]
  );
}

async function criarVinculoCargo(input: {
  id: string;
  empresaId: string;
  colaboradorId: string;
  setorId: string | null;
  cargoId: string;
  dataInicio?: string;
  ativo?: boolean;
}) {
  await executarSql(
    `insert into colaboradores_cargos
       (id, empresa_id, colaborador_id, setor_id, cargo_id, remuneracao_minuto, data_inicio, ativo)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.id,
      input.empresaId,
      input.colaboradorId,
      input.setorId,
      input.cargoId,
      "1.000000",
      input.dataInicio ?? "2026-01-01",
      input.ativo ?? true
    ]
  );
}

async function semearFronteira() {
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
  await executarSql("insert into cargos (id, empresa_id, nome) values ($1, $2, $3)", [
    cargoAExtra,
    idsTeste.empresaA,
    "CARGO-EMPRESA-A-EXTRA"
  ]);
  await executarSql("insert into turnos (id, empresa_id, nome, hora_inicio, hora_fim) values ($1, $2, $3, $4, $5)", [
    turnoB,
    idsTeste.empresaB,
    "TURNO-EMPRESA-B",
    "06:00",
    "14:00"
  ]);
  await executarSql("insert into turnos (id, empresa_id, nome, hora_inicio, hora_fim) values ($1, $2, $3, $4, $5)", [
    turnoA,
    idsTeste.empresaA,
    "TURNO-EMPRESA-A",
    "06:00",
    "14:00"
  ]);

  await criarColaborador({
    id: colaboradorBComCargo,
    empresaId: idsTeste.empresaB,
    nome: "COLABORADOR-EMPRESA-B-COM-CARGO",
    cpf: "39053344705",
    setorId: setorB,
    turnoPadraoId: turnoB
  });
  await criarVinculoCargo({
    id: vinculoBComCargo,
    empresaId: idsTeste.empresaB,
    colaboradorId: colaboradorBComCargo,
    setorId: setorB,
    cargoId: cargoB
  });

  await criarColaborador({
    id: colaboradorBSemCargo,
    empresaId: idsTeste.empresaB,
    nome: "COLABORADOR-EMPRESA-B-SEM-CARGO",
    cpf: "12345678909",
    setorId: setorB,
    turnoPadraoId: null
  });

  await criarColaborador({
    id: colaboradorALegitimo,
    empresaId: idsTeste.empresaA,
    nome: "COLABORADOR-EMPRESA-A-LEGITIMO",
    cpf: "11144477735",
    setorId: idsTeste.setorA,
    turnoPadraoId: turnoA
  });
  await criarVinculoCargo({
    id: vinculoALegitimo,
    empresaId: idsTeste.empresaA,
    colaboradorId: colaboradorALegitimo,
    setorId: idsTeste.setorA,
    cargoId: idsTeste.cargoGerente
  });

  await criarColaborador({
    id: colaboradorAComPonteiroB,
    empresaId: idsTeste.empresaA,
    nome: "COLABORADOR-EMPRESA-A-COM-PONTEIRO-B",
    cpf: "52998224725",
    setorId: setorB,
    turnoPadraoId: turnoB
  });
  await criarVinculoCargo({
    id: vinculoAComPonteiroB,
    empresaId: idsTeste.empresaA,
    colaboradorId: colaboradorAComPonteiroB,
    setorId: setorB,
    cargoId: idsTeste.cargoGerente
  });

  await criarColaborador({
    id: colaboradorAComCargoB,
    empresaId: idsTeste.empresaA,
    nome: "COLABORADOR-EMPRESA-A-COM-CARGO-B",
    cpf: "16899535009",
    setorId: idsTeste.setorA,
    turnoPadraoId: null
  });
  await criarVinculoCargo({
    id: vinculoAComCargoB,
    empresaId: idsTeste.empresaA,
    colaboradorId: colaboradorAComCargoB,
    setorId: idsTeste.setorA,
    cargoId: cargoB
  });

  await criarColaborador({
    id: colaboradorASemSetor,
    empresaId: idsTeste.empresaA,
    nome: "COLABORADOR-EMPRESA-A-SEM-SETOR",
    cpf: null,
    setorId: null,
    turnoPadraoId: null
  });
  await criarVinculoCargo({
    id: vinculoASemSetor,
    empresaId: idsTeste.empresaA,
    colaboradorId: colaboradorASemSetor,
    setorId: null,
    cargoId: idsTeste.cargoGerente
  });

  await criarColaborador({
    id: colaboradorAStatus,
    empresaId: idsTeste.empresaA,
    nome: "COLABORADOR-EMPRESA-A-STATUS",
    cpf: null,
    setorId: idsTeste.setorA,
    turnoPadraoId: null
  });
  await criarVinculoCargo({
    id: vinculoAStatus,
    empresaId: idsTeste.empresaA,
    colaboradorId: colaboradorAStatus,
    setorId: idsTeste.setorA,
    cargoId: idsTeste.cargoGerente
  });
}

// Linhas filhas de um colaborador da empresa B, marcadas como se fossem da empresa A. E o estado
// que a CX-M05 impede de nascer, mas que pode ja existir no banco — e que o recorte por
// `empresa_id` do filho, sozinho, nao pega.
async function semearFilhosQueMentemAEmpresa() {
  await criarColaborador({
    id: colaboradorBComFilhosMentirosos,
    empresaId: idsTeste.empresaB,
    nome: "COLABORADOR-EMPRESA-B-COM-FILHOS-MENTIROSOS",
    cpf: null,
    setorId: setorB,
    turnoPadraoId: null
  });
  // Um filho LEGITIMO (empresa B, igual a do pai): serve de contraprova — ele tem de continuar
  // aparecendo para quem tem a empresa B, senao a correcao teria simplesmente escondido tudo.
  await criarVinculoCargo({
    id: vinculoLegitimoDaB,
    empresaId: idsTeste.empresaB,
    colaboradorId: colaboradorBComFilhosMentirosos,
    setorId: setorB,
    cargoId: cargoB,
    dataInicio: "2026-02-01"
  });

  // Os tres filhos CORROMPIDOS: dizem-se da empresa A, penduram num colaborador da B.
  await criarVinculoCargo({
    id: vinculoMentindoEmpresa,
    empresaId: idsTeste.empresaA,
    colaboradorId: colaboradorBComFilhosMentirosos,
    setorId: null,
    cargoId: idsTeste.cargoGerente,
    dataInicio: "2026-02-02"
  });
  await executarSql(
    `insert into colaboradores_jornadas
       (id, empresa_id, colaborador_id, dia_da_semana, carga_horaria_diaria_em_minutos, intervalo_minutos,
        hora_entrada, data_inicio, ativo)
     values ($1, $2, $3, 'SEXTA', 480, 60, '08:00', '2026-02-02', true)`,
    [jornadaMentindoEmpresa, idsTeste.empresaA, colaboradorBComFilhosMentirosos]
  );
  await executarSql(
    `insert into colaboradores_faltas_justificadas
       (id, empresa_id, colaborador_id, inicio, fim, motivo)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      faltaMentindoEmpresa,
      idsTeste.empresaA,
      colaboradorBComFilhosMentirosos,
      "2026-02-02T08:00:00.000Z",
      "2026-02-02T12:00:00.000Z",
      "FALTA-QUE-MENTE-A-EMPRESA"
    ]
  );
}

// --- Consultas de apoio ------------------------------------------------------------------------

async function colaboradorGravado(id: string) {
  return consultarUm<{
    empresa_id: string;
    nome: string;
    cpf: string | null;
    setor_id: string | null;
    turno_padrao_id: string | null;
  }>("select empresa_id, nome, cpf, setor_id, turno_padrao_id from colaboradores where id = $1", [id]);
}

async function vinculosDoColaborador(colaboradorId: string) {
  return consultarTodos<{ id: string; empresa_id: string; cargo_id: string; ativo: boolean }>(
    "select id, empresa_id, cargo_id, ativo from colaboradores_cargos where colaborador_id = $1 order by id",
    [colaboradorId]
  );
}

async function contarLinhas(tabela: "colaboradores" | "colaboradores_cargos", colaboradorId: string) {
  const coluna = tabela === "colaboradores" ? "id" : "colaborador_id";
  const linha = await consultarUm<{ total: string }>(
    `select count(*)::text as total from ${tabela} where ${coluna} = $1`,
    [colaboradorId]
  );
  return Number(linha?.total ?? "0");
}

async function nomeDoCargo(id: string) {
  const linha = await consultarUm<{ nome: string }>("select nome from cargos where id = $1", [id]);
  return linha?.nome ?? null;
}

// `pageSize` alto de proposito: o default do servidor e 10 (shared/src/api/index.ts:65-68) e a
// empresa A tem 11 colaboradores so de seed. Sem isto a listagem esconderia as fixtures por
// paginacao e o teste "nao vaza a B" passaria sem provar nada.
async function listarColaboradores(contexto: ContextoApiTeste, cookie: string, empresaId?: string) {
  const filtro = empresaId ? `&empresaId=${empresaId}` : "";
  const resposta = await contexto.app.inject({
    method: "GET",
    url: `/api/colaboradores?pageSize=100${filtro}`,
    headers: { cookie }
  });
  return resposta;
}

function dadosDaLista(resposta: { json: () => unknown }) {
  return json<{ data: ColaboradorLista[] }>(resposta).data;
}

describe("colaboradores cross-tenant (CX-M05)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieMultiempresa: string;
  let cookieCaixa: string;
  let cookieGerente: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    cookieMultiempresa = await cookieSessao(contexto.app, "multiempresa");
    cookieCaixa = await cookieSessao(contexto.app, "caixa");
    cookieGerente = await cookieSessao(contexto.app, "gerente");
    await semearFronteira();
    await semearFilhosQueMentemAEmpresa();
  }, 180_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  // === 1. LEITURA ==============================================================================

  it("Deve_NaoDevolverColaboradorDaEmpresaB_Quando_OAtorSoTemAEmpresaA", async () => {
    const resposta = await listarColaboradores(contexto, cookieAdmin);

    expect(resposta.statusCode).toBe(200);
    const corpo = JSON.stringify(resposta.json());
    expect(corpo).not.toContain(colaboradorBComCargo);
    expect(corpo).not.toContain(colaboradorBSemCargo);
    expect(corpo).not.toContain("COLABORADOR-EMPRESA-B");
    expect(corpo).not.toContain(idsTeste.empresaB);
  });

  it("Deve_NaoVazarNenhumUuidDaEmpresaB_Quando_AListagemDaEmpresaAERetornada", async () => {
    const resposta = await listarColaboradores(contexto, cookieAdmin);
    const corpo = JSON.stringify(resposta.json());

    expect(corpo).not.toContain(setorB);
    expect(corpo).not.toContain(cargoB);
    expect(corpo).not.toContain(turnoB);
    expect(corpo).not.toContain("SETOR-EMPRESA-B");
    expect(corpo).not.toContain("CARGO-EMPRESA-B");
  });

  it("Deve_NaoVazarOSetorDaB_Quando_UmColaboradorDaAApontaParaEle", async () => {
    const resposta = await listarColaboradores(contexto, cookieAdmin);
    const alvo = dadosDaLista(resposta).find((item) => item.id === colaboradorAComPonteiroB);

    // A linha CONTINUA aparecendo: ela e da empresa A. O que nao pode sair e o ponteiro.
    expect(alvo).toBeDefined();
    expect(alvo?.setorId ?? null).toBeNull();
    expect(alvo?.turnoPadraoId ?? null).toBeNull();
  });

  it("Deve_NaoVazarOCargoDaB_Quando_OVinculoDaAApontaParaEle", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/colaboradores/${colaboradorAComCargoB}/cargos?pageSize=100`,
      headers: { cookie: cookieAdmin }
    });

    expect(resposta.statusCode).toBe(200);
    const itens = json<{ data: Array<{ id: string; cargoId: string | null; cargoNome: string | null }> }>(
      resposta
    ).data;

    // A LINHA precisa continuar vindo — so o ponteiro sai nulo. Sem esta assercao o teste passaria
    // com lista VAZIA, e uma regressao de `leftJoin` para `innerJoin` (que faz a linha sumir em vez
    // de vazar) nao seria detectada: o "nao contem" abaixo e verdadeiro para o conjunto vazio.
    expect(itens).toHaveLength(1);
    expect(itens[0]?.id).toBe(vinculoAComCargoB);
    expect(itens[0]?.cargoId).toBeNull();
    expect(itens[0]?.cargoNome).toBeNull();

    const corpo = JSON.stringify(resposta.json());
    expect(corpo).not.toContain(cargoB);
    expect(corpo).not.toContain("CARGO-EMPRESA-B");
    expect(corpo).not.toContain(setorB);
  });

  // P1-B. As tres sub-rotas recortavam pelo `empresa_id` da linha FILHA. Um registro filho marcado
  // como empresa A, pendurado num colaborador da empresa B, satisfazia o filtro e aparecia para o
  // ator da A — junto com tudo o que a linha carrega. A empresa que manda tem de ser a do
  // COLABORADOR do path, confrontada com a do filho.
  it("Deve_NaoDevolverFilhoDeColaboradorDaB_Quando_ALinhaFilhaSeDizDaEmpresaA", async () => {
    const cargos = await contexto.app.inject({
      method: "GET",
      url: `/api/colaboradores/${colaboradorBComFilhosMentirosos}/cargos?pageSize=100`,
      headers: { cookie: cookieAdmin }
    });
    const jornadas = await contexto.app.inject({
      method: "GET",
      url: `/api/colaboradores/${colaboradorBComFilhosMentirosos}/jornadas?pageSize=100`,
      headers: { cookie: cookieAdmin }
    });
    const faltas = await contexto.app.inject({
      method: "GET",
      url: `/api/colaboradores/${colaboradorBComFilhosMentirosos}/faltas-justificadas?pageSize=100`,
      headers: { cookie: cookieAdmin }
    });

    expect(cargos.statusCode).toBe(200);
    expect(jornadas.statusCode).toBe(200);
    expect(faltas.statusCode).toBe(200);

    expect(json<{ data: unknown[] }>(cargos).data).toEqual([]);
    expect(json<{ data: unknown[] }>(jornadas).data).toEqual([]);
    expect(json<{ data: unknown[] }>(faltas).data).toEqual([]);

    // Nem o id da linha filha, nem nada do colaborador da B.
    const corpo = JSON.stringify([cargos.json(), jornadas.json(), faltas.json()]);
    expect(corpo).not.toContain(vinculoMentindoEmpresa);
    expect(corpo).not.toContain(jornadaMentindoEmpresa);
    expect(corpo).not.toContain(faltaMentindoEmpresa);
    expect(corpo).not.toContain("FALTA-QUE-MENTE-A-EMPRESA");
    expect(corpo).not.toContain(colaboradorBComFilhosMentirosos);
  });

  // Contraprova do P1-B: o dono legitimo continua vendo as proprias linhas filhas — inclusive a que
  // mente a empresa, porque para o ator multiempresa a empresa REAL do colaborador (B) esta no
  // escopo. O que a correcao exige e igualdade entre filho e pai, e a linha plantada tem
  // `empresa_id` = A com pai em B: ela nao aparece para NINGUEM, nem para quem tem as duas empresas.
  // Este e o teste que ISOLA a igualdade filho<->pai. O ator multiempresa tem a empresa REAL do
  // colaborador (B) no escopo, entao o recorte por escopo deixa passar — a unica coisa que recusa a
  // linha plantada e o `colaboradores.empresa_id = <filho>.empresa_id` do innerJoin.
  //
  // Sem ele, uma mutacao que apagasse SO a igualdade (mantendo o join e o `where` pelo pai) passaria
  // batida: o teste do ator da A ja rejeita por escopo, porque o pai e da B.
  it("Deve_ContinuarListandoOsFilhosLegitimos_Quando_OAtorTemAEmpresaRealDoColaborador", async () => {
    async function subRota(caminho: "cargos" | "jornadas" | "faltas-justificadas") {
      const resposta = await contexto.app.inject({
        method: "GET",
        url: `/api/colaboradores/${colaboradorBComFilhosMentirosos}/${caminho}?pageSize=100`,
        headers: { cookie: cookieMultiempresa }
      });
      expect(resposta.statusCode).toBe(200);
      return json<{ data: Array<{ id: string }> }>(resposta).data;
    }

    // CARGOS: o legitimo da B aparece; o que mente a empresa fica de fora dos dois lados.
    expect((await subRota("cargos")).map((item) => item.id)).toEqual([vinculoLegitimoDaB]);
    // JORNADAS e FALTAS: o colaborador da B so tem as linhas mentirosas, entao a lista fica vazia
    // MESMO para quem tem as duas empresas. E a prova de que a recusa vem da igualdade, e nao do
    // escopo (que aqui esta satisfeito).
    expect(await subRota("jornadas")).toEqual([]);
    expect(await subRota("faltas-justificadas")).toEqual([]);
  });

  it("Deve_Retornar403_Quando_ACargosPedeAEmpresaBEOAtorSoTemAEmpresaA", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/cargos?empresaId=${idsTeste.empresaB}`,
      headers: { cookie: cookieAdmin }
    });

    assertProblem(resposta, 403, CODIGO_EMPRESA);
  });

  it("Deve_EntregarSomenteOContratoOperacional_Quando_OAtorSoTemCaixaOperar", async () => {
    const resposta = await listarColaboradores(contexto, cookieCaixa);

    expect(resposta.statusCode).toBe(200);
    const itens = dadosDaLista(resposta);
    expect(itens.length).toBeGreaterThan(0);

    // O credor de despesa/retirada e o item da discriminacao usam SO `id` e `nome`; o recorte de
    // empresa do cliente usa `empresaId` (web-vue/utils/domain.ts:684-688).
    for (const item of itens) {
      expect(Object.keys(item).sort()).toEqual(["empresaId", "id", "nome"]);
    }
    const corpo = JSON.stringify(resposta.json());
    expect(corpo).not.toContain("11144477735");
    expect(corpo).not.toContain("cpf");
  });

  it("Deve_Retornar403_Quando_AQueryPedeAEmpresaBEOAtorSoTemAEmpresaA", async () => {
    const resposta = await listarColaboradores(contexto, cookieAdmin, idsTeste.empresaB);

    assertProblem(resposta, 403, CODIGO_EMPRESA);
  });

  it("Deve_Retornar403_Quando_AsSubRotasRecebemEmpresaIdForaDoEscopo", async () => {
    const cargos = await contexto.app.inject({
      method: "GET",
      url: `/api/colaboradores/${colaboradorALegitimo}/cargos?empresaId=${idsTeste.empresaB}`,
      headers: { cookie: cookieAdmin }
    });
    const jornadas = await contexto.app.inject({
      method: "GET",
      url: `/api/colaboradores/${colaboradorALegitimo}/jornadas?empresaId=${idsTeste.empresaB}`,
      headers: { cookie: cookieAdmin }
    });
    const faltas = await contexto.app.inject({
      method: "GET",
      url: `/api/colaboradores/${colaboradorALegitimo}/faltas-justificadas?empresaId=${idsTeste.empresaB}`,
      headers: { cookie: cookieAdmin }
    });

    assertProblem(cargos, 403, CODIGO_EMPRESA);
    assertProblem(jornadas, 403, CODIGO_EMPRESA);
    assertProblem(faltas, 403, CODIGO_EMPRESA);
  });

  // === 2. CRIACAO ==============================================================================

  it("Deve_RecusarESalvarZeroLinhas_Quando_CriarColaboradorComSetorDaEmpresaB", async () => {
    const antes = await contarLinhas("colaboradores", idsTeste.empresaA);
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/colaboradores",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: "COLABORADOR-COM-SETOR-DA-B",
        cargoId: idsTeste.cargoGerente,
        setorId: setorB
      }
    });

    expect(resposta.statusCode).toBe(400);
    await expect(
      consultarUm("select id from colaboradores where nome = $1", ["COLABORADOR-COM-SETOR-DA-B"])
    ).resolves.toBeNull();
    expect(antes).toBe(await contarLinhas("colaboradores", idsTeste.empresaA));
  });

  it("Deve_RecusarESalvarZeroLinhas_Quando_CriarColaboradorComCargoDaEmpresaB", async () => {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/colaboradores",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: "COLABORADOR-COM-CARGO-DA-B",
        cargoId: cargoB,
        setorId: idsTeste.setorA
      }
    });

    expect(resposta.statusCode).toBe(400);
    await expect(
      consultarUm("select id from colaboradores where nome = $1", ["COLABORADOR-COM-CARGO-DA-B"])
    ).resolves.toBeNull();
  });

  it("Deve_RecusarESalvarZeroLinhas_Quando_CriarColaboradorComTurnoDaEmpresaB", async () => {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/colaboradores",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: "COLABORADOR-COM-TURNO-DA-B",
        cargoId: idsTeste.cargoGerente,
        turnoPadraoId: turnoB
      }
    });

    expect(resposta.statusCode).toBe(400);
    await expect(
      consultarUm("select id from colaboradores where nome = $1", ["COLABORADOR-COM-TURNO-DA-B"])
    ).resolves.toBeNull();
  });

  // === 3. EDICAO ===============================================================================

  it("Deve_RecusarENaoAlterarNadaNemInserirCargo_Quando_OAlvoRealEDaEmpresaBESemCargoAtivo", async () => {
    const antes = await colaboradorGravado(colaboradorBSemCargo);
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/colaboradores/${colaboradorBSemCargo}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: "SEQUESTRADO PELA EMPRESA A",
        cpf: "00000000000",
        cargoId: idsTeste.cargoGerente,
        setorId: idsTeste.setorA
      }
    });

    assertProblem(resposta, 404, CODIGO_COLABORADOR_AUSENTE);
    // Nenhum campo do alvo mudou...
    expect(await colaboradorGravado(colaboradorBSemCargo)).toEqual(antes);
    // ...e nenhum vinculo fantasma da empresa A nasceu no colaborador da B.
    expect(await vinculosDoColaborador(colaboradorBSemCargo)).toEqual([]);
  });

  it("Deve_RecusarENaoAlterarNada_Quando_OAlvoRealEDaEmpresaBEComCargoAtivo", async () => {
    const antes = await colaboradorGravado(colaboradorBComCargo);
    const vinculosAntes = await vinculosDoColaborador(colaboradorBComCargo);
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/colaboradores/${colaboradorBComCargo}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: "SEQUESTRADO PELA EMPRESA A",
        cargoId: idsTeste.cargoGerente,
        setorId: idsTeste.setorA
      }
    });

    // Antes: 204 mudo. O corpo mentia dizendo que gravou.
    assertProblem(resposta, 404, CODIGO_COLABORADOR_AUSENTE);
    expect(await colaboradorGravado(colaboradorBComCargo)).toEqual(antes);
    expect(await vinculosDoColaborador(colaboradorBComCargo)).toEqual(vinculosAntes);
  });

  it("Deve_RecusarIntegralmente_Quando_EditarAlvoDaAComSetorOuCargoDaEmpresaB", async () => {
    const antes = await colaboradorGravado(colaboradorALegitimo);

    const comSetorDaB = await contexto.app.inject({
      method: "PUT",
      url: `/api/colaboradores/${colaboradorALegitimo}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: "NOME QUE NAO PODE GRAVAR",
        cargoId: idsTeste.cargoGerente,
        setorId: setorB
      }
    });
    const comCargoDaB = await contexto.app.inject({
      method: "PUT",
      url: `/api/colaboradores/${colaboradorALegitimo}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: "NOME QUE NAO PODE GRAVAR",
        cargoId: cargoB,
        setorId: idsTeste.setorA
      }
    });
    const comTurnoDaB = await contexto.app.inject({
      method: "PUT",
      url: `/api/colaboradores/${colaboradorALegitimo}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: "NOME QUE NAO PODE GRAVAR",
        cargoId: idsTeste.cargoGerente,
        setorId: idsTeste.setorA,
        turnoPadraoId: turnoB
      }
    });

    expect(comSetorDaB.statusCode).toBe(400);
    expect(comCargoDaB.statusCode).toBe(400);
    expect(comTurnoDaB.statusCode).toBe(400);
    // Recusa INTEGRAL: nem o `nome`, que era legitimo, foi gravado.
    expect(await colaboradorGravado(colaboradorALegitimo)).toEqual(antes);
  });

  // Este caso nasceu de uma MUTACAO que nao matou nenhum teste. Todos os ataques acima usam um ator
  // que so tem a empresa A, entao quem os barrava era a checagem de ESCOPO — a checagem de
  // DIVERGENCIA (`empresa real do alvo != empresa do corpo`) nao tinha prova nenhuma.
  //
  // O ator multiempresa tem A e B: o escopo deixa passar, e so a divergencia recusa. Sem ela o PUT
  // gravaria o vinculo de cargo do colaborador da B com `empresa_id` = A — a mesma corrupcao
  // cross-tenant do ataque principal, por um ator legitimo e por um caminho que o escopo nao ve.
  it("Deve_Retornar403_Quando_OCorpoAfirmaUmaEmpresaQueNaoEADoAlvo", async () => {
    const antes = await colaboradorGravado(colaboradorBSemCargo);

    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/colaboradores/${colaboradorBSemCargo}`,
      headers: { cookie: cookieMultiempresa },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: "MOVIDO PARA A EMPRESA A",
        cargoId: idsTeste.cargoGerente,
        setorId: idsTeste.setorA
      }
    });

    assertProblem(resposta, 403, CODIGO_EMPRESA);
    expect(await colaboradorGravado(colaboradorBSemCargo)).toEqual(antes);
    expect(await vinculosDoColaborador(colaboradorBSemCargo)).toEqual([]);
  });

  it("Deve_Retornar404ENaoCriarNada_Quando_OIdDoAlvoNaoExiste", async () => {
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/colaboradores/${colaboradorInexistente}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: "COLABORADOR FANTASMA",
        cargoId: idsTeste.cargoGerente,
        setorId: idsTeste.setorA
      }
    });

    // Antes: 500 INTERNAL_ERROR (violacao de FK ao inserir o cargo do fantasma) + alerta no Sentry.
    assertProblem(resposta, 404, CODIGO_COLABORADOR_AUSENTE);
    expect(await contarLinhas("colaboradores", colaboradorInexistente)).toBe(0);
    expect(await contarLinhas("colaboradores_cargos", colaboradorInexistente)).toBe(0);
  });

  // === 4. FALSO 204 ============================================================================

  it("Deve_Retornar404_Quando_OPutDeCargoNaoAfetaLinhaNenhuma", async () => {
    const nomeAntes = await nomeDoCargo(cargoB);

    const cargoDaOutraEmpresa = await contexto.app.inject({
      method: "PUT",
      url: `/api/cargos/${cargoB}`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "CARGO SEQUESTRADO" }
    });
    const cargoQueNaoExiste = await contexto.app.inject({
      method: "PUT",
      url: `/api/cargos/${cargoInexistente}`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "CARGO FANTASMA" }
    });

    assertProblem(cargoDaOutraEmpresa, 404, CODIGO_CARGO_AUSENTE);
    assertProblem(cargoQueNaoExiste, 404, CODIGO_CARGO_AUSENTE);
    expect(await nomeDoCargo(cargoB)).toBe(nomeAntes);
    expect(await nomeDoCargo(cargoInexistente)).toBeNull();
  });

  it("Deve_Retornar404_Quando_AlterarStatusDeVinculoDaEmpresaBComCorpoDaA", async () => {
    const antes = await vinculosDoColaborador(colaboradorBComCargo);

    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/colaboradores/${colaboradorBComCargo}/cargos/${vinculoBComCargo}`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, ativo: false }
    });

    // Antes: 204 mudo — e, pior, o guard do ultimo cargo ativo rodava sobre a linha da empresa B,
    // devolvendo 409 ou 204 conforme o estado dela. Oraculo de existencia.
    assertProblem(resposta, 404, CODIGO_COLABORADOR_AUSENTE);
    expect(await vinculosDoColaborador(colaboradorBComCargo)).toEqual(antes);
  });

  it("Deve_Retornar404_Quando_OVinculoInformadoNaoPertenceAoColaborador", async () => {
    const antes = await vinculosDoColaborador(colaboradorAStatus);

    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/colaboradores/${colaboradorAStatus}/cargos/${vinculoInexistente}`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, ativo: false }
    });

    assertProblem(resposta, 404, CODIGO_VINCULO_AUSENTE);
    expect(await vinculosDoColaborador(colaboradorAStatus)).toEqual(antes);
  });

  // === 5. SUB-ROTAS ============================================================================

  it("Deve_Recusar_Quando_CriarCargoParaColaboradorDaEmpresaBComCorpoDaA", async () => {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: `/api/colaboradores/${colaboradorBSemCargo}/cargos`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        cargoId: idsTeste.cargoGerente,
        setorId: idsTeste.setorA,
        remuneracaoMinuto: 1,
        dataInicio: "2026-03-01",
        ativo: true
      }
    });

    assertProblem(resposta, 404, CODIGO_COLABORADOR_AUSENTE);
    expect(await vinculosDoColaborador(colaboradorBSemCargo)).toEqual([]);
  });

  it("Deve_Recusar_Quando_CriarJornadaOuFaltaParaColaboradorDaEmpresaB", async () => {
    const jornada = await contexto.app.inject({
      method: "POST",
      url: `/api/colaboradores/${colaboradorBComCargo}/jornadas`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataInicio: "2026-07-01",
        dias: [
          {
            diaDaSemana: "SEGUNDA",
            faixas: [
              {
                horaEntrada: "08:00",
                cargaHorariaDiariaEmMinutos: 480,
                intervaloMinutos: 60,
                colaboradorCargoId: vinculoBComCargo
              }
            ]
          }
        ]
      }
    });
    const falta = await contexto.app.inject({
      method: "POST",
      url: `/api/colaboradores/${colaboradorBComCargo}/faltas-justificadas`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        inicio: "2026-07-02T08:00:00.000Z",
        fim: "2026-07-02T12:00:00.000Z",
        motivo: "Falta cross-tenant"
      }
    });

    assertProblem(jornada, 404, CODIGO_COLABORADOR_AUSENTE);
    assertProblem(falta, 404, CODIGO_COLABORADOR_AUSENTE);
    await expect(
      consultarUm("select id from colaboradores_jornadas where colaborador_id = $1", [colaboradorBComCargo])
    ).resolves.toBeNull();
    await expect(
      consultarUm("select id from colaboradores_faltas_justificadas where colaborador_id = $1", [colaboradorBComCargo])
    ).resolves.toBeNull();
  });

  // A divergencia `empresa real do alvo != empresa do corpo` so tinha prova no PUT do colaborador.
  // Os outros quatro portoes passam `payload.empresaId` para o mesmo `bloquearColaboradorDoAtor`,
  // mas isso era verdade so por leitura de codigo — e foi exatamente esse tipo de buraco que a
  // mutacao achou da primeira vez. O ator multiempresa passa no escopo; so a divergencia recusa.
  it("Deve_Retornar403_Quando_AsSubRotasDeEscritaAfirmamEmpresaDivergente", async () => {
    const corpoDaEmpresaErrada = { empresaId: idsTeste.empresaA };

    const cargo = await contexto.app.inject({
      method: "POST",
      url: `/api/colaboradores/${colaboradorBSemCargo}/cargos`,
      headers: { cookie: cookieMultiempresa },
      payload: {
        ...corpoDaEmpresaErrada,
        cargoId: idsTeste.cargoGerente,
        remuneracaoMinuto: 1,
        dataInicio: "2026-05-01",
        ativo: true
      }
    });
    const status = await contexto.app.inject({
      method: "PUT",
      url: `/api/colaboradores/${colaboradorBComCargo}/cargos/${vinculoBComCargo}`,
      headers: { cookie: cookieMultiempresa },
      payload: { ...corpoDaEmpresaErrada, ativo: false }
    });
    const jornada = await contexto.app.inject({
      method: "POST",
      url: `/api/colaboradores/${colaboradorBComCargo}/jornadas`,
      headers: { cookie: cookieMultiempresa },
      payload: {
        ...corpoDaEmpresaErrada,
        dataInicio: "2026-05-01",
        dias: [
          {
            diaDaSemana: "QUINTA",
            faixas: [
              {
                horaEntrada: "08:00",
                cargaHorariaDiariaEmMinutos: 480,
                intervaloMinutos: 60,
                colaboradorCargoId: vinculoBComCargo
              }
            ]
          }
        ]
      }
    });
    const falta = await contexto.app.inject({
      method: "POST",
      url: `/api/colaboradores/${colaboradorBComCargo}/faltas-justificadas`,
      headers: { cookie: cookieMultiempresa },
      payload: {
        ...corpoDaEmpresaErrada,
        inicio: "2026-05-02T08:00:00.000Z",
        fim: "2026-05-02T12:00:00.000Z",
        motivo: "Falta com empresa divergente"
      }
    });

    assertProblem(cargo, 403, CODIGO_EMPRESA);
    assertProblem(status, 403, CODIGO_EMPRESA);
    assertProblem(jornada, 403, CODIGO_EMPRESA);
    assertProblem(falta, 403, CODIGO_EMPRESA);
    // O vinculo da B continua ativo e nenhuma linha nova nasceu nele.
    expect(await vinculosDoColaborador(colaboradorBComCargo)).toHaveLength(1);
    expect(await vinculosDoColaborador(colaboradorBSemCargo)).toEqual([]);
  });

  // === 6. IMPORTACAO / EXPORTACAO ==============================================================

  it("Deve_NaoAtravessarEmpresa_Quando_ImportarOuExportarForaDoEscopo", async () => {
    const importar = await contexto.app.inject({
      method: "POST",
      url: "/api/colaboradores/importar",
      headers: { cookie: cookieAdmin },
      payload: { empresaOrigemId: idsTeste.empresaB, empresaDestinoId: idsTeste.empresaA, modo: "simples" }
    });
    const exportar = await contexto.app.inject({
      method: "POST",
      url: `/api/colaboradores/${colaboradorBComCargo}/exportar`,
      headers: { cookie: cookieAdmin },
      payload: { empresaDestinoId: idsTeste.empresaA, modo: "simples" }
    });

    assertProblem(importar, 403, CODIGO_EMPRESA);
    assertProblem(exportar, 404, CODIGO_COLABORADOR_AUSENTE);
    await expect(
      consultarUm("select id from colaboradores where empresa_id = $1 and importado_de = $2", [
        idsTeste.empresaA,
        idsTeste.empresaB
      ])
    ).resolves.toBeNull();
  });

  // === 7. FALHA TECNICA ========================================================================

  // Espelha `Deve_Retornar500_Quando_OBancoFalhaAoCarregarOAlvoDaEdicao`
  // (tests/integration/usuarios/edicao-segura.test.ts:906). O filtro e por PARAMETRO, nao so pelo
  // texto do SQL: derrubar toda consulta a `colaboradores` mataria junto a resolucao de perfil do
  // proprio ator no preHandler, e o teste provaria 500 pela razao errada.
  it("Deve_Retornar500ENao400_Quando_OBancoFalhaAoCarregarOAlvoDaEdicao", async () => {
    const conectarOriginal = pool.connect.bind(pool);
    const embrulhados: { cliente: pg.PoolClient; original: pg.PoolClient["query"] }[] = [];
    pool.connect = ((...args: unknown[]) => {
      if (args.length) return (conectarOriginal as (...a: unknown[]) => unknown)(...args);
      return (conectarOriginal as () => Promise<pg.PoolClient>)().then((cliente) => {
        const queryOriginal = cliente.query.bind(cliente);
        embrulhados.push({ cliente, original: queryOriginal });
        cliente.query = ((texto: unknown, ...resto: unknown[]) => {
          const sql = typeof texto === "string" ? texto : String((texto as { text?: string })?.text ?? "");
          const parametros = Array.isArray(resto[0]) ? (resto[0] as unknown[]) : [];
          if (sql.includes('from "colaboradores"') && parametros.includes(colaboradorALegitimo)) {
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
        url: `/api/colaboradores/${colaboradorALegitimo}`,
        headers: { cookie: cookieAdmin },
        payload: {
          empresaId: idsTeste.empresaA,
          nome: "COLABORADOR-EMPRESA-A-LEGITIMO",
          cargoId: idsTeste.cargoGerente,
          setorId: idsTeste.setorA
        }
      });

      expect(resposta.statusCode).toBe(500);
      const corpo = JSON.stringify(resposta.json());
      expect(corpo).not.toContain(CODIGO_COLABORADOR_AUSENTE);
      expect(corpo).not.toContain(CODIGO_EMPRESA);
      expect(corpo).not.toContain("banco fora do ar (simulado)");
    } finally {
      pool.connect = conectarOriginal;
      for (const { cliente, original } of embrulhados) cliente.query = original;
    }
  });

  // === 8. AUSENCIA DE ATOR =====================================================================

  // Chamada direta ao service: o guard de rota nunca deixa `perfilUsuario` indefinido hoje, entao
  // o fio HTTP nao alcanca este caminho. O teste existe porque seguranca nao pode depender de
  // nenhum chamador lembrar — e o mesmo argumento da PR #145 (usuarios.service.ts:168-172).
  it("Deve_FalharFechado_Quando_NaoHaAtor", async () => {
    await expect(
      salvarColaborador(null, {
        empresaId: idsTeste.empresaB,
        nome: "COLABORADOR SEM ATOR",
        cargoId: cargoB
      })
    ).rejects.toMatchObject({ status: 403, code: CODIGO_SEM_ATOR });

    await expect(
      consultarUm("select id from colaboradores where nome = $1", ["COLABORADOR SEM ATOR"])
    ).resolves.toBeNull();
  });

  // === 8b. NIVEL DO LOCK DA RAIZ ===============================================================
  //
  // A CX-M05 transformou o lock da linha de `colaboradores` no portao de CINCO escritas que antes
  // nao travavam nada. Com `FOR UPDATE` isso teria custado a operacao: `colaboradores.id` e
  // referenciado por 9 FKs (db/migrations/0001_baseline.sql:826-941), entre elas
  // `fechamentos_caixa.colaborador_id` (:860) e `debitos_colaboradores.colaborador_id` (:840), e
  // todo INSERT nessas tabelas pega `FOR KEY SHARE` na linha do colaborador para checar a FK.
  // `FOR UPDATE` conflita com `KEY SHARE`; `NO KEY UPDATE` nao.
  //
  // Sem `sleep`: quem decide a ordem e o `NOWAIT`, que falha na hora com 55P03 (`lock_not_available`)
  // em vez de esperar. E o mesmo instrumento da PR #145 (edicao-segura.test.ts).
  // Os dois casos abaixo passam pela ROTA REAL, de proposito. Uma primeira versao deles travava a
  // linha com SQL proprio e conferia a matriz de conflito do Postgres — e nao servia para nada:
  // trocar `no key update` por `update` no repositorio NAO derrubava o teste, porque ele nunca
  // exercitava o codigo de producao. Provava o Postgres, nao a entrega.
  describe("nivel do lock da raiz de colaboradores", () => {
    async function abrirBloqueador(modo: "key share" | "update") {
      const cliente = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
      await cliente.connect();
      try {
        // Teto de espera nesta conexao: se o teste for interrompido, a transacao nao fica segurando
        // a linha e queimando o timeout de todos os testes seguintes.
        await cliente.query("set lock_timeout = '15s'");
        const { rows } = await cliente.query<{ pid: number }>("select pg_backend_pid() as pid");
        await cliente.query("begin");
        await cliente.query(`select id from colaboradores where id = $1 for ${modo}`, [colaboradorALegitimo]);
        return { cliente, pid: rows[0]?.pid ?? 0 };
      } catch (erro) {
        await cliente.end().catch(() => undefined);
        throw erro;
      }
    }

    async function fechar(bloqueador: { cliente: pg.Client }) {
      await bloqueador.cliente.query("rollback").catch(() => undefined);
      await bloqueador.cliente.end().catch(() => undefined);
    }

    it("Deve_EditarSemEsperar_Quando_UmaFkDeCaixaSeguraKeyShareNoColaborador", async () => {
      // `FOR KEY SHARE` e exatamente o lock que o Postgres toma sozinho ao validar a FK de um INSERT
      // em `fechamentos_caixa` (abrir caixa) ou `debitos_colaboradores` (despesa/retirada com credor
      // colaborador). Com `NO KEY UPDATE` no repositorio, o PUT nao conflita e responde COM O
      // BLOQUEADOR AINDA ABERTO. Se alguem devolver `FOR UPDATE`, este `await` nao resolve ate o
      // rollback la embaixo e o teste morre no timeout — que e o kill que se quer.
      const bloqueador = await abrirBloqueador("key share");
      try {
        const resposta = await contexto.app.inject({
          method: "PUT",
          url: `/api/colaboradores/${colaboradorALegitimo}`,
          headers: { cookie: cookieAdmin },
          payload: {
            empresaId: idsTeste.empresaA,
            nome: "COLABORADOR-EMPRESA-A-LEGITIMO",
            cpf: "11144477735",
            cargoId: idsTeste.cargoGerente,
            setorId: idsTeste.setorA,
            turnoPadraoId: turnoA
          }
        });

        expect(resposta.statusCode).toBe(204);
      } finally {
        await fechar(bloqueador);
      }
    });

    it("Deve_EsperarOFluxoDeUsuarios_Quando_EleSeguraForUpdateNoColaborador", async () => {
      // O outro lado: `usuarios.repository.ts` pede `FOR UPDATE` para trocar `usuario_id`. Essa
      // serializacao e a garantia da PR #145 e a CX-M05 nao pode afrouxa-la — `NO KEY UPDATE`
      // continua conflitando com `UPDATE`. O bloqueio e observado em `pg_blocking_pids`,
      // especificamente pelo pid do bloqueador; nao ha `sleep` decidindo ordem.
      const bloqueador = await abrirBloqueador("update");
      let promessa: Promise<unknown> | null = null;
      try {
        // Payload COMPLETO e igual ao estado gravado: este teste e sobre esperar o lock, nao sobre
        // mudar dado. O PUT e substituicao total, entao omitir `cpf`/`turnoPadraoId` aqui apagaria
        // os dois e quebraria a contraprova do contrato completo mais adiante no arquivo.
        promessa = contexto.app.inject({
          method: "PUT",
          url: `/api/colaboradores/${colaboradorALegitimo}`,
          headers: { cookie: cookieAdmin },
          payload: {
            empresaId: idsTeste.empresaA,
            nome: "COLABORADOR-EMPRESA-A-LEGITIMO",
            cpf: "11144477735",
            cargoId: idsTeste.cargoGerente,
            setorId: idsTeste.setorA,
            turnoPadraoId: turnoA
          }
        });

        const inicio = Date.now();
        let bloqueadas = 0;
        while (Date.now() - inicio < 20_000 && bloqueadas < 1) {
          const { rows } = await bloqueador.cliente.query<{ total: number }>(
            `select count(*)::int as total
               from pg_stat_activity
              where datname = current_database()
                and pid <> pg_backend_pid()
                and $1 = any(pg_blocking_pids(pid))`,
            [bloqueador.pid]
          );
          bloqueadas = rows[0]?.total ?? 0;
          if (!bloqueadas) await new Promise((resolver) => setTimeout(resolver, 25));
        }

        expect(bloqueadas).toBeGreaterThanOrEqual(1);
      } finally {
        await fechar(bloqueador);
        // Solto o bloqueador, a edicao conclui normalmente.
        if (promessa) expect(((await promessa) as { statusCode: number }).statusCode).toBe(204);
      }
    });
  });

  // === 9. CONTRAPROVAS: o que NAO pode quebrar =================================================

  it("Deve_ContinuarListandoOsProprios_Quando_OAtorEDaEmpresaA", async () => {
    const resposta = await listarColaboradores(contexto, cookieAdmin);
    const itens = dadosDaLista(resposta);

    expect(itens.some((item) => item.id === colaboradorALegitimo)).toBe(true);
    expect(itens.some((item) => item.id === idsTeste.colaboradorGerente)).toBe(true);
    expect(itens.every((item) => item.empresaId === idsTeste.empresaA)).toBe(true);
  });

  it("Deve_ContinuarEntregandoOContratoCompleto_Quando_OAtorCadastraColaboradores", async () => {
    const resposta = await listarColaboradores(contexto, cookieAdmin);
    const alvo = dadosDaLista(resposta).find((item) => item.id === colaboradorALegitimo);

    // O contrato completo preserva os campos do cadastro legado e acrescenta o contexto
    // somente-leitura do DP. Retirar os campos legados apaga dado em silencio no proximo PUT,
    // porque o payload de cadastro e substituicao total
    // (shared/src/cadastros/index.ts:405-413); retirar os quatro novos quebra a lista do perfil DP.
    expect(Object.keys(alvo ?? {}).sort()).toEqual([
      "cpf",
      "empresaId",
      "funcaoNome",
      "id",
      "matricula",
      "nome",
      "setorId",
      "temVinculoHistorico",
      "turnoPadraoId",
      "usuarioId",
      "vinculoAtivoId"
    ]);
    expect(alvo?.cpf).toBe("11144477735");
    expect(alvo?.setorId).toBe(idsTeste.setorA);
    expect(alvo?.turnoPadraoId).toBe(turnoA);
  });

  it("Deve_ContinuarEntregandoUsuarioIdESetorId_Quando_OAtorEditaUsuarios", async () => {
    // O `gerente` do seed alcanca a rota por `caixa_operar` e tem `cadastro_usuarios_visualizar`
    // (tests/setup/seed.ts:93-110). A tela de usuarios depende de `usuarioId` para so oferecer
    // colaborador LIVRE (web-vue/components/app/AppWorkspace.vue:261-265) e de `setorId` para
    // herdar o setor na linha do usuario (web-vue/utils/cadastro-local.ts:181).
    const resposta = await listarColaboradores(contexto, cookieGerente);
    const itens = dadosDaLista(resposta);
    const vinculado = itens.find((item) => item.id === idsTeste.colaboradorGerente);

    expect(resposta.statusCode).toBe(200);
    expect(Object.keys(vinculado ?? {})).toContain("usuarioId");
    expect(Object.keys(vinculado ?? {})).toContain("setorId");
    expect(vinculado?.usuarioId).toBeTruthy();
  });

  it("Deve_ContinuarMostrandoColaboradorSemSetor_Quando_SetorIdENulo", async () => {
    const resposta = await listarColaboradores(contexto, cookieAdmin);
    const alvo = dadosDaLista(resposta).find((item) => item.id === colaboradorASemSetor);

    expect(alvo).toBeDefined();
    expect(alvo?.setorId ?? null).toBeNull();
    expect(alvo?.nome).toBe("COLABORADOR-EMPRESA-A-SEM-SETOR");
  });

  it("Deve_VerAsDuasEmpresas_Quando_OAtorEMultiempresaAutorizado", async () => {
    const resposta = await listarColaboradores(contexto, cookieMultiempresa);
    const empresas = new Set(dadosDaLista(resposta).map((item) => item.empresaId));

    expect(resposta.statusCode).toBe(200);
    expect(empresas.has(idsTeste.empresaA)).toBe(true);
    expect(empresas.has(idsTeste.empresaB)).toBe(true);
  });

  it("Deve_EditarColaboradorDaEmpresaB_Quando_OAtorEMultiempresaAutorizado", async () => {
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/colaboradores/${colaboradorBComCargo}`,
      headers: { cookie: cookieMultiempresa },
      payload: {
        empresaId: idsTeste.empresaB,
        nome: "COLABORADOR-EMPRESA-B-EDITADO",
        cargoId: cargoB,
        setorId: setorB
      }
    });

    expect(resposta.statusCode).toBe(204);
    expect((await colaboradorGravado(colaboradorBComCargo))?.nome).toBe("COLABORADOR-EMPRESA-B-EDITADO");
  });

  it("Deve_EditarNaPropriaEmpresa_Quando_OAlvoEOsVinculosSaoDaEmpresaDoAtor", async () => {
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/colaboradores/${colaboradorALegitimo}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: "COLABORADOR-EMPRESA-A-EDITADO",
        cpf: "11144477735",
        cargoId: idsTeste.cargoGerente,
        setorId: idsTeste.setorA,
        turnoPadraoId: turnoA
      }
    });

    expect(resposta.statusCode).toBe(204);
    const gravado = await colaboradorGravado(colaboradorALegitimo);
    expect(gravado?.nome).toBe("COLABORADOR-EMPRESA-A-EDITADO");
    expect(gravado?.setor_id).toBe(idsTeste.setorA);
    expect(gravado?.turno_padrao_id).toBe(turnoA);
  });

  it("Deve_ContinuarCriandoNaPropriaEmpresa_Quando_SetorCargoETurnoSaoDaMesmaEmpresa", async () => {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/colaboradores",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: "COLABORADOR-CRIADO-LEGITIMO",
        cargoId: cargoAExtra,
        setorId: idsTeste.setorA,
        turnoPadraoId: turnoA
      }
    });

    expect(resposta.statusCode).toBe(201);
    const criado = json<{ data: { id: string } }>(resposta).data.id;
    const vinculos = await vinculosDoColaborador(criado);
    expect(vinculos).toHaveLength(1);
    expect(vinculos[0]?.empresa_id).toBe(idsTeste.empresaA);
    expect(vinculos[0]?.cargo_id).toBe(cargoAExtra);
  });

  it("Deve_ContinuarAlterandoOStatusDoVinculo_Quando_TudoEDaEmpresaDoAtor", async () => {
    const extra = await contexto.app.inject({
      method: "POST",
      url: `/api/colaboradores/${colaboradorAStatus}/cargos`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        cargoId: cargoAExtra,
        setorId: idsTeste.setorA,
        remuneracaoMinuto: 1,
        dataInicio: "2026-04-01",
        ativo: true
      }
    });
    expect(extra.statusCode).toBe(201);
    const extraId = json<{ data: { id: string } }>(extra).data.id;

    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/colaboradores/${colaboradorAStatus}/cargos/${extraId}`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, ativo: false }
    });

    expect(resposta.statusCode).toBe(204);
    await expect(
      consultarUm("select id from colaboradores_cargos where id = $1 and ativo = false", [extraId])
    ).resolves.toBeTruthy();
  });

  // Ramo do `onConflictDoUpdate` de `salvarCargoColaboradorRepository`. Antes da CX-M05 este roteiro
  // — desativar o unico vinculo e depois editar o colaborador no MESMO dia — batia na unica
  // `(empresa, colaborador, cargo, data_inicio)` e virava 500 + alerta no Sentry, num fluxo
  // inteiramente legitimo. O efeito (colaborador volta a ter cargo ativo) ja era o pretendido pelo
  // bloco: ele so roda quando a contagem de cargos ativos e zero.
  it("Deve_ReativarOVinculoEmVezDeQuebrar_Quando_OColaboradorFicouSemCargoAtivoNoMesmoDia", async () => {
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/colaboradores",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: "COLABORADOR-REATIVACAO",
        cargoId: cargoAExtra,
        setorId: idsTeste.setorA
      }
    });
    expect(criado.statusCode).toBe(201);
    const colaboradorId = json<{ data: { id: string } }>(criado).data.id;
    const vinculo = (await vinculosDoColaborador(colaboradorId))[0];
    expect(vinculo?.ativo).toBe(true);

    const desativou = await contexto.app.inject({
      method: "PUT",
      url: `/api/colaboradores/${colaboradorId}/cargos/${vinculo?.id}`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, ativo: false }
    });
    expect(desativou.statusCode).toBe(204);

    const reeditou = await contexto.app.inject({
      method: "PUT",
      url: `/api/colaboradores/${colaboradorId}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: "COLABORADOR-REATIVACAO-EDITADO",
        cargoId: cargoAExtra,
        setorId: idsTeste.setorA
      }
    });

    expect(reeditou.statusCode).toBe(204);
    const depois = await vinculosDoColaborador(colaboradorId);
    // Reativa a MESMA linha, nao cria uma segunda.
    expect(depois).toHaveLength(1);
    expect(depois[0]?.id).toBe(vinculo?.id);
    expect(depois[0]?.ativo).toBe(true);
  });

  it("Deve_PreservarOColaboradorVinculado_Quando_AEdicaoDeUsuarioOmiteColaboradorId", async () => {
    // Fio da PR #145: a listagem recorta `colaboradorId` ao escopo da tela, entao o PUT que o OMITE
    // precisa preservar o vinculo gravado. Se a CX-M05 mexesse na projecao de `usuarioId` ou no
    // vinculo do colaborador, este teste cairia.
    const usuario = await consultarUm<{ usuario_id: string; email: string; nome: string }>(
      "select usuario_id, email, nome from perfis_usuarios where email = $1",
      ["gerente.integracao@padaria.local"]
    );
    expect(usuario).toBeTruthy();

    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/usuarios/${usuario?.usuario_id}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaIds: [idsTeste.empresaA],
        nome: "Gerente Integracao CXM05",
        email: usuario?.email,
        role: "usuario_comum"
      }
    });

    expect(resposta.statusCode).toBe(204);
    await expect(
      consultarUm("select id from colaboradores where usuario_id = $1", [usuario?.usuario_id])
    ).resolves.toMatchObject({ id: idsTeste.colaboradorGerente });
  });
});
