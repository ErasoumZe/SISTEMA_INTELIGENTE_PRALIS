import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agendarTransicaoEntrada, consumirTransicaoEntrada } from "../../web-vue/composables/useTransicaoEntrada";

function criarSessionStorage() {
  const valores = new Map<string, string>();
  return {
    getItem: (chave: string) => valores.get(chave) ?? null,
    setItem: (chave: string, valor: string) => valores.set(chave, valor),
    removeItem: (chave: string) => valores.delete(chave),
    clear: () => valores.clear()
  };
}

describe("transição de entrada", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { sessionStorage: criarSessionStorage() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("consome a animação uma única vez após o login", () => {
    agendarTransicaoEntrada();

    expect(consumirTransicaoEntrada()).toBe(true);
    expect(consumirTransicaoEntrada()).toBe(false);
  });
});
