import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

// P1-A da revisao do Codex sobre a CX-M05.
//
// `api/src/auth/perfil.repository.ts` monta o perfil da SESSAO e:
//   - lia `colaboradores.setor_id` sem confirmar que o setor e da empresa REAL do colaborador, e
//     resolvia `permissoes_setores` por esse id;
//   - lia `colaboradores_cargos` filtrando so por `colaborador_id` + `ativo`, sem exigir
//     `colaboradores_cargos.empresa_id = colaboradores.empresa_id` nem
//     `cargos.empresa_id = colaboradores.empresa_id`, e resolvia `permissoes_cargos` por esses ids;
//   - devolvia `setorId`, `cargoIds` e `cargos` (com NOME) no perfil.
//
// Consequencia: uma linha corrompida ja gravada — o passivo que a CX-M05 declarou e nao saneou —
// concedia permissao de outra empresa, autorizava guard e mandava UUID e nome de cargo/setor da
// empresa B para o browser da empresa A.
//
// A CX-M05 fechou a ESCRITA. Este arquivo fecha a LEITURA: mesmo com a linha suja no banco, nada da
// empresa estrangeira entra no perfil.
//
// O que NAO muda: a P-07 do PROJECT_BRAIN/23 ("permissao de cargo/setor vale cross-empresa"), que
// foi homologada. Ela diz que o CONJUNTO de permissoes de um cargo legitimo vale em todo o escopo do
// usuario. Aqui o assunto e outro: um vinculo cujo cargo/setor pertence a uma empresa DIFERENTE da
// do proprio colaborador — link corrompido, nunca uma decisao de negocio. Linha legitima sempre tem
// as duas empresas iguais (usuarios.service.ts grava a empresa do proprio colaborador), entao a
// correcao nao toca em nada homologado. As contraprovas no fim do arquivo travam isso.

// Permissao MARCADORA: existe no catalogo, protege uma rota real (`GET /api/clientes`, guard
// `cadastro_clientes_visualizar` em clientes.controller.ts:11) e NENHUM dos perfis usados aqui a
// possui pelo seed. Se ela aparecer, so pode ter vindo da linha corrompida.
const MARCADOR = "cadastro_clientes_visualizar";

// SEGUNDO marcador, para um caso que o primeiro nao consegue isolar (ver CORRUPCAO 4). Protege
// `GET /api/lacres` (lacres.controller.ts:11) e nenhum dos dois perfis usados nele o tem no seed —
// `tesouraria` tem, por isso ela NAO pode aparecer neste par.
const MARCADOR_VINCULO = "cadastro_lacres_visualizar";

const setorBMarcado = "33333333-3333-4333-8333-00000000f001";
const cargoBMarcado = "33333333-3333-4333-8333-00000000f002";
const setorAMarcado = "11111111-1111-4111-8111-00000000f003";
const cargoAMarcado = "11111111-1111-4111-8111-00000000f004";
// Cargo da PROPRIA empresa A. E o que permite testar a igualdade de empresa do VINCULO isolada da
// igualdade de empresa do CARGO.
const cargoALacre = "11111111-1111-4111-8111-00000000f008";

const vinculoCargoBMarcadoComoA = "11111111-1111-4111-8111-00000000f005";
const vinculoCargoBMarcadoComoB = "11111111-1111-4111-8111-00000000f006";
const vinculoCargoALegitimo = "11111111-1111-4111-8111-00000000f007";
const vinculoMarcadoComoBComCargoDaA = "11111111-1111-4111-8111-00000000f009";
const vinculoLacreLegitimo = "11111111-1111-4111-8111-00000000f00a";

type PerfilSessao = {
  setorId: string | null;
  cargoIds: string[];
  cargos: Array<{ id: string; nome: string }>;
  permissoes: string[];
  empresaIds: string[];
};

async function semear() {
  // --- empresa B: um setor e um cargo, os dois carregando o marcador --------------------------
  await executarSql("insert into setores (id, empresa_id, nome) values ($1, $2, $3)", [
    setorBMarcado,
    idsTeste.empresaB,
    "SETOR-B-MARCADO"
  ]);
  await executarSql("insert into cargos (id, empresa_id, nome) values ($1, $2, $3)", [
    cargoBMarcado,
    idsTeste.empresaB,
    "CARGO-B-MARCADO"
  ]);
  await executarSql("insert into permissoes_setores (setor_id, regras) values ($1, $2::jsonb)", [
    setorBMarcado,
    JSON.stringify({ [MARCADOR]: true })
  ]);
  await executarSql("insert into permissoes_cargos (cargo_id, regras) values ($1, $2::jsonb)", [
    cargoBMarcado,
    JSON.stringify({ [MARCADOR]: true })
  ]);

  // --- empresa A: os gemeos legitimos, para as contraprovas -----------------------------------
  await executarSql("insert into setores (id, empresa_id, nome) values ($1, $2, $3)", [
    setorAMarcado,
    idsTeste.empresaA,
    "SETOR-A-MARCADO"
  ]);
  await executarSql("insert into cargos (id, empresa_id, nome) values ($1, $2, $3)", [
    cargoAMarcado,
    idsTeste.empresaA,
    "CARGO-A-MARCADO"
  ]);
  await executarSql("insert into permissoes_setores (setor_id, regras) values ($1, $2::jsonb)", [
    setorAMarcado,
    JSON.stringify({ [MARCADOR]: true })
  ]);
  await executarSql("insert into permissoes_cargos (cargo_id, regras) values ($1, $2::jsonb)", [
    cargoAMarcado,
    JSON.stringify({ [MARCADOR]: true })
  ]);

  // --- CORRUPCAO 1: colaborador da A apontando para setor da B --------------------------------
  // `semPermissao` nao tem nenhuma permissao no seed, entao qualquer marcador no perfil dele so
  // pode ter vindo daqui.
  await executarSql("update colaboradores set setor_id = $1 where id = $2", [
    setorBMarcado,
    idsTeste.colaboradorSemPermissao
  ]);

  // --- CORRUPCAO 2: vinculo marcado como A, apontando para cargo REAL da B ---------------------
  await executarSql(
    `insert into colaboradores_cargos
       (id, empresa_id, colaborador_id, setor_id, cargo_id, remuneracao_minuto, data_inicio, ativo)
     values ($1, $2, $3, null, $4, '1.000000', '2026-03-01', true)`,
    [vinculoCargoBMarcadoComoA, idsTeste.empresaA, idsTeste.colaboradorTesouraria, cargoBMarcado]
  );

  // --- CORRUPCAO 3: vinculo marcado como B, num colaborador da A ------------------------------
  await executarSql(
    `insert into colaboradores_cargos
       (id, empresa_id, colaborador_id, setor_id, cargo_id, remuneracao_minuto, data_inicio, ativo)
     values ($1, $2, $3, null, $4, '1.000000', '2026-03-01', true)`,
    [vinculoCargoBMarcadoComoB, idsTeste.empresaB, idsTeste.colaboradorDiscriminador, cargoBMarcado]
  );

  // --- LEGITIMO 1: colaborador da A apontando para setor da A com marcador ---------------------
  await executarSql("update colaboradores set setor_id = $1 where id = $2", [setorAMarcado, idsTeste.colaboradorCaixa]);

  // --- LEGITIMO 2: vinculo da A apontando para cargo da A com marcador -------------------------
  await executarSql(
    `insert into colaboradores_cargos
       (id, empresa_id, colaborador_id, setor_id, cargo_id, remuneracao_minuto, data_inicio, ativo)
     values ($1, $2, $3, null, $4, '1.000000', '2026-03-01', true)`,
    [vinculoCargoALegitimo, idsTeste.empresaA, idsTeste.colaboradorGerente, cargoAMarcado]
  );

  // --- CORRUPCAO 4: vinculo marcado como B, colaborador da A, CARGO DA PROPRIA A ---------------
  // Esta fixture nasceu de uma mutacao que nao matou nada. As corrupcoes 2 e 3 usam cargo da B,
  // entao a igualdade de empresa do CARGO ja as barra — e a igualdade de empresa do VINCULO ficava
  // sem prova nenhuma. Aqui o cargo e legitimamente da A: a UNICA coisa que recusa a linha e o
  // `colaboradores_cargos.empresa_id = colaboradores.empresa_id`.
  await executarSql("insert into cargos (id, empresa_id, nome) values ($1, $2, $3)", [
    cargoALacre,
    idsTeste.empresaA,
    "CARGO-A-LACRE"
  ]);
  await executarSql("insert into permissoes_cargos (cargo_id, regras) values ($1, $2::jsonb)", [
    cargoALacre,
    JSON.stringify({ [MARCADOR_VINCULO]: true })
  ]);
  await executarSql(
    `insert into colaboradores_cargos
       (id, empresa_id, colaborador_id, setor_id, cargo_id, remuneracao_minuto, data_inicio, ativo)
     values ($1, $2, $3, null, $4, '1.000000', '2026-03-01', true)`,
    [vinculoMarcadoComoBComCargoDaA, idsTeste.empresaB, idsTeste.colaboradorSemRecorrencia, cargoALacre]
  );

  // --- LEGITIMO 3: o MESMO cargo, com vinculo integro, precisa continuar concedendo ------------
  await executarSql(
    `insert into colaboradores_cargos
       (id, empresa_id, colaborador_id, setor_id, cargo_id, remuneracao_minuto, data_inicio, ativo)
     values ($1, $2, $3, null, $4, '1.000000', '2026-03-01', true)`,
    [vinculoLacreLegitimo, idsTeste.empresaA, idsTeste.colaboradorOperadorEntradas, cargoALacre]
  );
}

describe("perfil da sessao — fronteira de empresa (P1-A)", () => {
  let contexto: ContextoApiTeste;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    // Semeia ANTES de abrir sessao: o perfil e resolvido por requisicao
    // (api/src/auth/guards.ts:29-32), entao o estado do banco no momento da chamada e o que vale.
    await semear();
  }, 180_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  async function perfilDaSessao(perfil: Parameters<typeof cookieSessao>[1]) {
    const cookie = await cookieSessao(contexto.app, perfil);
    const resposta = await contexto.app.inject({ method: "GET", url: "/api/sessao", headers: { cookie } });
    expect(resposta.statusCode).toBe(200);
    return {
      cookie,
      corpo: JSON.stringify(resposta.json()),
      perfil: json<{ data: { perfil: PerfilSessao } }>(resposta).data.perfil
    };
  }

  async function clientes(cookie: string) {
    return contexto.app.inject({ method: "GET", url: "/api/clientes", headers: { cookie } });
  }

  // === CORRUPCAO 1 — setor de outra empresa ====================================================

  it("Deve_IgnorarOSetorEstrangeiro_Quando_OColaboradorDaAApontaParaSetorDaB", async () => {
    const { perfil, corpo, cookie } = await perfilDaSessao("semPermissao");

    // O ponteiro nao volta para o browser...
    expect(perfil.setorId).toBeNull();
    expect(corpo).not.toContain(setorBMarcado);
    expect(corpo).not.toContain("SETOR-B-MARCADO");
    // ...e a permissao do setor da B nao entra no perfil...
    expect(perfil.permissoes).not.toContain(MARCADOR);
    // ...nem autoriza o guard da rota protegida.
    assertProblem(await clientes(cookie), 403, "INSUFFICIENT_PERMISSION");
  });

  // === CORRUPCAO 2 — vinculo marcado como A, cargo real da B ===================================

  it("Deve_IgnorarOCargoEstrangeiro_Quando_OVinculoSeDizDaAMasOCargoEDaB", async () => {
    const { perfil, corpo, cookie } = await perfilDaSessao("tesouraria");

    expect(perfil.cargoIds).not.toContain(cargoBMarcado);
    expect(perfil.cargos.map((cargo) => cargo.nome)).not.toContain("CARGO-B-MARCADO");
    expect(corpo).not.toContain(cargoBMarcado);
    expect(corpo).not.toContain("CARGO-B-MARCADO");
    expect(perfil.permissoes).not.toContain(MARCADOR);
    assertProblem(await clientes(cookie), 403, "INSUFFICIENT_PERMISSION");
  });

  // === CORRUPCAO 3 — vinculo marcado como B, colaborador da A ==================================

  it("Deve_IgnorarOVinculo_Quando_ELeSeDizDaEmpresaBEOColaboradorEDaA", async () => {
    const { perfil, corpo, cookie } = await perfilDaSessao("discriminador");

    expect(perfil.cargoIds).not.toContain(cargoBMarcado);
    expect(corpo).not.toContain(cargoBMarcado);
    expect(corpo).not.toContain("CARGO-B-MARCADO");
    expect(perfil.permissoes).not.toContain(MARCADOR);
    assertProblem(await clientes(cookie), 403, "INSUFFICIENT_PERMISSION");
  });

  // === CORRUPCAO 4 — vinculo marcado como B, cargo da propria empresa do colaborador ===========

  it("Deve_IgnorarOVinculo_Quando_ELeMenteAEmpresaAindaQueOCargoSejaDaEmpresaCerta", async () => {
    const { perfil, cookie } = await perfilDaSessao("semRecorrencia");
    const lacres = await contexto.app.inject({ method: "GET", url: "/api/lacres", headers: { cookie } });

    expect(perfil.cargoIds).not.toContain(cargoALacre);
    expect(perfil.permissoes).not.toContain(MARCADOR_VINCULO);
    assertProblem(lacres, 403, "INSUFFICIENT_PERMISSION");
  });

  it("Deve_ContinuarConcedendo_Quando_OMesmoCargoVemPorVinculoIntegro", async () => {
    const { perfil, cookie } = await perfilDaSessao("operadorEntradas");
    const lacres = await contexto.app.inject({ method: "GET", url: "/api/lacres", headers: { cookie } });

    expect(perfil.cargoIds).toContain(cargoALacre);
    expect(perfil.permissoes).toContain(MARCADOR_VINCULO);
    expect(lacres.statusCode).toBe(200);
  });

  // === CONTRAPROVAS: o legitimo nao pode ser sobrecorrigido =====================================

  it("Deve_ContinuarConcedendo_Quando_OSetorEDaMesmaEmpresaDoColaborador", async () => {
    const { perfil, cookie } = await perfilDaSessao("caixa");

    expect(perfil.setorId).toBe(setorAMarcado);
    expect(perfil.permissoes).toContain(MARCADOR);
    expect((await clientes(cookie)).statusCode).toBe(200);
  });

  it("Deve_ContinuarConcedendo_Quando_OCargoEDaMesmaEmpresaDoColaborador", async () => {
    const { perfil, cookie } = await perfilDaSessao("gerente");

    expect(perfil.cargoIds).toContain(cargoAMarcado);
    expect(perfil.cargos.map((cargo) => cargo.nome)).toContain("CARGO-A-MARCADO");
    expect(perfil.permissoes).toContain(MARCADOR);
    expect((await clientes(cookie)).statusCode).toBe(200);
  });

  it("Deve_ContinuarFuncionando_Quando_OUsuarioEMultiempresaLegitimo", async () => {
    const { perfil, cookie } = await perfilDaSessao("multiempresa");

    expect(perfil.empresaIds.sort()).toEqual([idsTeste.empresaA, idsTeste.empresaB].sort());
    // `usuario_admin` resolve por short-circuit (perfil.service.ts:11-13) — segue com acesso total.
    expect(perfil.permissoes).toContain(MARCADOR);
    expect((await clientes(cookie)).statusCode).toBe(200);
  });

  it("Deve_ManterOCargoDoProprioSeed_Quando_NadaFoiCorrompido", async () => {
    // Contraprova estreita: o vinculo do seed continua no perfil. Sem ela, uma correcao que zerasse
    // TODOS os cargos passaria nos tres testes de corrupcao acima.
    const { perfil } = await perfilDaSessao("tesouraria");

    expect(perfil.cargoIds).toContain(idsTeste.cargoTesouraria);
    await expect(
      consultarUm("select id from colaboradores_cargos where id = $1", [vinculoCargoBMarcadoComoA])
    ).resolves.toBeTruthy();
  });
});
