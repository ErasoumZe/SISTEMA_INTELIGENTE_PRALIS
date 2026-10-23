import { z } from "zod";

// Solicitacao de compra (doc 58 §2, Rodrigo 23/10/2026): cada agendamento de pedido vira um card para o
// responsavel. Na data, ele confere a lista de produtos, poe as quantidades e envia; cada fornecedor do catalogo
// recebe so os seus produtos pelo WhatsApp. Produto sem fornecedor: o responsavel escolhe ali mesmo.

const uuid = z.string().uuid();

export const solicitacoesCompraQuerySchema = z.object({ empresaId: uuid });

export const enviarSolicitacaoCompraSchema = z.object({
  empresaId: uuid,
  itens: z
    .array(
      z.object({
        produtoId: uuid,
        quantidade: z.number().positive().max(9_999_999),
        /** So para produto sem fornecedor no catalogo: quem recebe a cotacao (o vinculo vai para o catalogo). */
        fornecedorId: uuid.optional().nullable()
      })
    )
    .min(1)
    .max(500)
    .refine((itens) => new Set(itens.map((item) => item.produtoId)).size === itens.length, "Produto repetido")
});

export type EnviarSolicitacaoCompraPayload = z.infer<typeof enviarSolicitacaoCompraSchema>;

/** Quem pode ser responsavel por executar o pedido (quem envia cotacao: `pedidos_editar`). */
export type ResponsavelPedidoDto = { usuarioId: string; nome: string };

/** O card da tela: o agendamento e, se a data chegou, o pedido do dia esperando o responsavel. */
export type SolicitacaoCompraCardDto = {
  agendaId: string;
  grupoNome: string;
  grupoPaiNome: string | null;
  responsavelId: string;
  responsavelNome: string;
  resumo: string;
  totalProdutos: number;
  /** Proxima data da serie (ISO), se houver. */
  proximaData: string | null;
  /** Datas que chegaram e esperam o envio (a mais antiga primeiro). */
  pendentes: Array<{ ocorrenciaId: string; dataAtual: string }>;
};

export type SolicitacaoCompraFornecedorDto = { fornecedorId: string; nome: string };

export type SolicitacaoCompraItemDto = {
  produtoId: string;
  descricao: string;
  unidade: string | null;
  estoqueAtual: string | null;
  estoqueMax: string | null;
  /** Sugestao: a quantidade padrao do agendamento ou maximo - saldo. Vazio = sem sugestao. */
  quantidadeSugerida: string | null;
  /** Fornecedores do catalogo (aprovados, com WhatsApp) que recebem este produto. Vazio = escolher. */
  fornecedores: SolicitacaoCompraFornecedorDto[];
  maisVende: boolean;
  maisCompra: boolean;
  maisLucro: boolean;
};

export type SolicitacaoCompraDetalheDto = {
  ocorrenciaId: string;
  grupoNome: string;
  dataAtual: string;
  prazoRespostaHoras: number;
  margemVariacaoPercentual: number;
  recebimentoInicio: string | null;
  recebimentoFim: string | null;
  itens: SolicitacaoCompraItemDto[];
};
