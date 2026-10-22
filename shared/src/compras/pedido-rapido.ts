import { z } from "zod";

// Pedido rapido (R-221 decisao 2): o pedido de fornecedor unico deixa de ser um segundo caminho de
// compra e vira uma RODADA com um unico fornecedor convidado (solicitacao `origem='rapida'`). O atalho
// continua na tela; o que muda e que a compra sai pelo mesmo portao (base, teto, adjudicacao).
export const pedidoRapidoPayloadSchema = z.object({
  empresaId: z.string().uuid(),
  fornecedorId: z.string().uuid(),
  observacao: z.string().trim().max(1_000).optional().nullable(),
  // Mesmos limites da abertura de rodada: nulo = padrao da empresa (R-216) e sem teto.
  prazoRespostaHoras: z.coerce
    .number()
    .int()
    .positive()
    .max(24 * 30)
    .optional()
    .nullable(),
  tetoValor: z.coerce.number().positive().max(999_999_999).optional().nullable(),
  // Doc 57 §6.3: variacao de quantidade aceita na separacao (10, 20, 30 ou 40%). Vazio = 10%.
  margemVariacaoPercentual: z
    .union([z.literal(10), z.literal(20), z.literal(30), z.literal(40)])
    .optional()
    .nullable(),
  itens: z
    .array(
      z.object({
        produtoId: z.string().uuid(),
        quantidade: z.coerce.number().positive()
      })
    )
    .min(1)
});

export type PedidoRapidoPayload = z.infer<typeof pedidoRapidoPayloadSchema>;
