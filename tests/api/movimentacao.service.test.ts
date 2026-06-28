import type { PerfilUsuario, Permissao } from "@padaria/shared/autenticacao";
import type { MovimentacaoPayload } from "@padaria/shared/movimentacao";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  criarMovimentacao,
  listarMovimentacoes,
  PermissaoMovimentacaoInsuficienteError,
  validarMovimentacaoFinanceira
} from "../../api/src/movimentacao/movimentacao.service.js";

const mocks = vi.hoisted(() => ({
  criarMovimentacaoFinanceira: vi.fn(),
  listarMovimentacoesFinanceiras: vi.fn(),
  marcarLacreComoUsado: vi.fn(),
  obterLacrePorId: vi.fn(),
  validarReferenciasMovimentacaoEmpresa: vi.fn()
}));

vi.mock("../../api/src/movimentacao/movimentacao.repository.js", () => mocks);

const empresaId = "11111111-1111-4111-8111-111111111111";
const uuidA = "22222222-2222-4222-8222-222222222222";
const uuidB = "33333333-3333-4333-8333-333333333333";

const perfilTesouraria: PerfilUsuario = {
  usuarioId: "usuario-1",
  nome: "Usuario",
  email: "usuario@padaria.local",
  empresaId,
  empresaIds: [empresaId],
  colaboradorId: "colaborador-1",
  setorId: null,
  cargoIds: ["cargo-tesouraria"],
  cargos: [{ id: "cargo-tesouraria", nome: "Tesouraria" }],
  role: "usuario_comum",
  permissoes: ["entradas", "despesas", "transferencias", "mercadorias", "retiradas"]
};

function payloadBase(sobrescritas: Partial<MovimentacaoPayload>): MovimentacaoPayload {
  return {
    empresaId,
    tipo: "entrada",
    dataReferencia: "2026-06-10",
    dataVencimento: "2026-06-10",
    dataPagamento: null,
    descricao: "Lancamento",
    observacao: null,
    valorOriginal: 10,
    valorAcrescimo: 0,
    descricaoAcrescimo: null,
    valorDesconto: 0,
    descricaoDesconto: null,
    contaOrigemId: null,
    contaDestinoId: null,
    fornecedorId: null,
    colaboradorId: null,
    grupoDespesaId: null,
    grupoMercadoriaId: null,
    grupoRetiradaId: null,
    maloteId: null,
    lacreMaloteId: null,
    notaFiscalId: null,
    temNotaFiscal: false,
    computar: true,
    fotoDocumentoUrl: null,
    itensDespesa: [],
    itensMercadoria: [],
    ...sobrescritas
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.criarMovimentacaoFinanceira.mockResolvedValue({ id: uuidA });
  mocks.obterLacrePorId.mockResolvedValue({ status: "disponivel" });
  mocks.validarReferenciasMovimentacaoEmpresa.mockResolvedValue(null);
});

describe("movimentacao service", () => {
  it("bloqueia transferencia para a mesma conta", () => {
    const payload = payloadBase({
      tipo: "transferencia",
      dataVencimento: null,
      contaOrigemId: uuidA,
      contaDestinoId: uuidA
    });

    expect(() => validarMovimentacaoFinanceira(payload)).toThrow("Conta de destino deve ser diferente da origem");
  });

  it("bloqueia despesa quando a soma dos itens diverge do valor original", () => {
    const payload = payloadBase({
      tipo: "despesa",
      grupoDespesaId: null,
      valorOriginal: 100,
      itensDespesa: [
        { grupoDespesaId: uuidA, descricao: "Item A", valor: 30 },
        { grupoDespesaId: uuidB, descricao: "Item B", valor: 40 }
      ]
    });

    expect(() => validarMovimentacaoFinanceira(payload)).toThrow(
      "Soma dos itens da despesa deve bater com o valor original"
    );
  });

  it("forca mercadoria com nota fiscal a computar mesmo quando o payload informa falso", async () => {
    const payload = payloadBase({
      tipo: "mercadoria",
      fornecedorId: uuidA,
      grupoMercadoriaId: uuidB,
      temNotaFiscal: true,
      computar: false
    });

    await expect(criarMovimentacao(payload, perfilTesouraria)).resolves.toEqual({ id: uuidA, computar: true });
    expect(mocks.criarMovimentacaoFinanceira).toHaveBeenCalledWith(payload, true, perfilTesouraria.usuarioId);
  });

  it("bloqueia lacre indisponivel antes de criar movimentacao", async () => {
    mocks.obterLacrePorId.mockResolvedValueOnce({ status: "usado" });

    const payload = payloadBase({
      tipo: "transferencia",
      dataVencimento: null,
      contaOrigemId: uuidA,
      contaDestinoId: uuidB,
      lacreMaloteId: uuidA
    });

    await expect(criarMovimentacao(payload, perfilTesouraria)).rejects.toThrow("Lacre indisponivel");
    expect(mocks.criarMovimentacaoFinanceira).not.toHaveBeenCalled();
  });

  it("retorna erro tipado quando o perfil nao tem a permissao da movimentacao", async () => {
    const payload = payloadBase({ tipo: "despesa", grupoDespesaId: uuidA });
    const permissoes: Permissao[] = ["entradas"];
    const perfilSemDespesa: PerfilUsuario = { ...perfilTesouraria, permissoes };

    await expect(criarMovimentacao(payload, perfilSemDespesa)).rejects.toBeInstanceOf(
      PermissaoMovimentacaoInsuficienteError
    );
    expect(mocks.criarMovimentacaoFinanceira).not.toHaveBeenCalled();
  });

  it("bloqueia referencia de outra empresa antes de criar movimentacao", async () => {
    mocks.validarReferenciasMovimentacaoEmpresa.mockResolvedValueOnce("Fornecedor");
    const payload = payloadBase({ tipo: "mercadoria", fornecedorId: uuidA, grupoMercadoriaId: uuidB });

    await expect(criarMovimentacao(payload, perfilTesouraria)).rejects.toThrow(
      "Fornecedor nao pertence a empresa informada"
    );
    expect(mocks.criarMovimentacaoFinanceira).not.toHaveBeenCalled();
  });

  it("lista movimentacoes apenas no escopo de empresas permitido", async () => {
    mocks.listarMovimentacoesFinanceiras.mockResolvedValueOnce([]);

    await expect(listarMovimentacoes({}, [empresaId])).resolves.toEqual([]);
    expect(mocks.listarMovimentacoesFinanceiras).toHaveBeenCalledWith({}, [empresaId]);
  });

  it("nao consulta movimentacoes quando o perfil nao tem empresas liberadas", async () => {
    await expect(listarMovimentacoes({}, [])).resolves.toEqual([]);
    expect(mocks.listarMovimentacoesFinanceiras).not.toHaveBeenCalled();
  });
});
