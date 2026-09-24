// ADM-003 V5 — a decisao do DP: aprovar ou devolver, num lugar so.
//
// Monta o componente real com o Vuetify real, como o teste do modal do processo: os dois dialogos
// sao overlays de verdade, e um stub provaria so o stub. Os tres globais abaixo cobrem o que o
// happy-dom nao tem e o VOverlay usa.
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import type { SituacaoFicha } from "@padaria/shared";
import FichaRevisaoDecisao from "~/components/admissoes/FichaRevisaoDecisao.vue";

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

function montar(cenario: { situacao?: SituacaoFicha; podeRevisar?: boolean; processando?: boolean } = {}) {
  const vuetify = createVuetify({ components, directives });
  return mount(FichaRevisaoDecisao, {
    attachTo: document.body,
    global: { plugins: [vuetify], stubs: { transition: false } },
    props: {
      situacao: cenario.situacao ?? "enviada",
      podeRevisar: cenario.podeRevisar ?? true,
      processando: cenario.processando ?? false
    }
  });
}

/** Botoes por rotulo INTEIRO, no documento todo — os dialogos sao teleportados para fora do wrapper. */
function botao(rotulo: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((b) => b.textContent?.replace(/\s+/gu, " ").trim() === rotulo);
}

/** O dialogo ATIVO. O conteudo fica no DOM durante a transicao de saida; a classe `--active` nao. */
function dialogoAberto(): HTMLElement | null {
  return document.querySelector(".v-dialog.v-overlay--active .v-overlay__content");
}

async function assentar() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
}

describe("os botoes so existem quando ha decisao a tomar", () => {
  it("Deve_NaoRenderizarNada_Quando_FichaNaoEstaEnviada", () => {
    for (const situacao of ["rascunho", "devolvida", "aprovada"] as const) {
      const wrapper = montar({ situacao });
      expect(wrapper.find("footer").exists(), situacao).toBe(false);
      expect(botao("Aprovar ficha"), situacao).toBeUndefined();
      wrapper.unmount();
    }
  });

  it("Deve_NaoRenderizarNada_Quando_SemPermissaoDeRevisar", () => {
    // Ver a ficha e decidir sobre ela sao permissoes distintas. Quem so ve, le tudo e nao ve botao.
    const wrapper = montar({ podeRevisar: false });
    expect(wrapper.find("footer").exists()).toBe(false);
  });

  it("Deve_MostrarOsDoisBotoes_Quando_EnviadaEComPermissao", () => {
    const wrapper = montar();
    expect(wrapper.find("footer").attributes("aria-label")).toBe("Decisão sobre a ficha");
    expect(botao("Devolver para correção")).toBeDefined();
    expect(botao("Aprovar ficha")).toBeDefined();
  });
});

describe("aprovar pede confirmacao e emite um evento so", () => {
  it("Deve_EmitirAprovar_SoDepoisDeConfirmar", async () => {
    const wrapper = montar();
    botao("Aprovar ficha")?.click();
    await assentar();
    expect(dialogoAberto()?.textContent).toContain("Os dados conferem?");
    // Nada emitido ainda: o clique no botao da barra so abre a confirmacao.
    expect(wrapper.emitted("aprovar")).toBeUndefined();

    botao("Aprovar")?.click();
    await assentar();
    expect(wrapper.emitted("aprovar")).toHaveLength(1);
    expect(dialogoAberto()).toBeNull();
  });

  it("Deve_NaoEmitir_Quando_Voltar", async () => {
    const wrapper = montar();
    botao("Aprovar ficha")?.click();
    await assentar();
    botao("Voltar")?.click();
    await assentar();
    expect(wrapper.emitted("aprovar")).toBeUndefined();
    expect(dialogoAberto()).toBeNull();
  });
});

describe("devolver exige o texto que o candidato vai ler", () => {
  it("Deve_RecusarDevolverSemPendencias_E_DizerPorQue", async () => {
    const wrapper = montar();
    botao("Devolver para correção")?.click();
    await assentar();
    expect(dialogoAberto()?.textContent).toContain("Devolver para correção");

    botao("Devolver ficha")?.click();
    await assentar();
    expect(wrapper.emitted("devolver")).toBeUndefined();
    expect(dialogoAberto()?.textContent).toContain("Escreva o que precisa ser corrigido.");
  });

  it("Deve_EmitirDevolverComOTextoLimpo_Quando_HaPendencias", async () => {
    const wrapper = montar();
    botao("Devolver para correção")?.click();
    await assentar();

    const campo = dialogoAberto()?.querySelector("textarea");
    expect(campo).not.toBeNull();
    if (!campo) return;
    campo.value = "  Confira o número do RG.  ";
    campo.dispatchEvent(new Event("input"));
    await nextTick();

    botao("Devolver ficha")?.click();
    await assentar();
    // O texto vai aparado: espaco nas pontas nao e pendencia.
    expect(wrapper.emitted("devolver")).toEqual([["Confira o número do RG."]]);
    expect(dialogoAberto()).toBeNull();
  });

  it("Deve_ComecarComOCampoVazio_ACadaAbertura", async () => {
    // Devolucao anterior nao vaza para a proxima: quem abre de novo escreve de novo.
    montar();
    botao("Devolver para correção")?.click();
    await assentar();
    const campo = dialogoAberto()?.querySelector("textarea");
    if (!campo) throw new Error("textarea ausente");
    campo.value = "rascunho de pendencia";
    campo.dispatchEvent(new Event("input"));
    await nextTick();
    botao("Voltar")?.click();
    await assentar();

    botao("Devolver para correção")?.click();
    await assentar();
    expect(dialogoAberto()?.querySelector("textarea")?.value).toBe("");
  });

  it("Deve_DesabilitarOsBotoes_Enquanto_Processa", () => {
    montar({ processando: true });
    expect(botao("Devolver para correção")?.disabled).toBe(true);
    expect(botao("Aprovar ficha")?.disabled).toBe(true);
  });
});
