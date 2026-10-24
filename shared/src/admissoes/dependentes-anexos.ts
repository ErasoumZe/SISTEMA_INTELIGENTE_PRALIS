import { z } from "zod";

export const tiposAnexoDependente = [
  "certidao_nascimento_rg",
  "cpf",
  "cartao_vacina",
  "comprovante_escolaridade"
] as const;

export const tiposAnexoDependenteObrigatorios = [
  "certidao_nascimento_rg",
  "cpf",
  "cartao_vacina",
  "comprovante_escolaridade"
] as const;

export const tipoAnexoDependenteSchema = z.enum(tiposAnexoDependente);

export const anexoDependenteDtoSchema = z.object({
  id: z.string().uuid(),
  tipo: tipoAnexoDependenteSchema,
  nomeOriginal: z.string(),
  mimeType: z.string(),
  tamanhoBytes: z.number().int().positive(),
  criadoEm: z.string()
});

export type TipoAnexoDependente = (typeof tiposAnexoDependente)[number];
export type AnexoDependenteDto = z.infer<typeof anexoDependenteDtoSchema>;
