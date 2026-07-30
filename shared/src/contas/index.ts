import { z } from "zod";
import {
  empresaQuerySchema,
  exportarEmpresaPayloadSchema,
  apiIdParamsSchema,
  importarEmpresaPayloadSchema,
  type ExportarEmpresaPayload,
  type ImportarEmpresaPayload
} from "../api/index.js";

const uuidSchema = z.string().uuid();

export const contaPayloadSchema = z.object({
  empresaId: uuidSchema,
  nome: z.string().min(1),
  // FUNDO da conta (D8): ponto de partida do saldo, definido no cadastro. Opcional para nao quebrar
  // quem ja chama sem ele — ausente significa 0, que e o que as contas existentes valem hoje.
  saldoInicial: z.coerce.number().min(0).optional(),
  // Usuarios que podem MOVIMENTAR a conta (contas_usuarios). Vem junto do cadastro porque no
  // desenho do Rodrigo (FOTO 4) fundo e vinculos sao a mesma tela. undefined = nao mexer nos
  // vinculos; [] = remover todos (e uma escolha explicita do admin, nao um efeito colateral).
  usuariosIds: z.array(z.string()).optional()
});

// Conta na listagem, com o saldo ATUAL derivado (nunca lido de coluna). Os dois vem em reais.
export const contaComSaldoSchema = z.object({
  id: z.string(),
  empresaId: z.string(),
  nome: z.string(),
  saldoInicial: z.number(),
  saldoAtual: z.number(),
  usuariosIds: z.array(z.string())
});

export const contasQuerySchema = empresaQuerySchema;
export const importarContasSchema = importarEmpresaPayloadSchema;
export const exportarContaSchema = exportarEmpresaPayloadSchema;
export const contaParamsSchema = apiIdParamsSchema;

export type ContaPayload = z.infer<typeof contaPayloadSchema>;
export type ContaComSaldo = z.infer<typeof contaComSaldoSchema>;
export type ImportarContasPayload = ImportarEmpresaPayload;
export type ExportarContaPayload = ExportarEmpresaPayload;
