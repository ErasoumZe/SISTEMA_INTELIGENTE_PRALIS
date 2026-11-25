import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../../api/src/env.js";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, executarSql, json } from "../../setup/integracao.js";

// Comandas do CREARE (R-248): o robo manda com a chave de integracao (a do seed e da empresa A) e o S2 le pelo
// Bearer proprio. Idempotencia por hash, conferencia das que fecharam, retencao e isolamento por empresa.
const TOKEN = "s2-comandas-".padEnd(48, "c");
const BASE = 9_100_000;

type Resposta<T> = { data: T };
type Pagina = { data: Array<Record<string, unknown>>; meta: { pagination: { total: number } } };

const agora = Date.now();
const iso = (minutosAtras: number) => new Date(agora - minutosAtras * 60_000).toISOString();

function comanda(id: number, status: number, extra: Record<string, unknown> = {}) {
  return {
    idComanda: BASE + id,
    numero: id,
    mesa: null,
    status,
    abertaEm: iso(30),
    ultimoLancamentoEm: iso(20),
    puxadaEm: null,
    fechadaEm: null,
    valorSubtotal: 25,
    valorDesconto: 0,
    valorTotal: 25,
    nomeCliente: null,
    observacao: null,
    vendaCreareId: null,
    vendaValorTotal: null,
    itens: [
      {
        idItem: (BASE + id) * 10 + 1,
        produtoCodigo: "77",
        descricao: "PAO FRANCES",
        quantidade: 1,
        valorTotal: 20,
        funcionarioCodigo: "12",
        funcionarioNome: "Ana",
        cancelado: false,
        motivoCancelamento: null,
        lancadoEm: iso(25)
      },
      {
        idItem: (BASE + id) * 10 + 2,
        produtoCodigo: "78",
        descricao: "CAFE",
        quantidade: 1,
        valorTotal: 5,
        funcionarioCodigo: "13",
        funcionarioNome: "Bruno",
        cancelado: true,
        motivoCancelamento: "Lancado errado",
        lancadoEm: iso(22)
      }
    ],
    ...extra
  };
}

describe("comandas do CREARE - robo e leitura pelo S2", () => {
  let contexto: ContextoApiTeste;
  const original = { token: env.S2_LEITURA_TOKEN, empresa: env.S2_LEITURA_EMPRESA_ID };

  const robo = (url: string, payload: object, chave: string | null = idsTeste.integracaoCodigo) =>
    contexto.app.inject({ method: "POST", url, headers: chave ? { "x-api-key": chave } : {}, payload });
  const s2 = (url: string, token: string | null = TOKEN) =>
    contexto.app.inject({ method: "GET", url, headers: token ? { authorization: `Bearer ${token}` } : {} });

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    env.S2_LEITURA_TOKEN = TOKEN;
    env.S2_LEITURA_EMPRESA_ID = idsTeste.empresaA;
  }, 180_000);

  afterAll(async () => {
    env.S2_LEITURA_TOKEN = original.token;
    env.S2_LEITURA_EMPRESA_ID = original.empresa;
    await executarSql("delete from creare_comandas where id_comanda between $1 and $2", [BASE, BASE + 99_999]);
    await executarSql("delete from creare_comandas_retrato");
    await contexto.fechar();
  });

  it("Deve_RecusarSemChave_E_ComChaveErrada", async () => {
    assertProblem(await robo("/api/integracoes/comandas/retrato", { abertasIds: [] }, null), 401);
    assertProblem(await robo("/api/integracoes/comandas", { comandas: [] }, "CHAVE-QUE-NAO-EXISTE"), 401);
    assertProblem(await robo("/api/integracoes/comandas", { comandas: [{ idComanda: -1 }] }), 400, "INVALID_PAYLOAD");
  });

  it("Deve_GravarUmaVez_E_IgnorarReenvioIgual", async () => {
    const lote = { comandas: [comanda(1, 1), comanda(2, 2, { abertaEm: iso(200), ultimoLancamentoEm: iso(90) })] };
    const primeira = json<Resposta<{ gravadas: number; semMudanca: number }>>(
      await robo("/api/integracoes/comandas", lote)
    );
    expect(primeira.data).toMatchObject({ gravadas: 2, semMudanca: 0 });
    const segunda = json<Resposta<{ gravadas: number; semMudanca: number }>>(
      await robo("/api/integracoes/comandas", lote)
    );
    expect(segunda.data).toMatchObject({ gravadas: 0, semMudanca: 2 });
    const itens = await consultarTodos<{ total: string }>(
      "select count(*)::text as total from creare_comanda_itens where id_comanda in ($1, $2)",
      [BASE + 1, BASE + 2]
    );
    expect(itens[0]?.total).toBe("4");
  });

  it("Deve_PedirParaConferirAsQueSumiramDasAbertas_E_InformarOMaiorId", async () => {
    // O CREARE so tem a 1 em aberto agora: a 2 fechou ou foi cancelada.
    const resposta = json<Resposta<{ maiorIdComanda: number; conferirIds: number[] }>>(
      await robo("/api/integracoes/comandas/retrato", { abertasIds: [BASE + 1] })
    );
    expect(resposta.data.conferirIds).toEqual([BASE + 2]);
    expect(resposta.data.maiorIdComanda).toBeGreaterThanOrEqual(BASE + 2);
    // O robo rele a 2 e manda fechada, com a venda vinculada (valor diferente do da comanda).
    await robo("/api/integracoes/comandas", {
      comandas: [comanda(2, 5, { fechadaEm: iso(5), puxadaEm: iso(6), vendaCreareId: 555, vendaValorTotal: 27.5 })]
    });
    const depois = json<Resposta<{ conferirIds: number[] }>>(
      await robo("/api/integracoes/comandas/retrato", { abertasIds: [BASE + 1] })
    );
    expect(depois.data.conferirIds).toEqual([]);
  });

  it("Deve_RecusarTokenErrado_NaLeituraDoS2", async () => {
    assertProblem(await s2("/api/s2/comandas", "z".repeat(48)), 401, "S2_TOKEN_INVALIDO");
    assertProblem(await s2("/api/s2/comandas/indicadores", null), 401, "S2_TOKEN_INVALIDO");
  });

  it("Deve_ListarAbertasEFechadas_ComSituacaoEValores", async () => {
    const abertas = json<Pagina>(await s2("/api/s2/comandas?aba=abertas"));
    const minhas = abertas.data.filter((c) => Number(c["idComanda"]) >= BASE);
    expect(minhas).toHaveLength(1);
    expect(minhas[0]).toMatchObject({
      numero: 1,
      situacao: "aberta",
      itensValidos: 1,
      itensCancelados: 1,
      valorTotalCentavos: 2500,
      lancadoPor: "Ana"
    });

    const fechadas = json<Pagina>(await s2("/api/s2/comandas?aba=fechadas"));
    const fechada = fechadas.data.find((c) => c["idComanda"] === BASE + 2);
    expect(fechada).toMatchObject({
      situacao: "fechada",
      valorVendaCentavos: 2750,
      diferencaVendaCentavos: 250,
      puxadaAproximada: false
    });
  });

  it("Deve_MostrarODetalheComItensCanceladosELinhaDoTempo", async () => {
    const detalhe = json<
      Resposta<{
        itens: Array<{ cancelado: boolean; motivoCancelamento: string | null }>;
        linhaDoTempo: Array<{ tipo: string }>;
      }>
    >(await s2(`/api/s2/comandas/${BASE + 2}`));
    expect(detalhe.data.itens.find((item) => item.cancelado)?.motivoCancelamento).toBe("Lancado errado");
    expect(detalhe.data.linhaDoTempo.map((evento) => evento.tipo)).toEqual([
      "abriu",
      "item",
      "item_cancelado",
      "puxada",
      "fechada"
    ]);
    assertProblem(await s2(`/api/s2/comandas/${BASE + 99_000}`), 404, "COMANDA_NAO_ENCONTRADA");
  });

  it("Deve_SomarOsIndicadores_E_RegistrarORetrato", async () => {
    const indicadores = json<Resposta<Record<string, unknown>>>(await s2("/api/s2/comandas/indicadores"));
    expect(indicadores.data["retratoEm"]).not.toBeNull();
    expect(Number(indicadores.data["abertasAgora"])).toBeGreaterThanOrEqual(1);
    expect(Number(indicadores.data["diferentesDaVendaNoDia"])).toBeGreaterThanOrEqual(1);
  });

  it("Deve_NaoMostrarComandaDeOutraEmpresa", async () => {
    env.S2_LEITURA_EMPRESA_ID = idsTeste.empresaB;
    try {
      const pagina = json<Pagina>(await s2("/api/s2/comandas?aba=fechadas"));
      expect(pagina.data.filter((c) => Number(c["idComanda"]) >= BASE)).toEqual([]);
      assertProblem(await s2(`/api/s2/comandas/${BASE + 2}`), 404, "COMANDA_NAO_ENCONTRADA");
    } finally {
      env.S2_LEITURA_EMPRESA_ID = idsTeste.empresaA;
    }
  });

  it("Deve_ApagarFechadasComMaisDeUmAno_NoRetrato", async () => {
    await robo("/api/integracoes/comandas", {
      comandas: [comanda(3, 5, { abertaEm: "2025-01-10T12:00:00.000Z", fechadaEm: "2025-01-10T13:00:00.000Z" })]
    });
    await robo("/api/integracoes/comandas/retrato", { abertasIds: [BASE + 1] });
    const restantes = await consultarTodos<{ id_comanda: string }>(
      "select id_comanda::text from creare_comandas where id_comanda = $1",
      [BASE + 3]
    );
    expect(restantes).toEqual([]);
  });
});
