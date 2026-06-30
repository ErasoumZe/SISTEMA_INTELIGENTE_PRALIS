import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type * as LancamentosDominio from "../../api/src/lancamentos/lancamentos.dominio.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarDespesa, listarDespesas } from "../../api/src/despesas/despesas.service.js";
import { criarMercadoria } from "../../api/src/mercadorias/mercadorias.service.js";
import { criarRetirada } from "../../api/src/retiradas/retiradas.service.js";
import { criarTransferencia } from "../../api/src/transferencias/transferencias.service.js";
import { criarVenda, listarVendas } from "../../api/src/vendas/vendas.service.js";

const mocks = vi.hoisted(() => ({
  obterCaixaAbertoParaLancamento: vi.fn(),
  validarReferenciasVenda: vi.fn(),
  validarReferenciasDespesa: vi.fn(),
  validarReferenciasMercadoria: vi.fn(),
  validarReferenciasRetirada: vi.fn(),
  validarReferenciasTransferencia: vi.fn(),
  criarVendaRepository: vi.fn(),
  listarVendasRepository: vi.fn(),
  criarDespesaRepository: vi.fn(),
  listarDespesasRepository: vi.fn(),
  criarMercadoriaRepository: vi.fn(),
  criarRetiradaRepository: vi.fn(),
  criarTransferenciaRepository: vi.fn()
}));

vi.mock("../../api/src/caixa/caixa.service.js", () => ({
  obterCaixaAbertoParaLancamento: mocks.obterCaixaAbertoParaLancamento
}));

vi.mock("../../api/src/lancamentos/lancamentos.dominio.js", async (importOriginal) => {
  const original = await importOriginal<typeof LancamentosDominio>();
  return {
    ...original,
    obterCaixaParaLancamento: mocks.obterCaixaAbertoParaLancamento,
    validarReferenciasVenda: mocks.validarReferenciasVenda,
    validarReferenciasDespesa: mocks.validarReferenciasDespesa,
    validarReferenciasMercadoria: mocks.validarReferenciasMercadoria,
    validarReferenciasRetirada: mocks.validarReferenciasRetirada,
    validarReferenciasTransferencia: mocks.validarReferenciasTransferencia
  };
});

vi.mock("../../api/src/vendas/vendas.repository.js", () => ({
  criarVendaRepository: mocks.criarVendaRepository,
  listarVendasRepository: mocks.listarVendasRepository
}));

vi.mock("../../api/src/despesas/despesas.repository.js", () => ({
  criarDespesaRepository: mocks.criarDespesaRepository,
  listarDespesasRepository: mocks.listarDespesasRepository
}));

vi.mock("../../api/src/mercadorias/mercadorias.repository.js", () => ({
  criarMercadoriaRepository: mocks.criarMercadoriaRepository
}));

vi.mock("../../api/src/retiradas/retiradas.repository.js", () => ({
  criarRetiradaRepository: mocks.criarRetiradaRepository
}));

vi.mock("../../api/src/transferencias/transferencias.repository.js", () => ({
  criarTransferenciaRepository: mocks.criarTransferenciaRepository
}));

const empresaId = "11111111-1111-4111-8111-111111111111";
const usuarioId = "usuario-1";
const uuid = "22222222-2222-4222-8222-222222222222";

const perfil: PerfilUsuario = {
  usuarioId,
  nome: "Usuario",
  email: "usuario@email.com",
  empresaId,
  empresaIds: [empresaId],
  colaboradorId: uuid,
  setorId: null,
  cargoIds: [],
  cargos: [],
  role: "admin",
  permissoes: ["entradas_criar", "despesas_criar", "mercadorias_criar", "retiradas_criar", "transferencias_criar"]
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.obterCaixaAbertoParaLancamento.mockResolvedValue({ id: "caixa-1", pdvContaId: uuid });
  mocks.validarReferenciasVenda.mockResolvedValue(null);
  mocks.validarReferenciasDespesa.mockResolvedValue(null);
  mocks.validarReferenciasMercadoria.mockResolvedValue(null);
  mocks.validarReferenciasRetirada.mockResolvedValue(null);
  mocks.validarReferenciasTransferencia.mockResolvedValue(null);
  mocks.criarVendaRepository.mockResolvedValue({ id: "venda-1" });
  mocks.criarDespesaRepository.mockResolvedValue({ id: "despesa-1" });
  mocks.criarMercadoriaRepository.mockResolvedValue({ id: "mercadoria-1" });
  mocks.criarRetiradaRepository.mockResolvedValue({ id: "retirada-1" });
  mocks.criarTransferenciaRepository.mockResolvedValue({ id: "transferencia-1" });
});

describe("services operacionais por entidade", () => {
  it("cria venda usando permissao de entradas e repository de vendas", async () => {
    await expect(
      criarVenda(
        {
          empresaId,
          dataReferencia: "2026-06-29",
          descricao: "Venda",
          valorOriginal: 10,
          valorAcrescimo: 0,
          valorDesconto: 0,
          computar: true,
          itensVenda: [{ descricaoProduto: "Pão", quantidade: 1, valorUnitario: 10, valorTotal: 10 }],
          tiposPagamento: [{ numeroVendas: 1, totalPago: 10 }]
        },
        perfil
      )
    ).resolves.toEqual({ id: "venda-1", computar: true });

    expect(mocks.criarVendaRepository).toHaveBeenCalled();
  });

  it("bloqueia entidade quando a permissao direta nao existe", async () => {
    await expect(
      criarDespesa(
        {
          empresaId,
          dataReferencia: "2026-06-29",
          dataVencimento: "2026-06-30",
          descricao: "Despesa",
          valorOriginal: 1,
          valorAcrescimo: 0,
          valorDesconto: 0,
          computar: true,
          itensDespesa: [{ descricao: "Item", valor: 1 }]
        },
        { ...perfil, permissoes: ["entradas_criar"] }
      )
    ).rejects.toThrow("Permissao insuficiente");
  });

  it("cria as demais entidades com repositories especificos", async () => {
    await expect(
      criarMercadoria(
        {
          empresaId,
          fornecedorId: uuid,
          dataReferencia: "2026-06-29",
          dataVencimento: "2026-06-30",
          descricao: "Mercadoria",
          valorOriginal: 2,
          valorAcrescimo: 0,
          valorDesconto: 0,
          grupoMercadoriaId: uuid,
          temNotaFiscal: false,
          computar: true,
          itensMercadoria: []
        },
        perfil
      )
    ).resolves.toEqual({ id: "mercadoria-1", computar: true });

    await expect(
      criarRetirada(
        {
          empresaId,
          colaboradorId: uuid,
          dataReferencia: "2026-06-29",
          dataVencimento: "2026-06-29",
          descricao: "Retirada",
          valorOriginal: 3,
          valorAcrescimo: 0,
          valorDesconto: 0,
          computar: true
        },
        perfil
      )
    ).resolves.toEqual({ id: "retirada-1", computar: true });

    await expect(
      criarTransferencia(
        {
          empresaId,
          contaOrigemId: uuid,
          contaDestinoId: "33333333-3333-4333-8333-333333333333",
          dataReferencia: "2026-06-29",
          descricao: "Transferencia",
          valorOriginal: 4,
          valorAcrescimo: 0,
          valorDesconto: 0,
          computar: true
        },
        perfil
      )
    ).resolves.toEqual({ id: "transferencia-1", computar: true });
  });

  it("lista por repository especifico e respeita escopo vazio", async () => {
    mocks.listarVendasRepository.mockResolvedValue([{ id: "venda-1" }]);
    mocks.listarDespesasRepository.mockResolvedValue([{ id: "despesa-1" }]);

    await expect(listarVendas({}, null)).resolves.toEqual([{ id: "venda-1" }]);
    await expect(listarDespesas({}, [])).resolves.toEqual([]);
  });
});
