import { describe, expect, it, vi } from "vitest";

vi.mock("pdf-parse", () => ({
  PDFParse: class {
    async getText() {
      return {
        text: `Relatorio CREARE - PDV 01 - Manha
          Vendas por forma de pagamento
          Dinheiro R$ 50,00
          Credito R$ 31,50
          Debito R$ 18,50
          Pix R$ 22,00
          Voucher R$ 14,00
          Total R$ 136,00
          Resultado CREARE do turno: R$ 136,00. Nenhuma despesa no relatorio CREARE.`
      };
    }
    async destroy() {}
  }
}));

import {
  extrairRelatorioVendasCreareComGemini,
  extrairRelatorioVendasCreareDePdf
} from "../../api/src/caixa/gemini-relatorio-vendas-creare.js";

const leituraValida = {
  documentoLegivel: true,
  totalBruto: 1023.97,
  dinheiro: 327.5,
  credito: 213.37,
  debito: 347.55,
  pix: 86.55,
  voucher: 49,
  despesasExcetoSangria: 0,
  resultadoFinal: 1023.97,
  camposDuvidosos: [],
  observacoes: []
};

describe("cliente Gemini do relatorio CREARE", () => {
  it("preenche a folha quando o PDF possui texto nativo", async () => {
    const resultado = await extrairRelatorioVendasCreareDePdf(Buffer.from("%PDF-ficticio"));

    expect(resultado).toMatchObject({
      documentoLegivel: true,
      totalBruto: 136,
      dinheiro: 50,
      credito: 31.5,
      debito: 18.5,
      pix: 22,
      voucher: 14,
      despesasExcetoSangria: 0,
      resultadoFinal: 136,
      camposDuvidosos: []
    });
  });

  it("pede exatamente os campos da folha e nao usa saldo final como venda", async () => {
    let corpo: { contents: Array<{ parts: Array<{ text?: string; inlineData?: { data: string } }> }> } | undefined;
    const fetchMock = vi.fn(async (_entrada: string | URL | Request, opcoes?: RequestInit) => {
      if (typeof opcoes?.body !== "string") throw new Error("corpo da requisicao nao e texto");
      corpo = JSON.parse(opcoes.body) as typeof corpo;
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(leituraValida) }] } }] }),
        { status: 200 }
      );
    });

    const resultado = await extrairRelatorioVendasCreareComGemini(
      { dados: Buffer.from("folha-creare"), mimeType: "application/pdf" },
      { chave: "segredo-teste", modelo: "gemini-teste", timeoutMs: 5_000 },
      fetchMock
    );

    expect(resultado.credito).toBe(213.37);
    expect(resultado.resultadoFinal).toBe(1023.97);
    expect(corpo?.contents[0]?.parts[0]?.text).toContain("Saldo Final do caixa");
    expect(corpo?.contents[0]?.parts[0]?.text).toContain("despesasExcetoSangria");
  });
});
