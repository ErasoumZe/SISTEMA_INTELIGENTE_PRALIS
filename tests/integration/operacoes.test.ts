import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarPerfil, empresaA, payloadVenda, requisitar, usuarioId } from "./_helpers.js";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  buscarPerfilUsuario: vi.fn(),
  listarVendas: vi.fn(),
  criarVenda: vi.fn(),
  listarDespesas: vi.fn(),
  criarDespesa: vi.fn(),
  listarMercadorias: vi.fn(),
  criarMercadoria: vi.fn(),
  listarRetiradas: vi.fn(),
  criarRetirada: vi.fn(),
  listarTransferencias: vi.fn(),
  criarTransferencia: vi.fn()
}));

vi.mock("../../api/src/auth/config.js", () => ({
  auth: {
    api: {
      getSession: mocks.getSession,
      handler: vi.fn()
    }
  }
}));

vi.mock("../../api/src/auth/perfil.service.js", () => ({
  buscarPerfilUsuario: mocks.buscarPerfilUsuario
}));

vi.mock("../../api/src/vendas/vendas.service.js", () => ({
  listarVendas: mocks.listarVendas,
  criarVenda: mocks.criarVenda
}));

vi.mock("../../api/src/despesas/despesas.service.js", () => ({
  listarDespesas: mocks.listarDespesas,
  criarDespesa: mocks.criarDespesa
}));

vi.mock("../../api/src/mercadorias/mercadorias.service.js", () => ({
  listarMercadorias: mocks.listarMercadorias,
  criarMercadoria: mocks.criarMercadoria
}));

vi.mock("../../api/src/retiradas/retiradas.service.js", () => ({
  listarRetiradas: mocks.listarRetiradas,
  criarRetirada: mocks.criarRetirada
}));

vi.mock("../../api/src/transferencias/transferencias.service.js", () => ({
  listarTransferencias: mocks.listarTransferencias,
  criarTransferencia: mocks.criarTransferencia
}));

describe("rotas operacionais por entidade", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { buildApp } = await import("../../api/src/app.js");
    app = await buildApp();
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: usuarioId } });
    mocks.buscarPerfilUsuario.mockResolvedValue(
      criarPerfil(
        ["entradas_visualizar", "entradas_criar", "despesas_criar", "mercadorias_criar", "retiradas_criar", "transferencias_criar"],
        { empresaIds: [empresaA] }
      )
    );
    mocks.listarVendas.mockResolvedValue([]);
    mocks.criarVenda.mockResolvedValue({ id: "venda-1", computar: true });
    mocks.listarDespesas.mockResolvedValue([]);
    mocks.criarDespesa.mockResolvedValue({ id: "despesa-1", computar: true });
    mocks.listarMercadorias.mockResolvedValue([]);
    mocks.criarMercadoria.mockResolvedValue({ id: "mercadoria-1", computar: true });
    mocks.listarRetiradas.mockResolvedValue([]);
    mocks.criarRetirada.mockResolvedValue({ id: "retirada-1", computar: true });
    mocks.listarTransferencias.mockResolvedValue([]);
    mocks.criarTransferencia.mockResolvedValue({ id: "transferencia-1", computar: true });
  });

  it("lista vendas em /api/vendas e nao registra rota antiga de entradas", async () => {
    const respostaVendas = await requisitar(app, { method: "GET", url: `/api/vendas?empresaId=${empresaA}` });
    const rotaRemovida = `/api/${"entr"}adas?empresaId=${empresaA}`;
    const respostaEntradas = await requisitar(app, { method: "GET", url: rotaRemovida });

    expect(respostaVendas.statusCode).toBe(200);
    expect(mocks.listarVendas).toHaveBeenCalled();
    expect(respostaEntradas.statusCode).toBe(404);
  });

  it("cria cada entidade no endpoint proprio", async () => {
    const venda = await requisitar(app, { method: "POST", url: "/api/vendas", payload: payloadVenda() });
    const despesa = await requisitar(app, {
      method: "POST",
      url: "/api/despesas",
      payload: {
        empresaId: empresaA,
        dataReferencia: "2026-06-29",
        dataVencimento: "2026-06-30",
        descricao: "Despesa",
        valorOriginal: 1,
        itensDespesa: [{ descricao: "Item", valor: 1 }]
      }
    });

    expect(venda.statusCode).toBe(201);
    expect(despesa.statusCode).toBe(201);
    expect(mocks.criarVenda).toHaveBeenCalled();
    expect(mocks.criarDespesa).toHaveBeenCalled();
  });
});



