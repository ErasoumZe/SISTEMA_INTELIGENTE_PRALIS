import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import PermissoesMenuOperacional from "./PermissoesMenuOperacional.vue";
import { WORKSPACE_CONTEXT } from "~/components/workspace/workspace-context";

function montar(estado = "herdar") {
  const definirRegraPermissao = vi.fn();
  const wrapper = mount(PermissoesMenuOperacional, {
    global: {
      provide: {
        [WORKSPACE_CONTEXT]: {
          estadoRegraPermissao: () => estado,
          definirRegraPermissao
        }
      },
      stubs: {
        "v-sheet": { template: "<section><slot /></section>" },
        "v-btn": { emits: ["click"], template: "<button type='button' @click='$emit(\"click\")'><slot /></button>" },
        "v-icon": { template: "<i><slot /></i>" }
      }
    }
  });
  return { wrapper, definirRegraPermissao };
}

describe("PermissoesMenuOperacional", () => {
  it("mostra cinco módulos e os três controles de cada um", () => {
    const { wrapper } = montar();

    expect(wrapper.findAll("section")).toHaveLength(5);
    expect(wrapper.findAll("section button")).toHaveLength(15);
    expect(wrapper.text()).toContain("Entradas");
    expect(wrapper.text()).toContain("Transferências");
    expect(wrapper.text()).toContain("Mostrar no menu");
    expect(wrapper.text()).toContain("Exigir caixa aberto");
  });

  it("alterna uma regra herdada para permitir usando o código real", async () => {
    const { wrapper, definirRegraPermissao } = montar();

    await wrapper.find("section button").trigger("click");

    expect(definirRegraPermissao).toHaveBeenCalledWith("menu_entradas_mostrar", "permitir");
  });
});
