import { relatorioMaquininhaIaSchema, type RelatorioMaquininhaIa } from "@padaria/shared/caixa";
import type { JsonValue } from "@padaria/shared/api";
import { ErroDominio } from "../erros.js";

export type ConfigGeminiMaquininha = { chave: string; modelo: string; timeoutMs: number };

/**
 * Dados explicitamente artificiais para exercitar o fluxo local sem enviar documentos a um provedor.
 * O chamador só pode usá-los em NODE_ENV=development, sob flag de ambiente dedicada.
 */
export function leituraRelatorioMaquininhaSimulada(
  tipoLeitura: "manha" | "tarde",
  numeroMaquininha: string | null
): RelatorioMaquininhaIa {
  const manha = tipoLeitura === "manha";
  const valores = manha
    ? { acumulador: 1850, credito: 1000, debito: 500, pix: 250, voucher: 100 }
    : { acumulador: 1936, credito: 1031.5, debito: 518.5, pix: 272, voucher: 114 };
  return {
    documentoLegivel: true,
    numeroMaquininha,
    dataEmissao: new Date().toISOString().slice(0, 10),
    ...valores,
    detalhes: {
      credito: [{ nome: manha ? "Saldo inicial simulado" : "Crédito simulado do turno", valor: valores.credito }],
      debito: [{ nome: manha ? "Saldo inicial simulado" : "Débito simulado do turno", valor: valores.debito }],
      pix: [{ nome: manha ? "Saldo inicial simulado" : "Pix simulado do turno", valor: valores.pix }],
      voucher: [{ nome: manha ? "Saldo inicial simulado" : "Voucher simulado do turno", valor: valores.voucher }]
    },
    camposDuvidosos: [],
    observacoes: ["SIMULAÇÃO LOCAL: valores artificiais; não são uma leitura de documento."],
    correcaoManual: null
  };
}

const detalhe = {
  type: "object",
  properties: { nome: { type: "string" }, valor: { type: "number" } },
  required: ["nome", "valor"]
} as const;

const schemaResposta = {
  type: "object",
  properties: {
    documentoLegivel: { type: "boolean" },
    numeroMaquininha: { type: ["string", "null"] },
    dataEmissao: { type: ["string", "null"] },
    acumulador: { type: ["number", "null"] },
    credito: { type: ["number", "null"] },
    debito: { type: ["number", "null"] },
    pix: { type: ["number", "null"] },
    voucher: { type: ["number", "null"] },
    detalhes: {
      type: "object",
      properties: {
        credito: { type: "array", items: detalhe },
        debito: { type: "array", items: detalhe },
        pix: { type: "array", items: detalhe },
        voucher: { type: "array", items: detalhe }
      },
      required: ["credito", "debito", "pix", "voucher"]
    },
    camposDuvidosos: { type: "array", items: { type: "string" } },
    observacoes: { type: "array", items: { type: "string" } }
  },
  required: [
    "documentoLegivel",
    "numeroMaquininha",
    "dataEmissao",
    "acumulador",
    "credito",
    "debito",
    "pix",
    "voucher",
    "detalhes",
    "camposDuvidosos",
    "observacoes"
  ]
} as const;

// Rotulos do "RELATORIO RESUMIDO" da PagBank usado nos PDVs (ex.: TOTAL EFETIVADO 2.552,61 = credito 947,05 +
// debito 779,72 + voucher 224,16 + Pix 601,68).
const prompt = `Leia UMA foto ou PDF de relatorio resumido de maquininha brasileiro (ex.: PagBank "RELATORIO RESUMIDO").
Extraia somente dados explicitamente visiveis: numero ou serie, data, acumulador, credito, debito, Pix e voucher.
Mapeamento obrigatorio:
- numeroMaquininha: "NUMERO DE SERIE". dataEmissao: "DATA DE EMISSAO" (como impresso).
- acumulador: "TOTAL EFETIVADO" (valor em R$, nunca a quantidade de transacoes).
- credito: o "TOTAL" da secao "CREDITO A VISTA". Se houver tambem "CREDITO PARCELADO" ou outra secao de credito, use null em credito e liste "credito" em camposDuvidosos.
- debito: o "TOTAL" da secao "DEBITO". "QR CODE DEBITO" NAO e debito.
- pix: o "TOTAL" da secao "QR CODE DEBITO" (linha "PIX") ou da secao "PIX".
- voucher: o "TOTAL" da secao "VOUCHER".
Em cada linha, o numero de 4 digitos (ex.: 0057) e a quantidade de transacoes, nunca valor.
A impressora termica imprime o ZERO cortado por um risco (parece "Ø"). Esse caractere e SEMPRE 0, nunca 8: "R$ 7Ø7,21" e 707.21.
Para cada forma, devolva as linhas discriminadas visiveis em detalhes (ex.: VISA, ELO, MASTER, TICKET FLEX), com nome e valor. Se nao houver linha discriminada, devolva lista vazia.
Nao some, nao estime, nao complete numeros cortados e nao compare fotos diferentes. Valores em reais como numero JSON com PONTO decimal e os centavos: R$ 947,05 vira 947.05; R$ 2.552,61 vira 2552.61. Nunca descarte os centavos nem devolva 94705. Use null quando nao estiver visivel.
O numero da maquininha e a hora do turno sao conferidos pelo sistema, nunca inventados pela IA. Se o documento nao for legivel, use documentoLegivel=false, valores null, listas vazias e explique em observacoes.
Liste em camposDuvidosos todo campo ambiguo. Responda somente o JSON solicitado.`;

type RespostaGemini = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };

const FORMAS = [
  ["credito", "Crédito"],
  ["debito", "Débito"],
  ["pix", "Pix"],
  ["voucher", "Voucher"]
] as const;
const emCentavos = (valor: number) => Math.round(valor * 100);
const reais = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * A IA le, o servidor confere a conta do proprio comprovante (11/11/2026). Caso real: PagBank com
 * CREDITO A VISTA 707,21 lido como 787,21 (zero cortado lido como 8) e o valor travado na tela.
 * 1) Em cada forma, o TOTAL tem de ser a soma das linhas discriminadas (ELO + MASTER + VISA). Se nao for,
 *    o total some (null) e vira duvidoso: o operador digita olhando a foto, em vez de herdar o erro.
 * 2) Credito + debito + Pix + voucher tem de dar o TOTAL EFETIVADO. Se nao der, quem nao tem linhas para
 *    conferir vira duvidoso (com o valor lido mantido); se todas foram conferidas, o duvidoso e o TOTAL EFETIVADO.
 * Nada e corrigido em silencio: o servidor nunca troca um numero lido por outro calculado.
 */
export function conferirSomasDaLeitura(leitura: RelatorioMaquininhaIa): RelatorioMaquininhaIa {
  if (!leitura.documentoLegivel) return leitura;
  const conferida = { ...leitura };
  const duvidosos = new Set(leitura.camposDuvidosos);
  const observacoes = [...leitura.observacoes];
  const semLinhas: string[] = [];

  for (const [forma, rotulo] of FORMAS) {
    const total = leitura[forma];
    const linhas = leitura.detalhes[forma];
    if (total === null) continue;
    if (!linhas.length) {
      semLinhas.push(forma);
      continue;
    }
    const soma = linhas.reduce((acumulado, linha) => acumulado + emCentavos(linha.valor), 0);
    if (soma === emCentavos(total)) continue;
    conferida[forma] = null;
    duvidosos.add(forma);
    observacoes.push(
      `${rotulo}: o total lido (${reais(emCentavos(total))}) não bate com a soma das linhas (${reais(soma)}). Confira na foto e digite o valor.`
    );
  }

  const formas = FORMAS.map(([forma]) => conferida[forma]);
  if (leitura.acumulador !== null && formas.every((valor) => valor !== null)) {
    const soma = formas.reduce((acumulado, valor) => acumulado + emCentavos(valor), 0);
    if (soma !== emCentavos(leitura.acumulador)) {
      // Aqui nao ha prova de QUAL numero errou: o valor fica, so destrava para o operador revisar.
      for (const campo of semLinhas.length ? semLinhas : ["acumulador"]) duvidosos.add(campo);
      observacoes.push(
        `A soma das formas (${reais(soma)}) não bate com o TOTAL EFETIVADO (${reais(emCentavos(leitura.acumulador))}). Confira na foto.`
      );
    }
  }

  return { ...conferida, camposDuvidosos: [...duvidosos].slice(0, 30), observacoes: observacoes.slice(0, 20) };
}

function falha(mensagem: string, status = 502, codigo = "IA_INDISPONIVEL"): never {
  throw new ErroDominio(mensagem, status, codigo);
}

export async function extrairRelatorioMaquininhaComGemini(
  arquivos: Array<{ dados: Buffer; mimeType: string }>,
  config: ConfigGeminiMaquininha,
  fetchImpl: typeof fetch = fetch
): Promise<RelatorioMaquininhaIa> {
  if (!arquivos.length) return falha("Envie ao menos uma foto ou PDF do relatorio da maquininha.", 400, "IA_SEM_ANEXO");
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
      const mensagem =
        resposta.status === 401 || resposta.status === 403
          ? "A configuracao da leitura por IA precisa ser revisada."
          : resposta.status === 429
            ? "O limite de leitura por IA foi atingido. Tente novamente mais tarde."
            : "A leitura do comprovante esta indisponivel. A foto continua valida como prova.";
      return falha(mensagem, resposta.status === 429 ? 503 : 502);
    }
    const corpo = (await resposta.json()) as RespostaGemini;
    const texto = corpo.candidates?.[0]?.content?.parts?.find((parte) => parte.text)?.text;
    if (!texto)
      return falha(
        "A IA nao conseguiu ler este comprovante. A foto continua valida como prova.",
        422,
        "IA_RESPOSTA_INCOMPLETA"
      );
    let json: JsonValue;
    try {
      json = JSON.parse(texto) as JsonValue;
    } catch {
      return falha("A IA devolveu uma leitura incompleta. Revise manualmente.", 422, "IA_RESPOSTA_INCOMPLETA");
    }
    const validado = relatorioMaquininhaIaSchema.safeParse(json);
    if (!validado.success)
      return falha("A IA devolveu campos invalidos. Revise manualmente.", 422, "IA_RESPOSTA_INCOMPLETA");
    return conferirSomasDaLeitura(validado.data);
  } catch (erro) {
    if (erro instanceof ErroDominio) throw erro;
    if (erro instanceof Error && erro.name === "AbortError")
      return falha("A leitura demorou demais. Tente novamente.", 504, "IA_TIMEOUT");
    return falha("Sem conexao com a leitura por IA. A foto continua valida como prova.", 503);
  } finally {
    clearTimeout(timeout);
  }
}
