import { describe, expect, it, vi } from "vitest";

// Texto como o PDF digital do cupom "Relatorio de Venda Geral" (R-225).
const CUPOM = `PADARIA LISBOA 2
  Relatorio de Venda Geral
  Data da emissão: 26/10/2026 - 13:58:46
  Período de 26/10/2026 06:14:58 até 26/10/2026 23:59:59
  Troco Inicial: R$ 243,20
  Saldo Inicial: R$ 0,00
  Forma pagamento Valor
  CLIENTES (VND/TRANS) R$ 148,81
  CRÉDITO (VND/TRANS) R$ 947,05
  DÉBITO (VND/TRAN) R$ 779,72
  DINHEIRO (VND) R$ 972,85
  PIX (VND/TRANS) R$ 601,68
  VOUCHER (VND/TRANS) R$ 224,16
  Total: R$ 3.674,27
  Despesas: R$ 0,00
  Sangria: -R$ 600,00
  Saldo Final Dinheiro: R$ 840,21
  Compilart - Sistema Menu 8.6`;

vi.mock("pdf-parse", () => ({
  PDFParse: class {
    async getText() {
      return { text: CUPOM };
    }
    async destroy() {}
  }
}));

import {
  extrairRelatorioVendasCreareComGemini,
  extrairRelatorioVendasCreareDePdf,
  lerTextoRelatorioVendasCreare
} from "../../api/src/caixa/gemini-relatorio-vendas-creare.js";

const leituraValida = {
  documentoLegivel: true,
  nomeLoja: "PADARIA LISBOA 2",
  dataEmissao: "26/10/2026 - 13:58:46",
  periodoInicio: "26/10/2026 06:14:58",
  periodoFim: "26/10/2026 23:59:59",
  trocoInicial: 243.2,
  saldoInicial: 0,
  clientes: 148.81,
  credito: 947.05,
  debito: 779.72,
  dinheiro: 972.85,
  pix: 601.68,
  voucher: 224.16,
  total: 3674.27,
  despesas: 0,
  sangria: -600,
  saldoFinalDinheiro: 840.21,
  camposDuvidosos: [],
  observacoes: []
};

describe("leitura da folha CREARE (Relatorio de Venda Geral)", () => {
  it("le o PDF com texto nativo campo a campo, na ordem do cupom", async () => {
    const resultado = await extrairRelatorioVendasCreareDePdf(Buffer.from("%PDF-ficticio"));

    expect(resultado).toMatchObject({
      documentoLegivel: true,
      dataEmissao: "26/10/2026 13:58:46",
      periodoInicio: "26/10/2026 06:14:58",
      periodoFim: "26/10/2026 23:59:59",
      trocoInicial: 243.2,
      saldoInicial: 0,
      clientes: 148.81,
      credito: 947.05,
      debito: 779.72,
      // "DINHEIRO (VND)", nunca o "Saldo Final Dinheiro".
      dinheiro: 972.85,
      pix: 601.68,
      voucher: 224.16,
      total: 3674.27,
      despesas: 0,
      sangria: 600,
      saldoFinalDinheiro: 840.21,
      camposDuvidosos: []
    });
  });

  it("deixa pendente o que nao esta impresso, sem estimar", () => {
    const resultado = lerTextoRelatorioVendasCreare("Relatorio de Venda Geral\nDINHEIRO (VND) R$ 10,00");
    expect(resultado?.dinheiro).toBe(10);
    expect(resultado?.credito).toBeNull();
    expect(resultado?.periodoInicio).toBeNull();
    expect(resultado?.camposDuvidosos).toEqual(expect.arrayContaining(["credito", "periodoInicio"]));
  });

  it("ignora texto que nao e a folha do CREARE", () => {
    expect(lerTextoRelatorioVendasCreare("Extrato bancario qualquer R$ 10,00")).toBeNull();
  });

  it("pede os rotulos exatos do cupom e normaliza a resposta da IA", async () => {
    let corpo:
      | {
          contents: Array<{ parts: Array<{ text?: string }> }>;
          generationConfig: { responseJsonSchema: { required: string[] } };
        }
      | undefined;
    const fetchMock = vi.fn(async (_entrada: string | URL | Request, opcoes?: RequestInit) => {
      if (typeof opcoes?.body !== "string") throw new Error("corpo da requisicao nao e texto");
      corpo = JSON.parse(opcoes.body) as typeof corpo;
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(leituraValida) }] } }] }),
        { status: 200 }
      );
    });

    const resultado = await extrairRelatorioVendasCreareComGemini(
      { dados: Buffer.from("folha-creare"), mimeType: "image/jpeg" },
      { chave: "segredo-teste", modelo: "gemini-teste", timeoutMs: 5_000 },
      fetchMock
    );

    expect(resultado.credito).toBe(947.05);
    // A folha imprime "-R$ 600,00": guarda positivo. A emissao perde o hifen.
    expect(resultado.sangria).toBe(600);
    expect(resultado.dataEmissao).toBe("26/10/2026 13:58:46");
    const texto = corpo?.contents[0]?.parts[0]?.text ?? "";
    for (const rotulo of [
      "Periodo de",
      "Troco Inicial",
      "CREDITO (VND/TRANS)",
      "DINHEIRO (VND)",
      "Saldo Final Dinheiro"
    ]) {
      expect(texto).toContain(rotulo);
    }
    expect(corpo?.generationConfig.responseJsonSchema.required).toEqual(
      expect.arrayContaining(["periodoInicio", "dataEmissao", "trocoInicial", "sangria", "saldoFinalDinheiro"])
    );
  });
});
