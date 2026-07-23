import { describe, expect, it } from "vitest";
import { chipStatusMalote } from "./malote";

// Malote === lacre (D3): a lista mostra o status como chip colorido. Ciclo disponivel -> em_uso ->
// devolvido, com as cores dos tokens V1.
describe("chipStatusMalote", () => {
  it("mapeia os tres status do ciclo para cor + rotulo", () => {
    expect(chipStatusMalote("disponivel")).toEqual({ cor: "#16a34a", label: "disponível" });
    expect(chipStatusMalote("em_uso")).toEqual({ cor: "#c2410c", label: "em uso" });
    expect(chipStatusMalote("devolvido")).toEqual({ cor: "#64748b", label: "devolvido" });
  });

  it("retorna undefined para status vazio ou desconhecido", () => {
    expect(chipStatusMalote("")).toBeUndefined();
    expect(chipStatusMalote(undefined)).toBeUndefined();
    expect(chipStatusMalote("qualquer")).toBeUndefined();
  });
});
