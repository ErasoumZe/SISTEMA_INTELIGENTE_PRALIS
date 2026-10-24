import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { permissoesPorCargo, regrasPermissoes } from "@padaria/db/referencia-permissoes";
import type { Permissao } from "@padaria/shared";
import {
  ERROS_QUESTOR,
  ROTAS_QUESTOR,
  contratoColaboradorQuestorDtoSchema,
  type ConplusSincronizacaoEstadoDto
} from "@padaria/shared/conplus";
import { criarOuRecuperarPrevia } from "../../../api/src/conplus/conplus.service.js";
import {
  concluirSincronizacaoConplus,
  falharSincronizacaoConplus,
  reservarSincronizacaoConplus
} from "../../../api/src/conplus/conplus-sincronizacao.service.js";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql } from "../../setup/integracao.js";

/**
 * Estrutura que espera a API Conplus: origem da importação, estado da busca automática e código do
 * contrato Questor no vínculo. Dados todos FICTÍCIOS.
 */
describe("Conplus — estrutura para a API", () => {
  let contexto: ContextoApiTeste;
  let cookieDp: string;
  let cookieGerencia: string;
  let usuarioId: string;

  const ids = {
    processoA1: "11111111-1111-4111-8111-11111111a691",
    processoA2: "11111111-1111-4111-8111-11111111a692",
    processoB: "11111111-1111-4111-8111-11111111a693",
    colaboradorA1: "11111111-1111-4111-8111-11111111a694",
    colaboradorA2: "11111111-1111-4111-8111-11111111a695",
    colaboradorB: "11111111-1111-4111-8111-11111111a696",
    vinculoA1: "11111111-1111-4111-8111-11111111a697",
    vinculoA2: "11111111-1111-4111-8111-11111111a698",
    vinculoB: "11111111-1111-4111-8111-11111111a699",
    funcaoB: "11111111-1111-4111-8111-11111111a69a",
    turnoA: "11111111-1111-4111-8111-11111111a69b",
    turnoB: "11111111-1111-4111-8111-11111111a69c"
  };
  const turnoDaEmpresa = (empresaId: string) => (empresaId === idsTeste.empresaA ? ids.turnoA : ids.turnoB);
  const rotaContrato = (id: string) => ROTAS_QUESTOR.contratoColaborador.replace(":id", id);

  async function vestir(email: string, cargo: "DP" | "Gerencia") {
    const alvo = await consultarUm<{ id: string }>(`select id from "user" where email = $1`, [email]);
    if (!alvo) throw new Error(`usuário ${email} ausente`);
    await executarSql(
      `insert into permissoes_usuarios (usuario_id, regras) values ($1, $2::jsonb)
       on conflict (usuario_id) do update set regras = excluded.regras`,
      [alvo.id, JSON.stringify(regrasPermissoes(permissoesPorCargo[cargo] as Permissao[]))]
    );
  }

  async function criarVinculo(p: {
    empresaId: string;
    processoId: string;
    colaboradorId: string;
    vinculoId: string;
    funcaoId: string;
    nome: string;
    numero: number;
    cpf: string;
  }) {
    await executarSql(
      `insert into admissoes_processos
         (id, empresa_id, origem, teste_id, nome_completo, cpf, funcao_id, turno_id, criado_por, atualizado_por)
       values ($1, $2, 'admissao_direta', null, $3, $4, $5, $6, $7, $7) on conflict do nothing`,
      [p.processoId, p.empresaId, p.nome, p.cpf, p.funcaoId, turnoDaEmpresa(p.empresaId), usuarioId]
    );
    await executarSql(`insert into colaboradores (id, empresa_id, nome) values ($1, $2, $3) on conflict do nothing`, [
      p.colaboradorId,
      p.empresaId,
      p.nome
    ]);
    await executarSql(
      `insert into colaboradores_vinculos
         (id, empresa_id, colaborador_id, processo_id, numero_sequencial, matricula, admitido_em,
          funcao_id, funcao_nome, jornada_horario, criado_por)
       values ($1, $2, $3, $4, $5, $6, '2026-10-01', $7, 'Funcao Ficticia', '06:00-14:00', $8)
       on conflict do nothing`,
      [
        p.vinculoId,
        p.empresaId,
        p.colaboradorId,
        p.processoId,
        p.numero,
        `QTR-${String(p.numero).padStart(6, "0")}`,
        p.funcaoId,
        usuarioId
      ]
    );
  }

  const chamar = (method: "GET" | "PUT", url: string, payload?: object, cookie = cookieDp) =>
    contexto.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });

  async function lerContrato(vinculoId: string) {
    const lista = await chamar("GET", ROTAS_QUESTOR.contratosColaboradores);
    expect(lista.statusCode, lista.body).toBe(200);
    const linha = (lista.json().data as Array<{ vinculoId: string }>).find((item) => item.vinculoId === vinculoId);
    if (!linha) throw new Error(`vínculo ${vinculoId} fora da lista`);
    return contratoColaboradorQuestorDtoSchema.parse(linha);
  }

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    await vestir(usuariosTeste.caixa.email, "DP");
    await vestir(usuariosTeste.gerente.email, "Gerencia");
    cookieDp = await cookieSessao(contexto.app, "caixa");
    cookieGerencia = await cookieSessao(contexto.app, "gerente");
    const perfil = await consultarUm<{ usuario_id: string }>("select usuario_id from perfis_usuarios limit 1");
    usuarioId = perfil!.usuario_id;

    await executarSql(
      `insert into funcoes_operacionais (id, empresa_id, nome) values ($1, $2, 'Funcao Conplus B') on conflict do nothing`,
      [ids.funcaoB, idsTeste.empresaB]
    );
    for (const [turnoId, empresaId] of [
      [ids.turnoA, idsTeste.empresaA],
      [ids.turnoB, idsTeste.empresaB]
    ] as const) {
      await executarSql(
        `insert into turnos (id, empresa_id, nome, hora_inicio, hora_fim, etiqueta, dias_semana)
         values ($1, $2, 'Turno Conplus API', '06:00', '14:00', 'M', array['SEGUNDA']::text[]) on conflict do nothing`,
        [turnoId, empresaId]
      );
    }
    const base = { funcaoId: idsTeste.funcaoOperacionalA, empresaId: idsTeste.empresaA };
    await criarVinculo({
      ...base,
      processoId: ids.processoA1,
      colaboradorId: ids.colaboradorA1,
      vinculoId: ids.vinculoA1,
      nome: "Pessoa Ficticia Contrato Um",
      numero: 960001,
      cpf: "52998224725"
    });
    await criarVinculo({
      ...base,
      processoId: ids.processoA2,
      colaboradorId: ids.colaboradorA2,
      vinculoId: ids.vinculoA2,
      nome: "Pessoa Ficticia Contrato Dois",
      numero: 960002,
      cpf: "11144477735"
    });
    await criarVinculo({
      empresaId: idsTeste.empresaB,
      funcaoId: ids.funcaoB,
      processoId: ids.processoB,
      colaboradorId: ids.colaboradorB,
      vinculoId: ids.vinculoB,
      nome: "Pessoa Ficticia Contrato B",
      numero: 960003,
      cpf: "39053344705"
    });
  }, 180_000);

  afterAll(async () => {
    await executarSql("delete from conplus_sincronizacao_estado where empresa_id = any($1)", [
      [idsTeste.empresaA, idsTeste.empresaB]
    ]);
    await executarSql("delete from conplus_importacoes where nome_arquivo like 'estrutura-api-%'");
    await executarSql("delete from colaboradores_vinculos where id = any($1)", [
      [ids.vinculoA1, ids.vinculoA2, ids.vinculoB]
    ]);
    await executarSql("delete from colaboradores where id = any($1)", [
      [ids.colaboradorA1, ids.colaboradorA2, ids.colaboradorB]
    ]);
    await executarSql("delete from admissoes_processos where id = any($1)", [
      [ids.processoA1, ids.processoA2, ids.processoB]
    ]);
    await executarSql("delete from funcoes_operacionais where id = $1", [ids.funcaoB]);
    await executarSql("delete from turnos where id = any($1)", [[ids.turnoA, ids.turnoB]]);
    await contexto.fechar();
  });

  // --- item 3: código do contrato Questor ----------------------------------------------------------

  it("Deve_ListarSoVinculosDaEmpresaDaSessao_SemCpf", async () => {
    const resposta = await chamar("GET", ROTAS_QUESTOR.contratosColaboradores);
    expect(resposta.statusCode, resposta.body).toBe(200);
    const linhas = resposta.json().data as Array<Record<string, unknown>>;
    const nossos = linhas.filter((linha) =>
      [ids.vinculoA1, ids.vinculoA2, ids.vinculoB].includes(String(linha["vinculoId"]))
    );
    expect(nossos.map((linha) => linha["vinculoId"]).sort()).toEqual([ids.vinculoA1, ids.vinculoA2].sort());
    for (const linha of nossos) {
      expect(Object.keys(linha).sort()).toEqual(Object.keys(contratoColaboradorQuestorDtoSchema.shape).sort());
      expect(linha["questorCodigoContrato"]).toBeNull();
    }
    expect(resposta.body).not.toContain("52998224725");
  });

  it("Deve_GravarCodigoSemZerosAEsquerda_Quando_DpSalva", async () => {
    const atual = await lerContrato(ids.vinculoA1);
    const resposta = await chamar("PUT", rotaContrato(ids.vinculoA1), {
      questorCodigoContrato: "0012345",
      atualizadoEmLido: atual.atualizadoEm
    });
    expect(resposta.statusCode, resposta.body).toBe(200);
    expect(resposta.json().data).toMatchObject({ vinculoId: ids.vinculoA1, questorCodigoContrato: "12345" });
    const banco = await consultarUm<{ questor_codigo_contrato: string }>(
      "select questor_codigo_contrato from colaboradores_vinculos where id = $1",
      [ids.vinculoA1]
    );
    expect(banco?.questor_codigo_contrato).toBe("12345");
  });

  it("Deve_Responder409_Quando_AtualizadoEmLidoEstaVelho", async () => {
    const resposta = await chamar("PUT", rotaContrato(ids.vinculoA1), {
      questorCodigoContrato: "777",
      atualizadoEmLido: "2020-01-01T00:00:00.000Z"
    });
    expect(resposta.statusCode, resposta.body).toBe(409);
    expect(resposta.json().code).toBe(ERROS_QUESTOR.versaoDesatualizada);
  });

  it("Deve_Responder409_Quando_CodigoJaEstaEmOutroVinculoDaEmpresa", async () => {
    const atual = await lerContrato(ids.vinculoA2);
    const resposta = await chamar("PUT", rotaContrato(ids.vinculoA2), {
      questorCodigoContrato: "12345",
      atualizadoEmLido: atual.atualizadoEm
    });
    expect(resposta.statusCode, resposta.body).toBe(409);
    expect(resposta.json().code).toBe(ERROS_QUESTOR.contratoColaboradorDuplicado);
  });

  it("Deve_PermitirMesmoCodigoEmOutraEmpresa_Quando_GravadoDireto", async () => {
    // Unicidade é por empresa: cada empresa tem a própria numeração no Questor.
    await executarSql("update colaboradores_vinculos set questor_codigo_contrato = '12345' where id = $1", [
      ids.vinculoB
    ]);
    const banco = await consultarUm<{ total: number }>(
      "select count(*)::int as total from colaboradores_vinculos where questor_codigo_contrato = '12345'"
    );
    expect(banco?.total).toBe(2);
  });

  it("Deve_Responder404_Quando_VinculoEDeOutraEmpresa", async () => {
    const resposta = await chamar("PUT", rotaContrato(ids.vinculoB), {
      questorCodigoContrato: "55",
      atualizadoEmLido: new Date().toISOString()
    });
    expect(resposta.statusCode, resposta.body).toBe(404);
  });

  it("Deve_Responder400_Quando_CorpoInvalido", async () => {
    const atual = await lerContrato(ids.vinculoA2);
    for (const corpo of [
      { questorCodigoContrato: "12345678", atualizadoEmLido: atual.atualizadoEm },
      { questorCodigoContrato: "12A", atualizadoEmLido: atual.atualizadoEm },
      { questorCodigoContrato: "000", atualizadoEmLido: atual.atualizadoEm },
      { questorCodigoContrato: "10", atualizadoEmLido: atual.atualizadoEm, empresaId: idsTeste.empresaB },
      { questorCodigoContrato: "10" }
    ]) {
      const resposta = await chamar("PUT", rotaContrato(ids.vinculoA2), corpo);
      expect(resposta.statusCode, JSON.stringify(corpo)).toBe(400);
    }
  });

  it("Deve_LimparCodigo_Quando_EnviaNulo", async () => {
    const atual = await lerContrato(ids.vinculoA1);
    const resposta = await chamar("PUT", rotaContrato(ids.vinculoA1), {
      questorCodigoContrato: null,
      atualizadoEmLido: atual.atualizadoEm
    });
    expect(resposta.statusCode, resposta.body).toBe(200);
    expect(resposta.json().data.questorCodigoContrato).toBeNull();
  });

  it("Deve_Responder403_Quando_PerfilNaoConfiguraQuestor", async () => {
    const lista = await chamar("GET", ROTAS_QUESTOR.contratosColaboradores, undefined, cookieGerencia);
    expect(lista.statusCode).toBe(403);
    const grava = await chamar(
      "PUT",
      rotaContrato(ids.vinculoA1),
      { questorCodigoContrato: "1", atualizadoEmLido: new Date().toISOString() },
      cookieGerencia
    );
    expect(grava.statusCode).toBe(403);
  });

  it("Deve_RecusarCodigoForaDoFormato_NoBanco", async () => {
    await expect(
      executarSql("update colaboradores_vinculos set questor_codigo_contrato = '12345678' where id = $1", [
        ids.vinculoA2
      ])
    ).rejects.toThrow(/colaboradores_vinculos_questor_contrato_check/u);
  });

  // --- item 1: origem da importação ----------------------------------------------------------------

  it("Deve_GravarOrigem_ArquivoPorPadrao_E_ApiQuandoInformada", async () => {
    const comum = {
      empresaId: idsTeste.empresaA,
      usuarioId,
      tipo: "ferias" as const,
      competencia: "2026-09-01",
      tamanhoBytes: 10,
      registros: [],
      diagnosticos: []
    };
    const doArquivo = await criarOuRecuperarPrevia({
      ...comum,
      nomeArquivo: "estrutura-api-arquivo.csv",
      hashArquivo: "a".repeat(64)
    });
    const daApi = await criarOuRecuperarPrevia({
      ...comum,
      origem: "api",
      nomeArquivo: "estrutura-api-busca.json",
      hashArquivo: "b".repeat(64)
    });
    expect(doArquivo.origem).toBe("arquivo");
    expect(daApi.origem).toBe("api");
    await expect(
      executarSql("update conplus_importacoes set origem = 'email' where id = $1", [doArquivo.id])
    ).rejects.toThrow(/conplus_importacoes_origem_check/u);
  });

  // --- item 2: estado da busca automática ----------------------------------------------------------

  it("Deve_MostrarNuncaExecutada_Quando_RotinaNuncaRodou", async () => {
    const resposta = await chamar("GET", ROTAS_QUESTOR.sincronizacaoEstado);
    expect(resposta.statusCode, resposta.body).toBe(200);
    const estados = resposta.json().data as ConplusSincronizacaoEstadoDto[];
    expect(estados.map((estado) => estado.tipo)).toEqual(["folha_05", "adiantamento_20", "rescisoes", "ferias"]);
    expect(estados.every((estado) => estado.status === "nunca_executada")).toBe(true);
    expect(resposta.body).not.toContain("cursor");
  });

  it("Deve_ReservarUmaVez_EsperarAposFalha_E_ConcluirComCursor", async () => {
    const empresaId = idsTeste.empresaA;
    const t0 = new Date("2026-10-22T10:00:00.000Z");
    const minutos = (n: number) => new Date(t0.getTime() + n * 60_000);

    const primeira = await reservarSincronizacaoConplus({ empresaId, tipo: "folha_05", agora: t0 });
    expect(primeira).toMatchObject({ ultimaCompetencia: null, cursor: null });
    // Segunda instância no mesmo instante: não é a vez dela.
    expect(await reservarSincronizacaoConplus({ empresaId, tipo: "folha_05", agora: minutos(1) })).toBeNull();
    // Outro tipo é independente.
    expect(await reservarSincronizacaoConplus({ empresaId, tipo: "ferias", agora: minutos(1) })).not.toBeNull();

    expect(
      await falharSincronizacaoConplus({
        empresaId,
        tipo: "folha_05",
        bloqueioToken: primeira!.bloqueioToken,
        codigo: "CONPLUS_API_TIMEOUT",
        mensagem: "tempo esgotado",
        agora: minutos(2)
      })
    ).toBe(true);
    // Espera de 5 min após a 1ª falha.
    expect(await reservarSincronizacaoConplus({ empresaId, tipo: "folha_05", agora: minutos(6) })).toBeNull();
    const segunda = await reservarSincronizacaoConplus({ empresaId, tipo: "folha_05", agora: minutos(8) });
    expect(segunda).not.toBeNull();

    // Token antigo não conclui nada.
    expect(
      await concluirSincronizacaoConplus({
        empresaId,
        tipo: "folha_05",
        bloqueioToken: primeira!.bloqueioToken,
        ultimaCompetencia: "2026-09-01",
        cursor: "x",
        importacaoId: null,
        agora: minutos(9)
      })
    ).toBe(false);
    expect(
      await concluirSincronizacaoConplus({
        empresaId,
        tipo: "folha_05",
        bloqueioToken: segunda!.bloqueioToken,
        ultimaCompetencia: "2026-09-01",
        cursor: "pagina-2",
        importacaoId: null,
        agora: minutos(10)
      })
    ).toBe(true);

    const proxima = await reservarSincronizacaoConplus({ empresaId, tipo: "folha_05", agora: minutos(11) });
    expect(proxima).toMatchObject({ ultimaCompetencia: "2026-09-01", cursor: "pagina-2" });

    const resposta = await chamar("GET", ROTAS_QUESTOR.sincronizacaoEstado);
    const folha = (resposta.json().data as ConplusSincronizacaoEstadoDto[]).find((item) => item.tipo === "folha_05");
    expect(folha).toMatchObject({
      status: "executando",
      tentativas: 0,
      ultimaCompetencia: "2026-09-01",
      ultimoSucessoEm: minutos(10).toISOString(),
      ultimoErroCodigo: null
    });
  });

  it("Deve_AssumirReservaExpirada_Quando_InstanciaMorreuNoMeio", async () => {
    const empresaId = idsTeste.empresaA;
    const t0 = new Date("2026-10-22T12:00:00.000Z");
    const morta = await reservarSincronizacaoConplus({ empresaId, tipo: "rescisoes", agora: t0 });
    expect(morta).not.toBeNull();
    expect(
      await reservarSincronizacaoConplus({ empresaId, tipo: "rescisoes", agora: new Date(t0.getTime() + 14 * 60_000) })
    ).toBeNull();
    const nova = await reservarSincronizacaoConplus({
      empresaId,
      tipo: "rescisoes",
      agora: new Date(t0.getTime() + 16 * 60_000)
    });
    expect(nova?.bloqueioToken).toBeTruthy();
    expect(nova?.bloqueioToken).not.toBe(morta?.bloqueioToken);
  });

  it("Deve_RecusarExecutandoSemDono_NoBanco", async () => {
    await executarSql(
      `insert into conplus_sincronizacao_estado (empresa_id, tipo) values ($1, 'adiantamento_20') on conflict do nothing`,
      [idsTeste.empresaB]
    );
    await expect(
      executarSql(
        `update conplus_sincronizacao_estado set status = 'executando' where empresa_id = $1 and tipo = 'adiantamento_20'`,
        [idsTeste.empresaB]
      )
    ).rejects.toThrow(/conplus_sincronizacao_estado_bloqueio_check/u);
  });

  it("Deve_Responder403_NoEstado_Quando_PerfilNaoVeImportacoes", async () => {
    // Gerência não recebe nenhuma permissão Conplus na referência.
    const resposta = await chamar("GET", ROTAS_QUESTOR.sincronizacaoEstado, undefined, cookieGerencia);
    expect(resposta.statusCode).toBe(403);
  });
});
