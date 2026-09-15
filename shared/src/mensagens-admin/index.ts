import { z } from "zod";

const uuidSchema = z.string().uuid();

// O QUE o Administrador Geral escolhe ao enviar (R-196). `caixas_abertos` e foto do instante do
// envio; `empresa` e `pdv` continuam alcancando quem abre caixa depois, enquanto a mensagem valer.
export const tipoAlvoMensagemSchema = z.enum(["caixas_abertos", "empresa", "pdv", "operador"]);

// `.strict()` em todas as variantes: sem ele o Zod DESCARTA em silencio a chave que nao pertence ao
// alvo, e um `pdvId` enviado por engano num alvo de empresa sumiria sem aviso — a tela pareceria ter
// mirado um PDV e a mensagem iria para a empresa inteira. Melhor um 400 explicito.
export const alvoMensagemSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("caixas_abertos") }).strict(),
  z.object({ tipo: z.literal("empresa") }).strict(),
  z.object({ tipo: z.literal("pdv"), pdvId: uuidSchema }).strict(),
  z.object({ tipo: z.literal("operador"), usuarioId: z.string().min(1) }).strict()
]);

export const criarMensagemAdminPayloadSchema = z.object({
  empresaId: uuidSchema,
  titulo: z.string().trim().min(1).max(120),
  corpo: z.string().trim().min(1).max(2000),
  // Sem validade = vale ate ser encerrada. O servidor recusa data no passado: uma mensagem que
  // nasce expirada nao alcanca ninguem e so polui o painel.
  validoAte: z.string().datetime().nullable().optional(),
  alvos: z.array(alvoMensagemSchema).min(1)
});

export const mensagemAdminParamsSchema = z.object({ mensagemId: uuidSchema });
export const entregaParamsSchema = z.object({ entregaId: uuidSchema });

export const statusMensagemAdminSchema = z.enum(["ativa", "encerrada"]);

// O que o OPERADOR le no pop-up. Nao traz destinatario nem situacao de terceiros: a rota so
// devolve a entrega da propria pessoa.
export const mensagemAdminDoOperadorSchema = z.object({
  entregaId: uuidSchema,
  mensagemId: uuidSchema,
  titulo: z.string(),
  corpo: z.string(),
  pdvId: uuidSchema.nullable(),
  entregueEm: z.string().nullable(),
  visualizadaEm: z.string().nullable(),
  confirmadaEm: z.string().nullable(),
  fechadaEm: z.string().nullable(),
  criadoEm: z.string()
});

// O que o ADMINISTRADOR ve: uma linha por destinatario e PDV (R-193). `situacao` e derivada dos
// carimbos, na ordem em que eles acontecem — nao existe coluna de situacao no banco.
export const situacaoEntregaSchema = z.enum(["pendente", "entregue", "visualizada", "fechada", "confirmada"]);

export const entregaMensagemAdminSchema = z.object({
  id: uuidSchema,
  destinatarioUsuarioId: z.string(),
  destinatarioNome: z.string().nullable(),
  pdvId: uuidSchema.nullable(),
  pdvNome: z.string().nullable(),
  situacao: situacaoEntregaSchema,
  entregueEm: z.string().nullable(),
  visualizadaEm: z.string().nullable(),
  confirmadaEm: z.string().nullable(),
  fechadaEm: z.string().nullable()
});

export const mensagemAdminSchema = z.object({
  id: uuidSchema,
  empresaId: uuidSchema,
  titulo: z.string(),
  corpo: z.string(),
  validoAte: z.string().nullable(),
  status: statusMensagemAdminSchema,
  criadoPor: z.string(),
  criadoPorNome: z.string().nullable(),
  criadoEm: z.string(),
  totalDestinatarios: z.number().int(),
  totalConfirmadas: z.number().int()
});

export const mensagemAdminDetalheSchema = mensagemAdminSchema.extend({
  entregas: z.array(entregaMensagemAdminSchema)
});

export type TipoAlvoMensagem = z.infer<typeof tipoAlvoMensagemSchema>;
export type AlvoMensagem = z.infer<typeof alvoMensagemSchema>;
export type CriarMensagemAdminPayload = z.infer<typeof criarMensagemAdminPayloadSchema>;
export type MensagemAdminDoOperador = z.infer<typeof mensagemAdminDoOperadorSchema>;
export type SituacaoEntrega = z.infer<typeof situacaoEntregaSchema>;
export type EntregaMensagemAdmin = z.infer<typeof entregaMensagemAdminSchema>;
export type MensagemAdmin = z.infer<typeof mensagemAdminSchema>;
export type MensagemAdminDetalhe = z.infer<typeof mensagemAdminDetalheSchema>;

/**
 * Situacao a partir dos carimbos, do fim para o comeco. A ordem importa e nao e alfabetica:
 * `confirmada` vence `fechada` porque "Entendi" encerra e "Fechar" apenas adia (R-194). Quem fechou
 * tres vezes e depois confirmou aparece como confirmada, que e o que o administrador precisa saber.
 */
export function situacaoDaEntrega(carimbos: {
  entregueEm: string | null;
  visualizadaEm: string | null;
  confirmadaEm: string | null;
  fechadaEm: string | null;
}): SituacaoEntrega {
  if (carimbos.confirmadaEm) return "confirmada";
  if (carimbos.fechadaEm) return "fechada";
  if (carimbos.visualizadaEm) return "visualizada";
  if (carimbos.entregueEm) return "entregue";
  return "pendente";
}
