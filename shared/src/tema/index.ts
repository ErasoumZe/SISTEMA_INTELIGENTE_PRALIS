import { z } from "zod";

const uuidSchema = z.string().uuid();

export const TELA_TEMA_RESUMO_CAIXA = "resumo_caixa";

export const temaAplicacaoSchema = z.object({
  corPrimaria: z.string().min(4),
  corSecundaria: z.string().min(4),
  corFundo: z.string().min(4),
  corCartao: z.string().min(4),
  corSucesso: z.string().min(4),
  corAviso: z.string().min(4),
  corErro: z.string().min(4)
});

export const configuracaoAparenciaEmpresaSchema = z.object({
  padrao: temaAplicacaoSchema,
  especifico: z
    .array(
      z.object({
        pagina: z.string().min(1),
        propriedades: temaAplicacaoSchema.partial()
      })
    )
    .default([])
});

export const temaQuerySchema = z.object({
  empresaId: uuidSchema,
  tela: z.string().min(1).default("padrao")
});

export const temaPayloadSchema = temaAplicacaoSchema.extend({
  empresaId: uuidSchema,
  tela: z.string().min(1).default("padrao")
});

export const temaPadraoAplicacao = {
  corPrimaria: "#6d28d9",
  corSecundaria: "#0891b2",
  corFundo: "#eaf1f9",
  corCartao: "#ffffff",
  corSucesso: "#16a34a",
  corAviso: "#f59e0b",
  corErro: "#ef4444"
} satisfies TemaAplicacao;

export interface EmpresaSessao {
  id: string;
  nome: string;
  cnpj?: string | null;
  configuracoesAparencia: ConfiguracaoAparenciaEmpresa;
}

export type TemaAplicacao = z.infer<typeof temaAplicacaoSchema>;
export type ConfiguracaoAparenciaEmpresa = z.infer<typeof configuracaoAparenciaEmpresaSchema>;
export type TemaQuery = z.infer<typeof temaQuerySchema>;
export type TemaPayload = z.infer<typeof temaPayloadSchema>;
export type TemaDto = TemaAplicacao;
