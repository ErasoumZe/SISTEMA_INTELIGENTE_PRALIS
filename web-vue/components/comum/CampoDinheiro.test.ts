import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CampoDinheiro from "./CampoDinheiro.vue";

const stubs = { "v-icon": true };

function montar(props: Record<string, unknown> = {}) {
  return mount(CampoDinheiro, {
    props: { modelValue: "", label: "Total contado", ...props } as never,
    global: { stubs }
  });
}

describe("CampoDinheiro", () => {
  it("formata o valor digitado e devolve a string decimal com ponto", async () => {
    const wrapper = montar();
    const input = wrapper.get("input");
    await input.setValue("1234");
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual(["1234"]);
  });

  it("sem erro nao desenha mensagem nem marca o campo como invalido", () => {
    const wrapper = montar({ modelValue: "200" });
    expect(wrapper.find(".campo-dinheiro__erro").exists()).toBe(false);
    expect(wrapper.get("input").attributes("aria-invalid")).toBeUndefined();
  });

  it("error + errorMessages desenham a mensagem e marcam o campo (antes ficavam em silencio)", () => {
    const wrapper = montar({
      modelValue: "200",
      error: true,
      errorMessages: "Total deve ser igual a dinheiro físico mais moedas."
    });
    expect(wrapper.get(".campo-dinheiro__erro").text()).toContain("Total deve ser igual");
    const input = wrapper.get("input");
    expect(input.attributes("aria-invalid")).toBe("true");
    expect(input.classes()).toContain("campo-dinheiro--invalido");
    expect(input.attributes("aria-describedby")).toBe(wrapper.get(".campo-dinheiro__erro").attributes("id"));
  });

  it("aceita a mensagem como lista", () => {
    const wrapper = montar({ errorMessages: ["Primeira.", "Segunda."] });
    expect(wrapper.get(".campo-dinheiro__erro").text()).toBe("Primeira. Segunda.");
  });

  it("campo sem rotulo tambem marca o invalido", () => {
    const wrapper = montar({ label: undefined, error: true });
    expect(wrapper.get("input").attributes("aria-invalid")).toBe("true");
  });
});
