import { describe, expect, it } from "vitest";
import {
  camposDaFichaPublica,
  mascararTelefone,
  normalizarCep,
  normalizarTelefone,
  rotuloCampoFicha
} from "./ficha-campos";
import { mascararCep } from "./formatacao";

describe("campos da ficha publica", () => {
  it("marca exatamente os campos obrigatorios no rotulo", () => {
    const sexo = camposDaFichaPublica.find((campo) => campo.chave === "sexo");
    const email = camposDaFichaPublica.find((campo) => campo.chave === "email");

    expect(rotuloCampoFicha(sexo!)).toBe("Sexo *");
    expect(rotuloCampoFicha(email!)).toBe("E-mail");
  });

  it("oferece estados civis canonicos para o cadastro", () => {
    const estadoCivil = camposDaFichaPublica.find((campo) => campo.chave === "estadoCivil");

    expect(estadoCivil?.opcoes).toEqual([
      "Solteiro",
      "Casado",
      "Separado judicialmente",
      "Divorciado",
      "Viúvo",
      "União estável"
    ]);
  });

  it("mantem apenas oito digitos e apresenta o CEP legivel", () => {
    expect(normalizarCep("01.001-000abc")).toBe("01001000");
    expect(mascararCep("01001000")).toBe("01001-000");
  });

  it("guarda o telefone em digitos e o apresenta no formato brasileiro", () => {
    expect(normalizarTelefone("(11) 99999-0000")).toBe("11999990000");
    expect(mascararTelefone("11999990000")).toBe("(11) 99999-0000");
  });
});
