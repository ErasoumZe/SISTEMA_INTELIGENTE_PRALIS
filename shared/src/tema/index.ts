import { z } from "zod";

const uuidSchema = z.string().uuid();

export const temaQuerySchema = z.object({
  empresaId: uuidSchema,
  tela: z.string().min(1).default("padrao")
});

export const temaPayloadSchema = z.object({
  empresaId: uuidSchema,
  tela: z.string().min(1).default("padrao"),
  corPrimaria: z.string().min(4),
  corSecundaria: z.string().min(4),
  corFundo: z.string().min(4),
  corCartao: z.string().min(4),
  corSucesso: z.string().min(4),
  corAviso: z.string().min(4),
  corErro: z.string().min(4)
});

export interface TemaAplicacao {
  corPrimaria: string;
  corSecundaria: string;
  corFundo: string;
  corCartao: string;
  corSucesso: string;
  corAviso: string;
  corErro: string;
}

export type TemaQuery = z.infer<typeof temaQuerySchema>;
export type TemaPayload = z.infer<typeof temaPayloadSchema>;
export type TemaDto = TemaAplicacao;
