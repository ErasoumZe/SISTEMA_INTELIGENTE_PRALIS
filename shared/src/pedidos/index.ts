import { z } from "zod";

const uuidSchema = z.string().uuid();

// `manual` e `automatico` sao so de LEITURA (pedidos criados antes do E8); `rodada` e o unico tipo que nasce
// hoje (compra automatica ou excecao do comprador, R-221).
export const pedidoTipos = ["manual", "automatico", "rodada"] as const;
// Os dois primeiros valores sao somente leitura para pedidos criados antes do modulo Compras.
export const pedidoStatus = [
  "rascunho",
  "aprovado",
  "a_fazer",
  "enviado",
  // Doc 57 §5: o fornecedor ganhou os itens e esta separando (pode ajustar a quantidade real).
  "cotado",
  "retornado",
  "confirmado",
  "recebido_parcial",
  "recebido",
  "cancelado"
] as const;
export const pedidoStatusNovo = [
  "a_fazer",
  "enviado",
  "cotado",
  "retornado",
  "confirmado",
  "recebido_parcial",
  "recebido",
  "cancelado"
] as const;
export const pedidoRecorrencias = ["nenhuma", "semanal", "quinzenal", "mensal"] as const;
export type PedidoTipo = (typeof pedidoTipos)[number];
export type PedidoStatus = (typeof pedidoStatus)[number];
export type PedidoStatusNovo = (typeof pedidoStatusNovo)[number];
export type PedidoRecorrencia = (typeof pedidoRecorrencias)[number];

export const pedidoSituacaoPayloadSchema = z.object({
  // Depois do E8 (R-221) o unico ato manual sobre a situacao e CANCELAR. "Confirmado" nasce da rodada
  // (compra automatica ou excecao do comprador); nao existe mais confirmar na mao.
  status: z.enum(["cancelado"]),
  observacao: z.string().trim().max(1_000).optional().nullable()
});

// Doc 58 §7: por item, quanto recebeu e quanto devolveu (com motivo). Devolver fecha o item: o estoque entra so o
// recebido e o que faltou nao fica esperando.
export const pedidoRecebimentoItemSchema = z
  .object({
    pedidoItemId: uuidSchema,
    quantidadeConferida: z.coerce.number().min(0),
    quantidadeDevolvida: z.coerce.number().min(0).default(0),
    motivoDevolucao: z.string().trim().max(500).optional().nullable()
  })
  .refine((item) => item.quantidadeConferida > 0 || item.quantidadeDevolvida > 0, {
    message: "Informe quanto recebeu ou quanto devolveu",
    path: ["quantidadeConferida"]
  })
  .refine((item) => item.quantidadeDevolvida === 0 || Boolean(item.motivoDevolucao), {
    message: "Diga o motivo da devolucao",
    path: ["motivoDevolucao"]
  });

export const pedidoRecebimentoPayloadSchema = z.object({
  idempotenciaChave: uuidSchema,
  observacao: z.string().trim().max(1_000).optional().nullable(),
  itens: z.array(pedidoRecebimentoItemSchema).min(1)
});

export const pedidosQuerySchema = z.object({
  empresaId: uuidSchema.optional(),
  status: z.enum(pedidoStatus).optional()
});

export type PedidoSituacaoPayload = z.infer<typeof pedidoSituacaoPayloadSchema>;
export type PedidoRecebimentoPayload = z.infer<typeof pedidoRecebimentoPayloadSchema>;
// O que a tela manda por item (o coerce do schema deixaria o tipo de entrada como unknown).
export type PedidoRecebimentoItem = {
  pedidoItemId: string;
  quantidadeConferida: number;
  quantidadeDevolvida: number;
  motivoDevolucao: string | null;
};
export type PedidosQuery = z.infer<typeof pedidosQuerySchema>;

export type PedidoItemDto = {
  id: string;
  produtoId: string | null;
  descricaoProduto: string;
  quantidade: string;
  quantidadeRecebida: string;
  /** Doc 58 §7: o que voltou com o entregador. Item com devolucao esta fechado (pendente 0). */
  quantidadeDevolvida: string;
  quantidadePendente: string;
  estoqueAtual: string | null;
  estoqueMin: string | null;
  estoqueMax: string | null;
};

export type PedidoEventoDto = {
  id: string;
  status: PedidoStatusNovo;
  observacao: string | null;
  /** Nulo quando o ato foi do fornecedor pelo link (compra automatica ou cotacao legada); o nome vem preenchido assim mesmo. */
  criadoPor: string | null;
  // Quem agiu precisa ser legivel na tela: o id sozinho nao responde "quem enviou" nem "quem recebeu".
  criadoPorNome: string;
  criadoEm: string;
};

export type PedidoDto = {
  id: string;
  empresaId: string;
  tipo: PedidoTipo;
  status: PedidoStatus;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  fornecedorWhatsapp: string | null;
  dataAgendada: string | null;
  recorrencia: PedidoRecorrencia;
  observacao: string | null;
  totalItens: number;
  criadoEm: string;
  aprovadoEm: string | null;
  itens?: PedidoItemDto[];
  eventos?: PedidoEventoDto[];
};

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

// Sugestao assistida: sem movimentos de venda/producao/perda/inventario completos nao existe
// gatilho autonomo confiavel. Esta funcao pura continua testavel e so calcula maximo - atual.
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
