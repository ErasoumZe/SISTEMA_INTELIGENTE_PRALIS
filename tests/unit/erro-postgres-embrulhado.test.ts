// R-164/R-165 · O SQLSTATE tem de ser achado mesmo quando o driver EMBRULHA o erro.
//
// A R-164 contratou: contenção transitória (55P03) e deadlock (40P01) viram **503 LOCK_OCUPADO**,
// nunca 500 opaco — porque o operador precisa saber que é só tentar de novo, e o agente CREARE
// re-tenta 5xx mas DESCARTA 4xx (R-013 proíbe descartar venda).
//
// O contrato estava furado. `app.ts` lia `error.code` na RAIZ, e o Drizzle entrega o erro do
// Postgres embrulhado: a raiz vem com `code` indefinido e o SQLSTATE vive em `error.cause.code`.
// Medido na rota real, com duas transferências opostas simultâneas:
//
//   cadeia : Error(code=undefined) -> cause: error(code=40P01)
//   mensagem: "deadlock detected"
//   HTTP   : 500 INTERNAL_ERROR   (deveria ser 503 LOCK_OCUPADO)
//
// Este teste prende a extração: qualquer profundidade de embrulho tem de devolver o SQLSTATE.
import { describe, expect, it } from "vitest";
import { codigoPostgresDoErro } from "../../api/src/erros.js";

describe("codigoPostgresDoErro (R-164/R-165)", () => {
  it("acha o codigo quando ele esta na raiz", () => {
    expect(codigoPostgresDoErro(Object.assign(new Error("lock nao disponivel"), { code: "55P03" }))).toBe("55P03");
  });

  // O caso REAL medido: o Drizzle embrulha o erro do pg.
  it("acha o codigo embrulhado em cause (o caso que virava 500 opaco)", () => {
    const doPostgres = Object.assign(new Error("deadlock detected"), { code: "40P01" });
    const embrulhado = new Error("Failed query: insert into transferencias ...", { cause: doPostgres });
    expect(codigoPostgresDoErro(embrulhado)).toBe("40P01");
  });

  it("acha o codigo com mais de um nivel de embrulho", () => {
    const doPostgres = Object.assign(new Error("deadlock detected"), { code: "40P01" });
    const nivel1 = new Error("drizzle", { cause: doPostgres });
    const nivel2 = new Error("servico", { cause: nivel1 });
    expect(codigoPostgresDoErro(nivel2)).toBe("40P01");
  });

  it("devolve undefined quando nao ha codigo nenhum na cadeia", () => {
    expect(codigoPostgresDoErro(new Error("erro comum"))).toBeUndefined();
    expect(codigoPostgresDoErro(new Error("fora", { cause: new Error("dentro") }))).toBeUndefined();
  });

  // Um `code` de erro do Node (string longa, nao-SQLSTATE) nao pode ser confundido com SQLSTATE.
  // SQLSTATE e sempre 5 caracteres alfanumericos.
  it("ignora code que nao tem cara de SQLSTATE", () => {
    expect(codigoPostgresDoErro(Object.assign(new Error("x"), { code: "ERR_MODULE_NOT_FOUND" }))).toBeUndefined();
    expect(codigoPostgresDoErro(Object.assign(new Error("x"), { code: "ECONNREFUSED" }))).toBeUndefined();
  });

  // E o do Postgres tem de continuar passando mesmo embrulhado por um code do Node por cima.
  it("atravessa um code do Node na raiz para achar o SQLSTATE embaixo", () => {
    const doPostgres = Object.assign(new Error("lock timeout"), { code: "55P03" });
    const porCima = Object.assign(new Error("falhou", { cause: doPostgres }), { code: "ERR_QUERY" });
    expect(codigoPostgresDoErro(porCima)).toBe("55P03");
  });

  it("nao entra em laco infinito se a cadeia de cause se referenciar", () => {
    const a: Error & { cause?: unknown } = new Error("a");
    a.cause = a;
    expect(codigoPostgresDoErro(a)).toBeUndefined();
  });

  it("tolera entrada que nao e Error", () => {
    expect(codigoPostgresDoErro(null)).toBeUndefined();
    expect(codigoPostgresDoErro("texto")).toBeUndefined();
    expect(codigoPostgresDoErro({ code: "40P01" })).toBe("40P01");
  });
});
