import { z } from "zod";

// Cotacao por fornecedor (doc 58 §4, Rodrigo 23/10/2026): uma linha por PRODUTO em cotacao, com as bolinhas; as
// colunas contam quantos fornecedores estao em cada situacao. "Enviado" mostra para quantos fornecedores o produto
// foi; as outras colunas contam onde cada um esta agora.

export const COLUNAS_COTACAO = ["enviado", "cotado", "retornado", "com_aumento", "comprado"] as const;
export type ColunaCotacao = (typeof COLUNAS_COTACAO)[number];

export const ROTULO_COLUNA_COTACAO: Record<ColunaCotacao, string> = {
  enviado: "Enviado",
  cotado: "Cotado",
  retornado: "Retornado",
  com_aumento: "Com aumento",
  comprado: "Comprado"
};

export const painelComprasQuerySchema = z.object({ empresaId: z.string().uuid() });

/**
 * Onde o fornecedor esta com este produto. Comprado: ganhou. Enviou: indisponivel ou o produto ja foi de outro =
 * Retornado; preco acima da referencia (ou sem referencia) = Com aumento; dentro da referencia mas sem compra
 * (fora da margem ou do teto) = Retornado. So salvou sem enviar = Cotado. Nada ainda = Enviado.
 */
export function situacaoDaOferta(oferta: {
  compradoDeste: boolean;
  compradoDeOutro: boolean;
  enviada: { indisponivel: boolean; custo: number | null } | null;
  rascunho: boolean;
  referencia: number | null;
}): ColunaCotacao {
  if (oferta.compradoDeste) return "comprado";
  if (oferta.enviada) {
    if (oferta.enviada.indisponivel || oferta.compradoDeOutro || oferta.enviada.custo === null) return "retornado";
    if (oferta.referencia === null || oferta.enviada.custo > oferta.referencia + 0.00005) return "com_aumento";
    return "retornado";
  }
  return oferta.rascunho ? "cotado" : "enviado";
}

export type CelulasCotacao = Record<ColunaCotacao, number>;

export function celulasZeradas(): CelulasCotacao {
  return { enviado: 0, cotado: 0, retornado: 0, com_aumento: 0, comprado: 0 };
}

/** Soma as situacoes de um produto: Enviado conta todos os fornecedores; as demais, onde cada um esta. */
export function contarSituacoes(situacoes: ColunaCotacao[]): CelulasCotacao {
  const celulas = celulasZeradas();
  celulas.enviado = situacoes.length;
  for (const situacao of situacoes) if (situacao !== "enviado") celulas[situacao] += 1;
  return celulas;
}

export type ProdutoEmCotacaoDto = {
  produtoId: string;
  descricao: string;
  unidade: string | null;
  /** Referencia vigente (preco-base). null = sem referencia. */
  referencia: string | null;
  maisVende: boolean;
  maisCompra: boolean;
  maisLucro: boolean;
  celulas: CelulasCotacao;
};

export type PainelComprasDto = { produtos: ProdutoEmCotacaoDto[] };

export type OfertaDoProdutoDto = {
  rodadaId: string;
  rodadaNumero: number;
  solicitacaoId: string;
  rodadaAberta: boolean;
  expiraEm: string;
  fornecedorId: string;
  fornecedorNome: string;
  situacao: ColunaCotacao;
  quantidadePedida: string;
  quantidadeDisponivel: string | null;
  valorUnitario: string | null;
  custoFinalUnitario: string | null;
  indisponivel: boolean;
  /** A proposta que se aceita em "Com aumento". null quando nao ha resposta enviada. */
  propostaItemId: string | null;
};

export type CotacaoDoProdutoDto = {
  produtoId: string;
  descricao: string;
  unidade: string | null;
  referencia: string | null;
  ofertas: OfertaDoProdutoDto[];
};
