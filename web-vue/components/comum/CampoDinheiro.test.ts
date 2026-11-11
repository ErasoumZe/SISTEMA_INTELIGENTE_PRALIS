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

  it("modo centavos: os dois ultimos digitos viram centavos e a virgula entra sozinha", async () => {
    const wrapper = montar({ label: "Moedas", centavos: true });
    const input = wrapper.get("input");
    await input.setValue("4");
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual(["0.04"]);
    expect((input.element as HTMLInputElement).value).toBe("0,04");
    await input.setValue("0,042");
    expect((input.element as HTMLInputElement).value).toBe("0,42");
    await input.setValue("0,4230");
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual(["42.3"]);
    expect((input.element as HTMLInputElement).value).toBe("42,30");
    await input.setValue("42,301");
    expect((input.element as HTMLInputElement).value).toBe("423,01");
  });

  it("modo centavos: apagar tudo deixa o campo vazio, nao zero", async () => {
    const wrapper = montar({ label: "Moedas", centavos: true, modelValue: "0.04" });
    const input = wrapper.get("input");
    (input.element as HTMLInputElement).value = "0,0";
    await input.trigger("input", { inputType: "deleteContentBackward" });
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([""]);
  });

  it("sem o modo centavos, digitar 4230 continua sendo R$ 4.230,00", async () => {
    const wrapper = montar();
    await wrapper.get("input").setValue("4230");
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual(["4230"]);
  });
});
