// ADM-003 V6 — a listagem passou a dizer em que pe esta a ficha. Este arquivo protege as duas
// coisas que isso ameaca: a tabela nao pode virar uma segunda porta para a revisao, e o sinal nao
// pode depender de cor.
//
// Nao havia teste algum para `ProcessosTabela.vue` antes desta entrega.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mount } from "@vue/test-utils";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import type { ProcessoListaDto, SituacaoFicha } from "@padaria/shared";
import ProcessosTabela from "~/components/admissoes/ProcessosTabela.vue";

const PASTA = dirname(fileURLToPath(import.meta.url));

function semComentarios(fonte: string): string {
  return fonte
    .replace(/<!--[\s\S]*?-->/gu, " ")
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/(^|[^:])\/\/[^\n]*/gu, "$1");
}

beforeAll(() => {
  class ObservadorInerte {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal("ResizeObserver", ObservadorInerte);
  vi.stubGlobal("IntersectionObserver", ObservadorInerte);
});

function linhaDe(fichaSituacao: SituacaoFicha | null, nome = "Pessoa Sintetica"): ProcessoListaDto {
  return {
    id: `processo-${fichaSituacao ?? "sem"}`,
    origem: "admissao_direta",
    status: "iniciado",
    situacao: "ativo",
    nomeCompleto: nome,
    cpfMascarado: "•••.•••.•••-••",
    funcaoNome: "PADEIRO",
    turnoResumo: "M · 06:00–14:00",
    dataAdmissao: "2026-10-01",
    exameSituacao: "aso_apto",
    fichaSituacao,
    criadoEm: "2026-09-01T12:00:00.000Z"
  };
}

function montar(cenario: { linhas?: ProcessoListaDto[]; filtrado?: boolean; total?: number } = {}) {
  const vuetify = createVuetify({ components, directives });
  const linhas = cenario.linhas ?? [linhaDe("enviada")];
  return mount(ProcessosTabela, {
    global: { plugins: [vuetify] },
    props: {
      linhas,
      carregando: false,
      pagina: 1,
      totalPaginas: 1,
      total: cenario.total ?? linhas.length,
      porPagina: 10,
      filtrado: cenario.filtrado ?? false
    }
  });
}

function texto(wrapper: ReturnType<typeof montar>): string {
  return wrapper.text().replace(/\s+/gu, " ").trim();
}

describe("o sinal da ficha na listagem", () => {
  it("Deve_MostrarOSinal_So_Quando_A_FichaPedeAcao", () => {
    // A ficha interna em edição não é pendência. Só uma devolução histórica pede ação na lista.
    expect(texto(montar({ linhas: [linhaDe("devolvida")] }))).toContain("Devolvida para correção");

    for (const silencioso of ["enviada", "aprovada", "rascunho", null] as const) {
      const conteudo = texto(montar({ linhas: [linhaDe(silencioso)] }));
      expect(conteudo, String(silencioso)).not.toContain("aguardando revisão");
      expect(conteudo, String(silencioso)).not.toContain("Devolvida para correção");
      expect(conteudo, String(silencioso)).not.toContain("Aprovada");
    }
  });

  it("Deve_OSinalTerTextoEIcone_E_NaoSoCor", () => {
    // WCAG 1.4.1: quem nao distingue cor le o rotulo; quem le rapido reconhece a forma. Tres canais.
    const wrapper = montar({ linhas: [linhaDe("devolvida")] });
    const chip = wrapper.find(".ficha-sinal .v-chip");
    expect(chip.exists()).toBe(true);
    expect(chip.text()).toContain("Devolvida para correção");
    expect(chip.find(".v-icon").exists()).toBe(true);
  });

  it("Deve_NomearOSinal_Para_LeitorDeTela", () => {
    // O chip mora na celula do candidato, entao o nome acessivel da celula vira "nome + rotulo".
    // O prefixo invisivel diz de que o rotulo esta falando.
    const wrapper = montar({ linhas: [linhaDe("devolvida")] });
    expect(wrapper.find(".ficha-sinal .d-sr-only").text()).toBe("Ficha do candidato:");
  });

  it("Deve_A_ListaNuncaMostrarConteudoDaFicha", () => {
    // Situacao e andamento; o conteudo mora na tela de revisao, com a permissao dela.
    const wrapper = montar({ linhas: [linhaDe("enviada")] });
    const conteudo = texto(wrapper).toLowerCase();
    for (const proibido of ["nome da mãe", "dependente", "pendência", "rg", "logradouro"]) {
      expect(conteudo, proibido).not.toContain(proibido);
    }
  });
});

describe("a listagem nao vira a segunda porta da revisao", () => {
  it("Deve_TerUmaAcaoPorLinha_E_ElaAbrirOProcesso", async () => {
    const wrapper = montar({ linhas: [linhaDe("enviada")] });
    const botoes = wrapper.findAll("tbody button");
    expect(botoes).toHaveLength(1);
    expect(botoes[0]?.text()).toBe("Abrir");
    await botoes[0]?.trigger("click");
    expect(wrapper.emitted("abrir")).toEqual([["processo-enviada"]]);
  });

  it("Deve_A_TabelaNaoConhecerRotaNemAcaoDaFicha", () => {
    // A guarda que faltava. A unica porta e o modal do processo; um `:to` ou um botao "Revisar" aqui
    // criaria a segunda, e a varredura que existia olhava so o modal.
    const codigo = semComentarios(readFileSync(join(PASTA, "ProcessosTabela.vue"), "utf8")).toLowerCase();
    for (const proibido of [
      "rotarevisaodaficha",
      "/ficha",
      "ficha/aprovar",
      "ficha/devolver",
      "aprovar",
      "devolver",
      "navigateto",
      "router.push"
    ]) {
      expect(codigo, proibido).not.toContain(proibido);
    }
  });
});

describe("a tabela usa a casca responsiva da casa", () => {
  it("Deve_EnvolverEmResponsiveTableShell_E_NaoTerMediaQueryPropria", () => {
    // A casca global da rolagem tambem GRUDA a coluna de acoes na direita em <=768px. Sem ela, o
    // botao "Abrir" saia da tela no celular — defeito que existia antes desta entrega.
    const wrapper = montar();
    expect(wrapper.find(".responsive-table-shell").exists()).toBe(true);

    const fonte = readFileSync(join(PASTA, "ProcessosTabela.vue"), "utf8");
    expect(semComentarios(fonte)).not.toContain("@media");
    expect(semComentarios(fonte)).not.toContain("v-table__wrapper");
  });

  it("Deve_O_EstadoVazioFicarForaDaCasca", async () => {
    // Dentro da casca, `min-width: 680px` empurra o texto para fora da area visivel em 390px.
    const wrapper = montar({ linhas: [], total: 0 });
    expect(wrapper.find(".responsive-table-shell").exists()).toBe(false);
    expect(wrapper.find(".vazio").exists()).toBe(true);
  });
});

describe("o resultado e anunciado", () => {
  it("Deve_ManterARegiaoVivaSempreMontada", () => {
    // Regiao que nasce junto com o texto costuma nao ser anunciada — e anunciar e o ponto.
    const vazia = montar({ linhas: [], total: 0 });
    const regiaoVazia = vazia.find('[role="status"]');
    expect(regiaoVazia.exists()).toBe(true);
    expect(regiaoVazia.attributes("aria-live")).toBe("polite");
    expect(regiaoVazia.text()).toBe("");

    const cheia = montar({ linhas: [linhaDe("enviada"), linhaDe("devolvida")], total: 7 });
    expect(cheia.find('[role="status"]').text()).toBe("Mostrando 1–2 de 7");
  });

  it("Deve_O_EstadoVazioDizerSeHaRecorte", () => {
    // "Nao ha nada" e "nada NESTE recorte" pedem acoes diferentes de quem le.
    expect(texto(montar({ linhas: [], total: 0, filtrado: false }))).toContain(
      "Nenhum processo de admissão nesta empresa"
    );
    const filtrada = texto(montar({ linhas: [], total: 0, filtrado: true }));
    expect(filtrada).toContain("Nenhum processo neste recorte");
    expect(filtrada).toContain("Limpe o filtro");
  });
});
