import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type { AjusteSaldoPayload } from "@padaria/shared/caixa";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acertarSaldoCaixa,
  acertarSaldoCaixaOperacional,
  calcularResumoCaixaOperacional,
  fecharCaixa,
  obterResumoCaixa
} from "../../api/src/caixa/caixa.service.js";

const mocks = vi.hoisted(() => ({
  buscarGrupoQuebraCaixa: vi.fn(),
  criarAjusteSaldoCaixa: vi.fn(),
  obterTotaisCaixa: vi.fn(),
  atualizarAberturaCaixaRepository: vi.fn(),
  atualizarFechamentoCaixaRepository: vi.fn(),
  buscarCaixaAbertoUsuarioRepository: vi.fn(),
  buscarCaixaPorIdRepository: vi.fn(),
  buscarColaboradorPorUsuarioRepository: vi.fn(),
  buscarPdvEmpresaRepository: vi.fn(),
  buscarPerfilUsuarioCaixaRepository: vi.fn(),
  caixaTemMovimentosRepository: vi.fn(),
  calcularTotaisCaixaOperacionalRepository: vi.fn(),
  criarAcertoSaldoCaixaRepository: vi.fn(),
  criarCaixaRepository: vi.fn(),
  existeCaixaAbertoPdvRepository: vi.fn(),
  existePeriodoCaixaRepository: vi.fn(),
  listarHistoricoCaixaRepository: vi.fn(),
  registrarEdicaoCaixaRepository: vi.fn()
}));

vi.mock("../../api/src/caixa/caixa.repository.js", () => mocks);
vi.mock("../../api/src/banco/conexao.js", () => ({
  executarEmTransacao: (callback: (tx: unknown) => unknown) => callback({}),
  banco: {}
}));

const empresaId = "11111111-1111-4111-8111-111111111111";
const colaboradorId = "22222222-2222-4222-8222-222222222222";
const movimentacaoId = "33333333-3333-4333-8333-333333333333";
const caixaId = "55555555-5555-4555-8555-555555555555";
const pdvId = "66666666-6666-4666-8666-666666666666";
const contaPdvId = "77777777-7777-4777-8777-777777777777";
const usuarioId = "usuario-1";

const perfil: PerfilUsuario = {
  usuarioId,
  nome: "Usuario",
  email: "usuario@email.com",
  empresaId,
  empresaIds: [empresaId],
  colaboradorId,
  setorId: null,
  cargoIds: [],
  cargos: [],
  role: "usuario_comum",
  permissoes: ["operar_caixa"]
};

const caixaAberto = {
  id: caixaId,
  empresaId,
  pdvId,
  pdvNome: "PDV 01",
  pdvContaId: contaPdvId,
  usuarioId,
  usuarioCaixaId: usuarioId,
  usuarioCaixaNome: "Usuario",
  colaboradorId,
  dataMovimento: "2026-06-10",
  dataHoraAbertura: new Date("2026-06-10T10:00:00.000Z"),
  abertoEm: new Date("2026-06-10T10:00:00.000Z"),
  dataHoraFechamento: null,
  fechadoEm: null,
  tokenEdicao: "ABC123",
  observacao: null,
  status: "aberto"
};

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
  mocks.buscarCaixaPorIdRepository.mockResolvedValue(caixaAberto);
  mocks.calcularTotaisCaixaOperacionalRepository.mockResolvedValue({
    totalEntradas: "100",
    totalTransferencias: "0",
    totalTransferenciasEntrada: "20",
    totalTransferenciasSaida: "5",
    totalDespesas: "30",
    totalRetiradas: "10",
    totalMercadorias: "25"
  });
  mocks.criarAcertoSaldoCaixaRepository.mockResolvedValue({
    movimentacaoId,
    debitoId: "88888888-8888-4888-8888-888888888888"
  });
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

  it("Deve_CalcularSaldoOperacional_Quando_CaixaTemMovimentosComputaveis", async () => {
    await expect(calcularResumoCaixaOperacional(caixaAberto)).resolves.toEqual({
      totalEntradas: 100,
      totalTransferencias: 0,
      totalTransferenciasEntrada: 20,
      totalTransferenciasSaida: 5,
      totalDespesas: 30,
      totalRetiradas: 10,
      totalMercadorias: 25,
      saldo: 50
    });
  });

  it("Deve_CriarDespesaEDebito_Quando_AcertarSaldoPositivo", async () => {
    await expect(acertarSaldoCaixaOperacional(caixaId, { observacao: "quebra" }, perfil)).resolves.toEqual({
      movimentacaoId,
      debitoId: "88888888-8888-4888-8888-888888888888",
      valorDiferenca: 50
    });
    expect(mocks.criarAcertoSaldoCaixaRepository).toHaveBeenCalledWith(
      expect.objectContaining({
        caixaId,
        empresaId,
        colaboradorId,
        contaOrigemId: contaPdvId,
        valorDiferenca: 50,
        observacao: "quebra",
        criadoPor: usuarioId
      }),
      expect.anything()
    );
  });

  it("Deve_BloquearFechamento_Quando_SaldoPositivoNaoFoiAcertado", async () => {
    await expect(
      fecharCaixa(caixaId, { observacao: null }, perfil)
    ).rejects.toThrow("Acerto de saldo obrigatorio");
    expect(mocks.atualizarFechamentoCaixaRepository).not.toHaveBeenCalled();
  });

  it("Deve_FecharCaixa_Quando_SaldoNaoForPositivo", async () => {
    mocks.calcularTotaisCaixaOperacionalRepository.mockResolvedValueOnce({
      totalEntradas: "10",
      totalTransferencias: "0",
      totalTransferenciasEntrada: "0",
      totalTransferenciasSaida: "20",
      totalDespesas: "0",
      totalRetiradas: "0",
      totalMercadorias: "0"
    });

    await expect(
      fecharCaixa(caixaId, { observacao: "fim" }, perfil)
    ).resolves.toEqual({ caixaAberto: null, resumo: null });
    expect(mocks.atualizarFechamentoCaixaRepository).toHaveBeenCalledWith(
      expect.objectContaining({ caixaId, saldo: -10, observacao: "fim", dataHoraFechamento: expect.any(Date) }),
      expect.anything()
    );
  });
});
