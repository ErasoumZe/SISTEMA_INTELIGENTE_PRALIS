import { z } from "zod";

// `mensagem_admin` referencia uma ENTREGA (mensagens_admin_entregas.id), nao a mensagem: e o que
// permite o mesmo operador ter uma linha por PDV sem mexer no unique que ja existia.
// `campanha` referencia a propria campanha.
export const tipoNotificacaoSchema = z.enum([
  "quebra_caixa",
  "transferencia_divergencia",
  "transferencia_prazo_confirmacao",
  "mensagem_admin",
  "campanha"
]);

// O sino continua recebendo apenas o que ainda pede acao. A central de Pendencias, por outro
// lado, tambem precisa mostrar o que acabou de ser verificado: sem essa opcao, um clique no
// "verificar" fazia uma quebra registrada desaparecer por completo da tela que deveria explica-la.
export const notificacoesQuerySchema = z.object({
  empresaId: z.string().uuid(),
  incluirVerificadas: z.coerce.boolean().optional().default(false)
});
export const notificacaoParamsSchema = z.object({ notificacaoId: z.string().uuid() });

export const notificacaoSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  tipo: tipoNotificacaoSchema,
  referenciaId: z.string().uuid(),
  titulo: z.string(),
  valor: z.number().nullable(),
  verificado: z.boolean(),
  verificadoPor: z.string().nullable(),
  verificadoEm: z.string().nullable(),
  criadoEm: z.string()
});

export type TipoNotificacao = z.infer<typeof tipoNotificacaoSchema>;
export type Notificacao = z.infer<typeof notificacaoSchema>;
