import { z } from "zod";
import { apiIdParamsSchema, paginationQuerySchema } from "../api/index.js";
// Da FONTE, nunca do barril: `./index.js` reexporta este arquivo, e o ciclo deixaria o schema
// indefinido em tempo de montagem sob a condicao `development`.
import { cpfTesteSchema } from "./cpf.js";
// Idem: da fonte. `ficha.ts` nao importa este arquivo, entao nao ha ciclo.
import { situacaoFichaSchema } from "./ficha.js";

/**
 * ADM-002 V0 — o PROCESSO DE ADMISSAO.
 *
 * Nasce de um teste encerrado com `aprovado_para_admissao`, na MESMA transacao que o encerra. Nao ha
 * acao "iniciar admissao": um segundo caminho para o mesmo ato e o defeito que a regra-mae do
 * PROJECT_BRAIN/16 proibe.
 *
 * Este contrato NAO tem `empresaId` — nem query, nem corpo, nem path. A empresa vem do perfil
 * autorizado da sessao, como em todo o modulo de Admissoes.
 *
 * O processo NAO tem `colaboradorId` e nao se liga a `colaboradores`. O vinculo com o cadastro
 * operacional e escopo inteiro da V7, incluindo a coluna que o representara.
 */

// --- Estados --------------------------------------------------------------------------------------
/**
 * SOMENTE os dois estados alcancaveis na V0.
 *
 * Nao ha `aguardando_candidato`, `em_revisao_dp` nem `efetivado`. Aceitar um estado antes de a regra
 * dele existir e gravar vocabulario que ninguem confirmou com o DP — e que o banco passa a aceitar de
 * qualquer bug. Ampliar a lista depois e migration aditiva e barata; desfazer nome errado com linha
 * gravada, nao.
 */
export const statusProcesso = ["iniciado", "pausado", "cancelado"] as const;
export const statusProcessoSchema = z.enum(statusProcesso);
export type StatusProcesso = z.infer<typeof statusProcessoSchema>;

export const situacoesProcesso = ["ativo", "pausado", "inativo"] as const;
export const situacaoProcessoSchema = z.enum(situacoesProcesso);
export type SituacaoProcesso = z.infer<typeof situacaoProcessoSchema>;

/**
 * Situacao DERIVADA do status. Mesma regra da D-2 do PROJECT_BRAIN/42: nao existe coluna, campo de
 * formulario nem filtro paralelo de ativo/inativo, e nao pode passar a existir.
 */
export function situacaoDoProcesso(status: StatusProcesso): SituacaoProcesso {
  if (status === "iniciado") return "ativo";
  // Pausado NAO e Ativo. Chamar de ativo esconderia justamente o que importa: o processo esta parado
  // esperando decisao interna sobre um ASO nao apto.
  return status === "pausado" ? "pausado" : "inativo";
}

// --- Origem (ADM-003 V1A) -------------------------------------------------------------------------
/**
 * DUAS origens, UM processo. Nao ha segunda tabela nem segundo tipo.
 *
 * `teste_efetivado` — nasce da efetivacao do periodo de teste, dentro da mesma transacao. Continua
 * sendo o unico caminho dessa origem: nao existe acao "iniciar admissao".
 * `admissao_direta`  — o DP/Gerencia faz o pre-cadastro interno e o processo nasce dali.
 *
 * A origem e SO LEITURA depois de criada: ela se registra, nao se escolhe. Nao ha payload que a
 * troque, e o CHECK do banco recusa a combinacao incoerente.
 */
export const origensProcesso = ["teste_efetivado", "admissao_direta"] as const;
export const origemProcessoSchema = z.enum(origensProcesso);
export type OrigemProcesso = z.infer<typeof origemProcessoSchema>;

// --- Exame admissional ----------------------------------------------------------------------------
/** As CINCO situacoes confirmadas pelo DP. */
export const situacoesExame = [
  "pendente",
  "guia_entregue",
  "agendado",
  "aso_apto",
  "aso_nao_apto",
  "exige_acao"
] as const;
export const situacaoExameSchema = z.enum(situacoesExame);
export type SituacaoExame = z.infer<typeof situacaoExameSchema>;

/**
 * O alerta e DERIVADO, como a situacao Ativo/Inativo. Nao existe coluna, indice nem filtro paralelo
 * de "pendencia de exame", e nao pode passar a existir: seria a segunda fonte da mesma verdade.
 */
export function exameExigeAtencao(situacao: SituacaoExame): boolean {
  return situacao !== "aso_apto";
}

/**
 * NAO HA MOTIVO ESTRUTURADO DE CANCELAMENTO NA V0. Nao e esquecimento.
 *
 * Uma lista provisoria vira regra definitiva no instante em que o CHECK do banco roda, e renomear ou
 * remover um valor ja gravado e caro. Como a lista real depende de validacao do DP que ainda nao
 * aconteceu, a V0 nao inventa uma.
 *
 * O cancelamento continua possivel e auditado por ATOR, DATA e ACAO, que e o que a trilha precisa
 * para responder "quem cancelou e quando". Motivo controlado e vertical futura.
 */

/** Trilha append-only. Cada ato do processo grava exatamente uma acao. */
export const acoesHistoricoProcesso = [
  "criado",
  "cancelado",
  "internos_alterados",
  "exame_alterado",
  // ADM-003 V1B: pausar e retomar sao CONSEQUENCIA de registrar o ASO, nunca atos proprios — nao ha
  // rota nem botao de retomar. A trilha registra os dois porque aconteceram.
  "pausado",
  "retomado",
  "cpf_revelado",
  // ADM-003 V2/V3: atos sobre o convite e a ficha. Nenhum deles muda o STATUS do processo, entao
  // nenhum consome versao dele — e por isso todos ficam fora do indice parcial de unicidade.
  "convite_gerado",
  "convite_revogado",
  "ficha_enviada",
  "ficha_devolvida",
  "ficha_aprovada",
  "ficha_dp_alterada",
  "ficha_dp_concluida",
  // A efetivacao cria o vinculo e o cadastro operacional. O processo nao ganha status persistido:
  // a existencia desse vinculo unico e que prova a conclusao da etapa.
  "efetivado"
] as const;
export const acaoHistoricoProcessoSchema = z.enum(acoesHistoricoProcesso);
export type AcaoHistoricoProcesso = z.infer<typeof acaoHistoricoProcessoSchema>;

// --- Entradas -------------------------------------------------------------------------------------
export const cancelarProcessoPayloadSchema = z.object({
  versao: z.number().int().positive()
});

/**
 * PRE-CADASTRO da admissao direta. Os tres campos que o DP confirma antes de qualquer candidato.
 *
 * NAO ha `testeId`: quem tem teste nao passa por aqui, e aceitar o campo abriria o segundo caminho
 * para o mesmo ato. NAO ha `nome` nem `cpf`: identidade pertence ao formulario do candidato, e
 * inventar aqui criaria a segunda fonte que o CHECK do banco existe para impedir.
 *
 * NAO ha area, setor, CBO, salario nem dados bancarios — fora desta vertical.
 */
export const criarProcessoDiretoPayloadSchema = z.object({
  nomeCompleto: z.string().trim().min(1, "Informe o nome completo").max(200),
  // MESMO schema do periodo de teste: valida digito verificador e normaliza para 11 digitos. Um
  // segundo validador de CPF seria a segunda regra para a mesma pergunta.
  cpf: cpfTesteSchema,
  funcaoId: z.string().uuid("Funcao operacional invalida"),
  // Turno do CATALOGO da empresa. Nao ha mais jornada em texto: a coluna existe para o historico
  // legado da V1A e nao e escrita por este caminho.
  turnoId: z.string().uuid("Turno invalido"),
  dataAdmissao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de admissao invalida")
});

/** Bloco INTERNO do DP. Tudo opcional: o DP preenche ao longo do tempo. */
const textoInternoOpcional = z
  .string()
  .trim()
  .max(120)
  .nullable()
  .optional()
  .transform((valor) => (valor === undefined || valor === "" ? null : valor));

export const dadosInternosPayloadSchema = z.object({
  versao: z.number().int().positive(),
  dataAdmissao: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data de admissao invalida")
    .nullable()
    .optional()
    .transform((valor) => valor ?? null),
  ctpsNumero: textoInternoOpcional,
  ctpsSerie: textoInternoOpcional,
  ctpsUf: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "UF invalida")
    .nullable()
    .optional()
    .transform((valor) => (valor === undefined || valor === "" ? null : valor)),
  pisPasepNit: z
    .string()
    .trim()
    .regex(/^[0-9]{11}$/, "PIS/PASEP/NIT deve ter 11 digitos")
    .nullable()
    .optional()
    .transform((valor) => (valor === undefined || valor === "" ? null : valor)),
  observacoesRh: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .optional()
    .transform((valor) => (valor === undefined || valor === "" ? null : valor))
});

/** Situacao do exame: acao PROPRIA, com concorrencia otimista propria. */
export const exameProcessoPayloadSchema = z.object({
  versao: z.number().int().positive(),
  situacao: situacaoExameSchema
});

/**
 * Opcao de turno no seletor da admissao. Traz `completo` DERIVADO pelo servidor: a tela nao
 * reimplementa a regra, so desabilita o que ja veio marcado.
 *
 * `ativo` vem junto porque `completo` sozinho e ambiguo para quem le: `turnoCompleto` exige
 * ativo E etiqueta E dias, entao um turno desativado com etiqueta e dias preenchidos chegava
 * marcado como "incompleto" — e o DP ia ao cadastro, via os dois campos preenchidos e nao
 * entendia o que faltava. Com `ativo`, a tela diz qual dos dois motivos e. Mesma razao pela qual
 * `FuncaoOpcaoDto` ja carrega o seu.
 */
export const turnoOpcaoDtoSchema = z.object({
  id: z.string(),
  nome: z.string(),
  etiqueta: z.string().nullable(),
  diasSemana: z.array(z.string()).nullable(),
  horaInicio: z.string(),
  horaFim: z.string(),
  ativo: z.boolean(),
  completo: z.boolean()
});

export const processoParamsSchema = apiIdParamsSchema;
export const historicoProcessoQuerySchema = paginationQuerySchema;

/**
 * Filtro da lista. So estado e paginacao — sem busca por nome e SEM BUSCA POR CPF, pela mesma
 * razao da ADM-001: documento nunca entra em query string.
 *
 * `ficha` (ADM-003 V6) e a fila do DP: filtrar por `enviada` e "o que espera decisao". Aceita so as
 * quatro situacoes que existem — nao ha valor para "sem ficha", porque ausencia nao e situacao, e um
 * quinto valor aqui viraria estado inventado no contrato. Quem quer ver tudo nao manda o filtro.
 *
 * O filtro e do SERVIDOR, e nao da tela: a lista e paginada, e filtrar no cliente filtraria apenas a
 * pagina carregada — o defeito que a listagem de produtos ja pagou uma vez.
 */
export const processosQuerySchema = paginationQuerySchema.extend({
  situacao: situacaoProcessoSchema.optional(),
  origem: origemProcessoSchema.optional(),
  ficha: situacaoFichaSchema.optional()
});

// --- Saidas ---------------------------------------------------------------------------------------
/**
 * LISTA. Existe desde a V1A porque a admissao direta nao tem teste de onde ser alcancada — sem
 * lista, um processo direto nasceria inalcancavel. E consulta e mais nada: nao ha aqui nenhuma acao
 * de iniciar, efetivar ou criar alem do "Novo cadastro" da propria tela.
 *
 * `nomeCompleto` resolve as DUAS origens por `coalesce` no repositorio: vem do teste quando a origem
 * e `teste_efetivado`, e da propria linha quando e `admissao_direta` — onde o CHECK de coerencia o
 * torna obrigatorio desde a V1B. O tipo segue anulavel porque o contrato nao consegue provar ao
 * TypeScript o que o CHECK garante no banco; na pratica a lista nao recebe nome nulo.
 */
export const processoListaDtoSchema = z.object({
  id: z.string(),
  origem: origemProcessoSchema,
  status: statusProcessoSchema,
  situacao: situacaoProcessoSchema,
  nomeCompleto: z.string().nullable(),
  // A lista NUNCA carrega digito de CPF, nem parcial — mesma regra da ADM-001. Constante quando ha
  // CPF, nula quando nao ha (processo de origem teste, cujo CPF mora no teste).
  cpfMascarado: z.string().nullable(),
  funcaoNome: z.string().nullable(),
  turnoResumo: z.string().nullable(),
  dataAdmissao: z.string().nullable(),
  exameSituacao: situacaoExameSchema,
  /**
   * ADM-003 V6 — a situacao da FICHA, para o DP achar o que espera decisao sem abrir um por um.
   *
   * `null` significa que a ficha nao existe: o candidato ainda nao abriu o link. Ausencia e um dos
   * quatro estados que a tela precisa distinguir, e por isso viaja como nulo em vez de virar um
   * valor do enum — o enum descreve fichas, e aqui nao ha ficha.
   *
   * DERIVADO: nada e gravado no processo. Sai da propria linha da ficha, por join.
   */
  fichaSituacao: situacaoFichaSchema.nullable(),
  criadoEm: z.string()
});

/** Bloco interno do DP, sempre presente no detalhe. Nasce junto do processo. */
export const dadosInternosDtoSchema = z.object({
  versao: z.number().int().positive(),
  dataAdmissao: z.string().nullable(),
  ctpsNumero: z.string().nullable(),
  ctpsSerie: z.string().nullable(),
  ctpsUf: z.string().nullable(),
  pisPasepNit: z.string().nullable(),
  observacoesRh: z.string().nullable(),
  exameSituacao: situacaoExameSchema,
  // Derivado por `exameExigeAtencao`. Viaja para a tela nao reimplementar a regra — nao para gravar.
  exameExigeAtencao: z.boolean(),
  exameAtualizadoPorNome: z.string().nullable(),
  exameAtualizadoEm: z.string().nullable()
});

export const processoDetalheDtoSchema = z.object({
  id: z.string(),
  origem: origemProcessoSchema,
  status: statusProcessoSchema,
  // Derivada pelo servidor com `situacaoDoProcesso`. Viaja no DTO para a tela nao reimplementar a
  // regra — e nao para ser gravada.
  situacao: situacaoProcessoSchema,
  versao: z.number().int().positive(),
  // A ORIGEM, quando ela e um teste. NULO na admissao direta — e e por isso que a tela precisa do
  // `origem` acima para saber se falta caminho de volta ou se ele nunca existiu.
  testeId: z.string().nullable(),
  /**
   * Identidade. NULA no processo direto ate o candidato responder.
   *
   * Vem de `admissoes_testes` na origem teste e de lugar nenhum na direta: o processo nao tem, e
   * nao vai ter, coluna de nome ou CPF. O CHECK do banco impede a segunda fonte.
   */
  nomeCompleto: z.string().nullable(),
  // Funcao e jornada: da origem teste sao HERDADAS e apenas exibidas; da direta vem do proprio
  // processo. Quem le nao precisa saber de onde — o servidor resolve numa funcao so.
  cpfMascarado: z.string().nullable(),
  funcaoNome: z.string().nullable(),
  /**
   * RETRATO do turno no ato da criacao — nao o catalogo de hoje. Se o DP mudar o horario do turno M
   * amanha, isto NAO muda: e o que foi combinado com esta pessoa.
   */
  turnoEtiqueta: z.string().nullable(),
  turnoRotulo: z.string().nullable(),
  turnoHoraInicio: z.string().nullable(),
  turnoHoraFim: z.string().nullable(),
  turnoDiasSemana: z.array(z.string()).nullable(),
  /**
   * HISTORICO LEGADO. Processos diretos criados na V1A, antes do catalogo de turnos, guardaram a
   * jornada em texto. Nao e escrita por caminho novo e nao foi convertida — converter seria adivinhar
   * qual turno da empresa aquele texto era.
   */
  jornadaHorario: z.string().nullable(),
  // Fato vindo da ficha, para a tela orientar a etapa de efetivacao sem carregar nenhum campo
  // pessoal dela. A confirmacao continua no servidor.
  fichaSituacao: situacaoFichaSchema.nullable(),
  // A efetivacao e provada pelo vinculo, nao por outro status gravado no processo.
  efetivado: z.boolean(),
  dataEfetivacao: z.string().nullable(),
  internos: dadosInternosDtoSchema,
  // SO o nome. E-mail nunca entra na projecao — e identificador reaproveitavel em outras rotas.
  criadoPorNome: z.string().nullable(),
  criadoEm: z.string(),
  atualizadoPorNome: z.string().nullable(),
  atualizadoEm: z.string(),
  canceladoPorNome: z.string().nullable(),
  canceladoEm: z.string().nullable()
});

// `camposAlterados` guarda NOMES de campos, nunca valores: gravar antes/depois duplicaria a PII
// dentro da propria trilha.
export const historicoProcessoDtoSchema = z.object({
  id: z.string(),
  versao: z.number().int().positive(),
  acao: acaoHistoricoProcessoSchema,
  atorNome: z.string().nullable(),
  camposAlterados: z.array(z.string()),
  ocorridoEm: z.string()
});

export type CancelarProcessoPayload = z.infer<typeof cancelarProcessoPayloadSchema>;
export type CriarProcessoDiretoPayload = z.infer<typeof criarProcessoDiretoPayloadSchema>;
export type DadosInternosPayload = z.infer<typeof dadosInternosPayloadSchema>;
export type ExameProcessoPayload = z.infer<typeof exameProcessoPayloadSchema>;
export type ProcessosQuery = z.infer<typeof processosQuerySchema>;
export type TurnoOpcaoDto = z.infer<typeof turnoOpcaoDtoSchema>;
export type ProcessoListaDto = z.infer<typeof processoListaDtoSchema>;
export type DadosInternosDto = z.infer<typeof dadosInternosDtoSchema>;
export type ProcessoDetalheDto = z.infer<typeof processoDetalheDtoSchema>;
export type HistoricoProcessoDto = z.infer<typeof historicoProcessoDtoSchema>;
