import { describe, expect, it } from "vitest";
import { chaveCartao, chavePdv } from "@padaria/shared/planilha-tesouraria";
import type { SheetsGateway, ValueRange } from "../../api/src/google/google-sheets-gateway.js";
import { gravarNaProximaLinha } from "../../api/src/planilha-tesouraria/planilha-tesouraria.sheets.js";

// Planilha em memoria: so a faixa F2:<ultima> da aba (o que o gravador le e escreve). Linha 1 = cabecalho.
function planilhaFalsa(linhasIniciais: string[][] = [], opcoes: { perderEscrita?: boolean } = {}) {
  const dados: string[][] = linhasIniciais.map((linha) => [...linha]);
  const escritas: ValueRange[] = [];
  const gateway: SheetsGateway = {
    getSheets: async () => [],
    batchUpdate: async () => undefined,
    batchGetValues: async (_id, ranges) =>
      ranges.map((range) => {
        const faixa = range.match(/!F(\d+):[A-Z](\d+)?$/u);
        const inicio = Number(faixa?.[1] ?? 2);
        const fim = faixa?.[2] ? Number(faixa[2]) : dados.length + 1;
        return dados.slice(inicio - 2, fim - 1);
      }),
    batchUpdateValues: async (_id, data) => {
      escritas.push(...data);
      if (opcoes.perderEscrita) return;
      for (const { range, values } of data) {
        const inicio = Number(range.match(/!F(\d+):/u)?.[1]);
        values.forEach((linha, indice) => {
          dados[inicio - 2 + indice] = linha.map((celula) => String(celula));
        });
      }
    }
  };
  return { gateway, dados, escritas };
}

const linhaCartao = (bandeira: string, valor: number) => [
  "10/11/2026",
  "J9BB07936155",
  "VND CAIXA PDV - 1M",
  "CRÉDITO",
  bandeira,
  6,
  valor
];

describe("gravacao na planilha da Tesouraria", () => {
  it("aba vazia: comeca na linha 2", async () => {
    const { gateway, escritas } = planilhaFalsa();
    const resultado = await gravarNaProximaLinha({
      gateway,
      planilhaId: "id",
      aba: "ABA",
      ultimaColuna: "L",
      linhas: [linhaCartao("ELO", 96.22), linhaCartao("VISA", 214.58)],
      chave: chaveCartao
    });
    expect(resultado).toMatchObject({ gravado: true, linhaInicial: 2, linhas: 2 });
    expect(escritas[0]?.range).toBe("'ABA'!F2:L3");
  });

  it("com registros: grava na linha seguinte a ultima preenchida, sem sobrescrever", async () => {
    const existentes = [linhaCartao("MASTER", 396.41).map(String), linhaCartao("MAESTRO", 375.75).map(String)];
    const { gateway, dados, escritas } = planilhaFalsa(existentes);
    const resultado = await gravarNaProximaLinha({
      gateway,
      planilhaId: "id",
      aba: "ABA",
      ultimaColuna: "L",
      linhas: [linhaCartao("ELO", 96.22)],
      chave: chaveCartao
    });
    expect(resultado).toMatchObject({ gravado: true, linhaInicial: 4 });
    expect(escritas[0]?.range).toBe("'ABA'!F4:L4");
    expect(dados[0]?.[4]).toBe("MASTER");
    expect(dados[1]?.[4]).toBe("MAESTRO");
  });

  it("registro que ja esta na aba (data curta da planilha) nao e gravado de novo, nem os outros", async () => {
    const jaEnviada = ["10/11/26", "J9BB07936155", "VND CAIXA PDV - 1M", "CRÉDITO", "ELO", "6", "96.22"];
    const { gateway, escritas } = planilhaFalsa([jaEnviada]);
    const resultado = await gravarNaProximaLinha({
      gateway,
      planilhaId: "id",
      aba: "ABA",
      ultimaColuna: "L",
      linhas: [linhaCartao("ELO", 96.22), linhaCartao("VISA", 214.58)],
      chave: chaveCartao
    });
    expect(resultado.gravado).toBe(false);
    expect(resultado.mensagem).toMatch(/JÁ ENVIADO/u);
    expect(escritas).toHaveLength(0);
  });

  it("so diz que gravou com a confirmacao real (releitura)", async () => {
    const { gateway } = planilhaFalsa([], { perderEscrita: true });
    const resultado = await gravarNaProximaLinha({
      gateway,
      planilhaId: "id",
      aba: "ABA",
      ultimaColuna: "N",
      linhas: [["10/11/2026", "VND CAIXA PDV - 1M", "LILIANE", 707.21, 1059.5, 449.83, 791.8, 1197.4, 197.35]],
      chave: chavePdv
    });
    expect(resultado.gravado).toBe(false);
    expect(resultado.mensagem).toMatch(/NÃO FOI CONFIRMADA/u);
  });
});
