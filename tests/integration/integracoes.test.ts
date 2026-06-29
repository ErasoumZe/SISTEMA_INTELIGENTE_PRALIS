import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarPerfil, empresaA, registroId, requisitar, usuarioId } from "./_helpers.js";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  buscarPerfilUsuario: vi.fn(),
  listarIntegracoes: vi.fn(),
  listarHistoricoIntegracao: vi.fn(),
  listarDicionarioIntegracao: vi.fn(),
  criarChaveIntegracao: vi.fn(),
  inativarChaveIntegracao: vi.fn(),
  salvarCampoIntegracao: vi.fn(),
  salvarVinculoIntegracao: vi.fn(),
  receberVendaIntegracao: vi.fn()
}));

vi.mock("../../api/src/auth.js", () => ({
  auth: {
    api: {
      getSession: mocks.getSession,
      handler: vi.fn()
    }
  }
}));

vi.mock("../../api/src/perfis.js", () => ({
  buscarPerfilUsuario: mocks.buscarPerfilUsuario
}));

vi.mock("../../api/src/integracoes/integracoes.service.js", () => ({
  listarIntegracoes: mocks.listarIntegracoes,
  listarHistoricoIntegracao: mocks.listarHistoricoIntegracao,
  listarDicionarioIntegracao: mocks.listarDicionarioIntegracao,
  criarChaveIntegracao: mocks.criarChaveIntegracao,
  inativarChaveIntegracao: mocks.inativarChaveIntegracao,
  salvarCampoIntegracao: mocks.salvarCampoIntegracao,
  salvarVinculoIntegracao: mocks.salvarVinculoIntegracao,
  receberVendaIntegracao: mocks.receberVendaIntegracao
}));

function payloadVenda() {
  return {
    DadosIntegracao: { origem: "pdv" },
    Venda: {
      idVenda: "VENDA-1",
      idCaixa: "PDV-1",
      nomeCaixa: "PDV 1",
      idCliente: "CLI-1",
      nomeCliente: "Cliente",
      documentoCliente: "123",
      dataHoraVenda: "2026-06-28T10:00:00.000Z",
      valorOriginal: 100,
      desconto: 0,
      acrescimo: 0,
      valorTotal: 100,
      statusVenda: "finalizada",
      numeroNotaFiscal: "NF-1"
    },
    ItensVenda: [
      {
        idRegistro: "ITEM-1",
        idProduto: "PROD-1",
        descricaoProduto: "Pao",
        dataHoraItem: "2026-06-28T10:00:00.000Z",
        quantidade: 2,
        valorUnitario: 10,
        desconto: 0,
        acrescimo: 0,
        total: 20,
        itemCancelado: false
      }
    ],
    PagamentosVenda: [
      {
        idVenda: "VENDA-1",
        idFormaPagamento: "DIN",
        descricaoFormaPagamento: "Dinheiro",
        valor: 100
      }
    ]
  };
}

describe("integracoes_visualizar", () => {
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
    mocks.buscarPerfilUsuario.mockResolvedValue(criarPerfil(["integracoes_visualizar"], { empresaIds: [empresaA] }));
    mocks.listarIntegracoes.mockResolvedValue({ integracoes: [], chaves: [] });
    mocks.receberVendaIntegracao.mockResolvedValue({
      status: "criado",
      vendaId: registroId,
      identificadorExterno: "VENDA-1"
    });
  });

  it("Deve_Retornar403_Quando_ListarIntegracoesSemPermissao", async () => {
    mocks.buscarPerfilUsuario.mockResolvedValueOnce(criarPerfil([], { empresaIds: [empresaA] }));

    const resposta = await requisitar(app, { method: "GET", url: `/api/integracoes?empresaId=${empresaA}` });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toMatchObject({ title: "Permissao insuficiente", status: resposta.statusCode, details: { permissao: "integracoes_visualizar" } });
    expect(mocks.listarIntegracoes).not.toHaveBeenCalled();
  });

  it("Deve_ListarIntegracoes_Quando_TiverPermissao", async () => {
    const resposta = await requisitar(app, { method: "GET", url: `/api/integracoes?empresaId=${empresaA}` });

    expect(resposta.statusCode).toBe(200);
    expect(mocks.listarIntegracoes).toHaveBeenCalledWith(
      { empresaId: empresaA, page: 1, pageSize: 10 },
      expect.objectContaining({ usuarioId })
    );
  });

  it("Deve_ReceberVendaAgregada_ComPayloadTipado", async () => {
    const resposta = await requisitar(app, {
      method: "POST",
      url: "/api/integracoes/01JTESTEINTEGRACAO00000000",
      payload: payloadVenda()
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      ok: true,
      data: { status: "criado", vendaId: registroId, identificadorExterno: "VENDA-1" }
    });
    expect(mocks.receberVendaIntegracao).toHaveBeenCalledWith(
      "01JTESTEINTEGRACAO00000000",
      expect.objectContaining({
        Venda: expect.objectContaining({ idVenda: "VENDA-1", dataHoraVenda: expect.any(Date) })
      })
    );
  });

  it("Deve_RejeitarVendaAgregada_Quando_ChaveForInvalida", async () => {
    mocks.receberVendaIntegracao.mockRejectedValueOnce(new Error("Chave de integracao invalida"));

    const resposta = await requisitar(app, {
      method: "POST",
      url: "/api/integracoes/CHAVEINVALIDA",
      payload: payloadVenda()
    });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toMatchObject({ title: "Chave de integracao invalida", status: resposta.statusCode });
  });
});



