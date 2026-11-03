import { describe, expect, it } from "vitest";
import { buscarDuvidas, normalizarBusca, TEMAS_DUVIDA, type Duvida } from "./duvidas";
import { DUVIDAS_CAIXA } from "./duvidas-caixa";

const base: Duvida[] = [
  { id: "a", tema: "vendas", pergunta: "Errei a contagem do malote", resposta: "Use Corrigir contagem." },
  { id: "b", tema: "turno", pergunta: "Como faço sangria?", resposta: "Informe o lacre e a contagem." },
  { id: "c", tema: "turno", pergunta: "Posso transferir sem lacre?", resposta: "Sim.", palavras: ["digitei errado"] }
];

describe("busca de dúvidas", () => {
  it("ignora acento e maiúsculas", () => {
    expect(normalizarBusca("  Cédulas e MOEDAS ")).toBe("cedulas e moedas");
    expect(buscarDuvidas(base, "faco SANGRIA").map((d) => d.id)).toEqual(["b"]);
  });

  it("quem casa na pergunta vem antes de quem casa só na resposta", () => {
    expect(buscarDuvidas(base, "contagem").map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("acha pelas palavras-chave", () => {
    expect(buscarDuvidas(base, "digitei errado").map((d) => d.id)).toEqual(["c"]);
  });

  it("entende a frase inteira, do jeito que a pessoa fala", () => {
    expect(buscarDuvidas(base, "o que eu faço se errei a contagem do malote?")[0]?.id).toBe("a");
  });

  it("só palavras vazias ou nada escrito não acha nada", () => {
    expect(buscarDuvidas(base, "   ")).toEqual([]);
    expect(buscarDuvidas(base, "o que eu faço?")).toEqual([]);
  });
});

describe("base de dúvidas do caixa", () => {
  it("ids únicos, tema conhecido e texto preenchido", () => {
    const temas = new Set(TEMAS_DUVIDA.map((t) => t.id));
    const ids = DUVIDAS_CAIXA.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const duvida of DUVIDAS_CAIXA) {
      expect(temas.has(duvida.tema)).toBe(true);
      expect(duvida.pergunta.trim().length).toBeGreaterThan(5);
      expect(duvida.resposta.trim().length).toBeGreaterThan(10);
    }
  });

  it("perguntas reais do caixa caem na resposta certa", () => {
    const topo = (frase: string) =>
      buscarDuvidas(DUVIDAS_CAIXA, frase)
        .slice(0, 3)
        .map((d) => d.id);
    expect(topo("disseram que mandaram dinheiro mas não recebi")).toContain("turno-nao-recebi");
    expect(topo("como faço sangria")).toContain("turno-sangria-como");
    expect(topo("errei a contagem")).toContain("vendas-errei-contagem");
    expect(topo("a maquininha mostra mais cartão")).toContain("maquininha-cartao-a-mais");
  });

  it("toda etapa do fechamento tem pergunta", () => {
    for (const tema of ["vendas", "maquininha", "relatorio-final", "fechamento"]) {
      expect(DUVIDAS_CAIXA.some((d) => d.tema === tema)).toBe(true);
    }
  });

  // A contagem do malote e cega (R-232): nenhuma resposta pode ensinar a ver o esperado antes de contar.
  it("nenhuma resposta manda olhar o esperado antes de contar", () => {
    for (const duvida of DUVIDAS_CAIXA) {
      expect(normalizarBusca(duvida.resposta)).not.toMatch(/veja o (saldo|esperado) antes/);
    }
  });
});
