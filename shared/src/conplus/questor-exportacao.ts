import { z } from "zod";

/**
 * Contratos das exportações Questor (TXT de admissão e CSV de eventos variáveis).
 *
 * Três níveis, do mais livre ao mais protegido:
 * - **prévia**: valida e mostra; não grava nada;
 * - **arquivo técnico** (só admissão): gera o TXT mesmo com pendências oficiais, com nome
 *   `TECNICO-NAO-IMPORTAR-…`, e registra na auditoria como `previa`. Serve para conferência interna
 *   e para enviar à Conplus como amostra — nunca para importar;
 * - **arquivo oficial**: só com os dois gates de homologação ligados (`CONPLUS_QUESTOR_EXPORT_ENABLED`
 *   e `CONPLUS_QUESTOR_EXPORT_HOMOLOGADA`) e o arquivo sem nenhuma pendência; registrado como `gerado`.
 *
 * Todo arquivo gravado fica no storage, identificado pelo SHA-256 do conteúdo, e pode ser baixado de
 * novo pelo histórico. O mesmo conteúdo gerado duas vezes devolve o registro existente.
 */

export const ROTAS_EXPORTACAO_QUESTOR = {
  admissoesPrevia: "/api/conplus/questor/exportacoes/admissoes/previa",
  admissoesTecnico: "/api/conplus/questor/exportacoes/admissoes/tecnico",
  admissoesDownload: "/api/conplus/questor/exportacoes/admissoes/download",
  eventosPrevia: "/api/conplus/questor/exportacoes/eventos/previa",
  eventosTecnico: "/api/conplus/questor/exportacoes/eventos/tecnico",
  eventosDownload: "/api/conplus/questor/exportacoes/eventos/download",
  historico: "/api/conplus/questor/exportacoes",
  arquivo: "/api/conplus/questor/exportacoes/:id/arquivo",
  eventos: "/api/conplus/questor/eventos",
  evento: "/api/conplus/questor/eventos/:id",
  eventosImportar: "/api/conplus/questor/eventos/importar-catalogo",
  lancamentoCancelar: "/api/conplus/questor/eventos/lancamentos/:id/cancelar",
  estado: "/api/conplus/questor/exportacoes/estado",
  lancamentos: "/api/conplus/questor/eventos/lancamentos",
  lancamento: "/api/conplus/questor/eventos/lancamentos/:id"
} as const;

export const ERROS_EXPORTACAO_QUESTOR = {
  naoHomologada: "QUESTOR_EXPORTACAO_NAO_HOMOLOGADA",
  invalida: "QUESTOR_EXPORTACAO_INVALIDA",
  jaExportado: "QUESTOR_EXPORTACAO_JA_REALIZADA",
  arquivoAusente: "QUESTOR_EXPORTACAO_ARQUIVO_AUSENTE",
  processoNaoExportavel: "QUESTOR_PROCESSO_NAO_EXPORTAVEL",
  lancamentoExportado: "QUESTOR_LANCAMENTO_JA_EXPORTADO",
  sequenciaEmUso: "QUESTOR_SEQUENCIA_EM_USO",
  tecnicoEncerrado: "QUESTOR_ARQUIVO_TECNICO_ENCERRADO",
  lancamentoEmArquivoTecnico: "QUESTOR_LANCAMENTO_EM_ARQUIVO_TECNICO",
  catalogoOutraEmpresa: "QUESTOR_CATALOGO_OUTRA_EMPRESA",
  catalogoSemIdentidade: "QUESTOR_CATALOGO_SEM_RAZAO_SOCIAL",
  confirmacaoTecnicoObrigatoria: "QUESTOR_CONFIRMACAO_TECNICO_OBRIGATORIA",
  lancamentoCancelado: "QUESTOR_LANCAMENTO_CANCELADO"
} as const;

export const VERSAO_LAYOUT_ADMISSAO_QUESTOR = "questor-admissao-v2";
/** Layout oficial enviado pela Conplus em 22/10/2026 (EventoVariavel.nli). */
export const VERSAO_LAYOUT_EVENTOS_QUESTOR = "questor-evento-variavel-nli-2026-10-22";

const idsUnicos = <T extends z.ZodTypeAny>(item: T, maximo: number) =>
  z
    .array(item)
    .min(1)
    .max(maximo)
    .refine((lista) => new Set(lista).size === lista.length, "Itens repetidos na seleção");

/** Reexportar algo já exportado exige justificativa: o Questor duplicaria o lançamento/contrato. */
const motivoRegeracao = z.string().trim().min(5).max(500).optional();
const competencia = z.string().regex(/^\d{4}-\d{2}-01$/u, "Competência é o primeiro dia do mês (AAAA-MM-01)");

export const questorExportacaoPreviaRequisicaoSchema = z
  .object({ processoIds: idsUnicos(z.string().uuid(), 50) })
  .strict();

/**
 * Novo download pelo histórico. Arquivo TÉCNICO exige a mesma confirmação da geração (o servidor confere;
 * a tela só abre o diálogo). Arquivo oficial não leva o campo.
 */
export const questorDownloadHistoricoQuerySchema = z
  .object({ confirmacaoArquivoTecnico: z.literal("true").optional() })
  .strict();

export const questorExportacaoAdmissaoRequisicaoSchema = z
  .object({ processoIds: idsUnicos(z.string().uuid(), 50), motivoRegeracao })
  .strict();

/**
 * O arquivo técnico tem o MESMO layout do oficial (o Questor não lê o nome do arquivo) e por isso exige
 * que quem baixa declare que não vai importá-lo. A confirmação é exigida no servidor e fica na auditoria.
 */
const confirmacaoArquivoTecnico = z.literal(true, {
  message: "Confirme que o arquivo técnico NÃO será importado no Questor"
});

export const questorExportacaoAdmissaoTecnicoSchema = z
  .object({ processoIds: idsUnicos(z.string().uuid(), 50), confirmacaoArquivoTecnico })
  .strict();

export type QuestorExportacaoPreviaRequisicao = z.infer<typeof questorExportacaoPreviaRequisicaoSchema>;

export type QuestorExportacaoPreviaRegistro = {
  processoId: string;
  situacao: "pronto" | "bloqueado";
  fichaAprovada: boolean;
  quantidadeLinhas: number;
  pendencias: readonly string[];
  diagnosticos: readonly string[];
};

export type QuestorExportacaoPreviaDto = {
  tipo: "admissao";
  /** `true` só com os dois gates de homologação ligados no servidor. */
  exportacaoDisponivel: boolean;
  homologacaoConplusConfirmada: boolean;
  bloqueio: "QUESTOR_EXPORTACAO_NAO_HOMOLOGADA" | null;
  registros: readonly QuestorExportacaoPreviaRegistro[];
};

// --- Eventos variáveis -------------------------------------------------------------------------------

export const questorEventosVariaveisCatalogoSchema = z
  .object({
    /** codigoevento do NLI: inteiro de até 5 dígitos. */
    codigo: z
      .string()
      .regex(/^\d{1,5}$/u, "Código do evento: até 5 dígitos")
      // "035" e "35" são o mesmo evento no Questor.
      .transform((valor) => valor.replace(/^0+(?=\d)/u, ""))
      .refine((valor) => valor !== "0", "Código do evento não pode ser zero"),
    descricao: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .refine((valor) => !/[;\r\n]/u.test(valor), "Descrição sem ';' nem quebra de linha"),
    unidades: z
      .array(z.enum(["H", "R", "V"]))
      .min(1)
      .max(3)
      .refine((lista) => new Set(lista).size === lista.length, "Unidade repetida")
  })
  .strict();

/** Código e unidades não mudam (seriam outro evento): corrige-se desativando e cadastrando outro. */
export const questorEventoVariavelAtualizacaoSchema = z
  .object({
    descricao: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .refine((valor) => !/[;\r\n]/u.test(valor), "Descrição sem ';' nem quebra de linha")
      .optional(),
    ativo: z.boolean().optional()
  })
  .strict()
  .refine((dados) => dados.descricao !== undefined || dados.ativo !== undefined, "Informe descrição ou situação");

/**
 * `valor` com ponto decimal, sem milhar. Para a letra H, o valor é digitado na convenção de horas
 * da empresa no Questor (com hora centesimal, 1.50 = 1h30; sem, 1.30 = 1h30) — o arquivo leva o
 * número como digitado, com vírgula.
 */
export const questorEventosVariaveisLancamentoSchema = z
  .object({
    competencia,
    vinculoId: z.string().uuid(),
    eventoId: z.string().uuid(),
    unidade: z.enum(["H", "R", "V"]),
    valor: z
      .string()
      .regex(/^\d{1,13}(\.\d{1,2})?$/u, "Valor com ponto decimal, até 2 casas (o Questor guarda 2)")
      .refine((valor) => Number(valor) > 0, "Valor precisa ser maior que zero")
  })
  .strict();

export type QuestorEventosVariaveisCatalogo = z.infer<typeof questorEventosVariaveisCatalogoSchema>;
export type QuestorEventosVariaveisLancamento = z.infer<typeof questorEventosVariaveisLancamentoSchema>;

/**
 * Parâmetros do arquivo que só o Questor conhece: o código do período de cálculo (consultado na rotina;
 * "pode não seguir o padrão ano/mês") e a sequência inicial — "número que ainda não exista para esse
 * contrato e período", e o Pralís não enxerga o que foi lançado direto no Questor.
 */
const parametrosArquivoEventos = {
  competencia,
  codigoPeriodoCalculo: z
    .string()
    .trim()
    .regex(/^\d{1,11}$/u, "Período de cálculo: código numérico do Questor (até 11 dígitos)")
    // Inteiro no NLI: "02505" e "2505" são o mesmo período e precisam virar a mesma chave.
    .transform((valor) => valor.replace(/^0+(?=\d)/u, ""))
    .refine((valor) => valor !== "0", "Período de cálculo não pode ser zero"),
  // O NLI aceita 10 dígitos; o Pralís guarda a sequência em integer (até 2.147.483.647).
  sequenciaInicial: z.number().int().min(1).max(2_147_483_647),
  lancamentoIds: idsUnicos(z.string().uuid(), 10_000)
};

export const questorEventosVariaveisPreviaSchema = z.object(parametrosArquivoEventos).strict();

export const questorEventosVariaveisGeracaoSchema = z.object({ ...parametrosArquivoEventos, motivoRegeracao }).strict();

export const questorEventosVariaveisTecnicoSchema = z
  .object({ ...parametrosArquivoEventos, confirmacaoArquivoTecnico })
  .strict();

/** Cancelamento lógico de lançamento que só saiu em arquivo técnico (ou em nenhum). */
export const questorLancamentoCancelamentoSchema = z
  .object({ motivo: z.string().trim().min(5, "Motivo com pelo menos 5 caracteres").max(500) })
  .strict();

/** Estado real dos bloqueios, para a tela mostrar o que o servidor vai fazer. */
export type QuestorEstadoExportacaoDto = {
  /** Os dois gates de homologação ligados no servidor. */
  oficialLiberado: boolean;
  gates: { exportacaoHabilitada: boolean; homologacaoConfirmada: boolean };
  /** Técnico só antes da homologação (depois dela, só o oficial). */
  tecnicoDisponivel: boolean;
  /** Integração por API com a Conplus: não existe ainda (sem especificação oficial). */
  apiConplusDisponivel: false;
  motivoBloqueio: string | null;
};

/** Importação do catálogo consolidado da Conplus (`eventos_variaveis_por_empresa.csv`). */
export const questorCatalogoImportacaoSchema = z
  .object({
    conteudo: z.string().min(1).max(200_000),
    /** Nome da empresa como está na coluna "Empresa" do arquivo. Sem ela, só lista as empresas. */
    empresaConplus: z.string().trim().min(1).max(200).optional(),
    confirmar: z.boolean().default(false)
  })
  .strict();

export type QuestorCatalogoImportacaoDto = {
  empresas: readonly string[];
  /** Razão social configurada para a empresa da sessão (Configuração Questor); a única importável. */
  empresaConfigurada: string | null;
  erros: readonly string[];
  itens: ReadonlyArray<{
    codigo: string;
    descricao: string;
    unidade: "H" | "R" | "V";
    natureza: "Provento" | "Desconto";
    sequencia: number;
    situacao: "novo" | "igual" | "divergente";
    detalhe: string | null;
  }>;
  /** Eventos gravados nesta chamada (só com `confirmar: true`). Divergentes nunca são sobrescritos. */
  gravados: number;
};

export const questorEventosVariaveisQuerySchema = z.object({ competencia: competencia.optional() }).strict();

export type QuestorEventosVariaveisPreviaDto = {
  tipo: "eventos_variaveis";
  competencia: string;
  exportacaoDisponivel: boolean;
  homologacaoConplusConfirmada: boolean;
  bloqueio: "QUESTOR_EXPORTACAO_NAO_HOMOLOGADA" | null;
  codigoPeriodoCalculo: string;
  quantidadeRegistros: number;
  quantidadeContratos: number;
  /** `true` = o CSV cumpre o layout e o catálogo da empresa. */
  valido: boolean;
  /** Dados do Pralís que faltam (ex.: colaborador sem código de contrato Questor). */
  pendencias: readonly string[];
  /** Erros do layout apontados pelo validador do CSV. */
  diagnosticos: readonly string[];
  /** Lançamentos da seleção que já saíram em arquivo oficial (gerar de novo exige motivo). */
  jaExportados: number;
  /** Conteúdo do arquivo como seria gerado (vazio enquanto houver pendência). */
  conteudo: string;
  /** Sequência atribuída a cada lançamento (contrato + sequência), na ordem do arquivo. */
  linhas: ReadonlyArray<{ lancamentoId: string; codigoContrato: string; sequencia: number }>;
};

export type QuestorLancamentoVariavelDto = {
  id: string;
  competencia: string;
  vinculoId: string;
  colaboradorNome: string;
  matricula: string;
  questorCodigoContrato: string | null;
  eventoId: string;
  eventoCodigo: string;
  eventoDescricao: string;
  unidade: "H" | "R" | "V";
  valor: string;
  exportado: boolean;
  /** Já saiu em arquivo técnico (não pode ser apagado, só cancelado com motivo). */
  emArquivoTecnico: boolean;
};

// --- Histórico e download ----------------------------------------------------------------------------

export const questorExportacoesQuerySchema = z
  .object({
    tipo: z.enum(["admissao", "eventos_variaveis"]).optional(),
    limite: z.coerce.number().int().min(1).max(100).default(50)
  })
  .strict();

export type QuestorExportacaoHistoricoDto = {
  id: string;
  tipo: "admissao" | "eventos_variaveis";
  competencia: string | null;
  layoutVersao: string;
  sha256: string;
  resultado: "previa" | "gerado" | "bloqueado" | "falhou";
  nomeArquivo: string | null;
  /** Há arquivo gravado para baixar de novo (bloqueados não têm). */
  temArquivo: boolean;
  diagnosticos: readonly string[];
  motivoRegeracao: string | null;
  codigoPeriodoCalculo: string | null;
  geradoPorNome: string | null;
  geradoEm: string;
};

export type QuestorEventoVariavelDto = {
  id: string;
  codigo: string;
  descricao: string;
  unidades: string[];
  ativo: boolean;
  natureza: "Provento" | "Desconto" | null;
  sequenciaQuestor: number | null;
  filialQuestor: number | null;
};
