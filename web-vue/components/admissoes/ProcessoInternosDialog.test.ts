import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import { VSelect } from "vuetify/components";
import * as directives from "vuetify/directives";
import { situacaoExameSchema, type DadosInternosDto } from "@padaria/shared";
import ProcessoInternosDialog from "~/components/admissoes/ProcessoInternosDialog.vue";

/**
 * ADM-003 — o select do exame tem de emitir o VALOR do enum, nunca o rotulo.
 *
 * Este arquivo existe por causa de um defeito que so apareceu em navegador real. O `v-select` usava
 * itens primitivos com `item-title` FUNCAO e sem `item-value`; nessa combinacao o Vuetify grava o
 * ROTULO no `v-model`. A tela mandava `"ASO apto"`, o contrato so aceita `aso_apto`, e o servidor
 * devolvia 400. Como o convite ao candidato exige ASO apto, o fluxo INTEIRO de admissao ficava
 * inalcancavel pela interface.
 *
 * Nenhum teste pegava: os de integracao chamam a rota ja com o valor certo do enum, e nenhum teste
 * de componente montava este dialogo. A prova aqui clica na opcao pelo ROTULO que a pessoa ve e
 * confere o que sai no `emit` contra o schema Zod do CONTRATO — nao contra uma string escrita a mao
 * no teste. E o mesmo schema que devolvia 400 quando chegava o rotulo.
 */

const INTERNOS: DadosInternosDto = {
  versao: 1,
  dataAdmissao: "2026-11-03",
  ctpsNumero: null,
  ctpsSerie: null,
  ctpsUf: null,
  pisPasepNit: null,
  exameTipo: null,
  exameClinica: null,
  exameUnidade: null,
  exameComplementares: null,
  exameAgendadoPara: null,
  exameResponsavelNome: null,
  exameResponsavelTelefone: null,
  observacoesRh: null,
  exameSituacao: "pendente",
  exameExigeAtencao: true,
  exameAtualizadoPorNome: null,
  exameAtualizadoEm: null
};

beforeAll(() => {
  // O `v-select` abre um `v-menu`, que instancia estes observadores e le o viewport — nada disso
  // existe no happy-dom. Mesmos stubs de `ProcessoDetalheDialog.test.ts`.
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

function montar(internos: DadosInternosDto = INTERNOS) {
  const vuetify = createVuetify({ components, directives });
  return mount(ProcessoInternosDialog, {
    attachTo: document.body,
    global: { plugins: [vuetify], stubs: { transition: false } },
    props: { aberto: true, internos, salvando: false, erro: "" }
  });
}

async function assentar() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
}

/**
 * Abre o select do exame e escolhe a opcao pelo rotulo VISIVEL, como a pessoa faria.
 *
 * O menu e aberto pela propriedade `menu` do proprio `VSelect`: no happy-dom nem um `click()` cru
 * nem um `trigger("click")` no `.v-field` chegam a abrir o overlay. O que esta prova precisa e o
 * CAMINHO DE VOLTA — clicar num item pelo texto que a pessoa le e conferir o que o `v-model` guardou.
 */
async function escolherExame(tela: ReturnType<typeof montar>, rotulo: string) {
  const select = tela.findComponent(VSelect);
  expect(select.exists(), "select do exame nao encontrado").toBe(true);
  select.vm.menu = true;
  await assentar();

  const opcao = [...document.querySelectorAll(".v-overlay-container .v-list-item")].find(
    (item) => item.textContent?.trim() === rotulo
  );
  if (!opcao) {
    const vistas = [...document.querySelectorAll(".v-overlay-container .v-list-item")].map((i) =>
      i.textContent?.trim()
    );
    throw new Error(`opcao "${rotulo}" nao encontrada. Vistas: ${JSON.stringify(vistas)}`);
  }
  (opcao as HTMLElement).click();
  await assentar();
}

describe("ProcessoInternosDialog — exame admissional", () => {
  it("Deve_EmitirOValorDoEnum_Quando_EscolherPeloRotulo", async () => {
    const tela = montar();
    await assentar();

    await escolherExame(tela, "ASO apto");

    const botao = [...document.querySelectorAll(".v-overlay__content button")].find(
      (b) => b.textContent?.trim() === "Salvar"
    );
    if (!botao) throw new Error("botao Salvar nao encontrado");
    (botao as HTMLElement).click();
    await assentar();

    const emitido = tela.emitted("salvar");
    expect(emitido, "o dialogo nao emitiu `salvar`").toBeTruthy();

    // O segundo argumento do emit e a situacao do exame.
    const exame = emitido?.[0]?.[1];
    expect(exame).toBe("aso_apto");
    // E o contrato real precisa aceitar: e ele quem devolvia 400 com o rotulo.
    expect(() => situacaoExameSchema.parse(exame)).not.toThrow();

    tela.unmount();
  });

  // Teto proprio, e nao o padrao de 5s: este caso monta e desmonta o dialogo SEIS vezes, uma por
  // situacao do exame, e cada volta espera o overlay do Vuetify assentar. Sozinho leva ~2s; dentro
  // da suite completa do front, com 40 arquivos disputando CPU, estourou — falha de RELOGIO, nunca
  // de regra. Mesmo remedio que a suite de produtos ja levou (2e1dc3a).
  it("Deve_ValerParaTodasAsSituacoes_E_NuncaEmitirRotulo", async () => {
    // Uma so situacao provaria pouco: o defeito era do binding, e valeria para qualquer opcao.
    for (const [rotulo, valor] of [
      ["Pendente", "pendente"],
      ["Guia entregue", "guia_entregue"],
      ["Agendado", "agendado"],
      ["ASO apto", "aso_apto"],
      ["ASO não apto", "aso_nao_apto"],
      ["Exige ação", "exige_acao"]
    ] as const) {
      // `internos` comeca noutra situacao, senao `exameMudou` e falso e o emit vem nulo.
      const partida = valor === "pendente" ? "agendado" : "pendente";
      const tela = montar({ ...INTERNOS, exameSituacao: partida });
      await assentar();

      await escolherExame(tela, rotulo);

      const botao = [...document.querySelectorAll(".v-overlay__content button")].find(
        (b) => b.textContent?.trim() === "Salvar"
      );
      (botao as HTMLElement | undefined)?.click();
      await assentar();

      expect(tela.emitted("salvar")?.[0]?.[1], `${rotulo} deveria virar ${valor}`).toBe(valor);
      tela.unmount();
      document.body.innerHTML = "";
    }
  }, 60_000);

  it("Deve_MostrarOAvisoDoExame_Quando_EscolherAsoApto", async () => {
    // O aviso comparava com `aso_apto` e nunca casava enquanto o model guardava o rotulo — era o
    // segundo sintoma do mesmo defeito, e serve de prova cruzada de que o valor certo chegou.
    const tela = montar();
    await assentar();

    await escolherExame(tela, "ASO apto");

    const conteudo = document.querySelector(".v-overlay__content")?.textContent ?? "";
    expect(conteudo).toContain("Se o processo estiver pausado, ele será retomado.");

    tela.unmount();
  });
});
