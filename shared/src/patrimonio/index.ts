// Cadastro MINIMO de patrimonio (PROJECT_BRAIN/17, D2): grupos com sigla + itens com marca/setor.
// Alimenta o campo Grupo da discriminacao quando o item e maquinario/manutencao (§5).
import { z } from "zod";
import { empresaQuerySchema, apiIdParamsSchema } from "../api/index.js";

const uuidSchema = z.string().uuid();

// Sigla curta em MAIUSCULAS (FIS, MAT, UTS, MAQ, MOB, EMB na planilha). Nao e enum: o cadastro tem
// CRUD e precisa aceitar um grupo novo — o formato e o que o banco tambem garante.
export const siglaPatrimonioSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2,4}$/, "Sigla deve ter de 2 a 4 letras maiusculas");

export const grupoPatrimonioPayloadSchema = z.object({
  empresaId: uuidSchema,
  sig: siglaPatrimonioSchema,
  nome: z.string().trim().min(1)
});

export const patrimonioItemPayloadSchema = z.object({
  empresaId: uuidSchema,
  grupoPatrimonioId: uuidSchema,
  setorId: uuidSchema.nullish(),
  nome: z.string().trim().min(1),
  marca: z.string().trim().nullish()
});

export const patrimonioQuerySchema = empresaQuerySchema;
export const patrimonioParamsSchema = apiIdParamsSchema;

export type GrupoPatrimonioPayload = z.infer<typeof grupoPatrimonioPayloadSchema>;
export type PatrimonioItemPayload = z.infer<typeof patrimonioItemPayloadSchema>;

// As seis siglas da aba PATRIMONIO da planilha (§3). Usadas pelo seed; o cadastro aceita outras.
export const gruposPatrimonioPadrao = [
  { sig: "FIS", nome: "Estrutura fisica" },
  { sig: "MAT", nome: "Materia prima" },
  { sig: "UTS", nome: "Utensilios e ferramentas" },
  { sig: "MAQ", nome: "Maquinas e equipamentos" },
  { sig: "MOB", nome: "Mobiliarios e balcoes" },
  { sig: "EMB", nome: "Embalagens" }
] as const;
