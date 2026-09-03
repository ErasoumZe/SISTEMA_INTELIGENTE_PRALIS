import { afterEach, describe, expect, it, vi } from "vitest";
import { copiarTexto } from "./copiar-texto";

/**
 * O harness MENTE nos dois sentidos, e e por isso que cada caso aqui stuba explicitamente:
 *
 * - o happy-dom implementa `navigator.clipboard` SEMPRE, sem checar contexto seguro, foco ou gesto.
 *   Um teste que confiasse nele provaria um caminho feliz que a producao nao tem.
 * - o happy-dom NAO implementa `document.execCommand`. Sem stub, o caminho de reserva nem roda.
 *
 * O que importa provar e o contrato: quando nao da para copiar, a funcao diz que nao deu.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  semExecCommand();
});

function comClipboard(writeText: (texto: string) => Promise<void>) {
  vi.stubGlobal("navigator", { clipboard: { writeText } });
}

/**
 * `vi.spyOn` nao serve: nao da para espionar o que nao existe, e o happy-dom nao implementa
 * `execCommand`. A funcao e DEFINIDA, e o `afterEach` a remove.
 */
function comExecCommand(retorno: boolean) {
  const chamadas: string[] = [];
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    writable: true,
    value: (comando: string) => {
      chamadas.push(comando);
      return retorno;
    }
  });
  return chamadas;
}

function semExecCommand() {
  if ("execCommand" in document) delete (document as Partial<Document>).execCommand;
}

describe("copiarTexto", () => {
  it("Deve_UsarAClipboardApi_Quando_Ela_Existe_E_Aceita", async () => {
    const escritas: string[] = [];
    comClipboard(async (texto) => {
      escritas.push(texto);
    });

    expect(await copiarTexto("https://x.exemplo/admissao#t=abc")).toBe(true);
    expect(escritas).toEqual(["https://x.exemplo/admissao#t=abc"]);
  });

  it("Deve_CairNoCaminhoDeReserva_Quando_ClipboardNaoExiste", async () => {
    // `http://<ip-da-lan>`: a propriedade nao e sequer instalada, e `.writeText` lancaria
    // TypeError SINCRONO. A funcao nao pode explodir — tem de tentar o outro caminho.
    vi.stubGlobal("navigator", {});
    const chamadas = comExecCommand(true);

    expect(await copiarTexto("texto")).toBe(true);
    expect(chamadas).toEqual(["copy"]);
  });

  it("Deve_CairNoCaminhoDeReserva_Quando_ClipboardRejeita", async () => {
    // Documento sem foco / gesto expirado: `NotAllowedError`.
    comClipboard(() => Promise.reject(new DOMException("Document is not focused", "NotAllowedError")));
    comExecCommand(true);

    expect(await copiarTexto("texto")).toBe(true);
  });

  it("Deve_DizerQueNaoCopiou_Quando_OsDoisCaminhosFalham", async () => {
    // A regra que mais importa: nunca fingir sucesso.
    vi.stubGlobal("navigator", {});
    comExecCommand(false);

    expect(await copiarTexto("texto")).toBe(false);
  });

  it("Deve_DizerQueNaoCopiou_Quando_NemExecCommandExiste", async () => {
    // E o caso do proprio happy-dom, e de navegadores futuros que removerem a API depreciada.
    vi.stubGlobal("navigator", {});
    expect(await copiarTexto("texto")).toBe(false);
  });

  it("Deve_RecusarTextoVazio_Sem_TocarNoNavegador", async () => {
    const writeText = vi.fn(async () => {});
    comClipboard(writeText);

    expect(await copiarTexto("")).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("Deve_LimparOCampoTemporario_E_NaoDeixarOTextoNoDocumento", async () => {
    // O campo de reserva carrega o segredo: se ficar no DOM, vira uma segunda copia visivel.
    vi.stubGlobal("navigator", {});
    comExecCommand(true);

    await copiarTexto("segredo-sintetico");

    expect(document.querySelectorAll("textarea")).toHaveLength(0);
    expect(document.body.innerHTML).not.toContain("segredo-sintetico");
  });
});
