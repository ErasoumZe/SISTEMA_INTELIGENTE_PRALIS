import { z } from "zod";
import {
  exportarEmpresaPayloadSchema,
  apiIdParamsSchema,
  importarEmpresaPayloadSchema,
  paginationQuerySchema,
  type ExportarEmpresaPayload,
  type ImportarEmpresaPayload
} from "../api/index.js";

const uuidSchema = z.string().uuid();
const dinheiroSchema = z.coerce.number().min(0);

// Ciclo do malote/lacre: disponivel -> em_uso (aberto num caixa ou usado numa sangria/retorno) -> devolvido.
export const maloteStatusSchema = z.enum(["disponivel", "em_uso", "devolvido"]);

export const maloteParamsSchema = z.object({
  maloteId: uuidSchema
});

export const malotesQuerySchema = z
  .object({
    empresaId: uuidSchema.optional()
  })
  .merge(paginationQuerySchema);

export const validarLacreQuerySchema = z.object({
  numero: z.string().min(1),
  empresaId: uuidSchema.optional()
});

// O malote E o lacre (D3): a identidade e o numero do lacre (unico por empresa, impresso de fonte
// externa e digitado). Nao existe mais "codigo do malote" nem o "saco". valor = fundo emprestado do
// cofre (R8); vira a divida do caixa quando o malote e usado na abertura.
export const criarMaloteSchema = z.object({
  empresaId: uuidSchema,
  numeroLacre: z.string().trim().min(1),
  valor: dinheiroSchema.default(0)
});

export const atualizarMaloteSchema = z.object({
  numeroLacre: z.string().trim().min(1),
  valor: dinheiroSchema.default(0)
});

export const importarMalotesSchema = importarEmpresaPayloadSchema;
export const exportarMaloteSchema = exportarEmpresaPayloadSchema;
export const maloteExportacaoParamsSchema = apiIdParamsSchema;

export type MaloteStatus = z.infer<typeof maloteStatusSchema>;
export type MaloteParams = z.infer<typeof maloteParamsSchema>;
export type MalotesQuery = z.infer<typeof malotesQuerySchema>;
export type CriarMalotePayload = z.infer<typeof criarMaloteSchema>;
export type AtualizarMalotePayload = z.infer<typeof atualizarMaloteSchema>;
export type ImportarMalotesPayload = ImportarEmpresaPayload;
export type ExportarMalotePayload = ExportarEmpresaPayload;
