import { z } from "zod";

const uuidSchema = z.string().uuid();
const curvaAbcSchema = z.enum(["A", "B", "C"]);

export const estoqueProdutosQuerySchema = z.object({
  empresaId: uuidSchema,
  grupoMercadoriaId: uuidSchema.optional(),
  areaEstoque: z.string().trim().min(1).max(120).optional(),
  localVenda: z.string().trim().min(1).max(120).optional(),
  localEstoque: z.string().trim().min(1).max(120).optional(),
  curvaAbc: curvaAbcSchema.optional()
});

export const estoqueMovimentosQuerySchema = z.object({
  empresaId: uuidSchema,
  produtoId: uuidSchema.optional(),
  localEstoque: z.string().trim().min(1).max(120).optional(),
  dataInicio: z.string().datetime({ offset: true }).optional(),
  dataFim: z.string().datetime({ offset: true }).optional()
});

export type EstoqueProdutosQuery = z.infer<typeof estoqueProdutosQuerySchema>;
export type EstoqueMovimentosQuery = z.infer<typeof estoqueMovimentosQuerySchema>;

export type ProdutoEstoqueDto = {
  id: string;
  descricao: string;
  grupoMercadoriaId: string | null;
  grupo: string | null;
  quantidadeEstoque: string;
  estoqueMin: string | null;
  estoqueMax: string | null;
  areaEstoque: string | null;
  localVenda: string[];
  localEstoque: string | null;
  curvaAbc: "A" | "B" | "C" | null;
  // Sigla da unidade individual. "12" sozinho nao diz se sao 12 quilos ou 12 caixas, e quem monta
  // pedido decide pela unidade. Esta rota ja exige `estoque_produtos_visualizar`.
  unidade: string | null;
};

export type EstoqueMovimentoDto = {
  id: string;
  produtoId: string;
  produtoDescricao: string;
  localEstoque: string | null;
  pedidoId: string;
  pedidoRecebimentoId: string;
  tipo: "recebimento_compra";
  quantidade: string;
  saldoAnterior: string;
  saldoPosterior: string;
  recebidoPorId: string;
  recebidoPorNome: string;
  recebidoEm: string;
  criadoEm: string;
};

export * from "./cotacao.js";
export * from "./fundacao.js";
export * from "./solicitacao.js";
export * from "./rodada.js";
export * from "./rodada-publica.js";
export * from "./adjudicacao.js";
export * from "./decisao.js";
export * from "./contraproposta.js";
export * from "./pedido-rapido.js";
export * from "./historico.js";
export * from "./recorrencia.js";
export * from "./agendamento.js";
export * from "./conferencia.js";
export * from "./painel.js";
