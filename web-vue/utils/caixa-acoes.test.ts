import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarAcoesCaixa, type DepsAcoesCaixa } from "./caixa-acoes";
import { dataHoraParaUtc } from "./formatacao";

// Fakes das dependencias injetadas: a factory nao toca Nuxt/refs, entao testa-se so a orquestracao
// (endpoint certo, re-fetch de status, notificacao, reset do "salvando", confirmacao do acerto).
function montarDeps(over: Partial<DepsAcoesCaixa> = {}) {
  const deps: DepsAcoesCaixa = {
    api: { post: vi.fn().mockResolvedValue(undefined) },
    empresaId: () => "emp-1",
    telaAtiva: () => "caixa",
    setSalvando: vi.fn(),
    carregarStatusCaixa: vi.fn().mockResolvedValue(undefined),
    carregarDadosTela: vi.fn().mockResolvedValue(undefined),
    notificar: vi.fn(),
    mensagemErro: (error) => `erro:${String((error as Error).message ?? error)}`,
    confirmar: () => true,
    ...over
  };
  return deps;
}

describe("abrirCaixaOperacional", () => {
  const payload = { pdvId: "pdv-1", usuarioCaixaId: "u-1", dataHoraAbertura: "2026-07-03T08:00", observacao: null };

  it("posta em /abrir com empresaId, re-busca status, recarrega tela, notifica e retorna true", async () => {
    const deps = montarDeps();
    const acoes = criarAcoesCaixa(deps);
    const ok = await acoes.abrirCaixaOperacional(payload);

    expect(ok).toBe(true);
    expect(deps.api.post).toHaveBeenCalledWith("/api/caixa/abrir", {
      empresaId: "emp-1",
      ...payload,
      dataHoraAbertura: dataHoraParaUtc(payload.dataHoraAbertura)
    });
    expect(deps.carregarStatusCaixa).toHaveBeenCalledWith("emp-1");
    expect(deps.carregarDadosTela).toHaveBeenCalledWith("caixa", "emp-1");
    expect(deps.notificar).toHaveBeenCalledWith("Caixa aberto com sucesso.");
    expect(deps.setSalvando).toHaveBeenNthCalledWith(1, true);
    expect(deps.setSalvando).toHaveBeenLastCalledWith(false);
  });

  it("em erro notifica erro, retorna false e reseta salvando", async () => {
    const deps = montarDeps({ api: { post: vi.fn().mockRejectedValue(new Error("500")) } });
    const acoes = criarAcoesCaixa(deps);
    const ok = await acoes.abrirCaixaOperacional(payload);

    expect(ok).toBe(false);
    expect(deps.notificar).toHaveBeenCalledWith("erro:500", "error");
    expect(deps.carregarStatusCaixa).not.toHaveBeenCalled();
    expect(deps.setSalvando).toHaveBeenLastCalledWith(false);
  });

  it("nao recarrega tela quando nao ha tela ativa", async () => {
    const deps = montarDeps({ telaAtiva: () => "" });
    await criarAcoesCaixa(deps).abrirCaixaOperacional(payload);
    expect(deps.carregarDadosTela).not.toHaveBeenCalled();
  });
});

describe("retornarSaldoOperacional", () => {
  const payload = { caixaId: "cx-1", valor: 15, observacao: null };

  it("com confirmacao posta retorno ao cofre, notifica e re-busca status", async () => {
    const deps = montarDeps({ confirmar: vi.fn().mockReturnValue(true) });
    await criarAcoesCaixa(deps).retornarSaldoOperacional(payload);

    expect(deps.confirmar).toHaveBeenCalledOnce();
    expect(deps.api.post).toHaveBeenCalledWith("/api/caixa/cx-1/transferencia-cofre", {
      tipo: "retorno",
      valor: 15,
      observacao: null
    });
    expect(deps.notificar).toHaveBeenCalledWith("Retorno ao cofre lançado com sucesso.");
    expect(deps.carregarStatusCaixa).toHaveBeenCalledWith("emp-1");
  });

  it("aborta sem chamar a API se a confirmacao for negada", async () => {
    const deps = montarDeps({ confirmar: () => false });
    await criarAcoesCaixa(deps).retornarSaldoOperacional(payload);

    expect(deps.api.post).not.toHaveBeenCalled();
    expect(deps.setSalvando).not.toHaveBeenCalled();
  });
});

describe("fecharCaixaOperacional", () => {
  it("posta em /:id/fechar, re-busca status, notifica e recarrega tela", async () => {
    const deps = montarDeps();
    await criarAcoesCaixa(deps).fecharCaixaOperacional({ caixaId: "cx-2", observacao: "fim" });

    expect(deps.api.post).toHaveBeenCalledWith("/api/caixa/cx-2/fechar", { observacao: "fim" });
    expect(deps.carregarStatusCaixa).toHaveBeenCalledWith("emp-1");
    expect(deps.notificar).toHaveBeenCalledWith("Caixa fechado com sucesso.");
    expect(deps.carregarDadosTela).toHaveBeenCalledWith("caixa", "emp-1");
  });

  it("em erro notifica e reseta salvando", async () => {
    const deps = montarDeps({ api: { post: vi.fn().mockRejectedValue(new Error("boom")) } });
    await criarAcoesCaixa(deps).fecharCaixaOperacional({ caixaId: "cx-2", observacao: null });

    expect(deps.notificar).toHaveBeenCalledWith("erro:boom", "error");
    expect(deps.setSalvando).toHaveBeenLastCalledWith(false);
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});
