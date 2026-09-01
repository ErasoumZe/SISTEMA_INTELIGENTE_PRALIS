import { z } from "zod";

/**
 * ADM-003 V2 — o contrato do convite ao candidato.
 *
 * O token NAO aparece em nenhum schema de entrada: ele nasce no servidor, e sai UMA vez na resposta
 * da emissao. Nao ha rota que o receba de volta nesta fatia — a ficha publica e a V3.
 */

/** 14 dias, contados da emissao. GRAVADO na linha, nunca derivado na leitura. */
export const diasDeValidadeDoConvite = 14;

export const conviteDtoSchema = z.object({
  id: z.string(),
  expiraEm: z.string(),
  criadoEm: z.string(),
  criadoPorNome: z.string().nullable(),
  avisoPrivacidadeVersao: z.string(),
  /** DERIVADO no servidor: a tela nao recalcula prazo, so mostra. */
  expirado: z.boolean(),
  primeiroAcessoEm: z.string().nullable(),
  ultimoAcessoEm: z.string().nullable()
});

export type ConviteDto = z.infer<typeof conviteDtoSchema>;

/**
 * A resposta da EMISSAO carrega o token em claro. E a unica vez que ele existe fora do servidor:
 * o banco guarda so o SHA-256, e nao ha rota que o devolva depois.
 */
export const conviteEmitidoDtoSchema = conviteDtoSchema.extend({
  token: z.string()
});

export type ConviteEmitidoDto = z.infer<typeof conviteEmitidoDtoSchema>;

/**
 * Situacao do convite para a tela, derivada no servidor.
 *
 * `indisponivel` e o estado em que o sistema NAO pode emitir — hoje porque o aviso de privacidade
 * vigente nao vale no ambiente. A tela mostra o motivo em vez de um botao que daria erro.
 */
export const situacoesConvite = ["indisponivel", "ausente", "vigente", "expirado"] as const;
export const situacaoConviteSchema = z.enum(situacoesConvite);
export type SituacaoConvite = z.infer<typeof situacaoConviteSchema>;

export const painelConviteDtoSchema = z.object({
  situacao: situacaoConviteSchema,
  /** Por que nao da para emitir agora. Vazio quando da. */
  motivo: z.string(),
  convite: conviteDtoSchema.nullable()
});

export type PainelConviteDto = z.infer<typeof painelConviteDtoSchema>;
