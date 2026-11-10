import { describe, expect, it } from "vitest";
import { resumoDosItens } from "../../api/src/whatsapp/texto-whatsapp.js";

describe("texto do WhatsApp", () => {
  it("resumo cabe inteiro quando e curto", () => {
    expect(resumoDosItens(["5 Coca 2 L", "3 Coca 1,5 L"])).toBe("5 Coca 2 L; 3 Coca 1,5 L");
  });

  it("pedido grande corta no limite sem partir item e diz quantos faltaram", () => {
    const itens = Array.from({ length: 80 }, (_, indice) => `10 Produto de nome comprido numero ${indice + 1}`);
    const resumo = resumoDosItens(itens, 200);
    expect(resumo.length).toBeLessThanOrEqual(200);
    expect(resumo).toMatch(/; e mais \d+ item\(ns\)$/u);
    const mostrados = resumo.split("; e mais ")[0]!.split("; ").length;
    expect(resumo.endsWith(`e mais ${80 - mostrados} item(ns)`)).toBe(true);
  });
});
