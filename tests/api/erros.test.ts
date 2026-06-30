import { describe, expect, it } from "vitest";
import { ErroDominio, conflito, erroValidacao, naoAutorizado, naoEncontrado, proibido } from "../../api/src/erros.js";

describe("ErroDominio", () => {
  it("carrega status, code e details", () => {
    const erro = new ErroDominio("Falha", 422, "DOMAIN_ERROR", { campo: "nome" });

    expect(erro).toBeInstanceOf(Error);
    expect(erro.status).toBe(422);
    expect(erro.code).toBe("DOMAIN_ERROR");
    expect(erro.details).toEqual({ campo: "nome" });
  });

  it("expoe factories para status comuns", () => {
    expect(erroValidacao("Dados invalidos").status).toBe(400);
    expect(naoAutorizado("Nao autenticado").status).toBe(401);
    expect(proibido("Sem acesso").status).toBe(403);
    expect(naoEncontrado("Ausente").status).toBe(404);
    expect(conflito("Duplicado").status).toBe(409);
  });
});
