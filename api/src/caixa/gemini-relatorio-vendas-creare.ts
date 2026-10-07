import { relatorioVendasCreareSchema, type RelatorioVendasCreare } from "@padaria/shared/caixa";
import type { JsonValue } from "@padaria/shared/api";
import { PDFParse } from "pdf-parse";
import { ErroDominio } from "../erros.js";

export type ConfigGeminiRelatorioCreare = { chave: string; modelo: string; timeoutMs: number };

const schemaResposta = {
  type: "object",
  properties: {
    documentoLegivel: { type: "boolean" },
    totalBruto: { type: ["number", "null"] },
    dinheiro: { type: ["number", "null"] },
    credito: { type: ["number", "null"] },
    debito: { type: ["number", "null"] },
    pix: { type: ["number", "null"] },
    voucher: { type: ["number", "null"] },
    despesasExcetoSangria: { type: ["number", "null"] },
    resultadoFinal: { type: ["number", "null"] },
    camposDuvidosos: { type: "array", items: { type: "string" } },
    observacoes: { type: "array", items: { type: "string" } }
  },
  required: [
    "documentoLegivel",
    "totalBruto",
    "dinheiro",
    "credito",
    "debito",
    "pix",
    "voucher",
    "despesasExcetoSangria",
    "resultadoFinal",
    "camposDuvidosos",
    "observacoes"
  ]
} as const;

const prompt = [
  "Leia UMA foto ou PDF do Relatorio de fechamento de caixa do CREARE/Compilart.",
  "Extraia somente valores explicitamente visiveis e responda o JSON solicitado.",
  "Mapeamento obrigatorio:",
  '- totalBruto: "Valor Total de venda" ou "Total Bruto de Vendas".',
  '- dinheiro, credito, debito, pix e voucher: o "Total" da secao "Forma de Pagamento" correspondente.',
  '- despesasExcetoSangria: "Total de Despesas (Exceto Sangria)" no resumo final.',
  '- resultadoFinal: "Resultado" no resumo final.',
  '"Saldo Final do caixa", "Saldo inicial caixa", "Entradas e Saidas do Caixa" e sangrias nao devem preencher nenhum desses campos.',
  "Sao evidencias operacionais diferentes e nao podem ser usadas para inferir vendas.",
  "Nao some, nao estime e nao complete valor cortado. Use null para valor ausente ou ambiguo e liste o campo em camposDuvidosos.",
  "Valor deve ser numero puro, sem R$, pontos ou virgulas. Responda somente JSON."
].join("\n");

type RespostaGemini = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };

function falha(mensagem: string, status = 502, codigo = "IA_INDISPONIVEL"): never {
  throw new ErroDominio(mensagem, status, codigo);
}

function normalizarTexto(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function lerMoeda(valor: string | undefined) {
  if (!valor) return null;
  const normalizado = valor.replace(/\./g, "").replace(",", ".");
  const numero = Number(normalizado);
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}

function moedaAposRotulo(texto: string, rotulo: string) {
  const encontrado = texto.match(new RegExp(`${rotulo}\\s*:?[\\s\\S]{0,80}?R\\$\\s*([\\d.]+,\\d{2}|\\d+(?:[.,]\\d+)?)`, "i"));
  return lerMoeda(encontrado?.[1]);
}

/**
 * PDFs digitais do CREARE ja contem texto selecionavel. Ler esse texto localmente evita que um
 * documento perfeitamente legivel fique inutil quando a chave da IA nao esta instalada no servidor.
 * Foto e PDF escaneado continuam usando Gemini, pois nao possuem texto confiavel.
 */
export async function extrairRelatorioVendasCreareDePdf(arquivo: Buffer): Promise<RelatorioVendasCreare | null> {
  let parser: PDFParse | undefined;
  try {
    parser = new PDFParse({ data: new Uint8Array(arquivo) });
    const resultado = await parser.getText();
    const texto = normalizarTexto(resultado.text);
    if (!texto || !/vendas|pagamento|creare/i.test(texto)) return null;

    const dinheiro = moedaAposRotulo(texto, "Dinheiro");
    const credito = moedaAposRotulo(texto, "Credito");
    const debito = moedaAposRotulo(texto, "Debito");
    const pix = moedaAposRotulo(texto, "Pix");
    const voucher = moedaAposRotulo(texto, "Voucher");
    const totalBruto =
      moedaAposRotulo(texto, "Valor Total de venda") ??
      moedaAposRotulo(texto, "Total Bruto de Vendas") ??
      moedaAposRotulo(texto, "\\bTotal\\b");
    const despesasExcetoSangria =
      moedaAposRotulo(texto, "Total de Despesas \\(Exceto Sangria\\)") ??
      moedaAposRotulo(texto, "Despesas exceto sangria") ??
      (/nenhuma despesa/i.test(texto) ? 0 : null);
    const resultadoFinal = moedaAposRotulo(texto, "Resultado(?: CREARE do turno| final)?");
    const valores = { totalBruto, dinheiro, credito, debito, pix, voucher, despesasExcetoSangria, resultadoFinal };
    const camposDuvidosos = Object.entries(valores)
      .filter(([, valor]) => valor === null)
      .map(([campo]) => campo);
    if (camposDuvidosos.length === Object.keys(valores).length) return null;
    return relatorioVendasCreareSchema.parse({
      documentoLegivel: true,
      ...valores,
      camposDuvidosos,
      observacoes: ["Valores lidos do texto nativo do PDF; revise antes de gerar o relatÃ³rio."]
    });
  } catch {
    return null;
  } finally {
    await parser?.destroy();
  }
}

export async function extrairRelatorioVendasCreareComGemini(
  arquivo: { dados: Buffer; mimeType: string },
  config: ConfigGeminiRelatorioCreare,
  fetchImpl: typeof fetch = fetch
): Promise<RelatorioVendasCreare> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const resposta = await fetchImpl(
      "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(config.modelo) +
        ":generateContent",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": config.chave },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }, { inlineData: { mimeType: arquivo.mimeType, data: arquivo.dados.toString("base64") } }]
            }
          ],
          generationConfig: { temperature: 0, responseMimeType: "application/json", responseJsonSchema: schemaResposta }
        })
      }
    );
    if (!resposta.ok) {
      const mensagem =
        resposta.status === 401 || resposta.status === 403
          ? "A configuracao da leitura por IA precisa ser revisada."
          : resposta.status === 429
            ? "O limite de leitura por IA foi atingido. Tente novamente mais tarde."
            : "A leitura da folha CREARE esta indisponivel. Preencha os campos visiveis manualmente.";
      return falha(mensagem, resposta.status === 429 ? 503 : 502);
    }
    const corpo = (await resposta.json()) as RespostaGemini;
    const texto = corpo.candidates?.[0]?.content?.parts?.find((parte) => parte.text)?.text;
    if (!texto) return falha("A IA nao conseguiu ler esta folha. Preencha os campos visiveis manualmente.", 422, "IA_RESPOSTA_INCOMPLETA");
    let json: JsonValue;
    try {
      json = JSON.parse(texto) as JsonValue;
    } catch {
      return falha("A IA devolveu uma leitura incompleta. Revise a folha.", 422, "IA_RESPOSTA_INCOMPLETA");
    }
    const validado = relatorioVendasCreareSchema.safeParse(json);
    if (!validado.success) return falha("A IA devolveu campos invalidos. Revise a folha.", 422, "IA_RESPOSTA_INCOMPLETA");
    return validado.data;
  } catch (erro) {
    if (erro instanceof ErroDominio) throw erro;
    if (erro instanceof Error && erro.name === "AbortError") return falha("A leitura demorou demais. Tente novamente.", 504, "IA_TIMEOUT");
    return falha("Sem conexao com a leitura por IA. Preencha os campos visiveis manualmente.", 503);
  } finally {
    clearTimeout(timeout);
  }
}
