import { describe, expect, it, vi } from "vitest";
import { obterTentativaRecebimento, type ItemRecebimento } from "./recebimento-idempotencia";

const item = (sobrescrita: Partial<ItemRecebimento> = {}): ItemRecebimento => ({
  pedidoItemId: "item-1",
  quantidadeConferida: 3,
  quantidadeDevolvida: 0,
  motivoDevolucao: null,
  ...sobrescrita
});

describe("idempotencia do recebimento", () => {
  it("reutiliza a chave ao repetir exatamente a mesma intencao", () => {
    const gerar = vi.fn().mockReturnValueOnce("chave-1").mockReturnValueOnce("chave-2");
    const itens = [item()];
    const primeira = obterTentativaRecebimento(null, "pedido-1", itens, "conferido", gerar);
    const repetida = obterTentativaRecebimento(primeira, "pedido-1", itens, "conferido", gerar);
    expect(repetida.chave).toBe("chave-1");
    expect(gerar).toHaveBeenCalledTimes(1);
  });

  it("gera nova chave quando pedido, quantidade ou observacao mudam", () => {
    let sequencia = 0;
    const gerar = () => `chave-${++sequencia}`;
    const primeira = obterTentativaRecebimento(null, "pedido-1", [item()], "", gerar);
    const alterada = obterTentativaRecebimento(primeira, "pedido-1", [item({ quantidadeConferida: 2 })], "", gerar);
    expect(alterada.chave).toBe("chave-2");
  });

  it("gera nova chave quando a devolucao muda (doc 58 §7)", () => {
    let sequencia = 0;
    const gerar = () => `chave-${++sequencia}`;
    const primeira = obterTentativaRecebimento(null, "pedido-1", [item()], "", gerar);
    const comDevolucao = obterTentativaRecebimento(
      primeira,
      "pedido-1",
      [item({ quantidadeDevolvida: 1, motivoDevolucao: "estragado" })],
      "",
      gerar
    );
    expect(comDevolucao.chave).toBe("chave-2");
  });
});
