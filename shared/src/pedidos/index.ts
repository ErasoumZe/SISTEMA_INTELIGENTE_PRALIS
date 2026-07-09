import { z } from "zod";

// Modulo de PEDIDOS de compra/reposicao de estoque (V1). Serve para repor estoque em geral,
// inclusive insumos usados na PRODUCAO da padaria (produtos de transformacao).
// - Pedido MANUAL: o comprador monta os itens na mao.
// - Pedido AUTOMATICO: gerado quando um produto atinge o estoque minimo; sugere a quantidade que
//   enche ate o estoque maximo (max - atual).
// - Agendamento: por DATA UNICA (dataAgendada) e/ou RECORRENCIA (semanal/quinzenal/mensal).
// - MISTO: um pedido pode ter itens de fornecedores diferentes (fornecedor e por item, opcional).
// - O comprador confere, edita e aprova (rascunho -> aprovado).

const uuidSchema = z.string().uuid();

export const pedidoTipos = ["manual", "automatico"] as const;
export const pedidoStatus = ["rascunho", "aprovado", "cancelado"] as const;
export const pedidoRecorrencias = ["nenhuma", "semanal", "quinzenal", "mensal"] as const;
export type PedidoTipo = (typeof pedidoTipos)[number];
export type PedidoStatus = (typeof pedidoStatus)[number];
export type PedidoRecorrencia = (typeof pedidoRecorrencias)[number];

export const pedidoItemPayloadSchema = z.object({
  produtoId: uuidSchema,
  fornecedorId: uuidSchema.optional().nullable(),
  quantidade: z.coerce.number().positive()
});

export const pedidoPayloadSchema = z.object({
  empresaId: uuidSchema,
  dataAgendada: z.string().min(10).optional().nullable(),
  recorrencia: z.enum(pedidoRecorrencias).default("nenhuma"),
  observacao: z.string().optional().nullable(),
  itens: z.array(pedidoItemPayloadSchema).min(1)
});

export const pedidoEdicaoPayloadSchema = z.object({
  dataAgendada: z.string().min(10).optional().nullable(),
  recorrencia: z.enum(pedidoRecorrencias).optional(),
  observacao: z.string().optional().nullable(),
  itens: z.array(pedidoItemPayloadSchema).min(1)
});

export const gerarPedidoAutomaticoPayloadSchema = z.object({
  empresaId: uuidSchema,
  dataAgendada: z.string().min(10).optional().nullable(),
  recorrencia: z.enum(pedidoRecorrencias).default("nenhuma")
});

export const pedidosQuerySchema = z.object({
  empresaId: uuidSchema.optional(),
  status: z.enum(pedidoStatus).optional()
});

export type PedidoPayload = z.infer<typeof pedidoPayloadSchema>;
export type PedidoEdicaoPayload = z.infer<typeof pedidoEdicaoPayloadSchema>;
export type GerarPedidoAutomaticoPayload = z.infer<typeof gerarPedidoAutomaticoPayloadSchema>;
export type PedidosQuery = z.infer<typeof pedidosQuerySchema>;

export type PedidoItemDto = {
  id: string;
  produtoId: string | null;
  descricaoProduto: string;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  quantidade: string;
  estoqueAtual: string | null;
  estoqueMin: string | null;
  estoqueMax: string | null;
};

export type PedidoDto = {
  id: string;
  empresaId: string;
  tipo: PedidoTipo;
  status: PedidoStatus;
  dataAgendada: string | null;
  recorrencia: PedidoRecorrencia;
  observacao: string | null;
  totalItens: number;
  criadoEm: string;
  aprovadoEm: string | null;
  itens?: PedidoItemDto[];
};

// Produto com os dados de estoque que a regra de reposicao precisa (valores ja em numero).
export type ProdutoEstoque = {
  id: string;
  descricao?: string | null;
  quantidadeEstoque: number;
  estoqueMin: number | null;
  estoqueMax: number | null;
};

export type ItemReposicaoSugerido = {
  produtoId: string;
  descricao: string | null;
  quantidadeAtual: number;
  estoqueMin: number;
  estoqueMax: number;
  quantidadeSugerida: number;
};

// REGRA do pedido automatico (pura, testavel). Para cada produto que ATINGIU o minimo
// (quantidadeEstoque <= estoqueMin), sugere a quantidade que enche ate o maximo (max - atual).
// Ignora: produtos sem min/max definido, acima do minimo, ou cuja sugestao daria <= 0.
export function gerarItensReposicao(produtos: ProdutoEstoque[]): ItemReposicaoSugerido[] {
  const itens: ItemReposicaoSugerido[] = [];
  for (const produto of produtos) {
    if (produto.estoqueMin === null || produto.estoqueMax === null) continue;
    if (produto.quantidadeEstoque > produto.estoqueMin) continue;
    const quantidadeSugerida = produto.estoqueMax - produto.quantidadeEstoque;
    if (quantidadeSugerida <= 0) continue;
    itens.push({
      produtoId: produto.id,
      descricao: produto.descricao ?? null,
      quantidadeAtual: produto.quantidadeEstoque,
      estoqueMin: produto.estoqueMin,
      estoqueMax: produto.estoqueMax,
      quantidadeSugerida
    });
  }
  return itens;
}
