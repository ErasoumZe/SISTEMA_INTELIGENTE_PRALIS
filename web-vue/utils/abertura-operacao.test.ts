import { describe, expect, it, vi } from "vitest";
import { criarGuardaAberturaOperacao } from "./abertura-operacao";

describe("guarda de abertura de operacao", () => {
  it("faz uma unica busca de contas ao abrir o modal de transferencia", async () => {
    const abrirUmaVez = criarGuardaAberturaOperacao();
    const buscarContas = vi.fn(async () => [{ id: "conta-1", nome: "Conta 1" }]);
    let modalAberto = false;
    let liberarCarregamento!: () => void;
    const carregamentoPendente = new Promise<void>((resolve) => {
      liberarCarregamento = resolve;
    });

    const abrirTransferencia = () =>
      abrirUmaVez(
        () => modalAberto,
        async () => {
          await buscarContas();
          await carregamentoPendente;
          modalAberto = true;
        }
      );

    const primeiraAbertura = abrirTransferencia();
    const realimentacaoEnquantoCarrega = abrirTransferencia();
    liberarCarregamento();
    await Promise.all([primeiraAbertura, realimentacaoEnquantoCarrega]);
    await abrirTransferencia();

    expect(buscarContas).toHaveBeenCalledTimes(1);
    expect(modalAberto).toBe(true);
  });
});
