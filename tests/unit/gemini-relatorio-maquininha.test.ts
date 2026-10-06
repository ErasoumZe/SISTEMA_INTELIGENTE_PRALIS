import { describe, expect, it, vi } from "vitest";
import {
  extrairRelatorioMaquininhaComGemini,
  leituraRelatorioMaquininhaSimulada
} from "../../api/src/caixa/gemini-relatorio-maquininha.js";

const leituraValida = {
  documentoLegivel: true,
  numeroMaquininha: "3901939815",
  dataEmissao: "01/09/2026 13:58",
  acumulador: 4901.58,
  credito: 1216.78,
  debito: 1645.99,
  pix: 572.12,
  voucher: 566.69,
  detalhes: { credito: [{ nome: "credito", valor: 1216.78 }], debito: [], pix: [], voucher: [] },
  camposDuvidosos: [],
  observacoes: []
};

describe("cliente Gemini do relatorio da maquininha", () => {
  it("mantem a leitura local explicitamente artificial e com liquido igual ao cenário de vendas", () => {
    const manha = leituraRelatorioMaquininhaSimulada("manha", "MAQ-LOCAL-01");
    const tarde = leituraRelatorioMaquininhaSimulada("tarde", "MAQ-LOCAL-01");

    expect(manha.numeroMaquininha).toBe("MAQ-LOCAL-01");
    expect(tarde.credito! - manha.credito!).toBe(31.5);
    expect(tarde.debito! - manha.debito!).toBe(18.5);
    expect(tarde.pix! - manha.pix!).toBe(22);
    expect(tarde.voucher! - manha.voucher!).toBe(14);
    expect(tarde.observacoes).toContain("SIMULAÇÃO LOCAL: valores artificiais; não são uma leitura de documento.");
  });

  it("pede valores discriminados e nao deixa a IA definir o turno", async () => {
    let corpo: { contents: Array<{ parts: Array<{ text?: string; inlineData?: { data: string } }> }> } | undefined;
    const fetchMock = vi.fn(async (_entrada: string | URL | Request, opcoes?: RequestInit) => {
      if (typeof opcoes?.body !== "string") throw new Error("corpo da requisicao nao e texto");
      corpo = JSON.parse(opcoes.body) as typeof corpo;
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(leituraValida) }] } }] }),
        { status: 200 }
      );
    });

    const resultado = await extrairRelatorioMaquininhaComGemini(
      [{ dados: Buffer.from("foto-um"), mimeType: "image/jpeg" }],
      { chave: "segredo-teste", modelo: "gemini-teste", timeoutMs: 5_000 },
      fetchMock
    );

    expect(resultado.debito).toBe(1645.99);
    expect(resultado.detalhes.credito[0]?.nome).toBe("credito");
    expect(corpo?.contents[0]?.parts[0]?.text).toContain("detalhes");
    expect(corpo?.contents[0]?.parts[0]?.text).not.toContain("manhã");
  });
});
