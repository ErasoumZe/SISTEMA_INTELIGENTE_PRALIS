// Leitura PROPRIA dos relatorios para a planilha da Tesouraria (Marco, 12/11/2026). Separada da leitura do fechamento
// (gemini-relatorio-maquininha / gemini-relatorio-vendas-creare): aqui precisamos de transacoes por bandeira, numero
// de serie e data das vendas, e nada disso pode mudar o que o fechamento ja conferiu.
import {
  leituraCartaoPlanilhaSchema,
  leituraPdvPlanilhaSchema,
  type LeituraCartaoPlanilha,
  type LeituraPdvPlanilha
} from "@padaria/shared/planilha-tesouraria";
import type { z } from "zod";
import { ErroDominio } from "../erros.js";

export type ConfigGeminiPlanilha = { chave: string; modelo: string; timeoutMs: number };
type Arquivo = { dados: Buffer; mimeType: string };

const CUIDADOS = `
Cuidados com impressao termica:
- Confusoes comuns: 0 e 8, 3 e 8, 5 e 6, 1 e 7. O zero pode aparecer cortado e parecer 8.
- Use subtotais e totais impressos so para PERCEBER que um digito pode estar errado. NUNCA altere um valor para a
  soma fechar. Se um numero estiver ilegivel ou duvidoso, devolva o que esta impresso (ou null se ilegivel) e cite o
  campo em camposDuvidosos.
- Nao invente dados que nao estao no papel.`;

const PROMPT_CARTAO = `Voce le um "RELATORIO RESUMIDO" de maquininha PagBank (foto de cupom termico).
Extraia SOMENTE o que esta impresso:
- data: a data das TRANSACOES (linha "DATA: dd/mm/aa DE ... ATE ..."), nao a "DATA DE EMISSAO". Formato dd/mm/aa ou dd/mm/aaaa.
- numeroSerie: o "NUMERO DE SERIE".
- totalEfetivado: o "TOTAL EFETIVADO" (quantidade de transacoes e valor).
- modalidades: uma por secao. "CREDITO A VISTA" -> "CRÉDITO"; "DEBITO" -> "DÉBITO"; "VOUCHER" -> "VOUCHER";
  "QR CODE DEBITO" ou "PIX" -> "PIX". Para cada uma: totalTransacoes e totalValor (linha TOTAL da secao) e as bandeiras
  (nome exatamente como impresso, quantidade de transacoes e valor). Se houver "CREDITO PARCELADO", inclua como
  "CRÉDITO" e cite em camposDuvidosos.
Valores em reais como numero (ex.: 1.059,60 -> 1059.6). Quantidades como inteiro (0034 -> 34).
${CUIDADOS}`;

const PROMPT_PDV = `Voce le um "Relatorio de Venda Geral" do sistema de PDV (CREARE/Compilart), foto de cupom termico.
Extraia SOMENTE o que esta impresso:
- data: a data das VENDAS (linha "Periodo de dd/mm/aaaa ..."), nao a "Data da emissao". Formato dd/mm/aaaa.
- formas (valor de cada forma de pagamento): credito = "CREDITO (VND/TRANS)", debito = "DEBITO (VND/TRAN)",
  voucher = "VOUCHER (VND/TRANS)", pix = "PIX (VND/TRANS)", dinheiro = "DINHEIRO (VND)", clientes = "CLIENTES (VND/TRANS)".
  Forma que nao aparece no papel: 0. Forma que aparece mas esta ilegivel: null.
- totalImpresso: o "Total:" das formas de pagamento (nao o "Saldo Final Dinheiro").
Valores em reais como numero (ex.: 1.197,40 -> 1197.4).
${CUIDADOS}`;

const numeroOuNulo = { type: ["number", "null"] };
const inteiroOuNulo = { type: ["integer", "null"] };
const SCHEMA_CARTAO = {
  type: "object",
  properties: {
    data: { type: ["string", "null"] },
    numeroSerie: { type: ["string", "null"] },
    totalEfetivado: {
      type: "object",
      properties: { transacoes: inteiroOuNulo, valor: numeroOuNulo },
      required: ["transacoes", "valor"]
    },
    modalidades: {
      type: "array",
      items: {
        type: "object",
        properties: {
          modalidade: { type: "string", enum: ["CRÉDITO", "DÉBITO", "VOUCHER", "PIX"] },
          totalTransacoes: inteiroOuNulo,
          totalValor: numeroOuNulo,
          bandeiras: {
            type: "array",
            items: {
              type: "object",
              properties: { bandeira: { type: "string" }, transacoes: inteiroOuNulo, valor: numeroOuNulo },
              required: ["bandeira", "transacoes", "valor"]
            }
          }
        },
        required: ["modalidade", "totalTransacoes", "totalValor", "bandeiras"]
      }
    },
    camposDuvidosos: { type: "array", items: { type: "string" } }
  },
  required: ["data", "numeroSerie", "totalEfetivado", "modalidades", "camposDuvidosos"]
};
const SCHEMA_PDV = {
  type: "object",
  properties: {
    data: { type: ["string", "null"] },
    formas: {
      type: "object",
      properties: {
        credito: numeroOuNulo,
        debito: numeroOuNulo,
        voucher: numeroOuNulo,
        pix: numeroOuNulo,
        dinheiro: numeroOuNulo,
        clientes: numeroOuNulo
      },
      required: ["credito", "debito", "voucher", "pix", "dinheiro", "clientes"]
    },
    totalImpresso: numeroOuNulo,
    camposDuvidosos: { type: "array", items: { type: "string" } }
  },
  required: ["data", "formas", "totalImpresso", "camposDuvidosos"]
};

type RespostaGemini = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };

async function lerComGemini<T>(
  prompt: string,
  schemaResposta: object,
  validador: z.ZodType<T>,
  arquivos: Arquivo[],
  config: ConfigGeminiPlanilha,
  fetchImpl: typeof fetch
): Promise<T> {
  if (!arquivos.length) throw new ErroDominio("Nenhuma foto do relatório anexada a este caixa.", 422, "PLANILHA_SEM_FOTO");
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
                ...arquivos.map((arquivo) => ({
                  inlineData: { mimeType: arquivo.mimeType, data: arquivo.dados.toString("base64") }
                }))
              ]
            }
          ],
          generationConfig: { temperature: 0, responseMimeType: "application/json", responseJsonSchema: schemaResposta }
        })
      }
    );
    if (!resposta.ok) {
      throw new ErroDominio(
        resposta.status === 429
          ? "O limite de leitura por IA foi atingido. Tente de novo em alguns minutos."
          : "A leitura por IA está indisponível agora. Tente de novo.",
        resposta.status === 429 ? 503 : 502,
        "PLANILHA_IA_INDISPONIVEL"
      );
    }
    const corpo = (await resposta.json()) as RespostaGemini;
    const texto = corpo.candidates?.[0]?.content?.parts?.find((parte) => parte.text)?.text;
    const validado = texto ? validador.safeParse(JSON.parse(texto)) : null;
    if (!validado?.success) {
      throw new ErroDominio("A IA não conseguiu ler este relatório. Preencha na prévia.", 422, "PLANILHA_IA_INCOMPLETA");
    }
    return validado.data;
  } catch (erro) {
    if (erro instanceof ErroDominio) throw erro;
    if (erro instanceof SyntaxError) {
      throw new ErroDominio("A IA devolveu uma leitura incompleta. Preencha na prévia.", 422, "PLANILHA_IA_INCOMPLETA");
    }
    if (erro instanceof Error && erro.name === "AbortError") {
      throw new ErroDominio("A leitura demorou demais. Tente de novo.", 504, "PLANILHA_IA_TIMEOUT");
    }
    throw new ErroDominio("Sem conexão com a leitura por IA. Tente de novo.", 503, "PLANILHA_IA_INDISPONIVEL");
  } finally {
    clearTimeout(timeout);
  }
}

export function lerCartaoParaPlanilha(arquivos: Arquivo[], config: ConfigGeminiPlanilha, fetchImpl: typeof fetch = fetch) {
  return lerComGemini<LeituraCartaoPlanilha>(
    PROMPT_CARTAO,
    SCHEMA_CARTAO,
    leituraCartaoPlanilhaSchema,
    arquivos,
    config,
    fetchImpl
  );
}

export function lerPdvParaPlanilha(arquivos: Arquivo[], config: ConfigGeminiPlanilha, fetchImpl: typeof fetch = fetch) {
  return lerComGemini<LeituraPdvPlanilha>(
    PROMPT_PDV,
    SCHEMA_PDV,
    leituraPdvPlanilhaSchema,
    arquivos,
    config,
    fetchImpl
  );
}

/** So para o ambiente local (mesma flag da maquininha simulada): dados claramente artificiais. */
export function leituraCartaoSimulada(numeroSerie: string | null, data: string): LeituraCartaoPlanilha {
  return {
    data,
    numeroSerie: numeroSerie ?? "SIMULADO000",
    totalEfetivado: { transacoes: 6, valor: 300 },
    modalidades: [
      {
        modalidade: "CRÉDITO",
        totalTransacoes: 2,
        totalValor: 100,
        bandeiras: [{ bandeira: "VISA (SIMULADO)", transacoes: 2, valor: 100 }]
      },
      {
        modalidade: "DÉBITO",
        totalTransacoes: 2,
        totalValor: 100,
        bandeiras: [{ bandeira: "MASTER (SIMULADO)", transacoes: 2, valor: 100 }]
      },
      { modalidade: "PIX", totalTransacoes: 2, totalValor: 100, bandeiras: [{ bandeira: "PIX", transacoes: 2, valor: 100 }] }
    ],
    camposDuvidosos: []
  };
}
export function leituraPdvSimulada(data: string): LeituraPdvPlanilha {
  return {
    data,
    formas: { credito: 100, debito: 100, voucher: 0, pix: 100, dinheiro: 50, clientes: 0 },
    totalImpresso: 350,
    camposDuvidosos: []
  };
}
