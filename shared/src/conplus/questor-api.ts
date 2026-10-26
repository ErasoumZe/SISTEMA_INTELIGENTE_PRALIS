import { z } from "zod";
import {
  contratoColaboradorQuestorPayloadSchema,
  contratoQuestorPayloadSchema,
  funcaoQuestorPayloadSchema,
  tabelasCodigoQuestor,
  turnoQuestorPayloadSchema,
  type TabelaCodigoQuestor
} from "./questor-parametros.js";

/**
 * Contrato HTTP de E2/E3/E4 — compartilhado entre a API e as telas do DP.
 *
 * Regras comuns:
 * - a empresa vem SEMPRE da sessão; nenhum corpo ou query aceita `empresaId`;
 * - respostas no envelope padrão `{ data }`; erros no formato problem (`code`, `title`, `status`);
 * - toda escrita usa concorrência otimista (`versao` ou `atualizadoEmLido`) e responde 409 se
 *   alguém gravou antes;
 * - campo desconhecido no corpo é recusado; nenhum código Questor é preenchido pelo servidor.
 *
 * As requisições de ENTRADA são os schemas de `questor-parametros.ts` (mesmas regras que o banco
 * reforça por CHECK). Este arquivo acrescenta os caminhos, as respostas e os códigos de erro.
 */

export const ROTAS_QUESTOR = {
  configuracao: "/api/conplus/questor/configuracao",
  codigos: "/api/conplus/questor/codigos",
  codigo: "/api/conplus/questor/codigos/:id",
  funcoes: "/api/conplus/questor/funcoes",
  funcao: "/api/conplus/questor/funcoes/:id",
  turnos: "/api/conplus/questor/turnos",
  turno: "/api/conplus/questor/turnos/:id",
  contratosColaboradores: "/api/conplus/questor/contratos-colaboradores",
  contratoColaborador: "/api/conplus/questor/contratos-colaboradores/:id",
  /** Situação da busca automática na API Conplus (só leitura). */
  sincronizacaoEstado: "/api/conplus/sincronizacao/estado",
  contrato: "/api/admissoes/processos/:id/questor/contrato",
  prontidao: "/api/admissoes/processos/:id/questor/prontidao"
} as const;

/** Códigos de erro de domínio que a tela deve tratar (além de 400/401/403/404 genéricos). */
export const ERROS_QUESTOR = {
  versaoDesatualizada: "QUESTOR_VERSAO_DESATUALIZADA",
  codigoForaDoCatalogo: "QUESTOR_CODIGO_FORA_DO_CATALOGO",
  codigoDuplicado: "QUESTOR_CODIGO_DUPLICADO",
  contratoColaboradorDuplicado: "QUESTOR_CONTRATO_COLABORADOR_DUPLICADO",
  migrationPendente: "QUESTOR_MIGRATION_PENDENTE"
} as const;

// --- E2: configuração -------------------------------------------------------------------------------

export const configuracaoQuestorDtoSchema = z.object({
  /** `0` enquanto a empresa não tiver configuração gravada. */
  versao: z.number().int().nonnegative(),
  codigoEstabelecimento: z.number().int().nullable(),
  classificacaoOrganograma: z.string().nullable(),
  utilizaHoraCentesimal: z.boolean().nullable(),
  codigoEmpresaQuestor: z.number().int().nullable(),
  razaoSocialQuestor: z.string().nullable(),
  padroes: z.record(z.string(), z.string()),
  atualizadoEm: z.string().nullable(),
  atualizadoPorNome: z.string().nullable()
});
export type ConfiguracaoQuestorDto = z.infer<typeof configuracaoQuestorDtoSchema>;

// --- E2: catálogo ----------------------------------------------------------------------------------

export const codigosQuestorQuerySchema = z.object({
  tabela: z.enum(tabelasCodigoQuestor as [TabelaCodigoQuestor, ...TabelaCodigoQuestor[]]).optional(),
  incluirInativos: z
    .enum(["true", "false"])
    .optional()
    .transform((valor) => valor === "true")
});

/** PATCH: tabela e código são imutáveis — corrigir código errado é desativar e cadastrar outro. */
export const codigoQuestorAtualizacaoSchema = z
  .object({
    descricao: z.string().trim().min(1).max(120).optional(),
    ativo: z.boolean().optional()
  })
  .strict()
  .refine((dados) => dados.descricao !== undefined || dados.ativo !== undefined, "Informe descrição ou situação");

export const codigoQuestorDtoSchema = z.object({
  id: z.string().uuid(),
  tabela: z.enum(tabelasCodigoQuestor as [TabelaCodigoQuestor, ...TabelaCodigoQuestor[]]),
  codigo: z.string(),
  descricao: z.string(),
  ativo: z.boolean(),
  atualizadoEm: z.string()
});
export type CodigoQuestorDto = z.infer<typeof codigoQuestorDtoSchema>;

// --- E3: funções e turnos -------------------------------------------------------------------------

/** `atualizadoEm` lido no GET: as tabelas não têm `versao`, então ele é o controle de concorrência. */
const atualizadoEmLido = z.string().datetime({ offset: true });

export const funcaoQuestorRequisicaoSchema = funcaoQuestorPayloadSchema.extend({ atualizadoEmLido }).strict();
export const turnoQuestorRequisicaoSchema = turnoQuestorPayloadSchema.extend({ atualizadoEmLido }).strict();

export const funcaoQuestorDtoSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  cbo: z.string().nullable(),
  ativo: z.boolean(),
  questorCodigoCargo: z.string().nullable(),
  questorAgenteNocivo: z.string().nullable(),
  atualizadoEm: z.string()
});
export type FuncaoQuestorDto = z.infer<typeof funcaoQuestorDtoSchema>;

export const turnoQuestorDtoSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  ativo: z.boolean(),
  questorCodigoEscala: z.string().nullable(),
  questorTipoJornada: z.number().int().nullable(),
  questorTempoParcial: z.number().int().nullable(),
  questorRegimeJornada: z.number().int().nullable(),
  atualizadoEm: z.string()
});
export type TurnoQuestorDto = z.infer<typeof turnoQuestorDtoSchema>;

// --- E4: contrato do DP ------------------------------------------------------------------------------

/** Mesma `versao` do bloco interno: o diálogo atual e este bloco não se sobrescrevem em silêncio. */
export const contratoQuestorRequisicaoSchema = contratoQuestorPayloadSchema;

export const contratoQuestorDtoSchema = z.object({
  processoId: z.string().uuid(),
  versao: z.number().int().positive(),
  questorTipoSalario: z.number().int().nullable(),
  salarioCentavos: z.number().int().nullable(),
  descricaoSalario: z.string().nullable(),
  diasExperiencia: z.number().int().nullable(),
  diasProrrogacao: z.number().int().nullable(),
  questorTipoContrato: z.string().nullable(),
  questorSindicato: z.string().nullable(),
  questorTipoAdmissao: z.number().int().nullable(),
  pcdCotista: z.boolean().nullable(),
  utilizaCtpsDigital: z.boolean().nullable(),
  possuiAlvara: z.boolean().nullable(),
  jaExpostoAgenteNocivo: z.boolean().nullable()
});
export type ContratoQuestorDto = z.infer<typeof contratoQuestorDtoSchema>;

// --- Código do contrato do colaborador ---------------------------------------------------------------

/** O vínculo não tem `versao`: o `atualizadoEm` lido na listagem é o controle de concorrência. */
export const contratoColaboradorQuestorRequisicaoSchema = contratoColaboradorQuestorPayloadSchema
  .extend({ atualizadoEmLido })
  .strict();

/** Só o necessário para o DP reconhecer o vínculo — sem CPF nem dado pessoal além do nome. */
export const contratoColaboradorQuestorDtoSchema = z.object({
  vinculoId: z.string().uuid(),
  matricula: z.string(),
  colaboradorNome: z.string(),
  funcaoNome: z.string(),
  admitidoEm: z.string(),
  status: z.enum(["ativo", "desligado"]),
  questorCodigoContrato: z.string().nullable(),
  atualizadoEm: z.string()
});
export type ContratoColaboradorQuestorDto = z.infer<typeof contratoColaboradorQuestorDtoSchema>;
