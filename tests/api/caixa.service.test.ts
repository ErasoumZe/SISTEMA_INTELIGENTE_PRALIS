import type { AjusteSaldoPayload } from "@padaria/shared/caixa";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { acertarSaldoCaixa, obterResumoCaixa } from "../../api/src/caixa/caixa.service.js";

const mocks = vi.hoisted(() => ({
  buscarGrupoQuebraCaixa: vi.fn(),
  criarAjusteSaldoCaixa: vi.fn(),
  obterTotaisCaixa: vi.fn()
}));

vi.mock("../../api/src/caixa/caixa.repository.js", () => mocks);

const empresaId = "11111111-1111-4111-8111-111111111111";
const colaboradorId = "22222222-2222-4222-8222-222222222222";
const movimentacaoId = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.obterTotaisCaixa.mockResolvedValue({
    totalEntradas: "100",
    totalTransferencias: "20",
    totalDespesas: "10",
    totalRetiradas: "5"
  });
  mocks.buscarGrupoQuebraCaixa.mockResolvedValue({ id: "44444444-4444-4444-8444-444444444444" });
  mocks.criarAjusteSaldoCaixa.mockResolvedValue({ id: movimentacaoId });
});

describe("caixa service", () => {
  it("calcula saldo a partir dos totais do repository", async () => {
    await expect(obterResumoCaixa({ empresaId, data: "2026-06-10" })).resolves.toEqual({
      totalEntradas: 100,
      totalTransferencias: 20,
      totalDespesas: 10,
      totalRetiradas: 5,
      saldo: 65
    });
  });

  it("bloqueia ajuste quando nao existe diferenca", async () => {
    const payload: AjusteSaldoPayload = {
      empresaId,
      colaboradorId,
      contaOrigemId: null,
      data: "2026-06-10",
      valorDiferenca: 0
    };

    await expect(acertarSaldoCaixa(payload, "usuario-1")).rejects.toThrow("Nao ha diferenca para acertar");
    expect(mocks.criarAjusteSaldoCaixa).not.toHaveBeenCalled();
  });

  it("cria movimentacao de ajuste usando grupo de quebra de caixa quando existir", async () => {
    const payload: AjusteSaldoPayload = {
      empresaId,
      colaboradorId,
      contaOrigemId: null,
      data: "2026-06-10",
      valorDiferenca: -12.5
    };

    await expect(acertarSaldoCaixa(payload, "usuario-1")).resolves.toEqual({ movimentacaoId });
    expect(mocks.criarAjusteSaldoCaixa).toHaveBeenCalledWith(
      payload,
      "44444444-4444-4444-8444-444444444444",
      "usuario-1"
    );
  });
});
