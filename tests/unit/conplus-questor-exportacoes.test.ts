import { describe, expect, it } from "vitest";
import {
  questorEventosVariaveisCatalogoSchema,
  questorEventosVariaveisLancamentoSchema,
  questorEventosVariaveisPreviaSchema
} from "@padaria/shared/conplus";

describe("contratos de exportação Questor", () => {
  it("aceita somente catálogo de eventos com unidades oficiais", () => {
    expect(
      questorEventosVariaveisCatalogoSchema.parse({ codigo: "80", descricao: "Hora extra", unidades: ["H"] })
    ).toEqual({ codigo: "80", descricao: "Hora extra", unidades: ["H"] });
    expect(() =>
      questorEventosVariaveisCatalogoSchema.parse({ codigo: "80", descricao: "x", unidades: ["X"] })
    ).toThrow();
  });

  it("rejeita campos desconhecidos e valores monetários malformados", () => {
    expect(() =>
      questorEventosVariaveisLancamentoSchema.parse({
        competencia: "2026-10-01",
        vinculoId: "00000000-0000-4000-8000-000000000001",
        eventoId: "00000000-0000-4000-8000-000000000002",
        unidade: "V",
        valor: "R$ 10,00"
      })
    ).toThrow();
    expect(() =>
      questorEventosVariaveisPreviaSchema.parse({ competencia: "2026-10-01", lancamentoIds: [], extra: true })
    ).toThrow();
  });
});
