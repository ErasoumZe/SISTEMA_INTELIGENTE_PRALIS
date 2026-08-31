// ADM-003 — o detalhe do processo virou MODAL CENTRAL, e e o unico caminho de detalhe.
//
// Monta o componente REAL com o Vuetify REAL. Nao ha stub de `v-dialog`: metade do que este teste
// precisa provar (Escape, clique fora, foco) e comportamento do overlay, e um stub provaria apenas
// que o stub funciona. Por isso o `vitest.config.ts` passou a inlinar o `vuetify`.
//
// O que os tres globais abaixo cobrem: `ResizeObserver`/`IntersectionObserver` faltam no happy-dom e
// o VOverlay os instancia; `visualViewport` e lido pela estrategia de posicionamento.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import type { HistoricoProcessoDto, ProcessoDetalheDto, StatusProcesso } from "@padaria/shared";
import ProcessoDetalheDialog from "~/components/admissoes/ProcessoDetalheDialog.vue";

const PASTA = dirname(fileURLToPath(import.meta.url));

/** Mesma limpeza das guardas de `tests/unit`: comentario nao e codigo. */
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
  vi.stubGlobal("visualViewport", {
    width: 1280,
    height: 800,
    offsetLeft: 0,
    offsetTop: 0,
    scale: 1,
    addEventListener() {},
    removeEventListener() {}
  });
});

beforeEach(() => {
  document.body.innerHTML = "";
});

/** Um processo `iniciado`, vindo de teste efetivado. Os cenarios mudam so o que precisam. */
function processoDe(status: StatusProcesso): ProcessoDetalheDto {
  return {
    id: "processo-1",
    origem: "teste_efetivado",
    status,
    situacao: status === "iniciado" ? "ativo" : status === "pausado" ? "pausado" : "inativo",
    versao: 3,
    testeId: "teste-1",
    nomeCompleto: "Maria Aparecida da Silva",
    cpfMascarado: "***.***.***-**",
    funcaoNome: "PADEIRO",
    turnoEtiqueta: "M",
    turnoRotulo: "Manhã",
    turnoHoraInicio: "06:00:00",
    turnoHoraFim: "14:00:00",
    turnoDiasSemana: ["SEGUNDA", "TERCA"],
    jornadaHorario: null,
    internos: {
      versao: 3,
      dataAdmissao: "2026-09-01",
      ctpsNumero: "1234567",
      ctpsSerie: "001",
      ctpsUf: "SP",
      pisPasepNit: "12345678901",
      observacoesRh: null,
      exameSituacao: status === "pausado" ? "aso_nao_apto" : "aso_apto",
      exameExigeAtencao: status === "pausado",
      exameAtualizadoPorNome: "Ana do DP",
      exameAtualizadoEm: "2026-08-30T12:00:00.000Z"
    },
    criadoPorNome: "Ana do DP",
    criadoEm: "2026-08-28T12:00:00.000Z",
    atualizadoPorNome: "Ana do DP",
    atualizadoEm: "2026-08-30T12:00:00.000Z",
    canceladoPorNome: status === "cancelado" ? "Ana do DP" : null,
    canceladoEm: status === "cancelado" ? "2026-08-31T12:00:00.000Z" : null
  };
}

const HISTORICO: HistoricoProcessoDto[] = [
  {
    id: "evento-1",
    versao: 1,
    acao: "criado",
    atorNome: "Ana do DP",
    camposAlterados: [],
    ocorridoEm: "2026-08-28T12:00:00.000Z"
  }
];

type Cenario = {
  aberto?: boolean;
  processo?: ProcessoDetalheDto | null;
  podeCancelar?: boolean;
  podeEditarInternos?: boolean;
  carregando?: boolean;
};

function montar(cenario: Cenario = {}) {
  const vuetify = createVuetify({ components, directives });
  return mount(ProcessoDetalheDialog, {
    attachTo: document.body,
    // `transition: false` desliga o stub de `<Transition>` do test-utils. Com ele ligado o `ref` do
    // scrim nao e preenchido, e o `closeConditional` do VOverlay — que exige `e.target === scrimEl`
    // — recusa qualquer clique fora: o teste de backdrop passaria a provar o stub, nao o modal.
    global: { plugins: [vuetify], stubs: { transition: false } },
    props: {
      aberto: cenario.aberto ?? true,
      processo: cenario.processo === undefined ? processoDe("iniciado") : cenario.processo,
      historico: HISTORICO,
      podeCancelar: cenario.podeCancelar ?? true,
      podeEditarInternos: cenario.podeEditarInternos ?? true,
      processando: false,
      carregando: cenario.carregando ?? false
    }
  });
}

/** O conteudo do dialogo e teleportado para fora do wrapper — a leitura tem que ser pelo `body`. */
function overlay(): HTMLElement | null {
  return document.querySelector(".v-dialog .v-overlay__content");
}

function textoDoModal(): string {
  return overlay()?.textContent?.replace(/\s+/gu, " ").trim() ?? "";
}

function botaoPorTexto(rotulo: string): HTMLElement | undefined {
  return [...(overlay()?.querySelectorAll("button") ?? [])].find((botao) => botao.textContent?.includes(rotulo));
}

/** Espera o `setTimeout(0)` da diretiva `click-outside` e o ciclo de render que ele dispara. */
async function assentar() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
}

// ===== abrir ====================================================================================

describe("o detalhe abre como modal central", () => {
  it("Deve_NaoRenderizarNada_Quando_Fechado", () => {
    montar({ aberto: false });
    expect(document.querySelector(".v-dialog")).toBeNull();
  });

  it("Deve_AbrirDialogoCentral_Quando_Aberto", () => {
    montar();
    const dialogo = document.querySelector(".v-dialog");
    expect(dialogo).not.toBeNull();
    // Modal, nao gaveta: `aria-modal` e o overlay do Vuetify, e o drawer nao tem nenhum dos dois.
    expect(dialogo?.getAttribute("aria-modal")).toBe("true");
    expect(document.querySelector(".v-navigation-drawer")).toBeNull();
  });

  it("Deve_MostrarTudoQueOPainelMostrava_Quando_Aberto", () => {
    montar();
    const texto = textoDoModal();
    for (const pedaco of [
      "Processo de admissão",
      "Status do processo",
      "Iniciado",
      "Situação",
      "Ativo porque a admissão está em andamento",
      "Maria Aparecida da Silva",
      "Período de teste efetivado",
      "Ver o teste",
      "***.***.***-**",
      "PADEIRO",
      "M · Manhã · seg, ter · 06:00–14:00",
      "Dados internos do DP",
      "Exame admissional",
      "PIS / PASEP / NIT",
      "Convite ao candidato",
      "Iniciado por Ana do DP",
      "Histórico",
      "Admissão iniciada"
    ]) {
      expect(texto, pedaco).toContain(pedaco);
    }
  });

  it("Deve_MostrarCarregando_Quando_ProcessoAindaNaoChegou", () => {
    // O painel antigo abria vazio: a prop `carregando` era passada e nao existia. Numa gaveta
    // encostada na borda isso passava; uma caixa em branco no meio da tela, nao.
    montar({ processo: null, carregando: true });
    expect(textoDoModal()).toContain("Carregando o processo");
  });
});

// ===== fechar ===================================================================================

describe("o modal fecha pelos tres caminhos", () => {
  it("Deve_EmitirFechar_Quando_CliqueNoX", async () => {
    const wrapper = montar();
    const x = overlay()?.querySelector<HTMLElement>('button[aria-label="Fechar"]');
    expect(x).toBeTruthy();
    x?.click();
    await nextTick();
    expect(wrapper.emitted("fechar")).toHaveLength(1);
  });

  it("Deve_EmitirFechar_Quando_Escape", async () => {
    const wrapper = montar();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await assentar();
    expect(wrapper.emitted("fechar")).toHaveLength(1);
  });

  it("Deve_EmitirFechar_Quando_CliqueFora", async () => {
    const wrapper = montar();
    const scrim = document.querySelector<HTMLElement>(".v-overlay__scrim");
    expect(scrim).toBeTruthy();
    scrim?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    scrim?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await assentar();
    expect(wrapper.emitted("fechar")).toHaveLength(1);
  });

  it("Deve_DevolverOFoco_Quando_Fecha", async () => {
    // O Vuetify so refoca o `activatorEl`, e aqui a abertura e programatica: sem isto o foco cairia
    // no `body` e o teclado recomecaria do topo da pagina.
    const gatilho = document.createElement("button");
    gatilho.textContent = "Abrir";
    document.body.append(gatilho);
    gatilho.focus();
    expect(document.activeElement).toBe(gatilho);

    const wrapper = montar({ aberto: false });
    await wrapper.setProps({ aberto: true });
    await assentar();

    await wrapper.setProps({ aberto: false });
    await assentar();
    expect(document.activeElement).toBe(gatilho);
  });
});

// ===== acoes por status e por permissao =========================================================

describe("as acoes seguem o status e a permissao", () => {
  it("Deve_OferecerCancelarEEditar_Quando_Iniciado", () => {
    montar({ processo: processoDe("iniciado") });
    expect(botaoPorTexto("Cancelar e arquivar")).toBeTruthy();
    expect(botaoPorTexto("Editar")).toBeTruthy();
  });

  it("Deve_ManterCancelar_Quando_Pausado", () => {
    // A pausa PRECISA de saida: o servidor recusa so `cancelado`, e um processo parado por ASO nao
    // apto e justamente um dos que o DP quer encerrar.
    montar({ processo: processoDe("pausado") });
    expect(botaoPorTexto("Cancelar e arquivar")).toBeTruthy();
    // E continua editavel — e registrando o ASO apto que ele volta a andar.
    expect(botaoPorTexto("Editar")).toBeTruthy();
    expect(textoDoModal()).toContain("Pausado porque o exame admissional voltou não apto");
  });

  it("Deve_EsconderCancelarEEditar_Quando_Cancelado", () => {
    montar({ processo: processoDe("cancelado") });
    expect(botaoPorTexto("Cancelar e arquivar")).toBeUndefined();
    expect(botaoPorTexto("Editar")).toBeUndefined();
    expect(textoDoModal()).toContain("Cancelado por Ana do DP");
  });

  it("Deve_EsconderEdicaoInterna_Quando_Gerencia", async () => {
    // A Gerencia nao recebe `admissoes_processos_editar_internos`: CTPS, PIS/NIT e o exame sao do DP.
    // Ela CANCELA — o botao de cancelar tem permissao propria e continua la.
    const wrapper = montar({ podeEditarInternos: false });
    expect(botaoPorTexto("Editar")).toBeUndefined();
    expect(botaoPorTexto("Cancelar e arquivar")).toBeTruthy();
    // E nenhum caminho lateral: o bloco interno segue visivel, so que sem gatilho de edicao.
    expect(textoDoModal()).toContain("Dados internos do DP");
    expect(wrapper.emitted("editarInternos")).toBeUndefined();
  });

  it("Deve_ConfirmarAntesDeCancelar_Quando_CliqueEmCancelar", async () => {
    const wrapper = montar();
    botaoPorTexto("Cancelar e arquivar")?.click();
    await nextTick();
    // O clique sozinho nao cancela: abre a confirmacao que diz o que a acao faz.
    expect(wrapper.emitted("cancelar")).toBeUndefined();
    const confirmacao = [...document.querySelectorAll(".v-dialog .v-overlay__content")].at(-1);
    expect(confirmacao?.textContent).toContain("Isto não apaga o processo");

    const confirmar = [...(confirmacao?.querySelectorAll("button") ?? [])].find((botao) =>
      botao.textContent?.includes("Cancelar e arquivar")
    );
    confirmar?.click();
    await nextTick();
    expect(wrapper.emitted("cancelar")).toHaveLength(1);
  });
});

// ===== um caminho so ============================================================================

describe("o painel lateral saiu de verdade", () => {
  it("Deve_NaoExistirMaisOArquivoDoDrawer", () => {
    expect(existsSync(join(PASTA, "ProcessoDetalhePainel.vue"))).toBe(false);
  });

  it("Deve_NaoRestarNenhumDrawerDeProcesso_Nas_DuasTelasQueAbremODetalhe", () => {
    // As DUAS telas montavam o mesmo painel. Migrar so a de Processos deixaria a de Testes com um
    // segundo caminho de detalhe — que e exatamente o que a regra-mae do AGENTS.md proibe.
    for (const tela of ["AdmissoesProcessosPage.vue", "AdmissoesTestesPage.vue"]) {
      const codigo = readFileSync(join(PASTA, tela), "utf8");
      expect(codigo, tela).not.toContain("ProcessoDetalhePainel");
      expect([...codigo.matchAll(/<ProcessoDetalheDialog/gu)], tela).toHaveLength(1);
    }
  });

  it("Deve_SerModalNaoGaveta_E_SemPersistent", () => {
    // Sem os comentarios: o cabecalho do componente EXPLICA que era um drawer, e explicar o passado
    // nao e mante-lo. A varredura precisa julgar o codigo, nao a prosa.
    const codigo = semComentarios(readFileSync(join(PASTA, "ProcessoDetalheDialog.vue"), "utf8"));
    expect(codigo).not.toContain("v-navigation-drawer");
    // `persistent` bloquearia Escape e clique fora. Ele existe nos modais de FORMULARIO deste
    // modulo, que seguram dado nao salvo; um detalhe de leitura nao tem o que segurar.
    expect(codigo).not.toContain("persistent");
  });
});
