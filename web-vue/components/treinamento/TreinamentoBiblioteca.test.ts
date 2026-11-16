import { mount } from "@vue/test-utils";
import { computed, defineComponent, h, ref } from "vue";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GRUPOS_VIDEOS } from "~/utils/videos-ajuda";

beforeAll(() => {
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
});

const { default: TreinamentoBiblioteca } = await import("./TreinamentoBiblioteca.vue");

// Campo de busca de verdade (input + v-model), sem o Vuetify: o teste prova a pagina, nao o campo.
const CampoStub = defineComponent({
  props: { modelValue: { type: String, default: "" } },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    return () =>
      h("input", {
        "data-teste": "busca",
        value: props.modelValue,
        onInput: (evento: Event) => emit("update:modelValue", (evento.target as HTMLInputElement).value)
      });
  }
});
const BotaoStub = defineComponent({
  setup(_, { slots, attrs }) {
    return () => h("button", { type: "button", class: attrs["class"], onClick: attrs["onClick"] }, slots.default?.());
  }
});
const PlayerStub = defineComponent({
  props: { grupo: { type: Object, required: true }, inicio: { type: Number, required: true } },
  setup(props) {
    return () =>
      h("div", {
        "data-teste": "player",
        "data-grupo": (props.grupo as { id: string }).id,
        "data-videos": (props.grupo as { videos: unknown[] }).videos.length,
        "data-inicio": props.inicio
      });
  }
});

const caixa = GRUPOS_VIDEOS.find((grupo) => grupo.id === "caixa")!;

function montar(telas: { id: string }[]) {
  return mount(TreinamentoBiblioteca, {
    props: { telas },
    global: {
      stubs: { "v-text-field": CampoStub, "v-btn": BotaoStub, "v-icon": true, AppVideoTelaCheia: PlayerStub }
    }
  });
}

describe("TreinamentoBiblioteca", () => {
  it("sem grupo liberado pelo menu, avisa e nao mostra video nenhum", () => {
    const tela = montar([{ id: "transferencias" }]);
    expect(tela.text()).toContain("Ainda não há treinamento para o seu acesso.");
    expect(tela.findAll(".aula")).toHaveLength(0);
  });

  it("com a tela Caixa, mostra o assunto com todos os videos numerados na ordem da abertura", () => {
    const tela = montar([{ id: "caixa" }]);
    expect(tela.get("h2").text()).toBe(caixa.titulo);
    expect(tela.get(".assunto__meta").text()).toContain(`${caixa.videos.length} vídeos`);
    expect(tela.get(".assunto__meta").text()).toContain("na ordem da abertura");
    const numeros = tela.findAll(".aula__numero").map((item) => item.text());
    expect(numeros).toEqual(caixa.videos.map((_, posicao) => String(posicao + 1)));
  });

  it("a busca filtra os videos e mantem o numero de cada um no grupo", async () => {
    const tela = montar([{ id: "caixa" }]);
    await tela.get("[data-teste='busca']").setValue("maquininha");
    const cartoes = tela.findAll(".aula");
    expect(cartoes.length).toBeGreaterThan(0);
    expect(cartoes.length).toBeLessThan(caixa.videos.length);
    const posicao = caixa.videos.findIndex((video) => video.id === "como-escolher-a-maquininha");
    expect(tela.findAll(".aula__numero").map((item) => item.text())).toContain(String(posicao + 1));
    expect(tela.get(".treinamento__conta").text()).toContain(`de ${caixa.videos.length} vídeos`);
  });

  it("busca sem resultado avisa e sugere palavras", async () => {
    const tela = montar([{ id: "caixa" }]);
    await tela.get("[data-teste='busca']").setValue("palavra que nao existe");
    expect(tela.text()).toContain("Nenhum vídeo com essa palavra.");
  });

  it("tocar num video abre o player no video tocado, com o grupo inteiro mesmo filtrado", async () => {
    const tela = montar([{ id: "caixa" }]);
    await tela.get("[data-teste='busca']").setValue("lacre");
    const alvo = caixa.videos.findIndex((video) => video.id === "onde-digito-o-lacre");
    const cartao = tela.findAll(".aula").find((item) => item.text().includes(caixa.videos[alvo]!.titulo))!;
    await cartao.trigger("click");
    const player = tela.get("[data-teste='player']");
    expect(player.attributes("data-grupo")).toBe("caixa");
    expect(player.attributes("data-videos")).toBe(String(caixa.videos.length));
    expect(player.attributes("data-inicio")).toBe(String(alvo));
  });

  it("Assistir em sequencia abre o player no primeiro video", async () => {
    const tela = montar([{ id: "caixa" }]);
    await tela.get(".assunto__sequencia").trigger("click");
    expect(tela.get("[data-teste='player']").attributes("data-inicio")).toBe("0");
  });
});
