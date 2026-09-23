import { relatorioMaquininhaIaSchema, type RelatorioMaquininhaIa } from "@padaria/shared/caixa";
import { ErroDominio } from "../erros.js";

export type ConfigGeminiMaquininha = { chave: string; modelo: string; timeoutMs: number };

const schemaResposta = {
  type: "object",
  properties: {
    documentoLegivel: { type: "boolean" },
    numeroMaquininha: { type: ["string", "null"] },
    periodo: { type: "string", enum: ["manha", "tarde", "noite", "nao_identificado"] },
    dataEmissao: { type: ["string", "null"] },
    credito: { type: ["number", "null"] },
    debito: { type: ["number", "null"] },
    pix: { type: ["number", "null"] },
    voucher: { type: ["number", "null"] },
    total: { type: ["number", "null"] },
    trocaInicial: { type: ["number", "null"] },
    saldoFinalDinheiro: { type: ["number", "null"] },
    camposDuvidosos: { type: "array", items: { type: "string" } },
    observacoes: { type: "array", items: { type: "string" } }
  },
  required: [
    "documentoLegivel",
    "numeroMaquininha",
    "periodo",
    "dataEmissao",
    "credito",
    "debito",
    "pix",
    "voucher",
    "total",
    "trocaInicial",
    "saldoFinalDinheiro",
    "camposDuvidosos",
    "observacoes"
  ]
} as const;

const prompt = `Leia um relatório resumido de maquininha/cartão brasileiro (foto ou PDF) para conferência de fechamento.
Extraia somente texto e valores visíveis; nunca estime números apagados, cortados ou ilegíveis.
Os campos são: número/série da maquininha, período do relatório, data de emissão, crédito, débito, Pix, voucher, total, troca inicial e saldo final em dinheiro.
Use valores numéricos sem R$, ponto de milhar ou vírgula. Quando não estiver visível, use null.
Período: use manha, tarde ou noite apenas se estiver escrito ou for inequivocamente definido pelo intervalo do próprio relatório; caso contrário use nao_identificado.
Se não for um relatório de maquininha legível, documentoLegivel=false, todos os valores null e explique em observacoes.
Liste em camposDuvidosos todos os campos ilegíveis ou ambíguos. Não escreva nada fora do JSON.`;

type RespostaGemini = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };

function falha(mensagem: string, status = 502, codigo = "IA_INDISPONIVEL"): never {
  throw new ErroDominio(mensagem, status, codigo);
}

export async function extrairRelatorioMaquininhaComGemini(
  arquivo: { dados: Buffer; mimeType: string },
  config: ConfigGeminiMaquininha,
  fetchImpl: typeof fetch = fetch
): Promise<RelatorioMaquininhaIa> {
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
          contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: arquivo.mimeType, data: arquivo.dados.toString("base64") } }] }],
          generationConfig: { temperature: 0, responseMimeType: "application/json", responseJsonSchema: schemaResposta }
        })
      }
    );
    if (!resposta.ok) {
      const mensagem =
        resposta.status === 401 || resposta.status === 403
          ? "A configuração da leitura por IA precisa ser revisada."
          : resposta.status === 429
            ? "O limite de leitura por IA foi atingido. Tente novamente mais tarde."
            : "A leitura do comprovante está indisponível. A foto continua válida como prova.";
      return falha(mensagem, resposta.status === 429 ? 503 : 502);
    }
    const corpo = (await resposta.json()) as RespostaGemini;
    const texto = corpo.candidates?.[0]?.content?.parts?.find((parte) => parte.text)?.text;
    if (!texto) return falha("A IA não conseguiu ler este comprovante. A foto continua válida como prova.", 422, "IA_RESPOSTA_INCOMPLETA");
    let json: unknown;
    try {
      json = JSON.parse(texto);
    } catch {
      return falha("A IA devolveu uma leitura incompleta. Revise manualmente.", 422, "IA_RESPOSTA_INCOMPLETA");
    }
    const validado = relatorioMaquininhaIaSchema.safeParse(json);
    if (!validado.success) return falha("A IA devolveu campos inválidos. Revise manualmente.", 422, "IA_RESPOSTA_INCOMPLETA");
    return validado.data;
  } catch (erro) {
    if (erro instanceof ErroDominio) throw erro;
    if (erro instanceof Error && erro.name === "AbortError") return falha("A leitura demorou demais. Tente novamente.", 504, "IA_TIMEOUT");
    return falha("Sem conexão com a leitura por IA. A foto continua válida como prova.", 503);
  } finally {
    clearTimeout(timeout);
  }
}
