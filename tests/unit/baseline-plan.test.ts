import { describe, expect, it } from "vitest";
import {
  lerLimiteThrough,
  selecionarMigrations,
  validarEntradasDoJournal,
  validarHistoricoVazio
} from "../../db/baseline-plan.js";

const entradas = [
  { idx: 0, when: 1000, tag: "0000_inicio.sql" },
  { idx: 1, when: 2000, tag: "0001_base.sql" },
  { idx: 61, when: 61000, tag: "0061_anexos.sql" },
  { idx: 62, when: 62000, tag: "0062_google.sql" }
];

describe("plano de baseline", () => {
  it("seleciona até 0061 e exclui 0062", () => {
    const selecionadas = selecionarMigrations(entradas, lerLimiteThrough(["--through=0061"]));

    expect(selecionadas.at(-1)?.tag).toBe("0061_anexos.sql");
    expect(selecionadas.some((migration) => migration.tag.startsWith("0062_"))).toBe(false);
  });

  it("mantém todas as migrations quando não há limite", () => {
    expect(selecionarMigrations(entradas, null)).toHaveLength(4);
  });

  it("recusa limite inválido ou inexistente", () => {
    expect(() => lerLimiteThrough(["--through=61"])).toThrow("formato");
    expect(() => selecionarMigrations(entradas, "0063")).toThrow("nao existe");
  });

  it("recusa journal fora de ordem", () => {
    expect(() => validarEntradasDoJournal([{ ...entradas[1]!, idx: 3 }])).toThrow("fora de ordem");
  });

  it("recusa histórico já existente", () => {
    expect(() => validarHistoricoVazio(1)).toThrow("historico existente");
    expect(() => validarHistoricoVazio(0)).not.toThrow();
  });

  it("preserva timestamps e ordem original", () => {
    expect(selecionarMigrations(entradas, "0061")).toEqual(
      entradas.slice(0, 3).map((entry) => ({ ...entry, hash: "" }))
    );
  });

  it("deixa 0062 como próximo created_at para o migrator", () => {
    const selecionadas = selecionarMigrations(entradas, "0061");
    expect(selecionadas.at(-1)?.when).toBeLessThan(entradas.at(-1)!.when);
  });
});
