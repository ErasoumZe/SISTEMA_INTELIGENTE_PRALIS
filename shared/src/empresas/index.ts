import { z } from "zod";

export { empresaQuerySchema as empresasQuerySchema } from "../api/index.js";

/**
 * O CHECK do banco so exige texto nao vazio, e `fuso_horario` nao e decoracao: a partir da
 * reestruturacao de Compras ele e o relogio do negocio (vencimento de rodada, agenda, dia de
 * negocio). "America/Sao Paulo" com espaco ou "BRT" passariam no banco e so quebrariam DEPOIS, em
 * runtime, dentro de um `Intl` — longe do cadastro que digitou o valor.
 *
 * A checagem e feita pelo proprio runtime em vez de uma lista fixa: `Intl.supportedValuesOf` devolve
 * so os nomes canonicos (418 hoje) e recusaria apelidos legitimos como "Brazil/East".
 */
export function fusoHorarioValido(valor: string): boolean {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: valor });
    return true;
  } catch {
    return false;
  }
}

export const empresaPayloadSchema = z.object({
  nome: z.string().min(1),
  cnpj: z.string().optional().nullable(),
  matriculaPrefixo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,8}$/)
    .default("TNP"),
  fusoHorario: z.string().trim().min(1).refine(fusoHorarioValido, "Fuso horario invalido").default("America/Sao_Paulo"),
  // Teto porque a coluna e `integer`: acima de 2.147.483.647 o Postgres responde 22003 e a rota
  // devolveria 500 por um numero digitado errado no cadastro.
  comprasPrazoRespostaHoras: z.coerce.number().int().positive().max(2_147_483_647).optional().nullable()
});

export type EmpresaPayload = z.infer<typeof empresaPayloadSchema>;
