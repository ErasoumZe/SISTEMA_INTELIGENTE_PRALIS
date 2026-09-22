import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarAcoesCaixa, type DepsAcoesCaixa } from "./caixa-acoes";

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
    confirmar: vi.fn().mockResolvedValue(true),
    ...over
  };
  return deps;
}

describe("abrirCaixaOperacional", () => {
  const payload = { pdvId: "pdv-1", usuarioCaixaId: "u-1", observacao: null };

  it("posta em /abrir com empresaId, re-busca status, recarrega tela, notifica e retorna true", async () => {
    const deps = montarDeps();
    const acoes = criarAcoesCaixa(deps);
    const ok = await acoes.abrirCaixaOperacional(payload);

    expect(ok).toBe(true);
    expect(deps.api.post).toHaveBeenCalledWith("/api/caixa/abrir", {
      empresaId: "emp-1",
      ...payload
    });
    expect(deps.carregarStatusCaixa).toHaveBeenCalledWith("emp-1");
    expect(deps.carregarDadosTela).toHaveBeenCalledWith("caixa", "emp-1");
    expect(deps.notificar).toHaveBeenCalledWith("Caixa aberto com sucesso.");
    expect(deps.setSalvando).toHaveBeenNthCalledWith(1, true);
    expect(deps.setSalvando).toHaveBeenLastCalledWith(false);
    expect(deps.confirmar).toHaveBeenCalledWith(expect.stringContaining("abertura"), "Abrir caixa", "Abrir caixa");
  });

  it("não abre nem altera o loading quando a confirmação é negada", async () => {
    const deps = montarDeps({ confirmar: async () => false });
    const ok = await criarAcoesCaixa(deps).abrirCaixaOperacional(payload);

    expect(ok).toBe(false);
    expect(deps.api.post).not.toHaveBeenCalled();
    expect(deps.setSalvando).not.toHaveBeenCalled();
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
  // B2: a chave viaja da tela ate a API. Ela e da INTENCAO, nao da requisicao — e por isso que o
  // retry precisa reenviar a MESMA, e por isso ela e obrigatoria no payload.
  const payload = {
    caixaId: "cx-1",
    valor: 15,
    valorEspecie: 10,
    valorMoedas: 5,
    lacre: "LAC-9",
    observacao: null,
    idempotenciaChave: "3f1a1d5e-0a2b-4c3d-8e4f-5a6b7c8d9e0f"
  };

  it("com confirmacao posta retorno ao cofre com lacre e chave, notifica e re-busca status", async () => {
    const deps = montarDeps({ confirmar: vi.fn().mockResolvedValue(true) });
    const ok = await criarAcoesCaixa(deps).retornarSaldoOperacional(payload);

    expect(ok).toBe(true);
    expect(deps.confirmar).toHaveBeenCalledOnce();
    expect(deps.api.post).toHaveBeenCalledWith("/api/caixa/cx-1/transferencia-cofre", {
      valor: 15,
      valorEspecie: 10,
      valorMoedas: 5,
      lacre: "LAC-9",
      observacao: null,
      idempotenciaChave: "3f1a1d5e-0a2b-4c3d-8e4f-5a6b7c8d9e0f"
    });
    expect(deps.notificar).toHaveBeenCalledWith("Retorno ao cofre lançado com sucesso.");
    expect(deps.carregarStatusCaixa).toHaveBeenCalledWith("emp-1");
  });

  it("aborta sem chamar a API se a confirmacao for negada", async () => {
    const deps = montarDeps({ confirmar: async () => false });
    const ok = await criarAcoesCaixa(deps).retornarSaldoOperacional(payload);

    expect(ok).toBe(false);
    expect(deps.api.post).not.toHaveBeenCalled();
    expect(deps.setSalvando).not.toHaveBeenCalled();
  });

  // O contrato que a tela usa para NAO limpar os campos: cancelamento e erro avisam `false`.
  // Sem isso a tela apagava valor e lacre no otimismo, e o operador redigitava as cegas.
  it("avisa aoConcluir(false) quando a confirmacao e negada", async () => {
    const aoConcluir = vi.fn();
    const deps = montarDeps({ confirmar: async () => false });
    await criarAcoesCaixa(deps).retornarSaldoOperacional({ ...payload, aoConcluir });

    expect(aoConcluir).toHaveBeenCalledWith(false);
  });

  it("avisa aoConcluir(false) quando a API falha, e aoConcluir(true) quando aceita", async () => {
    const aoConcluirErro = vi.fn();
    const depsErro = montarDeps({ api: { post: vi.fn().mockRejectedValue(new Error("500")) } });
    const falhou = await criarAcoesCaixa(depsErro).retornarSaldoOperacional({
      ...payload,
      aoConcluir: aoConcluirErro
    });

    expect(falhou).toBe(false);
    expect(aoConcluirErro).toHaveBeenCalledWith(false);
    expect(depsErro.notificar).toHaveBeenCalledWith("erro:500", "error");
    expect(depsErro.setSalvando).toHaveBeenLastCalledWith(false);

    const aoConcluirOk = vi.fn();
    const depsOk = montarDeps();
    await criarAcoesCaixa(depsOk).retornarSaldoOperacional({ ...payload, aoConcluir: aoConcluirOk });

    expect(aoConcluirOk).toHaveBeenCalledWith(true);
  });
});

// R-179/Fatia 3 · aqui existia `executarSolicitacaoCofre`, o POST de
// `/api/caixa/:id/solicitacoes-cofre/:id/executar`. Ele era o SEGUNDO caminho para o mesmo ato de
// `retornarSaldoOperacional` acima — mesmo dinheiro, mesmas contas, outra porta. A factory nao
// expoe mais essa acao, e a rota nao existe: ver `entrega-cofre-caminho-unico.test.ts`.
describe("fecharCaixaOperacional", () => {
  it("posta em /:id/fechar com lacre e composicao fisica, re-busca status e recarrega tela", async () => {
    const deps = montarDeps();
    const ok = await criarAcoesCaixa(deps).fecharCaixaOperacional({
      caixaId: "cx-2",
      observacao: "fim",
      lacreFechamento: "FCH-001",
      valorEspecieFechamento: 0,
      valorMoedasFechamento: 0
    });

    expect(ok).toBe(true);
    // D6: o fechamento devolve a sobra no MESMO ato. O valor nao vai daqui — quem apura e o
    // servidor, sob trava. Por isso o payload tem observacao e lacre, e nunca `valor`.
    expect(deps.api.post).toHaveBeenCalledWith("/api/caixa/cx-2/fechar", {
      observacao: "fim",
      lacreFechamento: "FCH-001",
      valorEspecieFechamento: 0,
      valorMoedasFechamento: 0
    });
    expect(deps.carregarStatusCaixa).toHaveBeenCalledWith("emp-1");
    expect(deps.notificar).toHaveBeenCalledWith("Caixa fechado com sucesso.");
    expect(deps.carregarDadosTela).toHaveBeenCalledWith("caixa", "emp-1");
    expect(deps.confirmar).toHaveBeenCalledWith(expect.stringContaining("fechamento"), "Fechar caixa", "Fechar caixa");
  });

  it("não fecha se a confirmação for negada", async () => {
    const deps = montarDeps({ confirmar: async () => false });
    const ok = await criarAcoesCaixa(deps).fecharCaixaOperacional({
      caixaId: "cx-2",
      observacao: null,
      lacreFechamento: "FCH-002",
      valorEspecieFechamento: 0,
      valorMoedasFechamento: 0
    });

    expect(ok).toBe(false);
    expect(deps.api.post).not.toHaveBeenCalled();
    expect(deps.setSalvando).not.toHaveBeenCalled();
  });

  it("manda lacre de fechamento e composicao fisica", async () => {
    const deps = montarDeps();
    await criarAcoesCaixa(deps).fecharCaixaOperacional({
      caixaId: "cx-2",
      observacao: null,
      lacreFechamento: "FCH-003",
      valorEspecieFechamento: 0,
      valorMoedasFechamento: 0
    });

    expect(deps.api.post).toHaveBeenCalledWith("/api/caixa/cx-2/fechar", {
      observacao: null,
      lacreFechamento: "FCH-003",
      valorEspecieFechamento: 0,
      valorMoedasFechamento: 0
    });
  });

  it("em erro notifica, devolve false e reseta salvando", async () => {
    const deps = montarDeps({ api: { post: vi.fn().mockRejectedValue(new Error("boom")) } });
    const ok = await criarAcoesCaixa(deps).fecharCaixaOperacional({
      caixaId: "cx-2",
      observacao: null,
      lacreFechamento: "FCH-004",
      valorEspecieFechamento: 0,
      valorMoedasFechamento: 0
    });

    expect(ok).toBe(false);
    expect(deps.notificar).toHaveBeenCalledWith("erro:boom", "error");
    expect(deps.setSalvando).toHaveBeenLastCalledWith(false);
  });
});

describe("planejamento de Transferencia de retorno", () => {
  it("executa a linha planejada e atualiza o retrato do Caixa", async () => {
    const deps = montarDeps();
    const ok = await criarAcoesCaixa(deps).executarPlanejamentoRetorno({
      caixaId: "cx-1",
      planejamentoId: "plano-1"
    });

    expect(ok).toBe(true);
    expect(deps.api.post).toHaveBeenCalledWith("/api/caixa/cx-1/planejamentos-retorno/plano-1/executar", {});
    expect(deps.carregarStatusCaixa).toHaveBeenCalledWith("emp-1");
    expect(deps.notificar).toHaveBeenCalledWith("Transferência de retorno executada e aguardando conferência.");
  });

  it("cancela com motivo auditavel e preserva o formulario quando a API falha", async () => {
    const aoConcluir = vi.fn();
    const deps = montarDeps();
    const ok = await criarAcoesCaixa(deps).cancelarPlanejamentoRetorno({
      planejamentoId: "plano-2",
      motivo: "  destino indisponivel  ",
      aoConcluir
    });

    expect(ok).toBe(true);
    expect(deps.api.post).toHaveBeenCalledWith("/api/caixa/planejamentos-retorno/plano-2/cancelar", {
      motivo: "destino indisponivel"
    });
    expect(deps.carregarStatusCaixa).not.toHaveBeenCalled();
    expect(aoConcluir).toHaveBeenCalledWith(true);

    const aoConcluirErro = vi.fn();
    const depsErro = montarDeps({ api: { post: vi.fn().mockRejectedValue(new Error("409")) } });
    const falhou = await criarAcoesCaixa(depsErro).cancelarPlanejamentoRetorno({
      planejamentoId: "plano-2",
      motivo: "manter motivo",
      aoConcluir: aoConcluirErro
    });

    expect(falhou).toBe(false);
    expect(aoConcluirErro).toHaveBeenCalledWith(false);
    expect(depsErro.notificar).toHaveBeenCalledWith("erro:409", "error");
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});
