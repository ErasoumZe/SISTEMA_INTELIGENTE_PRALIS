import { z } from "zod";
import { paginationQuerySchema } from "../api/index.js";
import { tiposJuros } from "../dinheiro/index.js";
import { recorrenciaSchema, resultadoSerieSchema } from "../recorrencia/index.js";

const uuidSchema = z.string().uuid();
const dinheiroSchema = z.coerce.number().min(0);

export const retiradasQuerySchema = z
  .object({
    empresaId: uuidSchema.optional(),
    caixaId: uuidSchema.optional()
  })
  .merge(paginationQuerySchema);

export const retiradaPayloadSchema = z
  .object({
    empresaId: uuidSchema,
    dataReferencia: z.string().min(10),
    dataVencimento: z.string().min(10),
    dataPagamento: z.string().min(10).optional().nullable(),
    // R-127: o texto do movimento e a OBSERVACAO. `descricao` continua ACEITA (compatibilidade com
    // chamada antiga) mas nao e exigida — o servidor grava o que vier em observacao, ou a descricao
    // como reserva, e recusa quando os dois vem vazios.
    descricao: z.string().optional().nullable(),
    observacao: z.string().optional().nullable(),
    valorOriginal: dinheiroSchema,
    valorAcrescimo: dinheiroSchema.default(0),
    descricaoAcrescimo: z.string().optional().nullable(),
    // R-041 — juros. Guarda COMO foi informado; o R$ resolvido vai para valorAcrescimo, e quem
    // resolve e o SERVIDOR (valoresJuros em lancamentos.dominio). O acrescimo que chega do cliente e
    // IGNORADO quando ha jurosTipo: total que chega pronto do front e total que o front pode mentir.
    jurosTipo: z.enum(tiposJuros).optional().nullable(),
    jurosValorInformado: z.coerce.number().min(0).optional().nullable(),
    valorDesconto: dinheiroSchema.default(0),
    descricaoDesconto: z.string().optional().nullable(),
    contaOrigemId: uuidSchema.optional().nullable(),
    // R-047: a 0020 tirou o NOT NULL de retiradas.colaborador_id porque, com socio/gestor como
    // credor, nao existe colaborador. Mas retirada SEM credor nenhum nunca foi aceita e nao passa
    // a ser: a obrigatoriedade virou "um dos dois", no refine abaixo.
    // R-128: a TELA oferece fornecedor ou socio/gestor (fiel a FOTO 2). `colaborador` continua
    // ACEITO no contrato porque o historico tem retirada gravada assim e ela precisa reabrir e ser
    // salva de novo sem virar registro invalido. O que muda e o que a tela OFERECE.
    fornecedorId: uuidSchema.optional().nullable(),
    colaboradorId: uuidSchema.optional().nullable(),
    socioGestorId: uuidSchema.optional().nullable(),
    credorTipo: z.enum(["fornecedor", "colaborador", "socio_gestor"]).optional().nullable(),
    dataDocumentoFiscal: z.string().min(10).optional().nullable(),
    numeroDocumentoFiscal: z.string().optional().nullable(),
    grupoRetiradaId: uuidSchema.optional().nullable(),
    computar: z.boolean().default(true),
    fotoDocumentoUrl: z.string().optional().nullable(),
    fotoNotaUrl: z.string().optional().nullable(),
    // Recorrencia (D3): presente = o servidor cria a serie inteira no salvar. Exige permissao.
    recorrencia: recorrenciaSchema.optional()
  })
  .superRefine((retirada, ctx) => {
    const credores = [retirada.fornecedorId, retirada.colaboradorId, retirada.socioGestorId].filter(Boolean).length;
    if (credores === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fornecedorId"],
        message: "Informe o credor da retirada: fornecedor ou socio/gestor"
      });
    }
    if (credores > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["socioGestorId"],
        message: "A retirada tem um credor so: fornecedor OU socio/gestor"
      });
    }
  });

export const retiradaDtoSchema = z.object({
  id: z.string(),
  empresaId: z.string(),
  dataReferencia: z.string(),
  descricao: z.string(),
  valorOriginal: z.string(),
  computar: z.boolean(),
  status: z.string()
});

export const retiradaCriadaSchema = z.object({
  id: z.string(),
  computar: z.boolean(),
  ...resultadoSerieSchema
});

export type RetiradasQuery = z.input<typeof retiradasQuerySchema>;
export type RetiradaPayload = z.infer<typeof retiradaPayloadSchema>;

// Detalhe para edicao: payload completo (com filhos) + identificacao do registro.
export type RetiradaDetalheDto = RetiradaPayload & { id: string; status: string; caixaId: string | null };
export type RetiradaDto = z.infer<typeof retiradaDtoSchema>;
export type RetiradaCriada = z.infer<typeof retiradaCriadaSchema>;
