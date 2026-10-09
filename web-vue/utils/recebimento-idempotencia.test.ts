import { describe, expect, it, vi } from "vitest";
import { obterTentativaRecebimento } from "./recebimento-idempotencia";

describe("idempotencia do recebimento", () => {
  it("reutiliza a chave ao repetir exatamente a mesma intencao", () => {
    const gerar = vi.fn().mockReturnValueOnce("chave-1").mockReturnValueOnce("chave-2");
    const itens = [{ pedidoItemId: "item-1", quantidadeConferida: 3 }];
    const primeira = obterTentativaRecebimento(null, "pedido-1", itens, "conferido", gerar);
    const repetida = obterTentativaRecebimento(primeira, "pedido-1", itens, "conferido", gerar);
    expect(repetida.chave).toBe("chave-1");
    expect(gerar).toHaveBeenCalledTimes(1);
  });

  it("gera nova chave quando pedido, quantidade ou observacao mudam", () => {
    let sequencia = 0;
    const gerar = () => `chave-${++sequencia}`;
    const primeira = obterTentativaRecebimento(
      null,
      "pedido-1",
      [{ pedidoItemId: "item-1", quantidadeConferida: 3 }],
      "",
      gerar
    );
    const alterada = obterTentativaRecebimento(
      primeira,
      "pedido-1",
      [{ pedidoItemId: "item-1", quantidadeConferida: 2 }],
      "",
      gerar
    );
    expect(alterada.chave).toBe("chave-2");
  });
});
