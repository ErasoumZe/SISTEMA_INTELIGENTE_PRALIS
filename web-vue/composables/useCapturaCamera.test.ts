import { afterEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { entregarArquivoAoInput, podeUsarWebcam, useCapturaCamera } from "./useCapturaCamera";

function simularAmbiente(opcoes: { webcam: boolean; toque: boolean }) {
  vi.stubGlobal("navigator", opcoes.webcam ? { mediaDevices: { getUserMedia: vi.fn() } } : { mediaDevices: undefined });
  vi.stubGlobal("matchMedia", () => ({ matches: opcoes.toque }));
}

afterEach(() => vi.unstubAllGlobals());

describe("podeUsarWebcam", () => {
  it("computador com webcam usa a webcam", () => {
    simularAmbiente({ webcam: true, toque: false });
    expect(podeUsarWebcam()).toBe(true);
  });

  it("celular ou tablet (ponteiro grosso) continua com a camera nativa do input", () => {
    simularAmbiente({ webcam: true, toque: true });
    expect(podeUsarWebcam()).toBe(false);
  });

  it("navegador sem mediaDevices nao tenta a webcam", () => {
    simularAmbiente({ webcam: false, toque: false });
    expect(podeUsarWebcam()).toBe(false);
  });
});

describe("useCapturaCamera", () => {
  function inputFalso() {
    const input = document.createElement("input");
    input.type = "file";
    const clicar = vi.spyOn(input, "click");
    return { input, clicar };
  }

  it("no computador abre o dialogo da webcam em vez do seletor de arquivos", () => {
    simularAmbiente({ webcam: true, toque: false });
    const { input, clicar } = inputFalso();
    const camera = useCapturaCamera(ref(input));
    camera.abrir();
    expect(camera.aberta.value).toBe(true);
    expect(clicar).not.toHaveBeenCalled();
  });

  it("no celular clica no input (camera nativa pelo capture)", () => {
    simularAmbiente({ webcam: true, toque: true });
    const { input, clicar } = inputFalso();
    const camera = useCapturaCamera(ref(input));
    camera.abrir();
    expect(camera.aberta.value).toBe(false);
    expect(clicar).toHaveBeenCalledTimes(1);
  });

  it("webcam indisponivel fecha o dialogo e volta ao seletor de arquivos", () => {
    simularAmbiente({ webcam: true, toque: false });
    const { input, clicar } = inputFalso();
    const camera = useCapturaCamera(ref(input));
    camera.abrir();
    camera.aoIndisponivel();
    expect(camera.aberta.value).toBe(false);
    expect(clicar).toHaveBeenCalledTimes(1);
  });

  it("a foto capturada chega ao input pelo MESMO evento change que o handler ja escuta", () => {
    simularAmbiente({ webcam: true, toque: false });
    const { input } = inputFalso();
    const recebido: string[] = [];
    input.addEventListener("change", (evento) => {
      const arquivo = (evento.target as HTMLInputElement).files?.[0];
      if (arquivo) recebido.push(`${arquivo.name}|${arquivo.type}`);
    });
    const camera = useCapturaCamera(ref(input));
    camera.aoCapturar(new File(["x"], "foto-1.jpg", { type: "image/jpeg" }));
    expect(recebido).toEqual(["foto-1.jpg|image/jpeg"]);
  });

  it("entregarArquivoAoInput dispara change com bubbles", () => {
    const { input } = inputFalso();
    document.body.append(input);
    const chamadas = vi.fn();
    document.body.addEventListener("change", chamadas);
    entregarArquivoAoInput(input, new File(["x"], "a.jpg", { type: "image/jpeg" }));
    expect(chamadas).toHaveBeenCalledTimes(1);
    document.body.removeEventListener("change", chamadas);
    input.remove();
  });
});
