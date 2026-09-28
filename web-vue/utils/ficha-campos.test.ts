import { describe, expect, it } from "vitest";
import { camposDaFichaPublica, normalizarCep, rotuloCampoFicha } from "./ficha-campos";
import { mascararCep } from "./formatacao";

describe("campos da ficha publica", () => {
  it("marca exatamente os campos obrigatorios no rotulo", () => {
    const sexo = camposDaFichaPublica.find((campo) => campo.chave === "sexo");
    const email = camposDaFichaPublica.find((campo) => campo.chave === "email");

    expect(rotuloCampoFicha(sexo!)).toBe("Sexo *");
    expect(rotuloCampoFicha(email!)).toBe("E-mail");
  });

  it("mantem apenas oito digitos e apresenta o CEP legivel", () => {
    expect(normalizarCep("01.001-000abc")).toBe("01001000");
    expect(mascararCep("01001000")).toBe("01001-000");
  });
});
