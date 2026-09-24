import { z } from "zod";

export { empresaQuerySchema as turnosQuerySchema } from "../api/index.js";

const uuidSchema = z.string().uuid();
// Hora no formato HH:MM (aceita segundos opcionais vindos do banco: HH:MM:SS).
const horaSchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Hora invalida (use HH:MM)");

/**
 * ADM-003 V1B. A etiqueta que a operacao usa para falar do turno, e os dias em que ele acontece.
 *
 * Os dias reusam o vocabulario de `colaboradores_jornadas.dia_da_semana` — um segundo conjunto de
 * nomes para dia da semana seria a divergencia da regra-mae, em miniatura.
 */
export const etiquetasTurno = ["M", "T", "I"] as const;
export const etiquetaTurnoSchema = z.enum(etiquetasTurno);
export type EtiquetaTurno = z.infer<typeof etiquetaTurnoSchema>;

export const diasSemana = ["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA", "SABADO", "DOMINGO"] as const;
export const diaSemanaSchema = z.enum(diasSemana);
export type DiaSemana = z.infer<typeof diaSemanaSchema>;

/**
 * AUSENTE e NULO sao coisas DIFERENTES aqui, e essa e a regra inteira:
 *   - campo ausente (`undefined`) -> NAO MEXE no que esta gravado;
 *   - `null` explicito           -> LIMPA.
 *
 * Sem isso, um cliente que nao conhece os campos novos apagaria etiqueta e dias ao salvar qualquer
 * outra coisa do turno. `.optional()` sem `.nullable()` nao serviria: nao haveria como limpar.
 */
export const turnoPayloadSchema = z.object({
  empresaId: uuidSchema,
  nome: z.string().trim().min(1),
  horaInicio: horaSchema,
  horaFim: horaSchema,
  ativo: z.boolean().default(true),
  etiqueta: etiquetaTurnoSchema.nullable().optional(),
  diasSemana: z.array(diaSemanaSchema).min(1, "Escolha ao menos um dia").nullable().optional()
});

export const turnoDtoSchema = z.object({
  id: z.string(),
  empresaId: z.string(),
  nome: z.string(),
  horaInicio: z.string(),
  horaFim: z.string(),
  ativo: z.boolean(),
  etiqueta: etiquetaTurnoSchema.nullable(),
  diasSemana: z.array(diaSemanaSchema).nullable()
});

/**
 * Turno COMPLETO e o que pode ser escolhido numa admissao: ativo, com etiqueta e com dias.
 *
 * Turno antigo continua valido no cadastro sem etiqueta e sem dias — nao quebramos o que ja existe.
 * Mas a tela de admissao precisa mostrar "M · seg a sex · 06:00–14:00", e metade disso nao existiria.
 *
 * A regra vive aqui, no contrato, para tela e servidor responderem a mesma coisa. A garantia dura,
 * porem, e do SERVICO: um CHECK em `admissoes_processos` nao enxerga colunas de `turnos`, e FK nao
 * aponta para indice parcial.
 */
export function turnoCompleto(turno: {
  ativo: boolean;
  etiqueta: EtiquetaTurno | null;
  diasSemana: readonly DiaSemana[] | null;
}): boolean {
  return turno.ativo && turno.etiqueta !== null && (turno.diasSemana?.length ?? 0) > 0;
}

export type TurnoPayload = z.infer<typeof turnoPayloadSchema>;
export type TurnoDto = z.infer<typeof turnoDtoSchema>;
