import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import CapturaCameraDialog from "./CapturaCameraDialog.vue";

const faixa = { stop: vi.fn() };
const fluxoFalso = { getTracks: () => [faixa] };

function montar(getUserMedia: () => Promise<unknown>) {
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  return mount(CapturaCameraDialog, {
    props: { modelValue: true },
    global: {
      stubs: {
        "v-dialog": {
          emits: ["after-enter"],
          template: "<div><button data-entrou @click=\"$emit('after-enter')\" /><slot /></div>"
        },
        "v-card": { template: "<div><slot /></div>" },
        "v-card-title": { template: "<h2><slot /></h2>" },
        "v-card-text": { template: "<div><slot /></div>" },
        "v-card-actions": { template: "<div><slot /></div>" },
        "v-spacer": true,
        "v-alert": { template: "<div><slot /></div>" },
        "v-btn": { template: '<button v-bind="$attrs"><slot /></button>' }
      }
    }
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  faixa.stop.mockClear();
});

describe("CapturaCameraDialog", () => {
  it("ao abrir pede a camera de tras (facingMode environment) sem audio", async () => {
    const pedir = vi.fn().mockResolvedValue(fluxoFalso);
    const wrapper = montar(pedir);
    await wrapper.get("[data-entrou]").trigger("click");
    await flushPromises();
    expect(pedir).toHaveBeenCalledTimes(1);
    const restricoes = pedir.mock.calls[0]?.[0] as { video: { facingMode: string }; audio: boolean };
    expect(restricoes.video.facingMode).toBe("environment");
    expect(restricoes.audio).toBe(false);
  });

  it("permissao negada avisa o pai e fecha, para ele voltar ao seletor de arquivos", async () => {
    const negado = vi.fn().mockRejectedValue(new DOMException("negado", "NotAllowedError"));
    const wrapper = montar(negado);
    await wrapper.get("[data-entrou]").trigger("click");
    await flushPromises();
    expect(wrapper.emitted("indisponivel")?.[0]).toEqual(["permissao-negada"]);
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([false]);
  });

  it("sem camera no computador diz sem-camera", async () => {
    const semCamera = vi.fn().mockRejectedValue(new DOMException("nenhuma", "NotFoundError"));
    const wrapper = montar(semCamera);
    await wrapper.get("[data-entrou]").trigger("click");
    await flushPromises();
    expect(wrapper.emitted("indisponivel")?.[0]).toEqual(["sem-camera"]);
  });

  it("Tirar foto fica desligado ate a camera estar pronta", () => {
    const wrapper = montar(vi.fn().mockResolvedValue(fluxoFalso));
    expect(wrapper.get('[data-teste="camera-tirar-foto"]').attributes("disabled")).toBeDefined();
  });

  it("fechar o dialogo desliga a camera (para a luz da webcam apagar)", async () => {
    const wrapper = montar(vi.fn().mockResolvedValue(fluxoFalso));
    await wrapper.get("[data-entrou]").trigger("click");
    await flushPromises();
    await wrapper.setProps({ modelValue: false });
    await flushPromises();
    expect(faixa.stop).toHaveBeenCalled();
  });
});
