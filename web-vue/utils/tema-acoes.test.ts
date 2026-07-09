import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfiguracaoAparenciaEmpresa, TemaAplicacao } from "@padaria/shared";
import { criarAcoesTema, type DepsAcoesTema } from "./tema-acoes";

const padrao: TemaAplicacao = {
  corPrimaria: "#111111",
  corSecundaria: "#222222",
  corFundo: "#333333",
  corCartao: "#444444",
  corSucesso: "#555555",
  corAviso: "#666666",
  corErro: "#777777"
};

const TELA_RESUMO = "resumo_caixa";

function montarCenario(over: Partial<DepsAcoesTema> = {}) {
  const refs = {
    tema: ref<TemaAplicacao>({ ...padrao }),
    temaAtual: ref<TemaAplicacao>({ ...padrao }),
    temaResumoCaixa: ref<TemaAplicacao>({ ...padrao }),
    temaTelaAtual: ref(""),
    temaResumoCaixaAtual: ref(""),
    temaTelaEdicao: ref("entradas"),
    temaSalvando: ref(false),
    modalTemaAberto: ref(false)
  };
  const empresa: { configuracoesAparencia?: ConfiguracaoAparenciaEmpresa | null } = { configuracoesAparencia: null };
  const aplicarTema = vi.fn();
  const notificar = vi.fn();
  const deps: DepsAcoesTema = {
    refs,
    empresaId: () => "emp-1",
    telaAtiva: () => "entradas",
    empresaAtiva: () => empresa,
    telaResumoCaixa: TELA_RESUMO,
    api: { get: vi.fn().mockResolvedValue({ ...padrao }), put: vi.fn().mockResolvedValue(undefined) },
    aplicarTema,
    notificar,
    mensagemErro: (error) => `erro:${String((error as Error).message ?? error)}`,
    temaPadrao: () => ({ ...padrao }),
    ...over
  };
  const acoes = criarAcoesTema(deps);
  return { acoes, refs, empresa, aplicarTema, notificar, api: deps.api };
}

describe("carregarTemaTela", () => {
  it("usa o tema LOCAL da empresa (sem chamar a API) e carimba a chave de cache", async () => {
    const config: ConfiguracaoAparenciaEmpresa = { padrao, especifico: [] };
    const cenario = montarCenario({ empresaAtiva: () => ({ configuracoesAparencia: config }) });
    await cenario.acoes.carregarTemaTela("padrao");

    expect(cenario.api.get).not.toHaveBeenCalled();
    expect(cenario.refs.temaAtual.value).toEqual(padrao);
    expect(cenario.refs.temaTelaAtual.value).toBe("emp-1:padrao");
    expect(cenario.aplicarTema).toHaveBeenCalledWith(padrao, padrao);
  });

  it("sem tema local busca na API", async () => {
    const cenario = montarCenario();
    await cenario.acoes.carregarTemaTela("entradas");
    expect(cenario.api.get).toHaveBeenCalledWith("/api/tema?tela=entradas&empresaId=emp-1");
    expect(cenario.refs.temaTelaAtual.value).toBe("emp-1:entradas");
  });

  it("em erro cai no tema padrao e ainda aplica", async () => {
    const cenario = montarCenario({ api: { get: vi.fn().mockRejectedValue(new Error("x")), put: vi.fn() } });
    await cenario.acoes.carregarTemaTela("entradas");
    expect(cenario.refs.temaAtual.value).toEqual(padrao);
    expect(cenario.aplicarTema).toHaveBeenCalled();
  });
});

describe("abrirTema", () => {
  it("marca a tela em edicao e abre o modal", async () => {
    const cenario = montarCenario();
    await cenario.acoes.abrirTema("despesas");
    expect(cenario.refs.temaTelaEdicao.value).toBe("despesas");
    expect(cenario.refs.modalTemaAberto.value).toBe(true);
  });
});

describe("salvarTema", () => {
  it("posta o tema, atualiza a tela ativa, fecha o modal e notifica sucesso", async () => {
    const cenario = montarCenario();
    cenario.refs.temaTelaEdicao.value = "entradas"; // === telaAtiva
    cenario.refs.tema.value = { ...padrao, corPrimaria: "#abcdef" };

    await cenario.acoes.salvarTema();

    expect(cenario.api.put).toHaveBeenCalledWith("/api/tema", {
      empresaId: "emp-1",
      tela: "entradas",
      ...cenario.refs.tema.value
    });
    expect(cenario.refs.temaAtual.value).toEqual({ ...padrao, corPrimaria: "#abcdef" });
    expect(cenario.refs.temaTelaAtual.value).toBe("emp-1:entradas");
    expect(cenario.refs.modalTemaAberto.value).toBe(false);
    expect(cenario.refs.temaSalvando.value).toBe(false);
    expect(cenario.notificar).toHaveBeenCalledWith("Aparencia salva com sucesso.");
  });

  it("salvar tema do resumo de caixa atualiza os refs do resumo", async () => {
    const cenario = montarCenario();
    cenario.refs.temaTelaEdicao.value = TELA_RESUMO;
    cenario.refs.tema.value = { ...padrao, corSucesso: "#00ff00" };

    await cenario.acoes.salvarTema();

    expect(cenario.refs.temaResumoCaixa.value).toEqual({ ...padrao, corSucesso: "#00ff00" });
    expect(cenario.refs.temaResumoCaixaAtual.value).toBe(`emp-1:${TELA_RESUMO}`);
  });

  it("em erro notifica e reseta salvando", async () => {
    const cenario = montarCenario({ api: { get: vi.fn(), put: vi.fn().mockRejectedValue(new Error("boom")) } });
    await cenario.acoes.salvarTema();
    expect(cenario.notificar).toHaveBeenCalledWith("erro:boom", "error");
    expect(cenario.refs.temaSalvando.value).toBe(false);
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});
