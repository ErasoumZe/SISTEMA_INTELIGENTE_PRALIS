import { describe, expect, it } from "vitest";
import { MENSAGEM_SENHA_CURTA, SENHA_MINIMA_CARACTERES, senhaAtendeMinimo } from "./senha-politica";

// O formulario exigia 8 caracteres e o servidor de producao exige 10: o usuario digitava uma senha
// que a tela aceitava, enviava, e recebia de volta um erro que nao tinha como prever.
describe("senhaAtendeMinimo", () => {
  it("o minimo da tela e 10 — o valor de producao, que e o mais restritivo", () => {
    expect(SENHA_MINIMA_CARACTERES).toBe(10);
  });

  it("senha com 9 caracteres e rejeitada", () => {
    expect(senhaAtendeMinimo("123456789")).toBe(false);
  });

  // A fronteira exata: 8 passava antes desta correcao.
  it("senha com 8 caracteres e rejeitada", () => {
    expect(senhaAtendeMinimo("12345678")).toBe(false);
  });

  it("senha com 10 caracteres e aceita", () => {
    expect(senhaAtendeMinimo("1234567890")).toBe(true);
  });

  it("senha com mais de 10 caracteres e aceita", () => {
    expect(senhaAtendeMinimo("senha-bem-longa-de-verdade")).toBe(true);
  });

  it("senha vazia e rejeitada", () => {
    expect(senhaAtendeMinimo("")).toBe(false);
  });

  it("a mensagem informa o numero exigido, sem divergir da constante", () => {
    expect(MENSAGEM_SENHA_CURTA).toContain(String(SENHA_MINIMA_CARACTERES));
  });
});
