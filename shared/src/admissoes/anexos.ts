import { z } from "zod";

export const tiposAnexoAdmissao = [
  "rg",
  "cpf",
  "titulo_eleitor",
  "certidao_nascimento_casamento",
  "comprovante_residencia",
  "foto_3x4",
  "ctps_digital",
  "pis_pasep_nit",
  "certificado_reservista",
  "comprovante_escolaridade",
  "certificados_profissionais",
  "aso_admissional"
] as const;

export const tiposAnexoAdmissaoObrigatorios = ["cpf", "comprovante_residencia"] as const;

export const tipoAnexoAdmissaoSchema = z.enum(tiposAnexoAdmissao);
export type TipoAnexoAdmissao = z.infer<typeof tipoAnexoAdmissaoSchema>;

export const anexoAdmissaoDtoSchema = z.object({
  id: z.string().uuid(),
  tipo: tipoAnexoAdmissaoSchema,
  nomeOriginal: z.string(),
  mimeType: z.string(),
  tamanhoBytes: z.number().int().positive(),
  criadoEm: z.string().datetime()
});

export type AnexoAdmissaoDto = z.infer<typeof anexoAdmissaoDtoSchema>;
