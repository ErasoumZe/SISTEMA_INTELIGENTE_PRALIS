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
  convites: z.array(abrirRodadaConviteSchema).min(1)
});

// Envio marca o convite como enviado e devolve o link por token (WhatsApp ou copia). O token sai uma
// unica vez, na abertura; aqui so registramos o disparo.
export const enviarConvitePayloadSchema = z.object({
  empresaId: uuid,
  canal: z.enum(["whatsapp", "copia"]).default("whatsapp")
});

export const rodadasQuerySchema = z.object({
  empresaId: uuid,
  solicitacaoId: uuid.optional(),
  status: z.enum(statusRodada).optional()
});

export type AbrirRodadaConvite = z.infer<typeof abrirRodadaConviteSchema>;
export type AbrirRodadaPayload = z.infer<typeof abrirRodadaPayloadSchema>;
export type EnviarConvitePayload = z.infer<typeof enviarConvitePayloadSchema>;
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
};
