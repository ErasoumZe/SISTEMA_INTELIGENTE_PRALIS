import { z } from "zod";

const uuidSchema = z.string().uuid();

export const importarCadastroSchema = z.object({
  empresaOrigemId: uuidSchema,
  empresaDestinoId: uuidSchema,
  modo: z.enum(["simples", "completo"]).default("simples")
});

export const exportarCadastroSchema = z.object({
  empresaDestinoId: uuidSchema,
  modo: z.enum(["simples", "completo"]).default("simples")
});

export const idCadastroParamsSchema = z.object({
  id: uuidSchema
});

export type ImportarCadastroPayload = z.infer<typeof importarCadastroSchema>;
export type ExportarCadastroPayload = z.infer<typeof exportarCadastroSchema>;
export type ModoCopiaCadastro = ImportarCadastroPayload["modo"];
