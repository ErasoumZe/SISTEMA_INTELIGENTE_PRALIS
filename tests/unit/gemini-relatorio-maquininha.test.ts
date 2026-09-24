import { describe, expect, it, vi } from "vitest";
import { extrairRelatorioMaquininhaComGemini } from "../../api/src/caixa/gemini-relatorio-maquininha.js";

const leituraValida = {
  documentoLegivel: true,
  numeroMaquininha: "3901939815",
  dataEmissao: "01/09/2026 13:58",
  credito: 1216.78,
  debito: 1645.99,
  pix: 572.12,
  voucher: 566.69,
  total: 4901.58,
  trocaInicial: 0,
  saldoFinalDinheiro: null,
  camposDuvidosos: ["saldo final dinheiro"],
  observacoes: []
};

describe("cliente Gemini do relatório único da maquininha", () => {
  it("envia as fotos como um único relatório e não pede que a IA defina o turno", async () => {
    let corpo: { contents: Array<{ parts: Array<{ text?: string; inlineData?: { data: string } }> }> } | undefined;
    const fetchMock = vi.fn(async (_entrada: string | URL | Request, opcoes?: RequestInit) => {
      if (typeof opcoes?.body !== "string") throw new Error("corpo da requisicao nao e texto");
      corpo = JSON.parse(opcoes.body) as typeof corpo;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(leituraValida) }] } }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });

    const resultado = await extrairRelatorioMaquininhaComGemini(
      [
        { dados: Buffer.from("foto-um"), mimeType: "image/jpeg" },
        { dados: Buffer.from("foto-dois"), mimeType: "image/jpeg" }
      ],
      { chave: "segredo-teste", modelo: "gemini-teste", timeoutMs: 5_000 },
      fetchMock
    );

    expect(resultado.debito).toBe(1645.99);
    expect(corpo?.contents[0]?.parts).toHaveLength(3);
    expect(corpo?.contents[0]?.parts[1]?.inlineData?.data).toBe(Buffer.from("foto-um").toString("base64"));
    expect(corpo?.contents[0]?.parts[2]?.inlineData?.data).toBe(Buffer.from("foto-dois").toString("base64"));
    expect(corpo?.contents[0]?.parts[0]?.text).not.toContain("manha");
  });
});
