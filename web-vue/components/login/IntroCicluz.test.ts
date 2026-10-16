import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import IntroCicluz from "./IntroCicluz.vue";

function definirPreferenciaDeMovimento(reduzir: boolean) {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: reduzir })));
}

describe("IntroCicluz", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    definirPreferenciaDeMovimento(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("só conclui depois que o painel autenticado está pronto", async () => {
    const wrapper = mount(IntroCicluz, { props: { pronta: false } });

    await vi.advanceTimersByTimeAsync(3_000);
    expect(wrapper.emitted("concluida")).toBeUndefined();

    await wrapper.setProps({ pronta: true });
    await vi.advanceTimersByTimeAsync(2_949);
    expect(wrapper.emitted("concluida")).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);
    expect(wrapper.emitted("concluida")).toHaveLength(1);
  });

  it("respeita a preferência de reduzir movimento", async () => {
    definirPreferenciaDeMovimento(true);
    const wrapper = mount(IntroCicluz);

    await vi.advanceTimersByTimeAsync(119);
    expect(wrapper.emitted("concluida")).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);
    expect(wrapper.emitted("concluida")).toHaveLength(1);
  });
});
