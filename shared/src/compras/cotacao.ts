import { z } from "zod";
import { diaDaSemanaIso, diaNegocio, janelaDiaNegocio, somarDias } from "../datas/index.js";
import { paraCentavos, pontosPercentuaisEmDezMilesimos } from "../dinheiro/index.js";

/**
 * R-216 — cotacao de compra respondida pelo fornecedor por link assinado.
 *
 * Tudo que envolve dinheiro mora aqui, numa funcao pura usada pelos DOIS lados: a tela do
 * fornecedor mostra o total enquanto ele digita, e o servidor recalcula com a MESMA funcao no envio
 * e grava o resultado. O navegador nunca e fonte do total gravado.
 *
 * Aritmetica inteira de ponta a ponta: dinheiro em centavos, quantidade em milesimos, percentual em
 * dez-milesimos de ponto. Um arredondamento por etapa, sempre no fim da etapa.
 */

/** Prazo do link, em dias uteis (segunda a sexta). Feriado nao e considerado: nao ha calendario. */
export const PRAZO_COTACAO_DIAS_UTEIS = 2;

export const tiposDescontoCotacao = ["valor", "percentual"] as const;
export type TipoDescontoCotacao = (typeof tiposDescontoCotacao)[number];

export const situacoesCotacao = ["aberta", "respondida", "revogada", "expirada"] as const;
export type SituacaoCotacao = (typeof situacoesCotacao)[number];

/**
 * Fim do prazo: o FIM do N-esimo dia util contado a partir do dia seguinte ao envio, no fuso do
 * negocio. Enviado numa segunda as 10h, vale ate o fim da quarta. Enviado na sexta, vale ate o fim
 * da terca. Devolve o instante exclusivo (meia-noite do dia seguinte), igual a `janelaDiaNegocio`.
 */
export function expiracaoCotacao(agora: Date, diasUteis = PRAZO_COTACAO_DIAS_UTEIS): Date {
  let dia = diaNegocio(agora);
  let contados = 0;
  while (contados < diasUteis) {
    dia = somarDias(dia, 1);
    if (diaDaSemanaIso(dia) <= 5) contados += 1;
  }
  return janelaDiaNegocio(dia).fim;
}

/** Quantidade do pedido (numeric 14,3) em milesimos inteiros. "4.500" -> 4500. */
export function quantidadeEmMilesimos(quantidade: string | number): number {
  const texto = String(quantidade).trim().replace(",", ".");
  const [inteiro = "0", decimal = ""] = texto.split(".");
  return (Number.parseInt(inteiro, 10) || 0) * 1000 + (Number.parseInt(decimal.padEnd(3, "0").slice(0, 3), 10) || 0);
}

export type ItemCotacaoEntrada = {
  id: string;
  quantidade: string | number;
  indisponivel: boolean;
  valorUnitario: string | number | null;
  descontoTipo: TipoDescontoCotacao | null;
  descontoValor: string | number | null;
};

export type DescontoCotacaoEntrada = {
  tipo: TipoDescontoCotacao | null;
  valor: string | number | null;
};

export type ItemCotacaoCalculado = {
  id: string;
  indisponivel: boolean;
  /** Quantidade x valor informado, antes de qualquer desconto. */
  brutoCentavos: number;
  /** Preco por unidade depois do desconto do PROPRIO item. */
  unitarioComDescontoCentavos: number;
  descontoItemCentavos: number;
  /** Total do item depois do desconto do proprio item. */
  totalItemCentavos: number;
  /** Fatia do desconto geral que coube a este item. */
  rateioGeralCentavos: number;
  totalFinalCentavos: number;
  /** Preco efetivo por unidade em dez-milesimos de real (4 casas), depois de tudo. */
  unitarioFinalDezMilesimos: number;
  erro: string | null;
};

export type CotacaoCalculada = {
  itens: ItemCotacaoCalculado[];
  totalBrutoCentavos: number;
  descontoItensCentavos: number;
  totalItensCentavos: number;
  descontoGeralCentavos: number;
  totalFinalCentavos: number;
  /** Erro geral (desconto do pedido). Os de item vivem em cada `itens[].erro`. */
  erroGeral: string | null;
};

const CEM_POR_CENTO = 1_000_000; // 100 pontos percentuais em dez-milesimos.

function descontoUnitario(
  unitarioCentavos: number,
  tipo: TipoDescontoCotacao | null,
  valor: string | number | null
): { centavos: number; erro: string | null } {
  if (!tipo || valor === null || valor === "") return { centavos: 0, erro: null };
  if (tipo === "valor") {
    const centavos = paraCentavos(valor);
    if (centavos > unitarioCentavos) return { centavos: unitarioCentavos, erro: "Desconto maior que o valor." };
    return { centavos, erro: null };
  }
  const pontos = pontosPercentuaisEmDezMilesimos(valor);
  if (pontos > CEM_POR_CENTO) return { centavos: unitarioCentavos, erro: "Desconto acima de 100%." };
  return { centavos: Math.round((unitarioCentavos * pontos) / CEM_POR_CENTO), erro: null };
}

/**
 * Rateio pelo maior resto: cada item recebe a parte inteira proporcional ao seu total, e os
 * centavos que sobram vao, um a um, para quem teve a maior fracao. A soma das fatias e SEMPRE
 * exatamente o desconto geral — nunca um centavo a mais ou a menos.
 */
function ratear(descontoCentavos: number, pesos: number[]): number[] {
  const total = pesos.reduce((soma, peso) => soma + peso, 0);
  if (descontoCentavos <= 0 || total <= 0) return pesos.map(() => 0);
  const brutas = pesos.map((peso) => (descontoCentavos * peso) / total);
  const fatias = brutas.map(Math.floor);
  let sobra = descontoCentavos - fatias.reduce((soma, fatia) => soma + fatia, 0);
  const ordem = brutas
    .map((bruta, indice) => ({ indice, resto: bruta - Math.floor(bruta) }))
    .sort((a, b) => b.resto - a.resto || a.indice - b.indice);
  for (const { indice } of ordem) {
    if (sobra <= 0) break;
    fatias[indice] = (fatias[indice] ?? 0) + 1;
    sobra -= 1;
  }
  return fatias;
}

/**
 * Calcula a cotacao inteira.
 *
 * - Desconto de item em R$ e POR UNIDADE ("valor com desconto do produto" e o preco unitario ja
 *   descontado); em % incide sobre o preco unitario. As duas formas viram o mesmo numero por unidade.
 * - Desconto geral incide sobre a soma dos itens JA descontados e e rateado proporcionalmente,
 *   para que cada item saiba seu preco efetivo — e esse preco que vira "ultimo valor" depois.
 * - Item marcado como indisponivel fica fora de todos os totais.
 */
export function calcularCotacao(itens: ItemCotacaoEntrada[], descontoGeral: DescontoCotacaoEntrada): CotacaoCalculada {
  const parciais = itens.map((item) => {
    const milesimos = quantidadeEmMilesimos(item.quantidade);
    const unitario = item.indisponivel ? 0 : Math.max(0, paraCentavos(item.valorUnitario));
    const desconto = item.indisponivel
      ? { centavos: 0, erro: null }
      : descontoUnitario(unitario, item.descontoTipo, item.descontoValor);
    const unitarioComDesconto = unitario - desconto.centavos;
    const bruto = Math.round((milesimos * unitario) / 1000);
    const totalItem = Math.round((milesimos * unitarioComDesconto) / 1000);
    return { item, milesimos, unitarioComDesconto, bruto, totalItem, erro: desconto.erro };
  });

  const totalBruto = parciais.reduce((soma, parcial) => soma + parcial.bruto, 0);
  const totalItens = parciais.reduce((soma, parcial) => soma + parcial.totalItem, 0);

  let erroGeral: string | null = null;
  let descontoGeralCentavos = 0;
  if (descontoGeral.tipo && descontoGeral.valor !== null && descontoGeral.valor !== "") {
    if (descontoGeral.tipo === "valor") {
      descontoGeralCentavos = paraCentavos(descontoGeral.valor);
    } else {
      const pontos = pontosPercentuaisEmDezMilesimos(descontoGeral.valor);
      if (pontos > CEM_POR_CENTO) erroGeral = "Desconto acima de 100%.";
      descontoGeralCentavos = Math.round((totalItens * Math.min(pontos, CEM_POR_CENTO)) / CEM_POR_CENTO);
    }
    if (descontoGeralCentavos > totalItens) {
      erroGeral = "Desconto do pedido maior que o total.";
      descontoGeralCentavos = totalItens;
    }
  }

  const fatias = ratear(
    descontoGeralCentavos,
    parciais.map((parcial) => parcial.totalItem)
  );

  const calculados = parciais.map((parcial, indice): ItemCotacaoCalculado => {
    const rateio = fatias[indice] ?? 0;
    const totalFinal = parcial.totalItem - rateio;
    return {
      id: parcial.item.id,
      indisponivel: parcial.item.indisponivel,
      brutoCentavos: parcial.bruto,
      unitarioComDescontoCentavos: parcial.unitarioComDesconto,
      descontoItemCentavos: parcial.bruto - parcial.totalItem,
      totalItemCentavos: parcial.totalItem,
      rateioGeralCentavos: rateio,
      totalFinalCentavos: totalFinal,
      // centavos -> dez-milesimos de real e o fator 100; dividir pela quantidade em milesimos pede x1000.
      unitarioFinalDezMilesimos: parcial.milesimos > 0 ? Math.round((totalFinal * 100 * 1000) / parcial.milesimos) : 0,
      erro: parcial.erro
    };
  });

  return {
    itens: calculados,
    totalBrutoCentavos: totalBruto,
    descontoItensCentavos: totalBruto - totalItens,
    totalItensCentavos: totalItens,
    descontoGeralCentavos,
    totalFinalCentavos: totalItens - descontoGeralCentavos,
    erroGeral
  };
}

/**
 * Pendencias que impedem ENVIAR (o rascunho salva mesmo incompleto). Devolve mensagens prontas
 * para a tela; `descricaoPorId` deixa a mensagem dizer QUAL produto falta.
 */
export function pendenciasParaEnviar(
  itens: ItemCotacaoEntrada[],
  calculo: CotacaoCalculada,
  descricaoPorId: Record<string, string> = {}
): string[] {
  const pendencias: string[] = [];
  const disponiveis = itens.filter((item) => !item.indisponivel);
  if (!disponiveis.length) pendencias.push("Informe o valor de ao menos um item.");
  for (const item of disponiveis) {
    const nome = descricaoPorId[item.id] ?? "item";
    if (paraCentavos(item.valorUnitario) <= 0) pendencias.push(`Informe o valor de ${nome}.`);
  }
  for (const item of calculo.itens) {
    if (item.erro) pendencias.push(`${descricaoPorId[item.id] ?? "Item"}: ${item.erro}`);
  }
  if (calculo.erroGeral) pendencias.push(calculo.erroGeral);
  return pendencias;
}

/** Dez-milesimos de real -> texto decimal de 4 casas, para coluna numeric(14,4). */
export function dezMilesimosParaDecimal(valor: number): string {
  const absoluto = Math.abs(Math.trunc(valor));
  const sinal = valor < 0 ? "-" : "";
  return `${sinal}${Math.trunc(absoluto / 10_000)}.${String(absoluto % 10_000).padStart(4, "0")}`;
}

// --- Contrato HTTP ---------------------------------------------------------------------------------

const uuidSchema = z.string().uuid();

function textoDecimal(casas: number) {
  const padrao = new RegExp(`^\\d{1,9}(\\.\\d{1,${casas}})?$`, "u");
  return z.preprocess(
    (valor) => {
      if (valor === null || valor === undefined) return null;
      // Numero ou texto viram texto; qualquer outra coisa segue adiante e o `z.string` recusa.
      if (typeof valor !== "string" && typeof valor !== "number") return valor;
      const texto = String(valor).trim().replace(",", ".");
      return texto === "" ? null : texto;
    },
    z.string().regex(padrao, `Use apenas numeros, com ate ${casas} casas decimais.`).nullable()
  );
}

export const cotacaoRespostaPayloadSchema = z.object({
  itens: z
    .array(
      z.object({
        pedidoItemId: uuidSchema,
        indisponivel: z.boolean().default(false),
        valorUnitario: textoDecimal(2).default(null),
        descontoTipo: z.enum(tiposDescontoCotacao).nullable().default(null),
        descontoValor: textoDecimal(4).default(null)
      })
    )
    .max(500),
  descontoGeralTipo: z.enum(tiposDescontoCotacao).nullable().default(null),
  descontoGeralValor: textoDecimal(4).default(null),
  observacao: z.string().trim().max(1_000).nullable().default(null),
  prazoEntrega: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .nullable()
    .default(null),
  condicaoPagamento: z.string().trim().max(200).nullable().default(null)
});

export type CotacaoRespostaPayload = z.infer<typeof cotacaoRespostaPayloadSchema>;

export type CotacaoItemDto = {
  pedidoItemId: string;
  descricao: string;
  quantidade: string;
  unidade: string | null;
  /** Preco efetivo por unidade da ultima cotacao CONFIRMADA deste produto. Nulo sem historico. */
  ultimoValor: string | null;
  indisponivel: boolean;
  valorUnitario: string | null;
  descontoTipo: TipoDescontoCotacao | null;
  descontoValor: string | null;
};

/** O que o fornecedor ve. Fora de `aberta`, os itens vem vazios: nao ha mais o que editar. */
export type CotacaoPublicaDto = {
  situacao: SituacaoCotacao;
  empresaNome: string;
  fornecedorNome: string;
  referencia: string;
  expiraEm: string;
  respondidaEm: string | null;
  itens: CotacaoItemDto[];
  descontoGeralTipo: TipoDescontoCotacao | null;
  descontoGeralValor: string | null;
  observacao: string | null;
  prazoEntrega: string | null;
  condicaoPagamento: string | null;
};

/** O que o Comprador ve no detalhe do pedido. */
export type CotacaoResumoDto = CotacaoPublicaDto & {
  id: string;
  criadaEm: string;
};

export type CotacaoGeradaDto = {
  token: string;
  expiraEm: string;
};

/** DTO -> entrada do calculo. Uma funcao so, para tela e servidor montarem a mesma entrada. */
export function entradaDoCalculo(
  cotacao: Pick<CotacaoPublicaDto, "itens" | "descontoGeralTipo" | "descontoGeralValor">
): {
  itens: ItemCotacaoEntrada[];
  descontoGeral: DescontoCotacaoEntrada;
} {
  return {
    itens: cotacao.itens.map((item) => ({
      id: item.pedidoItemId,
      quantidade: item.quantidade,
      indisponivel: item.indisponivel,
      valorUnitario: item.valorUnitario,
      descontoTipo: item.descontoTipo,
      descontoValor: item.descontoValor
    })),
    descontoGeral: { tipo: cotacao.descontoGeralTipo, valor: cotacao.descontoGeralValor }
  };
}
