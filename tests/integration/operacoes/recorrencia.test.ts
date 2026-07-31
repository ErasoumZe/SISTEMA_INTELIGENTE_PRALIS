// Recorrencia de lancamento (PROJECT_BRAIN/17, D3 — S5).
//
// "Recorrencia registra E cria lancamentos futuros automaticamente (como nao-pagos, vencendo na
// data). So Admin, Gerencia e Financeiro podem usar recorrencia." Teto de 12 meses na serie.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";

type LinhaDespesa = {
  id: string;
  data_referencia: string;
  data_vencimento: string;
  data_pagamento: string | null;
  caixa_id: string | null;
  recorrencia_id: string | null;
  recorrencia_ordem: number | null;
};

describe("recorrencia de lancamento (D3) integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  // Lanca despesa/retirada mas NAO tem lancamentos_recorrencia_criar — e nao opera caixa, para o
  // 403 ser o da recorrencia e nao o "abra um caixa".
  let cookieSemRecorrencia: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    cookieSemRecorrencia = await cookieSessao(contexto.app, "semRecorrencia");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  function criarDespesa(cookie: string, corpo: Record<string, unknown>) {
    return contexto.app.inject({
      method: "POST",
      url: "/api/despesas",
      headers: { cookie },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-07-24",
        dataVencimento: "2026-07-30",
        descricao: "Aluguel",
        valorOriginal: 100,
        contaOrigemId: idsTeste.contaCaixa,
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        ...corpo
      }
    });
  }

  async function serieDe(despesaId: string): Promise<LinhaDespesa[]> {
    const criada = await consultarUm<{ recorrencia_id: string | null }>(
      "select recorrencia_id from despesas where id = $1",
      [despesaId]
    );
    if (!criada?.recorrencia_id) return [];
    return consultarTodos<LinhaDespesa>(
      `select id, data_referencia::text, data_vencimento::text, data_pagamento::text, caixa_id,
              recorrencia_id, recorrencia_ordem
         from despesas where recorrencia_id = $1 order by recorrencia_ordem`,
      [criada.recorrencia_id]
    );
  }

  // --- Permissao (D3) ---------------------------------------------------------------------------
  it("quem lanca mas NAO tem a permissao leva 403 e NADA e gravado (nem o lancamento inicial)", async () => {
    const antes = await consultarTodos("select id from despesas where descricao = $1", ["Aluguel sem permissao"]);

    const resposta = await criarDespesa(cookieSemRecorrencia, {
      descricao: "Aluguel sem permissao",
      recorrencia: { frequencia: "mes", repeticoes: 3 }
    });

    assertProblem(resposta, 403, "INSUFFICIENT_PERMISSION");
    expect(json<{ details?: { permissao?: string } }>(resposta).details?.permissao).toBe(
      "lancamentos_recorrencia_criar"
    );
    // A permissao e checada ANTES de qualquer escrita: nem a despesa inicial existe.
    const depois = await consultarTodos("select id from despesas where descricao = $1", ["Aluguel sem permissao"]);
    expect(depois).toHaveLength(antes.length);
  });

  it("lancamento SEM recorrencia nao cria serie nem deixa lixo de definicao", async () => {
    const definicoesAntes = await consultarTodos("select id from lancamentos_recorrencias");
    const resposta = await criarDespesa(cookieAdmin, { descricao: "Despesa avulsa" });
    expect(resposta.statusCode, resposta.body).toBe(201);

    const criada = json<{ data: { id: string; serie?: number } }>(resposta).data;
    expect(criada.serie).toBeUndefined();
    expect(await serieDe(criada.id)).toHaveLength(0);
    const definicoesDepois = await consultarTodos("select id from lancamentos_recorrencias");
    expect(definicoesDepois).toHaveLength(definicoesAntes.length);
  });

  // "Gerencia e Financeiro PODEM" e uma regra de CATALOGO DE CARGO, nao de rota: quem prova isso e
  // o teste da referencia de permissoes (tests/unit/recorrencia-permissao), que confere o padrao de
  // cada cargo. Aqui provamos o outro lado — a rota barrando quem nao tem a permissao.

  // --- Serie gerada -----------------------------------------------------------------------------
  it("cria a serie inteira: repeticoes conta o lancamento atual e as futuras vencem na data", async () => {
    const resposta = await criarDespesa(cookieAdmin, {
      descricao: "Aluguel mensal",
      recorrencia: { frequencia: "mes", repeticoes: 3 }
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    const criada = json<{ data: { id: string; serie: number; serieLimitada: boolean } }>(resposta).data;
    expect(criada.serie).toBe(3);
    expect(criada.serieLimitada).toBe(false);

    const serie = await serieDe(criada.id);
    expect(serie).toHaveLength(3);
    expect(serie.map((linha) => linha.data_vencimento)).toEqual(["2026-07-30", "2026-08-30", "2026-09-30"]);
    expect(serie.map((linha) => linha.recorrencia_ordem)).toEqual([1, 2, 3]);
    // O id devolvido e o do PRIMEIRO da serie — o lancamento que a pessoa criou.
    expect(serie[0]?.id).toBe(criada.id);

    // A distancia lancar->vencer (6 dias) vale para a serie toda: por isso dataReferencia acompanha.
    expect(serie.map((linha) => linha.data_referencia)).toEqual(["2026-07-24", "2026-08-24", "2026-09-24"]);
  });

  it("as futuras nascem NAO PAGAS e FORA do caixa, mesmo com o inicial pago", async () => {
    const resposta = await criarDespesa(cookieAdmin, {
      descricao: "Aluguel pago a vista",
      dataPagamento: "2026-07-30",
      recorrencia: { frequencia: "mes", repeticoes: 3 }
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    const serie = await serieDe(json<{ data: { id: string } }>(resposta).data.id);

    expect(serie[0]?.data_pagamento).toBe("2026-07-30");
    // D3: "como nao-pagos, vencendo na data" — o de agosto nao esta pago so porque o de julho estava.
    expect(serie[1]?.data_pagamento).toBeNull();
    expect(serie[2]?.data_pagamento).toBeNull();

    // Preso ao caixa de hoje, o fechamento desta noite somaria as 3 despesas.
    expect(serie[0]?.caixa_id).not.toBeNull();
    expect(serie[1]?.caixa_id).toBeNull();
    expect(serie[2]?.caixa_id).toBeNull();
  });

  it("registra a DEFINICAO da serie, e nao so os lancamentos", async () => {
    const resposta = await criarDespesa(cookieAdmin, {
      descricao: "Aluguel com definicao",
      recorrencia: { frequencia: "semana", repeticoes: 4, diasSemana: [5, 2] }
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    const serie = await serieDe(json<{ data: { id: string } }>(resposta).data.id);

    const definicao = await consultarUm<{
      dominio: string;
      frequencia: string;
      dias_semana: string | null;
      repeticoes: number;
      data_inicial: string;
    }>(
      "select dominio, frequencia, dias_semana, repeticoes, data_inicial::text from lancamentos_recorrencias where id = $1",
      [serie[0]?.recorrencia_id]
    );
    expect(definicao).toMatchObject({
      dominio: "despesa",
      frequencia: "semana",
      dias_semana: "2,5", // normalizado e ordenado
      repeticoes: 4,
      data_inicial: "2026-07-30"
    });
  });

  it("dias da semana sao DESCARTADOS fora da frequencia semanal", async () => {
    const resposta = await criarDespesa(cookieAdmin, {
      descricao: "Mensal com dias marcados",
      recorrencia: { frequencia: "mes", repeticoes: 2, diasSemana: [2, 5] }
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    const serie = await serieDe(json<{ data: { id: string } }>(resposta).data.id);
    const definicao = await consultarUm<{ dias_semana: string | null }>(
      "select dias_semana from lancamentos_recorrencias where id = $1",
      [serie[0]?.recorrencia_id]
    );
    expect(definicao?.dias_semana).toBeNull();
    expect(serie.map((linha) => linha.data_vencimento)).toEqual(["2026-07-30", "2026-08-30"]);
  });

  // --- Teto de 12 meses -------------------------------------------------------------------------
  it("corta a serie em 12 meses e avisa que cortou", async () => {
    const resposta = await criarDespesa(cookieAdmin, {
      descricao: "Aluguel de 24 meses",
      recorrencia: { frequencia: "mes", repeticoes: 24 }
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    const criada = json<{ data: { id: string; serie: number; serieLimitada: boolean } }>(resposta).data;

    expect(criada.serieLimitada).toBe(true);
    expect(criada.serie).toBe(13); // a inicial + 12 meses
    const serie = await serieDe(criada.id);
    expect(serie).toHaveLength(13);
    expect(serie.at(-1)?.data_vencimento).toBe("2027-07-30");
  });

  it("repeticoes = 1 nao cria serie nem grava definicao", async () => {
    const resposta = await criarDespesa(cookieAdmin, {
      descricao: "Repetir uma vez so",
      recorrencia: { frequencia: "mes", repeticoes: 1 }
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    const criada = json<{ data: { id: string; serie?: number } }>(resposta).data;
    expect(criada.serie).toBeUndefined();

    const linha = await consultarUm<{ recorrencia_id: string | null; recorrencia_ordem: number | null }>(
      "select recorrencia_id, recorrencia_ordem from despesas where id = $1",
      [criada.id]
    );
    expect(linha?.recorrencia_id).toBeNull();
    expect(linha?.recorrencia_ordem).toBeNull();
  });

  it("frequencia invalida e recusada pelo contrato (400)", async () => {
    const resposta = await criarDespesa(cookieAdmin, {
      descricao: "Frequencia inventada",
      recorrencia: { frequencia: "decada", repeticoes: 3 }
    });
    expect(resposta.statusCode).toBe(400);
  });

  it("R-063 cancela so futuras nao pagas e preserva uma paga no meio", async () => {
    const resposta = await criarDespesa(cookieAdmin, {
      descricao: "Serie a cancelar",
      recorrencia: { frequencia: "mes", repeticoes: 4 }
    });
    const criada = json<{ data: { id: string } }>(resposta).data;
    const serie = await serieDe(criada.id);
    const recorrenciaId = serie[0]?.recorrencia_id;
    expect(recorrenciaId).toBeTruthy();
    await executarSql("update despesas set data_pagamento = data_vencimento where id = $1", [serie[1]?.id]);

    const cancelar = await contexto.app.inject({
      method: "PATCH",
      url: `/api/recorrencias/${recorrenciaId}/cancelar`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, dominio: "despesa" }
    });
    expect(cancelar.statusCode, cancelar.body).toBe(200);
    expect(json<{ data: { removidas: number } }>(cancelar).data.removidas).toBe(2);
    const restantes = await consultarTodos<{ id: string }>(
      "select id from despesas where recorrencia_id = $1 order by recorrencia_ordem",
      [recorrenciaId]
    );
    expect(restantes.map((item) => item.id)).toEqual([serie[0]?.id, serie[1]?.id]);
  });

  it("Retirada tambem aceita recorrencia", async () => {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/retiradas",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-07-30",
        dataVencimento: "2026-07-30",
        descricao: "Pro labore mensal",
        valorOriginal: 500,
        contaOrigemId: idsTeste.contaCaixa,
        colaboradorId: idsTeste.colaboradorCaixa,
        grupoRetiradaId: idsTeste.grupoRetiradaSangria,
        recorrencia: { frequencia: "mes", repeticoes: 3 }
      }
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    expect(json<{ data: { serie: number } }>(resposta).data.serie).toBe(3);

    const linhas = await consultarTodos<{ data_vencimento: string }>(
      `select data_vencimento::text from retiradas
        where recorrencia_id = (select recorrencia_id from retiradas where id = $1)
        order by recorrencia_ordem`,
      [json<{ data: { id: string } }>(resposta).data.id]
    );
    expect(linhas.map((linha) => linha.data_vencimento)).toEqual(["2026-07-30", "2026-08-30", "2026-09-30"]);
  });
});
