import { z } from "zod";
import type { SituacaoItemPublica } from "./contraproposta.js";

const uuid = z.string().uuid();

// Contrato PUBLICO da rodada (o que o fornecedor vê). Isolamento comercial (R-221 decisao 8): aqui
// NAO existe preco-base, proposta de concorrente nem vencedor — nem como campo opcional. O fornecedor
// vê só os itens que sao dele e o ULTIMO valor que ele mesmo mandou.

// Resposta versionada do fornecedor. Item indisponivel nao leva valor; item disponivel exige valor.
export const respostaItemPublicaSchema = z
  .object({
    conviteItemId: uuid,
    indisponivel: z.coerce.boolean().default(false),
    valorUnitario: z.coerce.number().nonnegative().optional().nullable()
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

export type RespostaItemPublica = z.infer<typeof respostaItemPublicaSchema>;
export type ResponderRodadaPayload = z.infer<typeof responderRodadaPayloadSchema>;

export type RodadaPublicaItemDto = {
  conviteItemId: string;
  descricaoProduto: string;
  quantidade: string;
  // Andamento do item para ELE (decisao 8): comprado / em analise / nao cotado. Nada de vencedor ou base.
  situacao: SituacaoItemPublica;
};

export type RodadaPublicaPropostaItemDto = {
  conviteItemId: string;
  indisponivel: boolean;
  valorUnitario: string | null;
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
};
