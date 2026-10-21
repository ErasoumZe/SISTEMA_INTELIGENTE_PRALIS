import { z } from "zod";

const uuid = z.string().uuid();

// Estados da solicitacao (R-221). Itens so sao editaveis em rascunho; quantidade bloqueia apos a
// rodada enviar.
export const statusSolicitacao = [
  "rascunho",
  "em_cotacao",
  "parcialmente_comprada",
  "comprada",
  "encerrada",
  "cancelada"
] as const;
export type StatusSolicitacao = (typeof statusSolicitacao)[number];

export const origensSolicitacao = ["manual", "sugestao", "rapida"] as const;
// `agendamento` nao entra no payload: so o agendador cria solicitacao com essa origem (doc 56).
export type OrigemSolicitacao = (typeof origensSolicitacao)[number] | "agendamento";

export const solicitacaoItemPayloadSchema = z.object({
  produtoId: uuid,
  quantidade: z.coerce.number().positive()
});

export const solicitacaoPayloadSchema = z.object({
  empresaId: uuid,
  origem: z.enum(origensSolicitacao).default("manual"),
  observacao: z.string().trim().max(1_000).optional().nullable(),
  itens: z.array(solicitacaoItemPayloadSchema).min(1)
});

// Edicao so vale em rascunho; o servidor recusa fora disso. Itens substituem os anteriores.
export const solicitacaoEdicaoPayloadSchema = z.object({
  empresaId: uuid,
  observacao: z.string().trim().max(1_000).optional().nullable(),
  itens: z.array(solicitacaoItemPayloadSchema).min(1)
});

export const solicitacoesQuerySchema = z.object({
  empresaId: uuid,
  status: z.enum(statusSolicitacao).optional()
});

export type SolicitacaoPayload = z.infer<typeof solicitacaoPayloadSchema>;
export type SolicitacaoEdicaoPayload = z.infer<typeof solicitacaoEdicaoPayloadSchema>;
export type SolicitacoesQuery = z.infer<typeof solicitacoesQuerySchema>;

/**
 * Teto de estoque por item, pelo CONJUNTO da solicitacao (conserta o bug do fan-out do pedido
 * legado, que validava por pedido e deixava a soma estourar o maximo).
 *
 * Para cada produto com `estoqueMax` definido, a quantidade pedida nao pode fazer o saldo passar do
 * maximo: `estoqueAtual + quantidade <= estoqueMax`. Produto sem maximo nao tem teto. A funcao e pura
 * e devolve as mensagens nominais; o servidor recusa com 422 se houver qualquer pendencia.
 */
export type ItemTeto = {
  produtoId: string;
  descricao?: string | null;
  quantidade: number;
  estoqueAtual: number | null;
  estoqueMax: number | null;
};

export function pendenciasDeTeto(itens: ItemTeto[]): string[] {
  const pendencias: string[] = [];
  // Soma por produto: se o mesmo produto aparecer mais de uma vez (nao deveria, o unique barra), a
  // conta ainda fecha pelo conjunto.
  const somaPorProduto = new Map<string, number>();
  for (const item of itens) {
    somaPorProduto.set(item.produtoId, (somaPorProduto.get(item.produtoId) ?? 0) + item.quantidade);
  }
  const vistos = new Set<string>();
  for (const item of itens) {
    if (vistos.has(item.produtoId)) continue;
    vistos.add(item.produtoId);
    if (item.estoqueMax === null) continue;
    const atual = item.estoqueAtual ?? 0;
    const pedido = somaPorProduto.get(item.produtoId) ?? 0;
    if (atual + pedido > item.estoqueMax) {
      pendencias.push(
        `${item.descricao ?? item.produtoId}: pedido de ${pedido} com saldo ${atual} passa do maximo ${item.estoqueMax}`
      );
    }
  }
  return pendencias;
}

export type SolicitacaoItemDto = {
  id: string;
  produtoId: string;
  descricaoProduto: string;
  quantidade: string;
  estoqueAtual: string | null;
  estoqueMin: string | null;
  estoqueMax: string | null;
};

export type SolicitacaoDto = {
  id: string;
  empresaId: string;
  status: StatusSolicitacao;
  origem: OrigemSolicitacao;
  observacao: string | null;
  criadoEm: string;
  itens?: SolicitacaoItemDto[];
  totalItens: number;
};
