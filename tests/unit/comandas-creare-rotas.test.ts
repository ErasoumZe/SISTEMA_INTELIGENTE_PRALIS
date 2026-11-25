import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "../../api/src/env.js";

// Comandas do CREARE (R-248) sem banco: as rotas reais com o service simulado. Trava a porta do S2 (Bearer, empresa
// da configuracao) e a do robo (x-api-key obrigatoria). O comportamento com banco esta em
// tests/integration/comandas/comandas-creare.test.ts.
const EMPRESA = "11111111-1111-4111-8111-1111111111bb" as const;
const TOKEN = "s2-comandas-unidade-".padEnd(48, "u");

vi.mock("../../api/src/comandas-creare/comandas-creare.service.js", () => ({
  listarComandasS2: vi.fn(async () => ({ itens: [{ idComanda: 1, numero: 430 }], total: 1, page: 1, pageSize: 50 })),
  indicadoresComandasS2: vi.fn(async () => ({ abertasAgora: 3 })),
  opcoesComandasS2: vi.fn(async () => ({ funcionarios: [] })),
  detalheComandaS2: vi.fn(async (_empresa: string, idComanda: number) => ({ idComanda })),
  receberRetratoComandas: vi.fn(async () => ({ maiorIdComanda: null, conferirIds: [] })),
  receberLoteComandas: vi.fn(async () => ({ recebidas: 0, gravadas: 0, semMudanca: 0 }))
}));

const { registrarRotasComandasCreare } = await import("../../api/src/comandas-creare/comandas-creare.controller.js");
const servico = await import("../../api/src/comandas-creare/comandas-creare.service.js");

describe("comandas do CREARE - rotas (sem banco)", () => {
  const app = Fastify();
  const anterior = { token: env.S2_LEITURA_TOKEN, empresa: env.S2_LEITURA_EMPRESA_ID };
  const pedir = (url: string, token = TOKEN) =>
    app.inject({ method: "GET", url, headers: { authorization: `Bearer ${token}` } });

  beforeAll(async () => {
    env.S2_LEITURA_TOKEN = TOKEN;
    env.S2_LEITURA_EMPRESA_ID = EMPRESA;
    await registrarRotasComandasCreare(app);
    await app.ready();
  });
  afterAll(async () => {
    env.S2_LEITURA_TOKEN = anterior.token;
    env.S2_LEITURA_EMPRESA_ID = anterior.empresa;
    await app.close();
  });

  it("Deve_ResponderOS2_ComAEmpresaDaConfiguracao", async () => {
    const [lista, indicadores, opcoes, detalhe] = await Promise.all([
      pedir("/api/s2/comandas?aba=abertas&empresaId=22222222-2222-4222-8222-222222222222"),
      pedir("/api/s2/comandas/indicadores"),
      pedir("/api/s2/comandas/opcoes"),
      pedir("/api/s2/comandas/9100002")
    ]);
    expect([lista.statusCode, indicadores.statusCode, opcoes.statusCode, detalhe.statusCode]).toEqual([
      200, 200, 200, 200
    ]);
    expect(lista.json()).toMatchObject({ ok: true, data: [{ numero: 430 }], meta: { pagination: { total: 1 } } });
    expect(detalhe.json()).toEqual({ ok: true, data: { idComanda: 9100002 } });
    expect(vi.mocked(servico.listarComandasS2).mock.calls[0]?.[0]).toBe(EMPRESA);
    expect(vi.mocked(servico.detalheComandaS2).mock.calls[0]?.[0]).toBe(EMPRESA);
  });

  it("Deve_RecusarTokenErrado_E_FicarDesligadoSemConfiguracao", async () => {
    expect((await pedir("/api/s2/comandas", "x".repeat(48))).statusCode).toBe(401);
    env.S2_LEITURA_TOKEN = "";
    try {
      expect((await pedir("/api/s2/comandas/indicadores")).statusCode).toBe(503);
    } finally {
      env.S2_LEITURA_TOKEN = TOKEN;
    }
  });

  it("Deve_ExigirAChaveDoRobo", async () => {
    const semChave = await app.inject({ method: "POST", url: "/api/integracoes/comandas", payload: { comandas: [] } });
    expect(semChave.statusCode).toBe(401);
    expect(servico.receberLoteComandas).not.toHaveBeenCalled();
    const comChave = await app.inject({
      method: "POST",
      url: "/api/integracoes/comandas/retrato",
      headers: { "x-api-key": "CHAVE" },
      payload: { abertasIds: [] }
    });
    expect(comChave.statusCode).toBe(200);
    expect(vi.mocked(servico.receberRetratoComandas).mock.calls[0]?.[0]).toBe("CHAVE");
  });
});
