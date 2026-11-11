import { describe, expect, it, vi } from "vitest";
import {
  conferirSomasDaLeitura,
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
    expect(corpo?.contents[0]?.parts[0]?.text).toContain("ZERO cortado");
  });
});

// Comprovante real: PagBank J9BB07936155, PDV 1 Manha da Lisboa 2 em 10/11/2026.
const pagbankLisboa = {
  documentoLegivel: true,
  numeroMaquininha: "J9BB07936155",
  dataEmissao: "10/11/26 14:01",
  acumulador: 3008.44,
  credito: 707.21,
  debito: 1059.6,
  pix: 791.8,
  voucher: 449.83,
  detalhes: {
    credito: [
      { nome: "ELO", valor: 96.22 },
      { nome: "MASTER", valor: 396.41 },
      { nome: "VISA", valor: 214.58 }
    ],
    debito: [
      { nome: "MAESTRO", valor: 375.75 },
      { nome: "VISA", valor: 394.96 },
      { nome: "ELO", valor: 120.96 },
      { nome: "MASTER", valor: 167.93 }
    ],
    pix: [{ nome: "PIX", valor: 791.8 }],
    voucher: [
      { nome: "PLUXEE REFEICAO", valor: 38.37 },
      { nome: "PLUXEE ALIMENTA", valor: 40.46 },
      { nome: "MASTERCARD", valor: 70.4 },
      { nome: "VR REFEICAO", valor: 24.25 },
      { nome: "VR ALIMENTACAO", valor: 34.28 },
      { nome: "VISA", valor: 34.79 },
      { nome: "ALELO REFEICAO", valor: 14.2 },
      { nome: "TICKET ALIMENTA", valor: 68.5 },
      { nome: "TICKET FLEX", valor: 120.68 },
      { nome: "ELO", valor: 3.9 }
    ]
  },
  camposDuvidosos: [],
  observacoes: [],
  correcaoManual: null
};

describe("conferencia das somas da leitura da maquininha", () => {
  it("leitura certa passa inteira, sem duvida", () => {
    const resultado = conferirSomasDaLeitura(pagbankLisboa);
    expect(resultado.credito).toBe(707.21);
    expect(resultado.camposDuvidosos).toEqual([]);
    expect(resultado.observacoes).toEqual([]);
  });

  it("zero cortado lido como 8 (707,21 virou 787,21): o credito some e vira duvidoso", () => {
    const resultado = conferirSomasDaLeitura({ ...pagbankLisboa, credito: 787.21 });
    expect(resultado.credito).toBeNull();
    expect(resultado.camposDuvidosos).toEqual(["credito"]);
    expect(resultado.observacoes.join(" ")).toContain("não bate com a soma das linhas");
    expect(resultado.debito).toBe(1059.6);
  });

  it("sem linhas para conferir, o TOTAL EFETIVADO acusa a forma, sem apagar o valor lido", () => {
    const resultado = conferirSomasDaLeitura({
      ...pagbankLisboa,
      credito: 787.21,
      detalhes: { ...pagbankLisboa.detalhes, credito: [] }
    });
    expect(resultado.credito).toBe(787.21);
    expect(resultado.camposDuvidosos).toEqual(["credito"]);
    expect(resultado.observacoes.join(" ")).toContain("TOTAL EFETIVADO");
  });

  it("todas as formas conferem com as linhas: o duvidoso e o proprio TOTAL EFETIVADO", () => {
    const resultado = conferirSomasDaLeitura({ ...pagbankLisboa, acumulador: 3088.44 });
    expect(resultado.camposDuvidosos).toEqual(["acumulador"]);
    expect(resultado.credito).toBe(707.21);
  });

  it("documento ilegivel nao e conferido", () => {
    const ilegivel = { ...pagbankLisboa, documentoLegivel: false, credito: 787.21 };
    expect(conferirSomasDaLeitura(ilegivel)).toEqual(ilegivel);
  });
});
