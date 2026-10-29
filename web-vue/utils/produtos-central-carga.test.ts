import { describe, expect, it } from "vitest";
import { cargaTemGrupos } from "./produtos-central-carga";

describe("cargaTemGrupos", () => {
  it("carga recebida (fontes enviadas, sem validar) ainda nao tem grupos", () => {
    expect(cargaTemGrupos("recebida")).toBe(false);
  });

  it("validada, ativa e substituida tem grupos, como no servidor", () => {
    expect(cargaTemGrupos("validada")).toBe(true);
    expect(cargaTemGrupos("ativa")).toBe(true);
    expect(cargaTemGrupos("substituida")).toBe(true);
  });

  it("sem carga ou estado desconhecido nao consulta", () => {
    expect(cargaTemGrupos(undefined)).toBe(false);
    expect(cargaTemGrupos("validando")).toBe(false);
  });
});
