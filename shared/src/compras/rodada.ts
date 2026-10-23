import { z } from "zod";

const uuid = z.string().uuid();

// Estados da rodada e do convite (R-221, contrato PROJECT_BRAIN/54). A rodada e o envelope congelado
// da pre-autorizacao: quantidade e preco-base no instante da abertura, imutaveis enquanto respondem.
export const statusRodada = ["aberta", "fechada", "cancelada"] as const;
export type StatusRodada = (typeof statusRodada)[number];

export const statusConvite = ["aberto", "aguardando_comprador", "encerrado", "revogado"] as const;
export type StatusConvite = (typeof statusConvite)[number];

// Convite da abertura: um fornecedor e os itens da solicitacao que ELE vai cotar (R-219 — subconjunto
// possivel; o default da tela e todos). Os itens sao referenciados por solicitacaoItemId; o servidor
// os mapeia para os rodada_itens congelados.
export const abrirRodadaConviteSchema = z.object({
  fornecedorId: uuid,
  solicitacaoItemIds: z.array(uuid).min(1)
});

export const abrirRodadaPayloadSchema = z.object({
  empresaId: uuid,
  solicitacaoId: uuid,
  // null = padrao (2 dias uteis da R-216). O comprador pode sobrescrever por rodada (decisao 3).
  prazoRespostaHoras: z.coerce
    .number()
    .int()
    .positive()
    .max(24 * 30)
    .optional()
    .nullable(),
  // Teto de compra automatica da rodada (decisao 14). null = sem teto.
  tetoValor: z.coerce.number().positive().optional().nullable(),
  // Doc 57: variacao de quantidade aceita (10, 20, 30 ou 40%). Vazio = 10%.
  margemVariacaoPercentual: z
    .union([z.literal(10), z.literal(20), z.literal(30), z.literal(40)])
    .optional()
    .nullable(),
  convites: z.array(abrirRodadaConviteSchema).min(1)
});

// Doc 57 §2: o comprador escolhe o fornecedor de um item "A fazer"; o sistema manda pelo WhatsApp.
export const convidarFornecedorPayloadSchema = z.object({
  empresaId: uuid,
  fornecedorId: uuid,
  rodadaItemIds: z.array(uuid).min(1).max(500)
});

/** Manda o link de novo (token novo; o anterior deixa de valer). */
export const reenviarConvitePayloadSchema = z.object({ empresaId: uuid });

export const rodadasQuerySchema = z.object({
  empresaId: uuid,
  solicitacaoId: uuid.optional(),
  status: z.enum(statusRodada).optional()
});

export type AbrirRodadaConvite = z.infer<typeof abrirRodadaConviteSchema>;
export type AbrirRodadaPayload = z.infer<typeof abrirRodadaPayloadSchema>;
export type ConvidarFornecedorPayload = z.infer<typeof convidarFornecedorPayloadSchema>;
export type RodadasQuery = z.infer<typeof rodadasQuerySchema>;

export type RodadaItemDto = {
  id: string;
  solicitacaoItemId: string;
  produtoId: string;
  descricaoProduto: string;
  quantidade: string;
  // Base congelada; presente so para quem tem leitura de preco-base (nunca no DTO publico do fornecedor).
  precoBaseValor: string | null;
};

export type RodadaConviteDto = {
  id: string;
  fornecedorId: string;
  fornecedorNome: string;
  fornecedorWhatsapp: string | null;
  status: StatusConvite;
  enviadoEm: string | null;
  respondidoEm: string | null;
  // Itens (rodadaItemId) atribuidos a este convite.
  rodadaItemIds: string[];
  // Ultimo envio pelo WhatsApp (doc 57 §3). Nulo: nada foi para a fila ainda.
  whatsapp: { status: "pendente" | "enviado" | "falhou"; erro: string | null } | null;
  // Token em claro do fornecedor; so vem no retorno da abertura (o token sai uma unica vez). O front
  // monta o link publico a partir dele, como na cotacao.
  token?: string;
};

export type RodadaResumoDto = {
  id: string;
  empresaId: string;
  solicitacaoId: string;
  numero: number;
  status: StatusRodada;
  expiraEm: string;
  fusoHorario: string;
  abertaEm: string;
  totalItens: number;
  totalConvites: number;
};

export type RodadaDto = {
  id: string;
  empresaId: string;
  solicitacaoId: string;
  numero: number;
  status: StatusRodada;
  prazoRespostaHoras: number | null;
  expiraEm: string;
  fusoHorario: string;
  tetoValor: string | null;
  abertaEm: string;
  itens: RodadaItemDto[];
  convites: RodadaConviteDto[];
  // Falso: o WhatsApp da empresa ainda nao esta conectado; o link tem de ser mandado a mao.
  whatsappConectado: boolean;
};

/** Doc 57 §5: o comprador confirma o pedido cotado ou retornado (Comprado). */
export const confirmarPedidoPayloadSchema = z.object({ empresaId: uuid });
