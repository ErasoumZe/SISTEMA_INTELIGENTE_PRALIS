import { relatorioVendasCreareSchema, type RelatorioVendasCreare } from "@padaria/shared/caixa";
import type { JsonValue } from "@padaria/shared/api";
import { PDFParse } from "pdf-parse";
import { ErroDominio } from "../erros.js";

export type ConfigGeminiRelatorioCreare = { chave: string; modelo: string; timeoutMs: number };

const valor = { type: ["number", "null"] } as const;
const dataHora = { type: ["string", "null"] } as const;
const camposFolha = {
  documentoLegivel: { type: "boolean" },
  nomeLoja: { type: ["string", "null"] },
  dataEmissao: dataHora,
  periodoInicio: dataHora,
  periodoFim: dataHora,
  trocoInicial: valor,
  saldoInicial: valor,
  clientes: valor,
  credito: valor,
  debito: valor,
  dinheiro: valor,
  pix: valor,
  voucher: valor,
  total: valor,
  despesas: valor,
  sangria: valor,
  saldoFinalDinheiro: valor,
  camposDuvidosos: { type: "array", items: { type: "string" } },
  observacoes: { type: "array", items: { type: "string" } }
} as const;
const schemaResposta = {
  type: "object",
  properties: camposFolha,
  required: Object.keys(camposFolha)
} as const;

// R-225 · a folha anexada e o cupom termico "Relatorio de Venda Geral" (Compilart, Sistema Menu).
const prompt = [
  'Leia UMA foto ou PDF do cupom "Relatorio de Venda Geral" do CREARE/Compilart (Sistema Menu).',
  "Extraia somente o que esta explicitamente impresso e responda o JSON solicitado.",
  "Mapeamento obrigatorio (rotulos exatos do cupom):",
  "- nomeLoja: a primeira linha do cupom (ex.: PADARIA LISBOA 2).",
  '- dataEmissao: a data e hora de "Data da emissao:", no formato DD/MM/AAAA HH:MM:SS (sem o hifen).',
  '- periodoInicio: a PRIMEIRA data e hora de "Periodo de ... ate ...", no formato DD/MM/AAAA HH:MM:SS.',
  '- periodoFim: a SEGUNDA data e hora de "Periodo de ... ate ..." (costuma ser 23:59:59; nao e a hora do fechamento).',
  '- trocoInicial: "Troco Inicial:". saldoInicial: "Saldo Inicial:".',
  '- Na tabela "Forma pagamento / Valor": clientes = "CLIENTES (VND/TRANS)", credito = "CREDITO (VND/TRANS)",',
  '  debito = "DEBITO (VND/TRAN)", dinheiro = "DINHEIRO (VND)", pix = "PIX (VND/TRANS)", voucher = "VOUCHER (VND/TRANS)".',
  '- total: "Total:" logo abaixo da tabela de formas de pagamento.',
  '- despesas: "Despesas:". sangria: "Sangria:" como numero POSITIVO (o cupom imprime com sinal de menos).',
  '- saldoFinalDinheiro: "Saldo Final Dinheiro:" (negativo somente se o cupom imprimir o sinal de menos).',
  '"Saldo Final Dinheiro" nunca preenche o campo dinheiro: dinheiro e somente a linha "DINHEIRO (VND)".',
  "Nao converta fuso, nao some, nao estime e nao complete valor cortado.",
  "Forma de pagamento que nao aparece no cupom fica null. Use null para valor ausente ou ambiguo e liste o campo em camposDuvidosos.",
  "Valor deve ser numero puro, sem R$, pontos de milhar ou virgulas. Responda somente JSON."
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

function lerMoeda(valor: string | undefined, sinal = "") {
  if (!valor) return null;
  const normalizado = valor.replace(/\./g, "").replace(",", ".");
  const numero = Number(normalizado);
  if (!Number.isFinite(numero)) return null;
  return sinal.includes("-") ? -numero : numero;
}

// Valor em reais logo depois do rotulo, com o sinal que o cupom imprime antes ou depois do "R$".
function moedaAposRotulo(texto: string, rotulo: string) {
  const encontrado = texto.match(
    new RegExp(`${rotulo}\\s*:?\\s*(-?)\\s*R\\$\\s*(-?)\\s*([\\d.]+,\\d{2}|\\d+(?:[.,]\\d+)?)`, "i")
  );
  return lerMoeda(encontrado?.[3], `${encontrado?.[1] ?? ""}${encontrado?.[2] ?? ""}`);
}

const DATA_HORA = "(\\d{2}\\/\\d{2}\\/\\d{4})\\s*-?\\s*(\\d{2}:\\d{2}:\\d{2})";

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
    return lerTextoRelatorioVendasCreare(resultado.text);
  } catch {
    return null;
  } finally {
    await parser?.destroy();
  }
}

/** Le o texto do cupom "Relatorio de Venda Geral" (rotulos na ordem impressa). */
export function lerTextoRelatorioVendasCreare(bruto: string): RelatorioVendasCreare | null {
  const texto = normalizarTexto(bruto);
  if (!texto || !/venda geral|forma pagamento|compilart|creare/i.test(texto)) return null;
  const emissao = texto.match(new RegExp(`Data da emissao\\s*:?\\s*${DATA_HORA}`, "i"));
  const periodo = texto.match(new RegExp(`Periodo de\\s*${DATA_HORA}\\s*ate\\s*${DATA_HORA}`, "i"));
  const positivo = (numero: number | null) => (numero === null ? null : Math.abs(numero));
  const valores = {
    trocoInicial: positivo(moedaAposRotulo(texto, "Troco Inicial")),
    saldoInicial: moedaAposRotulo(texto, "Saldo Inicial"),
    clientes: positivo(moedaAposRotulo(texto, "CLIENTES \\(VND\\/TRANS?\\)")),
    credito: positivo(moedaAposRotulo(texto, "CREDITO \\(VND\\/TRANS?\\)")),
    debito: positivo(moedaAposRotulo(texto, "DEBITO \\(VND\\/TRANS?\\)")),
    dinheiro: positivo(moedaAposRotulo(texto, "DINHEIRO \\(VND\\)")),
    pix: positivo(moedaAposRotulo(texto, "PIX \\(VND\\/TRANS?\\)")),
    voucher: positivo(moedaAposRotulo(texto, "VOUCHER \\(VND\\/TRANS?\\)")),
    total: positivo(moedaAposRotulo(texto, "\\bTotal")),
    despesas: positivo(moedaAposRotulo(texto, "\\bDespesas")),
    sangria: positivo(moedaAposRotulo(texto, "\\bSangria")),
    saldoFinalDinheiro: moedaAposRotulo(texto, "Saldo Final Dinheiro")
  };
  const datas = {
    dataEmissao: emissao ? `${emissao[1]} ${emissao[2]}` : null,
    periodoInicio: periodo ? `${periodo[1]} ${periodo[2]}` : null,
    periodoFim: periodo ? `${periodo[3]} ${periodo[4]}` : null
  };
  if (Object.values(valores).every((item) => item === null)) return null;
  const camposDuvidosos = Object.entries({ ...datas, ...valores })
    .filter(([, item]) => item === null)
    .map(([campo]) => campo);
  return relatorioVendasCreareSchema.parse({
    documentoLegivel: true,
    nomeLoja: null,
    ...datas,
    ...valores,
    camposDuvidosos,
    observacoes: ["Valores lidos do texto nativo do PDF; revise antes de gerar o relatório."]
  });
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
              parts: [
                { text: prompt },
                { inlineData: { mimeType: arquivo.mimeType, data: arquivo.dados.toString("base64") } }
              ]
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
    if (!texto)
      return falha(
        "A IA nao conseguiu ler esta folha. Preencha os campos visiveis manualmente.",
        422,
        "IA_RESPOSTA_INCOMPLETA"
      );
    let json: JsonValue;
    try {
      json = JSON.parse(texto) as JsonValue;
    } catch {
      return falha("A IA devolveu uma leitura incompleta. Revise a folha.", 422, "IA_RESPOSTA_INCOMPLETA");
    }
    const validado = relatorioVendasCreareSchema.safeParse(json);
    if (!validado.success)
      return falha("A IA devolveu campos invalidos. Revise a folha.", 422, "IA_RESPOSTA_INCOMPLETA");
    return validado.data;
  } catch (erro) {
    if (erro instanceof ErroDominio) throw erro;
    if (erro instanceof Error && erro.name === "AbortError")
      return falha("A leitura demorou demais. Tente novamente.", 504, "IA_TIMEOUT");
    return falha("Sem conexao com a leitura por IA. Preencha os campos visiveis manualmente.", 503);
  } finally {
    clearTimeout(timeout);
  }
}
