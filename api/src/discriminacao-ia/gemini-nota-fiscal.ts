import { z } from "zod";
import type { DadosExternos } from "@padaria/shared/api";
import { ErroDominio } from "../erros.js";

const decimalExtraidoSchema = z
  .string()
  .regex(/^\d+(?:\.\d{1,4})?$/)
  .nullable()
  .default(null);
const textoExtraidoSchema = z.string().trim().max(500).nullable().default(null);
const confiancaSchema = z.number().min(0).max(1).catch(0);

const itemExtraidoSchema = z.object({
  codigo: textoExtraidoSchema,
  ean: textoExtraidoSchema,
  descricao: textoExtraidoSchema,
  quantidade: decimalExtraidoSchema,
  valorUnitario: decimalExtraidoSchema,
  desconto: decimalExtraidoSchema,
  valorTotal: decimalExtraidoSchema,
  confianca: confiancaSchema,
  camposDuvidosos: z.array(z.string().max(80)).max(20).catch([])
});

export const notaFiscalExtraidaSchema = z.object({
  documentoLegivel: z.boolean().catch(false),
  fornecedorNome: textoExtraidoSchema,
  fornecedorCnpj: textoExtraidoSchema,
  numero: textoExtraidoSchema,
  serie: textoExtraidoSchema,
  dataEmissao: textoExtraidoSchema,
  chaveAcesso: textoExtraidoSchema,
  itens: z.array(itemExtraidoSchema).max(200).catch([]),
  valorProdutos: decimalExtraidoSchema,
  valorDesconto: decimalExtraidoSchema,
  valorFrete: decimalExtraidoSchema,
  valorTotal: decimalExtraidoSchema,
  confiancas: z
    .object({
      fornecedor: confiancaSchema,
      numero: confiancaSchema,
      serie: confiancaSchema,
      dataEmissao: confiancaSchema,
      chaveAcesso: confiancaSchema,
      totais: confiancaSchema
    })
    .catch({ fornecedor: 0, numero: 0, serie: 0, dataEmissao: 0, chaveAcesso: 0, totais: 0 }),
  camposDuvidosos: z.array(z.string().max(120)).max(100).catch([]),
  observacoes: z.array(z.string().max(300)).max(50).catch([])
});

export type NotaFiscalExtraida = z.infer<typeof notaFiscalExtraidaSchema>;

const schemaResposta = {
  type: "object",
  additionalProperties: false,
  properties: {
    documentoLegivel: { type: "boolean" },
    fornecedorNome: { type: ["string", "null"] },
    fornecedorCnpj: { type: ["string", "null"] },
    numero: { type: ["string", "null"] },
    serie: { type: ["string", "null"] },
    dataEmissao: { type: ["string", "null"], description: "Data YYYY-MM-DD" },
    chaveAcesso: { type: ["string", "null"], description: "44 digitos, sem espacos" },
    itens: {
      type: "array",
      maxItems: 200,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          codigo: { type: ["string", "null"] },
          ean: { type: ["string", "null"] },
          descricao: { type: ["string", "null"] },
          quantidade: { type: ["string", "null"] },
          valorUnitario: { type: ["string", "null"] },
          desconto: { type: ["string", "null"] },
          valorTotal: { type: ["string", "null"] },
          confianca: { type: "number", minimum: 0, maximum: 1 },
          camposDuvidosos: { type: "array", items: { type: "string" } }
        },
        required: [
          "codigo",
          "ean",
          "descricao",
          "quantidade",
          "valorUnitario",
          "desconto",
          "valorTotal",
          "confianca",
          "camposDuvidosos"
        ]
      }
    },
    valorProdutos: { type: ["string", "null"] },
    valorDesconto: { type: ["string", "null"] },
    valorFrete: { type: ["string", "null"] },
    valorTotal: { type: ["string", "null"] },
    confiancas: {
      type: "object",
      additionalProperties: false,
      properties: {
        fornecedor: { type: "number", minimum: 0, maximum: 1 },
        numero: { type: "number", minimum: 0, maximum: 1 },
        serie: { type: "number", minimum: 0, maximum: 1 },
        dataEmissao: { type: "number", minimum: 0, maximum: 1 },
        chaveAcesso: { type: "number", minimum: 0, maximum: 1 },
        totais: { type: "number", minimum: 0, maximum: 1 }
      },
      required: ["fornecedor", "numero", "serie", "dataEmissao", "chaveAcesso", "totais"]
    },
    camposDuvidosos: { type: "array", items: { type: "string" } },
    observacoes: { type: "array", items: { type: "string" } }
  },
  required: [
    "documentoLegivel",
    "fornecedorNome",
    "fornecedorCnpj",
    "numero",
    "serie",
    "dataEmissao",
    "chaveAcesso",
    "itens",
    "valorProdutos",
    "valorDesconto",
    "valorFrete",
    "valorTotal",
    "confiancas",
    "camposDuvidosos",
    "observacoes"
  ]
} as const;

const prompt = `Leia esta nota fiscal brasileira (DANFE/NF-e) para auxiliar uma discriminacao manual.
Extraia somente o que estiver visivel. Nao suponha nem complete texto ilegivel.
O fornecedor e o EMITENTE, nunca o destinatario ou a transportadora.
Use ponto como separador decimal e data no formato YYYY-MM-DD.
Valores monetarios nao podem ter simbolo nem separador de milhar.
Marque em camposDuvidosos todo campo ilegivel, ambiguo ou com confianca abaixo de 0.8.
Se a imagem nao for uma nota fiscal legivel, retorne documentoLegivel=false e valores null.
Nunca inclua explicacoes fora do JSON.`;

type RespostaGemini = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
};

export type ConfigGemini = { chave: string; modelo: string; timeoutMs: number };

export async function extrairNotaFiscalComGemini(
  imagem: { dados: Buffer; mimeType: string },
  config: ConfigGemini,
  fetchImpl: typeof fetch = fetch
): Promise<NotaFiscalExtraida> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const resposta = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.modelo)}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": config.chave },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                { inlineData: { mimeType: imagem.mimeType, data: imagem.dados.toString("base64") } }
              ]
            }
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseJsonSchema: schemaResposta
          }
        })
      }
    );
    if (!resposta.ok) {
      const status = resposta.status === 429 ? 503 : 502;
      throw new ErroDominio(
        resposta.status === 429
          ? "O servico de leitura esta ocupado. Aguarde e tente novamente."
          : "O servico de leitura da nota esta indisponivel.",
        status,
        resposta.status === 429 ? "IA_LIMITE_TEMPORARIO" : "IA_INDISPONIVEL"
      );
    }
    const corpo = (await resposta.json()) as RespostaGemini;
    const texto = corpo.candidates?.[0]?.content?.parts?.find((parte) => parte.text)?.text;
    if (!texto) throw new ErroDominio("A IA nao conseguiu ler esta imagem.", 422, "IA_RESPOSTA_INCOMPLETA");
    let json: DadosExternos;
    try {
      json = JSON.parse(texto);
    } catch {
      throw new ErroDominio("A IA devolveu uma leitura incompleta. Tente outra foto.", 422, "IA_RESPOSTA_INCOMPLETA");
    }
    const validado = notaFiscalExtraidaSchema.safeParse(json);
    if (!validado.success) {
      throw new ErroDominio("A IA devolveu uma leitura incompleta. Revise manualmente.", 422, "IA_RESPOSTA_INCOMPLETA");
    }
    return validado.data;
  } catch (erro) {
    if (erro instanceof ErroDominio) throw erro;
    if (erro instanceof Error && erro.name === "AbortError") {
      throw new ErroDominio("A leitura da nota demorou demais. Tente novamente.", 504, "IA_TIMEOUT");
    }
    throw new ErroDominio("Sem conexao com o servico de leitura. Tente novamente.", 503, "IA_INDISPONIVEL");
  } finally {
    clearTimeout(timeout);
  }
}
