import { z } from "zod";

const uuid = z.string().uuid();
const telefone = z.string().regex(/^\d{10,13}$/u, "Informe somente os números do WhatsApp");
const cep = z.string().regex(/^\d{8}$/u, "Informe somente os números do CEP");
const uf = z.string().regex(/^[A-Z]{2}$/u, "UF inválida");
const texto = (max: number) => z.string().trim().min(1).max(max);
const textoOpcional = (max: number) => z.string().trim().max(max).nullable().optional();

export const clinicaOcupacionalPayloadSchema = z.object({
  empresaId: uuid,
  nome: texto(180),
  cnpj: z.string().regex(/^\d{14}$/u, "CNPJ inválido").nullable().optional(),
  email: z.string().email("E-mail inválido").max(254).nullable().optional(),
  whatsapp: telefone.nullable().optional(),
  contatoNome: textoOpcional(180),
  observacoes: textoOpcional(2_000),
  ativo: z.boolean()
});

export const unidadeClinicaOcupacionalPayloadSchema = z.object({
  empresaId: uuid,
  nome: texto(180),
  email: z.string().email("E-mail inválido").max(254).nullable().optional(),
  whatsapp: telefone.nullable().optional(),
  cep: cep.nullable().optional(),
  logradouro: textoOpcional(180),
  numero: textoOpcional(30),
  complemento: textoOpcional(120),
  bairro: textoOpcional(120),
  municipio: textoOpcional(120),
  uf: uf.nullable().optional(),
  ativo: z.boolean()
});

export const clinicasOcupacionaisQuerySchema = z.object({ empresaId: uuid });

export const clinicaOcupacionalDtoSchema = z.object({
  id: z.string(),
  empresaId: z.string(),
  nome: z.string(),
  cnpj: z.string().nullable(),
  email: z.string().nullable(),
  whatsapp: z.string().nullable(),
  contatoNome: z.string().nullable(),
  observacoes: z.string().nullable(),
  ativo: z.boolean(),
  unidades: z.array(
    z.object({
      id: z.string(),
      nome: z.string(),
      email: z.string().nullable(),
      whatsapp: z.string().nullable(),
      cep: z.string().nullable(),
      logradouro: z.string().nullable(),
      numero: z.string().nullable(),
      complemento: z.string().nullable(),
      bairro: z.string().nullable(),
      municipio: z.string().nullable(),
      uf: z.string().nullable(),
      ativo: z.boolean()
    })
  )
});

export type ClinicaOcupacionalPayload = z.infer<typeof clinicaOcupacionalPayloadSchema>;
export type UnidadeClinicaOcupacionalPayload = z.infer<typeof unidadeClinicaOcupacionalPayloadSchema>;
export type ClinicaOcupacionalDto = z.infer<typeof clinicaOcupacionalDtoSchema>;
