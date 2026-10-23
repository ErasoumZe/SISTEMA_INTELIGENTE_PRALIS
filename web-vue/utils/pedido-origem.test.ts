import { describe, expect, it } from "vitest";
import { pedidoEhLegado, rotuloDoTipoDePedido } from "./pedido-origem";

describe("pedido-origem", () => {
  it("so o pedido da rodada nasce hoje; manual e automatico sao legado", () => {
    expect(pedidoEhLegado("rodada")).toBe(false);
    expect(pedidoEhLegado("manual")).toBe(true);
    expect(pedidoEhLegado("automatico")).toBe(true);
  });

  it("todo tipo tem rotulo, e o legado diz que e legado", () => {
    expect(rotuloDoTipoDePedido("rodada")).toBe("Rodada de cotação");
    expect(rotuloDoTipoDePedido("manual")).toContain("legado");
    expect(rotuloDoTipoDePedido("automatico")).toContain("legado");
  });
});
