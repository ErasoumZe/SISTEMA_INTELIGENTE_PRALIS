import { z } from "zod";

const uuidSchema = z.string().uuid();

export const diasSemana = ["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA", "SABADO", "DOMINGO"] as const;
export const diaSemanaSchema = z.enum(diasSemana);

export const idParamsSchema = z.object({ id: uuidSchema });
export const colaboradorParamsSchema = z.object({ colaboradorId: uuidSchema });
export const colaboradorCargoParamsSchema = z.object({
  colaboradorId: uuidSchema,
  cargoColaboradorId: uuidSchema
});

export const cargoPayloadSchema = z.object({
  empresaId: uuidSchema,
  nome: z.string().min(1)
});

export const colaboradorCargoPayloadSchema = z.object({
  empresaId: uuidSchema,
  cargoId: uuidSchema,
  setorId: uuidSchema.optional().nullable(),
  remuneracaoMinuto: z.coerce.number().positive(),
  dataInicio: z.string().min(1),
  ativo: z.boolean().default(true)
});

export const colaboradorCargoStatusPayloadSchema = z.object({
  empresaId: uuidSchema,
  ativo: z.boolean()
});

export const jornadaPayloadSchema = z.object({
  empresaId: uuidSchema,
  dataInicio: z.string().min(1),
  dias: z
    .array(
      z.object({
        diaDaSemana: diaSemanaSchema,
        faixas: z.array(
          z.object({
            horaEntrada: z.string().default(""),
            cargaHorariaDiariaEmMinutos: z.coerce.number().int().min(0),
            intervaloMinutos: z.coerce.number().int().min(0).default(0),
            colaboradorCargoId: uuidSchema.optional().nullable()
          })
        )
      })
    )
    .min(1)
});

export const faltaJustificadaPayloadSchema = z.object({
  empresaId: uuidSchema,
  inicio: z.string().min(1),
  fim: z.string().min(1),
  motivo: z.string().min(1)
});

export type DiaSemana = z.infer<typeof diaSemanaSchema>;
export type IdParams = z.infer<typeof idParamsSchema>;
export type ColaboradorParams = z.infer<typeof colaboradorParamsSchema>;
export type ColaboradorCargoParams = z.infer<typeof colaboradorCargoParamsSchema>;
export type CargoPayload = z.infer<typeof cargoPayloadSchema>;
export type ColaboradorCargoPayload = z.infer<typeof colaboradorCargoPayloadSchema>;
export type ColaboradorCargoStatusPayload = z.infer<typeof colaboradorCargoStatusPayloadSchema>;
export type JornadaPayload = z.infer<typeof jornadaPayloadSchema>;
export type FaltaJustificadaPayload = z.infer<typeof faltaJustificadaPayloadSchema>;
