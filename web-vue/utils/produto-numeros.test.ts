import { describe, expect, it } from "vitest";
import {
  fracaoParaPercentual,
  limitarMargem,
  mensagemDeProdutoSalvo,
  numeroDigitado,
  percentualParaFracao,
  semRolagemNoNumero,
  textoDeNumero
} from "./produto-numeros";

describe("numeroDigitado", () => {
  it("vazio e texto que nao e numero sao ausencia (null), nunca zero", () => {
    expect(numeroDigitado("")).toBeNull();
    expect(numeroDigitado("   ")).toBeNull();
    expect(numeroDigitado(null)).toBeNull();
    expect(numeroDigitado(undefined)).toBeNull();
    expect(numeroDigitado("abc")).toBeNull();
  });

  it("aceita virgula do teclado pt-BR e preserva o zero digitado", () => {
    expect(numeroDigitado("7,5")).toBe(7.5);
    expect(numeroDigitado("0")).toBe(0);
    expect(numeroDigitado(12)).toBe(12);
  });
});

describe("textoDeNumero", () => {
  it("tira as casas que so o banco guarda", () => {
    expect(textoDeNumero("25.000")).toBe("25");
    expect(textoDeNumero("10.000")).toBe("10");
    expect(textoDeNumero("12.5000")).toBe("12.5");
    expect(textoDeNumero("0.000")).toBe("0");
  });

  it("vazio continua vazio e texto estranho volta como veio", () => {
    expect(textoDeNumero(null)).toBe("");
    expect(textoDeNumero("")).toBe("");
    expect(textoDeNumero("N/D")).toBe("N/D");
  });
});

describe("margem e desconto (fracao <-> %)", () => {
  it("29% nao vira 28.999999999999996", () => {
    expect(fracaoParaPercentual(0.29)).toBe("29");
    expect(fracaoParaPercentual("0.2900")).toBe("29");
    expect(fracaoParaPercentual(0.075)).toBe("7.5");
    expect(fracaoParaPercentual(0)).toBe("0");
    expect(fracaoParaPercentual(null)).toBe("");
  });

  it("a volta preserva vazio (null) e zero (0)", () => {
    expect(percentualParaFracao("")).toBeNull();
    expect(percentualParaFracao("0")).toBe(0);
    expect(percentualParaFracao("70")).toBe(0.7);
    expect(percentualParaFracao("7,5")).toBe(0.075);
  });

  it("ida e volta nao inventa nem perde a escolha", () => {
    for (const pct of ["0", "7.5", "29", "70", "133.33"]) {
      expect(fracaoParaPercentual(percentualParaFracao(pct))).toBe(pct);
    }
  });
});

describe("limitarMargem", () => {
  it("prende entre 0 e 1000 e deixa vazio como vazio", () => {
    expect(limitarMargem("1500")).toBe("1000");
    expect(limitarMargem("-5")).toBe("0");
    expect(limitarMargem("35")).toBe("35");
    expect(limitarMargem("")).toBe("");
    expect(limitarMargem("abc")).toBe("");
  });
});

describe("semRolagemNoNumero", () => {
  it("tira o foco do campo numerico focado e deixa os outros em paz", () => {
    const numerico = document.createElement("input");
    numerico.type = "number";
    const texto = document.createElement("input");
    texto.type = "text";
    document.body.append(numerico, texto);

    numerico.focus();
    expect(document.activeElement).toBe(numerico);
    semRolagemNoNumero({ target: numerico });
    expect(document.activeElement).not.toBe(numerico);

    texto.focus();
    semRolagemNoNumero({ target: texto });
    expect(document.activeElement).toBe(texto);

    numerico.remove();
    texto.remove();
  });
});

describe("mensagemDeProdutoSalvo", () => {
  it("a BASE diz quantas lojas foram atualizadas", () => {
    expect(mensagemDeProdutoSalvo({ modo: "base", lojasAtualizadas: 3 })).toBe(
      "Produto salvo na base. 3 lojas atualizadas."
    );
    expect(mensagemDeProdutoSalvo({ modo: "base", lojasAtualizadas: 1 })).toBe(
      "Produto salvo na base. 1 loja atualizada."
    );
    expect(mensagemDeProdutoSalvo({ modo: "base", lojasAtualizadas: 0 })).toBe(
      "Produto salvo na base. Nenhuma loja foi atualizada."
    );
    expect(mensagemDeProdutoSalvo({ modo: "base" })).toBe("Produto salvo na base.");
    expect(mensagemDeProdutoSalvo({ modo: "loja" })).toBe("Produto salvo.");
  });
});
