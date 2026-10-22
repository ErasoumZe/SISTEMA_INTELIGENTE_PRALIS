import { z } from "zod";
import type { SituacaoItemPublica } from "./contraproposta.js";

const uuid = z.string().uuid();

// Contrato PUBLICO da rodada (o que o fornecedor vê). Doc 57 §5 (José, 22/10): o fornecedor VÊ o valor de
// referência (último pago ou cotado por nós) — quem responder igual ou menor primeiro ganha o item. Continua
// sem proposta de concorrente e sem vencedor.

// Resposta versionada do fornecedor. Item indisponivel nao leva valor; item disponivel exige valor.
export const respostaItemPublicaSchema = z
  .object({
    conviteItemId: uuid,
    indisponivel: z.coerce.boolean().default(false),
    // "Não tenho agora" ou "não trabalho mais com este produto" (doc 57 §5).
    motivoIndisponivel: z.enum(["sem_estoque", "nao_trabalha"]).optional().nullable(),
    valorUnitario: z.coerce.number().nonnegative().optional().nullable(),
    // Quanto ele tem. Vazio = a quantidade pedida.
    quantidadeDisponivel: z.coerce.number().positive().max(9_999_999).optional().nullable()
  })
  .refine((item) => item.indisponivel || (item.valorUnitario != null && item.valorUnitario > 0), {
    message: "Informe o valor do item (maior que zero) ou marque como indisponivel",
    path: ["valorUnitario"]
  });

export const responderRodadaPayloadSchema = z.object({
  frete: z.coerce.number().nonnegative().optional().nullable(),
  observacao: z.string().trim().max(1_000).optional().nullable(),
  prazoEntrega: z.string().min(10).optional().nullable(),
  condicaoPagamento: z.string().trim().max(200).optional().nullable(),
  itens: z.array(respostaItemPublicaSchema).min(1)
});

/** Passo 2 (doc 57 §5): depois de separar, o fornecedor informa a quantidade real de cada item que ganhou. */
export const separacaoPublicaPayloadSchema = z.object({
  itens: z
    .array(z.object({ pedidoItemId: uuid, quantidade: z.coerce.number().positive().max(9_999_999) }))
    .min(1)
    .max(500)
});

export type RespostaItemPublica = z.infer<typeof respostaItemPublicaSchema>;
export type SeparacaoPublicaPayload = z.infer<typeof separacaoPublicaPayloadSchema>;
export type ResponderRodadaPayload = z.infer<typeof responderRodadaPayloadSchema>;

export type RodadaPublicaItemDto = {
  conviteItemId: string;
  descricaoProduto: string;
  quantidade: string;
  /** Valor de referência: o último pago ou cotado por nós (doc 57 §5). null = sem histórico. */
  referencia: string | null;
  // Andamento do item para ELE: comprado / em analise / nao cotado. Nada de vencedor.
  situacao: SituacaoItemPublica;
};

export type RodadaPublicaPropostaItemDto = {
  conviteItemId: string;
  indisponivel: boolean;
  motivoIndisponivel: "sem_estoque" | "nao_trabalha" | null;
  valorUnitario: string | null;
  quantidadeDisponivel: string | null;
};

/** O pedido do fornecedor nesta rodada: o que ele ganhou, para separar e devolver (passo 2). */
export type PedidoPublicoDto = {
  status: "cotado" | "retornado" | "confirmado" | "recebido_parcial" | "recebido";
  margemVariacaoPercentual: number | null;
  itens: Array<{
    pedidoItemId: string;
    descricaoProduto: string;
    quantidadePedida: string;
    quantidade: string;
    valorUnitario: string | null;
    minimo: string | null;
    maximo: string | null;
  }>;
};

export type RodadaPublicaDto = {
  fornecedorNome: string;
  empresaNome: string;
  expiraEm: string;
  // "aberta" quando o fornecedor ainda pode mandar; "encerrada" quando o prazo passou ou o comprador
  // fechou. Sem revelar nada do envelope do comprador.
  situacao: "aberta" | "encerrada";
  itens: RodadaPublicaItemDto[];
  // A contraproposta do comprador PARA ELE que ainda espera resposta (E7). null se nao ha. So o valor
  // oferecido a este fornecedor; nunca de concorrente nem a base.
  contraproposta: {
    versao: number;
    itens: Array<{ conviteItemId: string; valorUnitario: string }>;
  } | null;
  // O ULTIMO que ELE mandou (nunca de concorrente). null se ainda nao respondeu.
  ultimaProposta: {
    versao: number;
    frete: string | null;
    observacao: string | null;
    prazoEntrega: string | null;
    condicaoPagamento: string | null;
    itens: RodadaPublicaPropostaItemDto[];
  } | null;
  /** O que ele já ganhou nesta rodada (passo 2). null se ainda não ganhou nada. */
  pedido: PedidoPublicoDto | null;
};

/** Doc 57 §5.1: o fornecedor marca, na lista do que a padaria compra, o que ele tambem vende. */
export const produtosDoFornecedorPayloadSchema = z.object({ produtoIds: z.array(uuid).min(1).max(500) });
export type ProdutosDoFornecedorPayload = z.infer<typeof produtosDoFornecedorPayloadSchema>;

export type ProdutoParaFornecedorDto = {
  produtoId: string;
  descricao: string;
  grupo: string | null;
  /** Ele ja aparece como fornecedor deste produto (vai receber a cotacao dele). */
  jaVende: boolean;
};
