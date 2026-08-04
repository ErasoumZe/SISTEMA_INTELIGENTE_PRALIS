import { z } from "zod";

export const tipoNotificacaoSchema = z.enum([
  "quebra_caixa",
  "transferencia_divergencia",
  "transferencia_prazo_confirmacao"
]);

export const notificacoesQuerySchema = z.object({ empresaId: z.string().uuid() });
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
