import { z } from "zod";

const uuidSchema = z.string().uuid();
const curvaAbcSchema = z.enum(["A", "B", "C"]);

export const estoqueProdutosQuerySchema = z.object({
  empresaId: uuidSchema,
  grupoMercadoriaId: uuidSchema.optional(),
  areaEstoque: z.string().trim().min(1).max(120).optional(),
  localVenda: z.string().trim().min(1).max(120).optional(),
  localEstoque: z.string().trim().min(1).max(120).optional(),
  curvaAbc: curvaAbcSchema.optional()
});

export const conferenciaEstoquePayloadSchema = z.object({
  empresaId: uuidSchema,
  grupoMercadoriaId: uuidSchema.optional().nullable(),
  areaEstoque: z.string().trim().max(120).optional().nullable(),
  localVenda: z.string().trim().max(120).optional().nullable(),
  localEstoque: z.string().trim().max(120).optional().nullable(),
  curvaAbc: curvaAbcSchema.optional().nullable(),
  agendadaPara: z.string().min(10),
  observacao: z.string().trim().max(1_000).optional().nullable()
});

export const conferenciasEstoqueQuerySchema = z.object({ empresaId: uuidSchema });

export type EstoqueProdutosQuery = z.infer<typeof estoqueProdutosQuerySchema>;
export type ConferenciaEstoquePayload = z.infer<typeof conferenciaEstoquePayloadSchema>;
export type ConferenciasEstoqueQuery = z.infer<typeof conferenciasEstoqueQuerySchema>;

export type ProdutoEstoqueDto = {
  id: string;
  descricao: string;
  grupoMercadoriaId: string | null;
  grupo: string | null;
  quantidadeEstoque: string;
  estoqueMin: string | null;
  estoqueMax: string | null;
  areaEstoque: string | null;
  localVenda: string[];
  localEstoque: string | null;
  curvaAbc: "A" | "B" | "C" | null;
};

export type ConferenciaEstoqueDto = {
  id: string;
  empresaId: string;
  grupoMercadoriaId: string | null;
  grupo: string | null;
  areaEstoque: string | null;
  localVenda: string | null;
  localEstoque: string | null;
  curvaAbc: "A" | "B" | "C" | null;
  agendadaPara: string;
  observacao: string | null;
  status: "agendada" | "cancelada" | "concluida";
  criadoEm: string;
};
