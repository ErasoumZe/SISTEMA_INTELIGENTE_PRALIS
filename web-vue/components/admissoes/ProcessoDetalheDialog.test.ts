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
import type { HistoricoProcessoDto, PainelConviteDto, ProcessoDetalheDto, StatusProcesso } from "@padaria/shared";
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
    cpfMascarado: "•••.•••.•••-••",
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
      exameTipo: "admissional",
      exameClinicaId: null,
      exameUnidadeId: null,
      exameClinica: "AcessaMed+",
      exameUnidade: "centro",
      exameComplementares: "nao",
      exameAgendadoPara: null,
      exameResponsavelNome: "Ana do DP",
      exameResponsavelTelefone: "3230316269",
      observacoesRh: null,
      exameSituacao: status === "pausado" ? "aso_nao_apto" : "aso_apto",
      exameExigeAtencao: status === "pausado",
      exameAtualizadoPorNome: "Ana do DP",
      exameAtualizadoEm: "2026-08-30T12:00:00.000Z"
    },
    efetivado: false,
    dataEfetivacao: null,
    fichaSituacao: null,
    criadoPorNome: "Ana do DP",
    criadoEm: "2026-08-28T12:00:00.000Z",
    atualizadoPorNome: "Ana do DP",
    atualizadoEm: "2026-08-30T12:00:00.000Z",
    canceladoPorNome: status === "cancelado" ? "Ana do DP" : null,
    canceladoEm: status === "cancelado" ? "2026-08-31T12:00:00.000Z" : null
  };
}

/** O valor real de `cpfTotalmenteMascarado()`: nenhum digito, nem parcial. */
const MASCARA = "•••.•••.•••-••";

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

/**
 * A admissao DIRETA e a unica origem com CPF proprio: na vinda de teste a coluna do processo e nula
 * por CHECK, e o documento mora no teste. So a direta pode revelar.
 */
function processoDireto(): ProcessoDetalheDto {
  return {
    ...processoDe("iniciado"),
    origem: "admissao_direta",
    testeId: null,
    turnoEtiqueta: "T",
    turnoRotulo: "Tarde"
  };
}

type Cenario = {
  aberto?: boolean;
  processo?: ProcessoDetalheDto | null;
  podeCancelar?: boolean;
  podeEfetivar?: boolean;
  podeEditarInternos?: boolean;
  /** O default e a tela de Testes, que TEM caminho de volta. A de Processos passa `false`. */
  podeVerTeste?: boolean;
  podeVerCpf?: boolean;
  cpfRevelado?: string | null;
  revelandoCpf?: boolean;
  carregando?: boolean;
  convite?: PainelConviteDto | null;
  podeConvidar?: boolean;
  tokenEmitido?: string | null;
  convitePendente?: boolean;
  /** O default e a tela de Testes, que NAO leva a ficha. A de Processos passa a permissao. */
  podeRevisarFicha?: boolean;
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
      podeEfetivar: cenario.podeEfetivar ?? false,
      podeEditarInternos: cenario.podeEditarInternos ?? true,
      podeVerTeste: cenario.podeVerTeste ?? true,
      podeVerCpf: cenario.podeVerCpf ?? false,
      cpfRevelado: cenario.cpfRevelado ?? null,
      revelandoCpf: cenario.revelandoCpf ?? false,
      processando: false,
      carregando: cenario.carregando ?? false,
      convite: cenario.convite ?? null,
      podeConvidar: cenario.podeConvidar ?? false,
      tokenEmitido: cenario.tokenEmitido ?? null,
      convitePendente: cenario.convitePendente ?? false,
      podeRevisarFicha: cenario.podeRevisarFicha ?? false
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

/**
 * Casa o rotulo INTEIRO, nao por substring: "Ver o teste de origem" casaria com `includes("Ver o
 * teste")` e um rotulo novo passaria despercebido por um teste que jura provar o antigo.
 */
function botaoPorTexto(rotulo: string): HTMLElement | undefined {
  return [...(overlay()?.querySelectorAll("button") ?? [])].find(
    (botao) => botao.textContent?.replace(/\s+/gu, " ").trim() === rotulo
  );
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
      MASCARA,
      "PADEIRO",
      "M · Manhã · seg, ter · 06:00–14:00",
      "Dados internos do DP",
      "Exame admissional",
      "PIS / PASEP / NIT",
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

describe("a efetivação manual", () => {
  it("Deve_OferecerEfetivar_Quando_ProcessoASOeDataEstaoProntosMesmoSemFicha", async () => {
    const wrapper = montar({ podeEfetivar: true });
    const botao = botaoPorTexto("Efetivar colaborador");
    expect(botao).toBeTruthy();

    botao?.click();
    await nextTick();
    expect(wrapper.emitted("efetivar")).toHaveLength(1);
  });

  it("Deve_NaoOferecerEfetivar_Quando_FaltaDataDeAdmissao", () => {
    const processo = processoDe("iniciado");
    processo.internos.dataAdmissao = null;
    montar({ processo, podeEfetivar: true });
    expect(botaoPorTexto("Efetivar colaborador")).toBeUndefined();
  });

  it("Deve_NaoOferecerEfetivar_Quando_UsuarioNaoTemPermissao", () => {
    montar({ podeEfetivar: false });
    expect(botaoPorTexto("Efetivar colaborador")).toBeUndefined();
  });
});

// ===== "Ver o teste": so onde ha para onde ir ===================================================

describe("o caminho de volta ao teste so aparece onde ele existe", () => {
  it("Deve_OferecerVerOTeste_Quando_A_TelaSabeAbrirOTeste", async () => {
    // Contexto da tela de Testes: ela monta o modal e escuta `verTeste` com `voltarAoTeste`.
    const wrapper = montar({ podeVerTeste: true });
    const botao = botaoPorTexto("Ver o teste");
    expect(botao).toBeTruthy();

    botao?.click();
    await nextTick();
    expect(wrapper.emitted("verTeste")).toHaveLength(1);
  });

  it("Deve_NaoRenderizarVerOTeste_Quando_A_TelaNaoTemParaOndeLevar", () => {
    // Contexto da tela de Processos: nao ha rota de processo para um teste especifico. O botao
    // renderizava e emitia para o vazio — clicar nao fazia nada, e nada explicava por que.
    montar({ podeVerTeste: false });
    expect(botaoPorTexto("Ver o teste")).toBeUndefined();
    // Ancora positiva: sem ela, um modal que nem renderizasse passaria neste teste — `overlay()`
    // devolveria `null` e a assercao negativa ficaria verde por vacuidade.
    expect(textoDoModal()).toContain("Período de teste efetivado");
  });

  it("Deve_NaoRenderizarVerOTeste_Quando_AdmissaoDireta_NaoTemTesteDeOrigem", () => {
    // Esta guarda e da OUTRA metade da condicao — `testeId` —, que ja existia antes da correcao.
    // Fica porque a admissao direta e o caso real em que nao ha teste nenhum para abrir.
    const direta = { ...processoDe("iniciado"), origem: "admissao_direta" as const, testeId: null };
    montar({ processo: direta, podeVerTeste: true });
    expect(botaoPorTexto("Ver o teste")).toBeUndefined();
    expect(textoDoModal()).toContain("Admissão direta");
  });
});

// ===== revelar CPF: ato explicito, auditado, e so dentro do modal ===============================

// O servidor devolve DIGITOS CRUS; a tela e quem formata. O fixture segue a realidade.
const CPF_CRU = "52998224725";
const CPF_FORMATADO = "529.982.247-25";

describe("o CPF so aparece quando alguem pede", () => {
  it("Deve_MostrarSoAMascara_Quando_NinguemPediu", () => {
    montar({ processo: processoDireto(), podeVerCpf: true });
    expect(textoDoModal()).toContain(MASCARA);
    expect(textoDoModal()).not.toContain(CPF_FORMATADO);
    // Mascara CONSTANTE, nunca parcial: a projecao nao carrega digito nenhum.
    expect(textoDoModal()).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/u);
    expect(botaoPorTexto("Ver CPF")).toBeTruthy();
  });

  it("Deve_NaoOferecerVerCpf_Quando_SemPermissaoDeVisualizar", () => {
    montar({ processo: processoDireto(), podeVerCpf: false });
    expect(botaoPorTexto("Ver CPF")).toBeUndefined();
    // E a mascara continua: esconder o botao nao pode esconder o campo.
    expect(textoDoModal()).toContain(MASCARA);
  });

  it("Deve_NaoOferecerVerCpf_Quando_OrigemEhTesteEfetivado", () => {
    // O processo vindo de teste NAO tem CPF proprio — a coluna e nula por CHECK e o servidor recusa
    // com 400. A mascara aparece porque a projecao resolve por `coalesce`; o botao nao pode.
    montar({ processo: processoDe("iniciado"), podeVerCpf: true });
    expect(textoDoModal()).toContain(MASCARA);
    expect(botaoPorTexto("Ver CPF")).toBeUndefined();
  });

  it("Deve_PedirUmaVezSo_Quando_CliqueDuplo", async () => {
    // Dois cliques no mesmo tick chegam antes de qualquer re-render: `disabled` sozinho nao segura.
    // Duas chamadas seriam dois eventos `cpf_revelado` na trilha para a mesma intencao.
    const wrapper = montar({ processo: processoDireto(), podeVerCpf: true });
    const botao = botaoPorTexto("Ver CPF");
    botao?.click();
    botao?.click();
    botao?.click();
    await nextTick();
    expect(wrapper.emitted("revelarCpf")).toHaveLength(1);
  });

  it("Deve_NaoPedir_Quando_A_ChamadaJaEstaEmCurso", async () => {
    const wrapper = montar({ processo: processoDireto(), podeVerCpf: true, revelandoCpf: true });
    botaoPorTexto("Ver CPF")?.click();
    await nextTick();
    expect(wrapper.emitted("revelarCpf")).toBeUndefined();
  });

  it("Deve_MostrarOCpf_E_SumirComOBotao_Quando_A_PaginaRevelou", () => {
    montar({ processo: processoDireto(), podeVerCpf: true, cpfRevelado: CPF_CRU });
    expect(textoDoModal()).toContain(CPF_FORMATADO);
    expect(textoDoModal()).not.toContain(MASCARA);
    // Revelado uma vez, nao ha o que pedir de novo — e nao ha como gerar segunda auditoria a toa.
    expect(botaoPorTexto("Ver CPF")).toBeUndefined();
    // O aviso de que a consulta foi registrada aparece junto.
    expect(textoDoModal()).toContain("registrada no histórico");
  });

  it("Deve_ManterSoAMascara_Quando_A_ChamadaFalha", async () => {
    // A pagina nao escreve `cpfRevelado` no erro; ela so desliga o `revelandoCpf`.
    const wrapper = montar({ processo: processoDireto(), podeVerCpf: true });
    botaoPorTexto("Ver CPF")?.click();
    await wrapper.setProps({ revelandoCpf: true });
    await wrapper.setProps({ revelandoCpf: false });

    expect(textoDoModal()).toContain(MASCARA);
    expect(textoDoModal()).not.toContain(CPF_FORMATADO);
    // E o botao volta a funcionar: falha nao pode travar a tela ate fechar o modal.
    botaoPorTexto("Ver CPF")?.click();
    await nextTick();
    expect(wrapper.emitted("revelarCpf")).toHaveLength(2);
  });

  it("Deve_VoltarAMascara_Quando_A_PaginaLimpaAoFechar", async () => {
    const wrapper = montar({ processo: processoDireto(), podeVerCpf: true, cpfRevelado: CPF_CRU });
    expect(textoDoModal()).toContain(CPF_FORMATADO);

    // E o que `fecharDetalhe` faz na pagina: fecha E zera o CPF revelado.
    await wrapper.setProps({ aberto: false, cpfRevelado: null });
    await assentar();
    await wrapper.setProps({ aberto: true });
    await assentar();

    expect(textoDoModal()).toContain(MASCARA);
    expect(textoDoModal()).not.toContain(CPF_FORMATADO);
    // Reabrir exige pedir de novo — e pedir de novo grava outra linha na trilha, como deve ser.
    expect(botaoPorTexto("Ver CPF")).toBeTruthy();
  });

  it("Deve_ManterOCpfSoDentroDoModal_Quando_Revelado", () => {
    montar({ processo: processoDireto(), podeVerCpf: true, cpfRevelado: CPF_CRU });
    // Fora do overlay nao pode haver rastro: nem no titulo do documento, nem em atributo nenhum.
    const foraDoModal = document.body.innerHTML.replace(overlay()?.outerHTML ?? "", "");
    expect(foraDoModal).not.toContain(CPF_FORMATADO);
    expect(document.title).not.toContain(CPF_FORMATADO);
    // Nem em `title`/`aria-label`/`alt` DENTRO do modal: o CPF e texto, nunca metadado copiavel.
    for (const atributo of ["title", "aria-label", "alt", "href", "value", "placeholder"]) {
      const comAtributo = [...(overlay()?.querySelectorAll(`[${atributo}]`) ?? [])];
      for (const no of comAtributo) {
        expect(no.getAttribute(atributo) ?? "", atributo).not.toContain(CPF_FORMATADO);
      }
    }
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

  it("Deve_EsconderEdicaoInterna_Quando_Gerencia", () => {
    // A Gerencia nao recebe `admissoes_processos_editar_internos`: CTPS, PIS/NIT e o exame sao do DP.
    // Ela CANCELA — o botao de cancelar tem permissao propria e continua la.
    montar({ podeEditarInternos: false });
    expect(botaoPorTexto("Editar")).toBeUndefined();
    expect(botaoPorTexto("Cancelar e arquivar")).toBeTruthy();
    // E nenhum caminho lateral: o bloco interno segue visivel, so que sem gatilho de edicao.
    expect(textoDoModal()).toContain("Dados internos do DP");
    expect(textoDoModal()).toContain("CTPS");
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
      // `semComentarios` porque comentar a montagem fora e' diferente de te-la: sem isto, envolver
      // o bloco em `<!-- -->` deixaria a contagem em 1 e a tela sem modal nenhum, com a suite verde.
      const codigo = semComentarios(readFileSync(join(PASTA, tela), "utf8"));
      expect(codigo, tela).not.toContain("ProcessoDetalhePainel");
      expect([...codigo.matchAll(/<ProcessoDetalheDialog/gu)], tela).toHaveLength(1);
    }
  });

  it("Deve_CadaTelaDeclararSeSabeAbrirOTeste", () => {
    // A prop e obrigatoria, entao o `nuxt typecheck` ja pegaria a ausencia. Esta guarda fixa o
    // VALOR de cada uma: e o par (tela, caminho) que o botao morto expos, e ele voltaria calado se
    // alguem copiasse a linha da tela de Testes para a de Processos.
    //
    // Por CONTAGEM e sem comentarios: os dois comentarios que explicam a escolha citam
    // `pode-ver-teste`, e um `toContain` no texto bruto nao distingue codigo de prosa nem recusaria
    // uma tela que declarasse os dois valores.
    const processos = semComentarios(readFileSync(join(PASTA, "AdmissoesProcessosPage.vue"), "utf8"));
    const testes = semComentarios(readFileSync(join(PASTA, "AdmissoesTestesPage.vue"), "utf8"));

    expect([...processos.matchAll(/:pode-ver-teste="false"/gu)]).toHaveLength(1);
    expect([...processos.matchAll(/:pode-ver-teste="true"/gu)]).toHaveLength(0);
    expect([...testes.matchAll(/:pode-ver-teste="true"/gu)]).toHaveLength(1);
    expect([...testes.matchAll(/:pode-ver-teste="false"/gu)]).toHaveLength(0);

    // E a tela que diz `true` precisa mesmo escutar o evento — senao o botao volta a ser morto.
    // O casamento para no `="` de proposito: `@ver-teste="() => voltar()"` e refactor legitimo, e
    // exigir um identificador simples faria a guarda gritar por cosmetica.
    expect(testes).toMatch(/@ver-teste="/u);
    expect(processos).not.toMatch(/@ver-teste="/u);
  });

  it("Deve_A_TelaDeTestesNaoEscutarEdicaoInterna_Porque_LaOBotaoNaoExiste", () => {
    // O espelho do botao morto: listener sem botao. `pode-editar-internos="false"` impede o
    // "Editar" de renderizar, entao `editarInternos` era inalcancavel dali — ninguem tinha como
    // dispara-lo. Editar mora na tela "Processos de admissao", que ja tem entrada de menu.
    //
    // O padrao aceita as QUATRO grafias validas de um listener em SFC — `@editar-internos`,
    // `@editarInternos`, e as duas com `v-on:` —, e nao exige o `=`, para que um modificador
    // (`.once`) tambem case. Casar so a grafia kebab provaria a ausencia de UMA escrita, e o
    // listener morto voltaria em camelCase com a suite verde.
    const ESCUTA_EDITAR_INTERNOS = /(?:@|v-on:)editar-?[Ii]nternos/u;

    const testes = semComentarios(readFileSync(join(PASTA, "AdmissoesTestesPage.vue"), "utf8"));
    expect(testes).toContain(':pode-editar-internos="false"');
    expect(testes).not.toMatch(ESCUTA_EDITAR_INTERNOS);
    // E a tela dona continua escutando — remover o listener morto nao pode ter levado o vivo junto.
    const processos = semComentarios(readFileSync(join(PASTA, "AdmissoesProcessosPage.vue"), "utf8"));
    expect(processos).toMatch(ESCUTA_EDITAR_INTERNOS);
  });

  it("Deve_A_ListagemNuncaTocarEmCpf", () => {
    // A tabela nao tem coluna de CPF, nem mascarada. O documento so existe no detalhe, e so depois
    // de um pedido explicito — PROJECT_BRAIN/42 D-4.
    const tabela = semComentarios(readFileSync(join(PASTA, "ProcessosTabela.vue"), "utf8"));
    expect(tabela.toLowerCase()).not.toContain("cpf");
  });

  it("Deve_A_PaginaRevelarPorPost_E_LimparAoFechar", () => {
    const pagina = semComentarios(readFileSync(join(PASTA, "AdmissoesProcessosPage.vue"), "utf8"));

    // POST, nunca GET: documento nao entra em URL. E sem query string na rota.
    expect(pagina).toMatch(/apiPost<\{ cpf: string \}>\(`\/api\/admissoes\/processos\/\$\{id\}\/cpf`/u);
    expect(pagina).not.toMatch(/apiGet[^\n]*\/cpf/u);
    expect(pagina).not.toMatch(/cpf[^\n]*[?&]\w+=/u);

    // Fechar limpa o CPF revelado da memoria da tela, e o modal chama justamente essa funcao.
    expect(pagina).toMatch(/function fecharDetalhe\(\)[\s\S]{0,200}?cpfRevelado\.value = null;/u);
    expect(pagina).toContain('@fechar="fecharDetalhe"');

    // O CPF revelado nao pode ir para lugar nenhum que sobreviva a tela. A varredura e por LINHA
    // que fala de CPF: banir os identificadores no arquivo inteiro seria falso — `useState` e como
    // a sessao chega aqui, e nada tem a ver com documento.
    const linhasComCpf = pagina.split("\n").filter((linha) => /cpf/iu.test(linha));
    expect(linhasComCpf.length).toBeGreaterThan(0);
    for (const fuga of ["localStorage", "sessionStorage", "useState", "navigateTo", "console."]) {
      expect(
        linhasComCpf.filter((linha) => linha.includes(fuga)),
        fuga
      ).toEqual([]);
    }
    // Nem para o aviso de rodape: `notificar` recebe texto fixo, nunca o documento.
    expect(pagina).not.toMatch(/notificar\([^)]*cpf/iu);
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

// ===== a ficha tem UMA porta, e ela leva para fora do modal ======================================

describe("a ficha do candidato tem uma porta so, e ela leva para a tela propria", () => {
  const PORTA = "Abrir ficha do DP";

  it("Deve_NaoMostrarAPorta_Quando_ATelaNaoLevaAFicha", () => {
    // `false` e o que a tela de Testes passa: dali o processo e so leitura, e a revisao e um ato que
    // mora na tela dona. Sem a porta, nao ha caminho — e nao ha botao que emita para o vazio.
    montar({ podeRevisarFicha: false });
    expect(botaoPorTexto(PORTA)).toBeUndefined();
    expect(textoDoModal()).not.toContain("Ficha do candidato");
  });

  it("Deve_MostrarAPorta_E_EmitirRevisarFicha_Quando_ATelaLeva", async () => {
    const wrapper = montar({ podeRevisarFicha: true });
    const porta = botaoPorTexto(PORTA);
    expect(porta).toBeDefined();
    porta?.click();
    await nextTick();
    expect(wrapper.emitted("revisarFicha")).toHaveLength(1);
  });

  it("Deve_OModalNaoCarregarAFicha_NemDependente_NemDecidir", () => {
    // A porta e a UNICA coisa da ficha que o modal conhece. Campo da ficha, lista de dependentes e
    // aprovar/devolver moram na tela de revisao; se algum voltar para ca, existem dois lugares para
    // o mesmo ato — e o modal, que ja passa de 600 linhas, vira o componente que o §4.5 proibe.
    // Por IDENTIFICADOR, nao por palavra: a frase da porta pode dizer "aprovar ou devolver" — o que
    // nao pode existir aqui e o contrato, o componente, a rota ou o campo da ficha.
    const codigo = semComentarios(readFileSync(join(PASTA, "ProcessoDetalheDialog.vue"), "utf8")).toLowerCase();
    for (const proibido of [
      "ficharevisao",
      "dependenterevisao",
      "ficha/aprovar",
      "ficha/devolver",
      "revisaopendencias",
      "semdependentes",
      "cpfinformado",
      "emit('aprovar')",
      "emit('devolver'"
    ]) {
      expect(codigo, proibido).not.toContain(proibido);
    }
  });

  it("Deve_CadaTelaDeclararSeLevaAFicha_E_SoAquelaQueLevaEscutar", () => {
    // Mesma guarda do `pode-ver-teste`, pelo mesmo motivo: a prop e obrigatoria, mas o VALOR e o que
    // separa a tela dona (Processos) da tela de leitura (Testes). Por contagem e sem comentarios.
    const processos = semComentarios(readFileSync(join(PASTA, "AdmissoesProcessosPage.vue"), "utf8"));
    const testes = semComentarios(readFileSync(join(PASTA, "AdmissoesTestesPage.vue"), "utf8"));

    expect([...processos.matchAll(/:pode-revisar-ficha="podeRevisarFicha"/gu)]).toHaveLength(1);
    expect([...processos.matchAll(/:pode-revisar-ficha="false"/gu)]).toHaveLength(0);
    expect([...testes.matchAll(/:pode-revisar-ficha="false"/gu)]).toHaveLength(1);
    expect([...testes.matchAll(/:pode-revisar-ficha="podeRevisarFicha"/gu)]).toHaveLength(0);

    // Quem leva escuta; quem nao leva nao tem listener morto. As quatro grafias de listener.
    const ESCUTA = /(?:@|v-on:)revisar-?[Ff]icha/u;
    expect(processos).toMatch(ESCUTA);
    expect(testes).not.toMatch(ESCUTA);

    // E a tela dona deriva a prop da permissao de VER a ficha, nao inventa uma quarta chave.
    expect(processos).toContain('"admissoes_processos_ver_ficha"');
  });

  it("Deve_ATelaDonaNavegarPeloUnicoMontadorDeRota", () => {
    // A rota da revisao e montada num lugar so (`rotaRevisaoDaFicha`). Uma string solta na pagina
    // continuaria apontando para a rota velha no dia em que ela mudasse.
    const processos = semComentarios(readFileSync(join(PASTA, "AdmissoesProcessosPage.vue"), "utf8"));
    expect(processos).toContain("rotaRevisaoDaFicha(");
    expect(processos).not.toMatch(/["'`]\/admissoes_processos\/\$\{[^}]+\}\/ficha/u);
  });
});

describe("o convite sai como LINK, e o token cru nunca aparece sozinho", () => {
  const TOKEN = "b".repeat(64);

  /** Painel de convite vigente — o estado em que o link recem-emitido aparece. */
  function painelVigente(): PainelConviteDto {
    return {
      situacao: "vigente",
      motivo: "",
      convite: {
        id: "11111111-1111-4111-8111-111111111111",
        expiraEm: "2026-09-17T12:00:00.000Z",
        criadoEm: "2026-09-03T12:00:00.000Z",
        criadoPorNome: "DP",
        avisoPrivacidadeVersao: "AVISO-TESTE-ADMISSAO-V1",
        expirado: false,
        primeiroAcessoEm: null,
        ultimoAcessoEm: null
      }
    };
  }

  function comLink(token: string | null = TOKEN) {
    return montar({ convite: painelVigente(), podeConvidar: true, tokenEmitido: token });
  }

  /**
   * Troca SO `navigator.clipboard`. Stubar o `navigator` inteiro derruba o proprio Vuetify, que le
   * `navigator.userAgent` ao montar — o teste morreria antes de chegar na copia.
   */
  function definirClipboard(valor: { writeText: (texto: string) => Promise<void> } | undefined) {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: valor });
  }

  function linkNaTela(): string {
    return overlay()?.querySelector(".detalhe-convite__link")?.textContent?.trim() ?? "";
  }

  function avisoDaCopia(): string {
    return overlay()?.querySelector(".detalhe-convite__copia")?.textContent?.trim() ?? "";
  }

  it("Deve_MostrarOLinkCompleto_E_NuncaOTokenSozinho", async () => {
    const tela = comLink();
    await assentar();

    const link = linkNaTela();
    // A origem e a do navegador do DP — nao ha configuracao, e nao deve haver.
    expect(link).toBe(`${window.location.origin}/admissao#t=${TOKEN}`);
    expect(link).toContain("/admissao#t=");

    // O token cru, isolado, nao pode estar em lugar nenhum do modal: era so isso que a tela dava.
    const texto = textoDoModal();
    expect(texto).toContain(link);
    expect(texto.replace(link, "")).not.toContain(TOKEN);

    tela.unmount();
  });

  it("Deve_ManterOLinkForaDoAlerta_Porque_AlertaEhRegiaoAssertiva", async () => {
    // O `v-alert` do Vuetify emite `role="alert"` fixo. Link dentro dele faria o leitor de tela
    // interromper tudo para soletrar a URL inteira, com o token.
    const tela = comLink();
    await assentar();

    const alerta = overlay()?.querySelector(".v-alert[role='alert']");
    expect(alerta?.textContent).toContain("Copie agora.");
    expect(alerta?.textContent ?? "").not.toContain(TOKEN);

    tela.unmount();
  });

  it("Deve_ExibirOLinkSemVirarCampoDeFormulario_Nem_Ancora", async () => {
    // `input readonly` continua sendo submetido e oferecido ao autofill; `a href` levaria o
    // endereco para a barra de status, o menu de contexto e o historico do DP.
    const tela = comLink();
    await assentar();

    const caixa = overlay()?.querySelector(".detalhe-convite__link");
    expect(caixa?.tagName).toBe("CODE");
    expect(overlay()?.querySelector("input[value]")).toBeNull();
    expect(overlay()?.querySelector(`a[href*="${TOKEN}"]`)).toBeNull();

    tela.unmount();
  });

  it("Deve_CopiarOLinkInteiro_E_Anunciar_Quando_A_CopiaFunciona", async () => {
    const escritas: string[] = [];
    definirClipboard({
      writeText: async (texto: string) => {
        escritas.push(texto);
      }
    });

    const tela = comLink();
    await assentar();
    botaoPorTexto("Copiar link")?.click();
    await assentar();

    // O que vai para a area de transferencia e o LINK, nao o token.
    expect(escritas).toEqual([`${window.location.origin}/admissao#t=${TOKEN}`]);
    expect(avisoDaCopia()).toBe("Link copiado.");

    definirClipboard(undefined);
    tela.unmount();
  });

  it("Deve_DizerQueNaoCopiou_E_MandarCopiarAMao_Quando_A_CopiaFalha", async () => {
    // Fora de contexto seguro `navigator.clipboard` nem existe, e `execCommand` some nos
    // navegadores novos. O que nao pode e a tela dizer que copiou.
    definirClipboard(undefined);

    const tela = comLink();
    await assentar();
    botaoPorTexto("Copiar link")?.click();
    await assentar();

    expect(avisoDaCopia()).toBe("Não foi possível copiar automaticamente. Selecione o link acima e copie.");
    expect(avisoDaCopia()).not.toContain("copiado");
    // E o link continua na tela para a copia manual ser possivel de verdade.
    expect(linkNaTela()).toContain("/admissao#t=");

    definirClipboard(undefined);
    tela.unmount();
  });

  it("Deve_AnunciarORresultadoEmRegiaoViva_Sem_MudarORotuloDoBotao", async () => {
    // O rotulo do botao fica estavel: nome acessivel que muda quebra comando de voz, e o resultado
    // tem lugar proprio. A regiao nasce montada, senao o anuncio nao sai (mesma doutrina do CPF).
    const tela = comLink();
    await assentar();

    const regiao = overlay()?.querySelector(".detalhe-convite__copia");
    expect(regiao?.getAttribute("role")).toBe("status");
    expect(regiao?.textContent?.trim()).toBe("");
    expect(botaoPorTexto("Copiar link")).toBeTruthy();

    tela.unmount();
  });

  it("Deve_TrocarOLinkExibido_Quando_UmNovoConviteEhGerado", async () => {
    // Rotacao: o backend revoga o anterior ao emitir. A tela tem de mostrar o novo, e nao pode
    // deixar o aviso da copia do link velho valendo para o novo.
    definirClipboard({ writeText: async () => {} });
    const tela = comLink();
    await assentar();
    botaoPorTexto("Copiar link")?.click();
    await assentar();
    expect(avisoDaCopia()).toBe("Link copiado.");

    const novo = "c".repeat(64);
    await tela.setProps({ tokenEmitido: novo });
    await assentar();

    expect(linkNaTela()).toBe(`${window.location.origin}/admissao#t=${novo}`);
    expect(linkNaTela()).not.toContain(TOKEN);
    expect(avisoDaCopia()).toBe("");

    definirClipboard(undefined);
    tela.unmount();
  });

  it("Deve_NaoMostrarLinkNemBotao_Quando_NaoHaTokenNaMemoria", async () => {
    // Reabrir o modal nao devolve o link: nao existe rota que o recupere.
    const tela = comLink(null);
    await assentar();

    expect(overlay()?.querySelector(".detalhe-convite__link")).toBeNull();
    expect(botaoPorTexto("Copiar link")).toBeFalsy();
    expect(textoDoModal()).toContain("Convite ao candidato");

    tela.unmount();
  });

  it("Deve_A_TelaDoDpNaoGuardarNemLogarOLink", () => {
    // Ate aqui NENHUMA varredura protegia o lado do DP — so a tela do candidato tinha. Agora o que
    // vive nessa tela e um link pronto para colar, e um `console.log` dele nao quebraria nada.
    for (const arquivo of ["ProcessoDetalheDialog.vue", "AdmissoesProcessosPage.vue"]) {
      const codigo = semComentarios(readFileSync(join(PASTA, arquivo), "utf8"));
      const linhas = codigo.split("\n").filter((linha) => /token|linkDoCandidato|linkDoConvite/iu.test(linha));
      expect(linhas.length, arquivo).toBeGreaterThan(0);
      for (const fuga of ["localStorage", "sessionStorage", "useState", "document.cookie", "console."]) {
        expect(
          linhas.filter((linha) => linha.includes(fuga)),
          `${arquivo} ${fuga}`
        ).toEqual([]);
      }
    }
  });

  it("Deve_O_SnackbarDaPaginaNuncaCarregarOLink", () => {
    // `notificar` recebe texto fixo — a mesma regra que ja vale para o CPF. O snackbar e uma
    // regiao viva: passar o link para ele seria mandar o leitor de tela soletrar o segredo.
    const pagina = semComentarios(readFileSync(join(PASTA, "AdmissoesProcessosPage.vue"), "utf8"));
    // Texto fixo com a palavra "link" e legitimo ("Copie o link agora."). O que nao pode e o
    // VALOR entrar: identificador do segredo ou interpolacao dentro da chamada.
    expect(pagina).not.toMatch(/notificar\([^)]*(?:tokenEmitido|linkDoCandidato|\$\{)/u);
  });
});
