import { describe, expect, it, vi } from "vitest";
import { extrairNotaFiscalComGemini } from "../../api/src/discriminacao-ia/gemini-nota-fiscal.js";

const leituraValida = {
  documentoLegivel: true,
  fornecedorNome: "Fornecedor Teste",
  fornecedorCnpj: "12345678000190",
  numero: "362",
  serie: "002",
  dataEmissao: "2021-11-08",
  chaveAcesso: "1".repeat(44),
  itens: [
    {
      codigo: "ABC",
      ean: null,
      descricao: "Produto teste",
      quantidade: "1",
      valorUnitario: "1299.90",
      desconto: "0.00",
      valorTotal: "1299.90",
      confianca: 0.98,
      camposDuvidosos: []
    }
  ],
  valorProdutos: "1299.90",
  valorDesconto: "0.00",
  valorFrete: "0.00",
  valorTotal: "1299.90",
  confiancas: { fornecedor: 0.98, numero: 0.99, serie: 0.99, dataEmissao: 0.99, chaveAcesso: 0.9, totais: 0.99 },
  camposDuvidosos: [],
  observacoes: []
};

describe("cliente Gemini da discriminacao", () => {
  it("envia a chave somente no header e valida o JSON estruturado", async () => {
    let url = "";
    let init: RequestInit | undefined;
    const fetchMock = vi.fn(async (entrada: string | URL | Request, opcoes?: RequestInit) => {
      url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
      init = opcoes;
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(leituraValida) }] } }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    const resultado = await extrairNotaFiscalComGemini(
      { dados: Buffer.from([0xff, 0xd8, 0xff]), mimeType: "image/jpeg" },
      { chave: "segredo-super-seguro", modelo: "gemini-teste", timeoutMs: 5_000 },
      fetchMock
    );
    expect(resultado.numero).toBe("362");
    expect(url).toContain("gemini-teste:generateContent");
    expect(url).not.toContain("segredo-super-seguro");
    expect(typeof init?.body === "string" ? init.body : "").not.toContain("segredo-super-seguro");
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("segredo-super-seguro");
  });

  it("nao devolve o corpo sensivel do provedor em erros", async () => {
    const fetchMock = vi.fn(async () => new Response("segredo-super-seguro e imagem", { status: 500 }));
    await expect(
      extrairNotaFiscalComGemini(
        { dados: Buffer.from([0xff, 0xd8, 0xff]), mimeType: "image/jpeg" },
        { chave: "segredo-super-seguro", modelo: "gemini-teste", timeoutMs: 5_000 },
        fetchMock
      )
    ).rejects.toMatchObject({ message: "O servico de leitura da nota esta indisponivel.", code: "IA_INDISPONIVEL" });
  });

  it("recusa resposta sem conteudo sem inventar campos", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 }));
    await expect(
      extrairNotaFiscalComGemini(
        { dados: Buffer.from([0xff, 0xd8, 0xff]), mimeType: "image/jpeg" },
        { chave: "segredo", modelo: "gemini-teste", timeoutMs: 5_000 },
        fetchMock
      )
    ).rejects.toMatchObject({ code: "IA_RESPOSTA_INCOMPLETA" });
  });
});
