import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { MensagemAdminDoOperador } from "@padaria/shared/mensagens-admin";
import MensagemAdminPopup from "./MensagemAdminPopup.vue";

function mensagem(over: Partial<MensagemAdminDoOperador> = {}): MensagemAdminDoOperador {
  return {
    entregaId: "11111111-1111-4111-8111-111111111111",
    mensagemId: "11111111-1111-4111-8111-111111111112",
    titulo: "Fechem o caixa as 18h",
    corpo: "Hoje o fechamento e antecipado.\nPassem no cofre antes de sair.",
    pdvId: null,
    entregueEm: "2026-09-15T08:00:00.000Z",
    visualizadaEm: null,
    confirmadaEm: null,
    fechadaEm: null,
    criadoEm: "2026-09-15T07:55:00.000Z",
    ...over
  };
}

const stubs = {
  "v-dialog": { template: "<div v-if='modelValue'><slot /></div>", props: ["modelValue"] },
  "v-card": { template: "<article><slot /></article>" },
  "v-card-title": { template: "<h2><slot /></h2>" },
  "v-card-text": { template: "<div><slot /></div>" },
  "v-card-actions": { template: "<div><slot /></div>" },
  "v-spacer": { template: "<span />" },
  "v-icon": { template: "<i><slot /></i>" },
  "v-btn": { template: "<button type='button' @click=\"$emit('click')\"><slot /></button>" }
};

function montar(props: { mensagem: MensagemAdminDoOperador | null }) {
  return mount(MensagemAdminPopup, { props, global: { stubs } });
}

describe("MensagemAdminPopup", () => {
  it("nao aparece quando nao ha mensagem na fila", () => {
    const tela = montar({ mensagem: null });
    expect(tela.text()).toBe("");
  });

  it("mostra titulo e corpo, preservando as quebras de linha do autor", () => {
    const tela = montar({ mensagem: mensagem() });
    expect(tela.text()).toContain("Fechem o caixa as 18h");
    expect(tela.text()).toContain("Passem no cofre antes de sair.");
  });

  // Ver a mensagem na tela E a visualizacao. Sem este emit, o administrador nao distinguiria
  // "nao chegou" de "chegou, ficou na tela e a pessoa ignorou".
  it("avisa que foi visualizada assim que aparece", () => {
    const tela = montar({ mensagem: mensagem() });
    expect(tela.emitted("visualizada")?.[0]).toEqual(["11111111-1111-4111-8111-111111111111"]);
  });

  it("nao repete a visualizacao de quem ja tinha visto", () => {
    const tela = montar({ mensagem: mensagem({ visualizadaEm: "2026-09-15T08:01:00.000Z" }) });
    expect(tela.emitted("visualizada")).toBeUndefined();
  });

  it("emite fechar e confirmar em eventos distintos: Fechar adia, Entendi encerra", async () => {
    const tela = montar({ mensagem: mensagem() });
    const botoes = tela.findAll("button");
    expect(botoes).toHaveLength(2);

    await botoes[0]!.trigger("click");
    await botoes[1]!.trigger("click");

    expect(tela.emitted("fechar")?.[0]).toEqual(["11111111-1111-4111-8111-111111111111"]);
    expect(tela.emitted("confirmar")?.[0]).toEqual(["11111111-1111-4111-8111-111111111111"]);
  });

  // O operador precisa ler, na propria tela, que fechar nao resolve — senao ele dispensa achando
  // que respondeu e o administrador continua cobrando.
  it("diz que fechar apenas adia", () => {
    const tela = montar({ mensagem: mensagem() });
    expect(tela.text()).toContain("Fechar apenas adia");
  });
});
