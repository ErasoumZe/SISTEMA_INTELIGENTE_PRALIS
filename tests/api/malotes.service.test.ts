import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarMalote, validarLacre } from "../../api/src/malotes/malotes.service.js";

const mocks = vi.hoisted(() => ({
  atualizarMaloteRepository: vi.fn(),
  buscarLacrePorEmpresaRepository: vi.fn(),
  buscarLacrePorNumeroRepository: vi.fn(),
  buscarMaloteEmpresaRepository: vi.fn(),
  criarMaloteRepository: vi.fn(),
  listarLacresMaloteRepository: vi.fn(),
  listarMalotesRepository: vi.fn()
}));

vi.mock("../../api/src/malotes/malotes.repository.js", () => mocks);

const empresaId = "11111111-1111-4111-8111-111111111111";
const maloteId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.buscarLacrePorEmpresaRepository.mockResolvedValue(null);
  mocks.buscarMaloteEmpresaRepository.mockResolvedValue({ empresaId });
  mocks.criarMaloteRepository.mockResolvedValue({ id: maloteId });
});

describe("malotes service", () => {
  it("normaliza codigo e lacres antes de criar", async () => {
    await expect(
      criarMalote(
        {
          empresaId,
          codigo: " MALOTE-001 ",
          lacres: [" LACRE-001 ", "LACRE-002"]
        },
        "usuario-1"
      )
    ).resolves.toMatchObject({
      id: maloteId,
      codigo: "MALOTE-001",
      lacres: ["LACRE-001", "LACRE-002"]
    });

    expect(mocks.criarMaloteRepository).toHaveBeenCalledWith({
      empresaId,
      codigo: "MALOTE-001",
      lacres: ["LACRE-001", "LACRE-002"],
      usuarioId: "usuario-1"
    });
  });

  it("bloqueia lacres duplicados no mesmo payload ignorando caixa e espacos", async () => {
    await expect(
      criarMalote({
        empresaId,
        codigo: "MALOTE-001",
        lacres: ["LACRE-001", " lacre-001 "]
      })
    ).rejects.toThrow("Lacre duplicado: lacre-001");
    expect(mocks.criarMaloteRepository).not.toHaveBeenCalled();
  });

  it("bloqueia lacre ja existente na mesma empresa", async () => {
    mocks.buscarLacrePorEmpresaRepository.mockResolvedValueOnce({ numero: "LACRE-001" });

    await expect(
      criarMalote({
        empresaId,
        codigo: "MALOTE-002",
        lacres: ["LACRE-001"]
      })
    ).rejects.toThrow("Lacre ja cadastrado: LACRE-001");
  });

  it("valida lacre disponivel para transferencia", async () => {
    mocks.buscarLacrePorNumeroRepository.mockResolvedValueOnce({
      id: "33333333-3333-4333-8333-333333333333",
      empresaId,
      numero: "LACRE-001",
      status: "disponivel",
      maloteId,
      maloteCodigo: "MALOTE-001"
    });

    await expect(validarLacre("LACRE-001", [empresaId])).resolves.toMatchObject({
      existe: true,
      disponivel: true,
      erro: null
    });
  });
});
