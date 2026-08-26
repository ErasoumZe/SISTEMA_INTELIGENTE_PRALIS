import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { consultarUm, executarSql } from "../../setup/integracao.js";

/**
 * ADM-002 V0 — os P0 do processo de admissao.
 *
 * NAO FORAM EXECUTADOS nesta entrega: rodar integracao exige Testcontainers, e o turno proibiu.
 * Estao escritos para rodar assim que autorizado, e o relatorio diz isso explicitamente.
 *
 * Cobrem seis frentes. As duas de idempotencia sao PROBLEMAS DIFERENTES e por isso sao dois testes:
 * concorrencia e duas chamadas antes de qualquer commit; repeticao e uma chamada depois do commit da
 * outra. Um nao cobre o outro.
 */
describe("admissoes processos integration", () => {
  let contexto: ContextoApiTeste;
  let cookieDp: string; // perfil "admin": usuario_admin recebe toda permissao nova do catalogo
  let cookieOutraEmpresa: string;

  /** Cria um teste em andamento e devolve id e versao. */
  async function criarTeste(cookie: string, cpf: string) {
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/admissoes/testes",
      headers: { cookie },
      payload: {
        nomeCompleto: "Pessoa de Teste",
        cpf,
        funcaoId: await idDeUmaFuncao(),
        jornadaHorario: "seg a sex, 08:00 as 17:00",
        inicioEm: "2026-09-01T12:00:00.000Z",
        fimCombinadoEm: "2026-09-30T12:00:00.000Z"
      }
    });
    assertOk(criado);
    const id = (criado.json()).data.id;
    return { id, versao: 1 };
  }

  async function idDeUmaFuncao() {
    const linha = await consultarUm<{ id: string }>("select id from funcoes_operacionais limit 1");
    if (!linha) throw new Error("nenhuma funcao operacional semeada");
    return linha.id;
  }

  async function efetivar(cookie: string, testeId: string, versao: number) {
    return contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/testes/${testeId}/encerrar`,
      headers: { cookie },
      payload: { versao, resultado: "aprovado_para_admissao" }
    });
  }

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieDp = await cookieSessao(contexto.app, "admin");
    cookieOutraEmpresa = await cookieSessao(contexto.app, "multiempresa");
    // A V0 nao concede permissao a cargo nenhum ainda (decisao pendente de Marco). Os testes usam
    // concessao direta para nao depender dessa decisao.
    await executarSql(
      "update permissoes_cargos set regras = regras || '{\"admissoes_processos_visualizar\":true,\"admissoes_processos_cancelar\":true}'::jsonb"
    );
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  // ---------------------------------------------------------------- P0-5 origem
  it("P0-5 Deve_CriarProcesso_Quando_TesteEfetivadoComAprovado", async () => {
    const teste = await criarTeste(cookieDp, "12345678909");
    const efetivado = await efetivar(cookieDp, teste.id, teste.versao);
    assertOk(efetivado);
    const { processoId } = (efetivado.json()).data;
    expect(processoId).toBeTruthy();
  });

  it("P0-5 Deve_NaoCriarProcesso_Quando_EncerradoSemProsseguir", async () => {
    const teste = await criarTeste(cookieDp, "11144477735");
    const encerrado = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/testes/${teste.id}/encerrar`,
      headers: { cookie: cookieDp },
      payload: { versao: teste.versao, resultado: "nao_prosseguir" }
    });
    assertOk(encerrado);
    expect((encerrado.json()).data.processoId).toBeNull();
    const linha = await consultarUm<{ n: number }>(`select count(*)::int as n from admissoes_processos where teste_id = '${teste.id}'`);
    if (!linha) throw new Error("consulta sem linha");
    expect(linha.n).toBe(0);
  });

  // ---------------------------------------------------------------- P0-3 concorrencia
  it("P0-3 Deve_CriarUmUnicoProcesso_Quando_DuasEfetivacoesSimultaneas", async () => {
    const teste = await criarTeste(cookieDp, "52998224725");
    // As duas partem ANTES de qualquer commit: e o caso que so o lock e a unique resolvem.
    const [a, b] = await Promise.all([
      efetivar(cookieDp, teste.id, teste.versao),
      efetivar(cookieDp, teste.id, teste.versao)
    ]);
    // Uma vence; a outra ou entra pelo ramo idempotente ou recebe conflito — nunca cria a segunda.
    expect([a.statusCode, b.statusCode].filter((s) => s === 200).length).toBeGreaterThanOrEqual(1);
    const linha = await consultarUm<{ n: number }>(`select count(*)::int as n from admissoes_processos where teste_id = '${teste.id}'`);
    if (!linha) throw new Error("consulta sem linha");
    expect(linha.n).toBe(1);
  });

  // ---------------------------------------------------------------- P0-3b repeticao
  it("P0-3b Deve_DevolverOMesmoProcesso_Quando_EfetivacaoRepetida", async () => {
    const teste = await criarTeste(cookieDp, "39053344705");
    const primeira = await efetivar(cookieDp, teste.id, teste.versao);
    assertOk(primeira);
    const idOriginal = (primeira.json()).data.processoId;

    // A repeticao carrega a versao ANTERIOR — o cliente nao recebeu a resposta que a incrementaria.
    // Se a checagem de versao vier antes do ramo idempotente, isto vira VERSAO_CONFLITANTE.
    const repetida = await efetivar(cookieDp, teste.id, teste.versao);
    assertOk(repetida);
    expect((repetida.json()).data.processoId).toBe(idOriginal);

    const linha = await consultarUm<{ n: number }>(`select count(*)::int as n from admissoes_processos where teste_id = '${teste.id}'`);
    if (!linha) throw new Error("consulta sem linha");
    expect(linha.n).toBe(1);
  });

  it("P0-3b Deve_Recusar_Quando_RepeticaoTrazDesfechoDiferente", async () => {
    const teste = await criarTeste(cookieDp, "48884555016");
    assertOk(await efetivar(cookieDp, teste.id, teste.versao));
    const divergente = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/testes/${teste.id}/encerrar`,
      headers: { cookie: cookieDp },
      payload: { versao: teste.versao, resultado: "nao_prosseguir" }
    });
    // Conflito REAL de intencao: nao e repeticao, e tentativa de trocar o desfecho.
    expect(divergente.statusCode).toBe(409);
  });

  it("P0-3b Deve_Responder200_Quando_EncerrarSemProsseguirRepetido", async () => {
    // A idempotencia e SIMETRICA: o duplo clique dOi igual nos dois desfechos, mesmo sem processo a
    // devolver. Antes este caso caia em 409 e a pessoa nao sabia se tinha funcionado.
    const teste = await criarTeste(cookieDp, "63017285074");
    const corpo = { versao: teste.versao, resultado: "nao_prosseguir" };
    const primeira = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/testes/${teste.id}/encerrar`,
      headers: { cookie: cookieDp },
      payload: corpo
    });
    assertOk(primeira);

    const repetida = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/testes/${teste.id}/encerrar`,
      headers: { cookie: cookieDp },
      payload: corpo
    });
    assertOk(repetida);
    expect(repetida.json().data.processoId).toBeNull();

    const linha = await consultarUm<{ n: number }>(`select count(*)::int as n from admissoes_processos where teste_id = '${teste.id}'`);
    if (!linha) throw new Error("consulta sem linha");
    expect(linha.n).toBe(0);
  });

  // ---------------------------------------------------------------- P0-1 tenant
  it("P0-1 Deve_Responder404_Quando_ProcessoDeOutraEmpresa", async () => {
    const teste = await criarTeste(cookieDp, "15350946056");
    const efetivado = await efetivar(cookieDp, teste.id, teste.versao);
    assertOk(efetivado);
    const processoId = (efetivado.json()).data.processoId;

    const alheio = await contexto.app.inject({
      method: "GET",
      url: `/api/admissoes/processos/${processoId}`,
      headers: { cookie: cookieOutraEmpresa }
    });
    // MESMA resposta de inexistente: distinguir entregaria a existencia de graca.
    expect(alheio.statusCode).toBe(404);

    const inexistente = await contexto.app.inject({
      method: "GET",
      url: "/api/admissoes/processos/00000000-0000-4000-8000-000000000000",
      headers: { cookie: cookieOutraEmpresa }
    });
    expect(inexistente.statusCode).toBe(404);
  });

  // ---------------------------------------------------------------- P0-2 autorizacao
  it("P0-2 Deve_Responder403_Quando_SemPermissaoDeProcesso", async () => {
    await executarSql(
      "update permissoes_cargos set regras = regras - 'admissoes_processos_visualizar'"
    );
    const semPermissao = await contexto.app.inject({
      method: "GET",
      url: "/api/admissoes/processos/00000000-0000-4000-8000-000000000000",
      headers: { cookie: cookieDp }
    });
    expect(semPermissao.statusCode).toBe(403);
    await executarSql(
      "update permissoes_cargos set regras = regras || '{\"admissoes_processos_visualizar\":true}'::jsonb"
    );
  });

  // ---------------------------------------------------------------- P0-4 estados
  it("P0-4 Deve_RecusarNoBanco_Quando_StatusForaDaLista", async () => {
    const teste = await criarTeste(cookieDp, "70830436045");
    const efetivado = await efetivar(cookieDp, teste.id, teste.versao);
    assertOk(efetivado);
    const processoId = (efetivado.json()).data.processoId;

    // O CHECK precisa recusar vocabulario que a V0 nao tem — inclusive vindo de fora do servico.
    await expect(
      executarSql(`update admissoes_processos set status = 'em_revisao_dp' where id = '${processoId}'`)
    ).rejects.toThrow();
  });

  it("P0-4 Deve_Recusar_Quando_CancelarProcessoJaCancelado", async () => {
    const teste = await criarTeste(cookieDp, "27267508019");
    const efetivado = await efetivar(cookieDp, teste.id, teste.versao);
    assertOk(efetivado);
    const processoId = (efetivado.json()).data.processoId;

    const primeiro = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/processos/${processoId}/cancelar`,
      headers: { cookie: cookieDp },
      payload: { versao: 1, motivoCancelamento: "vaga_cancelada" }
    });
    assertOk(primeiro);

    const segundo = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/processos/${processoId}/cancelar`,
      headers: { cookie: cookieDp },
      payload: { versao: 2, motivoCancelamento: "vaga_cancelada" }
    });
    // Terminal: nao ha reabertura e nao ha segundo cancelamento.
    expect(segundo.statusCode).toBe(409);
  });

  // ---------------------------------------------------------------- P0-6 auditoria
  it("P0-6 Deve_GravarTrilha_Quando_ProcessoNasceEQuandoECancelado", async () => {
    const teste = await criarTeste(cookieDp, "86288366757");
    const efetivado = await efetivar(cookieDp, teste.id, teste.versao);
    assertOk(efetivado);
    const processoId = (efetivado.json()).data.processoId;

    const aposCriar = await consultarUm<{ n: number }>(`select count(*)::int as n from admissoes_processos_historico where processo_id = '${processoId}' and acao = 'criado'`);
    if (!aposCriar) throw new Error("consulta sem linha");
    expect(aposCriar.n).toBe(1);

    assertOk(
      await contexto.app.inject({
        method: "POST",
        url: `/api/admissoes/processos/${processoId}/cancelar`,
        headers: { cookie: cookieDp },
        payload: { versao: 1, motivoCancelamento: "desistencia_do_candidato" }
      })
    );

    const aposCancelar = await consultarUm<{ n: number }>(`select count(*)::int as n from admissoes_processos_historico where processo_id = '${processoId}'`);
    if (!aposCancelar) throw new Error("consulta sem linha");
    expect(aposCancelar.n).toBe(2);
  });
});
