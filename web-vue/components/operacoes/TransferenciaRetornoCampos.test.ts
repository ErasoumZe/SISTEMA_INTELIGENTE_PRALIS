import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import TransferenciaRetornoCampos from "./TransferenciaRetornoCampos.vue";

describe("TransferenciaRetornoCampos", () => {
  it("expande retorno e sangria no mesmo formulario ao marcar a checkbox", async () => {
    const wrapper = mount(TransferenciaRetornoCampos, {
      slots: { default: '<input data-testid="lacre-retorno" />' }
    });

    expect(wrapper.find('[data-testid="retorno-campos"]').exists()).toBe(false);
    await wrapper.get('[data-testid="retorno-toggle"]').setValue(true);
    expect(wrapper.get('[data-testid="retorno-campos"]').isVisible()).toBe(true);
    expect(wrapper.find('[data-testid="lacre-retorno"]').exists()).toBe(true);
  });
});
