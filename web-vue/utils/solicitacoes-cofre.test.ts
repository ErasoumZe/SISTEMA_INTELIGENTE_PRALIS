import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarAcoesSolicitacoesCofre, type DepsSolicitacoesCofre } from "./solicitacoes-cofre";

function montarDeps(over: Partial<DepsSolicitacoesCofre> = {}) {
  const deps: DepsSolicitacoesCofre = {
    api: {
      get: vi.fn().mockResolvedValue({ data: [] }),
      post: vi.fn().mockResolvedValue({ data: [] })
    },
    notificar: vi.fn(),
    mensagemErro: (error) => `erro:${String((error as Error).message ?? error)}`,
    ...over
  };
  return deps;
}

const CHAVE = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("programar", () => {
  it("posta tipo, valor, observacao e a chave de idempotencia da intencao", async () => {
    const deps = montarDeps();
    const acoes = criarAcoesSolicitacoesCofre(deps);
    await acoes.programar({
      caixaId: "cx-1",
      tipo: "sangria",
      valor: 120,
      observacao: "Recolher antes do pico",
      idempotenciaChave: CHAVE
    });

    expect(deps.api.post).toHaveBeenCalledWith("/api/caixa/cx-1/solicitacoes-cofre", {
      tipo: "sangria",
      valor: 120,
      observacao: "Recolher antes do pico",
      idempotenciaChave: CHAVE
    });
    expect(deps.notificar).toHaveBeenCalledWith("Entrega programada com sucesso.");
  });

  it("em erro notifica e devolve null (a tela conserva a chave para o retry)", async () => {
    const deps = montarDeps({
      api: { get: vi.fn(), post: vi.fn().mockRejectedValue(new Error("500")) }
    });
    const resultado = await criarAcoesSolicitacoesCofre(deps).programar({
      caixaId: "cx-1",
      tipo: "retorno",
      valor: 10,
      observacao: null,
      idempotenciaChave: CHAVE
    });

    expect(resultado).toBeNull();
    expect(deps.notificar).toHaveBeenCalledWith("erro:500", "error");
  });
});

describe("cancelar", () => {
  it("exige motivo antes de chamar a API", async () => {
    const deps = montarDeps();
    const resultado = await criarAcoesSolicitacoesCofre(deps).cancelar("cx-1", "sol-1", "   ");

    expect(resultado).toBeNull();
    expect(deps.api.post).not.toHaveBeenCalled();
    expect(deps.notificar).toHaveBeenCalledWith("Informe o motivo do cancelamento.", "error");
  });

  it("com motivo posta na rota de cancelar, com o motivo aparado", async () => {
    const deps = montarDeps();
    await criarAcoesSolicitacoesCofre(deps).cancelar("cx-1", "sol-1", "  pedido mudou  ");

    expect(deps.api.post).toHaveBeenCalledWith("/api/caixa/cx-1/solicitacoes-cofre/sol-1/cancelar", {
      motivo: "pedido mudou"
    });
    expect(deps.notificar).toHaveBeenCalledWith("Solicitação cancelada.");
  });

  // O diálogo de motivo do painel JA e a confirmacao. Uma segunda caixa "tem certeza?" obrigava a
  // retaguarda a confirmar duas vezes o mesmo ato — e a segunda nem mostrava o motivo digitado.
  it("nao pede uma segunda confirmacao: o dialogo de motivo e a unica", async () => {
    const deps = montarDeps();
    await criarAcoesSolicitacoesCofre(deps).cancelar("cx-1", "sol-1", "motivo");

    expect(deps.api.post).toHaveBeenCalledOnce();
    expect(deps).not.toHaveProperty("confirmar");
  });

  // Em erro devolve null para a tela PRESERVAR o motivo digitado e a solicitacao selecionada.
  it("em erro devolve null e notifica, sem limpar nada", async () => {
    const deps = montarDeps({
      api: { get: vi.fn(), post: vi.fn().mockRejectedValue(new Error("timeout")) }
    });
    const resultado = await criarAcoesSolicitacoesCofre(deps).cancelar("cx-1", "sol-1", "motivo que nao se perde");

    expect(resultado).toBeNull();
    expect(deps.notificar).toHaveBeenCalledWith("erro:timeout", "error");
  });
});

describe("listar", () => {
  it("devolve as solicitacoes do caixa", async () => {
    const solicitacoes = [{ id: "s1", tipo: "sangria", valor: 50, observacao: null, criadoPor: "u", criadoEm: "x" }];
    const deps = montarDeps({
      api: { get: vi.fn().mockResolvedValue({ data: solicitacoes }), post: vi.fn() }
    });

    expect(await criarAcoesSolicitacoesCofre(deps).listar("cx-1")).toEqual(solicitacoes);
    expect(deps.api.get).toHaveBeenCalledWith("/api/caixa/cx-1/solicitacoes-cofre");
  });

  it("em erro devolve lista vazia em vez de quebrar a tela", async () => {
    const deps = montarDeps({
      api: { get: vi.fn().mockRejectedValue(new Error("boom")), post: vi.fn() }
    });

    expect(await criarAcoesSolicitacoesCofre(deps).listar("cx-1")).toEqual([]);
    expect(deps.notificar).toHaveBeenCalledWith("erro:boom", "error");
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});
