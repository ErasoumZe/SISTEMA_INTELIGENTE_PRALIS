import { z } from "zod";
import { apiIdParamsSchema, paginationQuerySchema } from "../api/index.js";
import { cpfValido, normalizarCpf } from "./cpf.js";

export * from "./cpf.js";
// ADM-002 V0 — o processo de admissao, que nasce do teste efetivado.
export * from "./processos.js";

// =================================================================================================
// ADM-001 — Controle de periodo de teste (piloto TNP).
//
// UMA diferenca deliberada em relacao a TODOS os outros modulos: aqui NAO existe `empresaId` —
// nem na query, nem no corpo, nem no parametro de rota. Nenhum outro contrato do sistema e assim
// (`empresaQuerySchema` carrega `empresaId` opcional e os payloads de cadastro o exigem).
//
// A empresa e derivada no servidor a partir de `perfil.empresaId`, e SO vale se ela existir E
// estiver dentro de `empresasPermitidas(perfil)`. Qualquer divergencia e 403 — inclusive perfil
// sem empresa. Aceitar empresa do navegador aqui reabriria exatamente a superficie que a decisao
// de Marco fechou, e um `empresaId` opcional no schema bastaria para alguem voltar a ler o corpo
// "so nesse caso".
//
// Consequencia pratica: NAO reutilize `empresaQuerySchema` neste modulo.
// =================================================================================================

const uuidSchema = z.string().uuid();

// Limites TECNICOS de texto, nao regra de negocio: existem para o payload nao virar deposito.
// Nenhum deles foi aprovado como regra do DP — se o negocio precisar de outro numero, ele muda.
const LIMITE_NOME = 180;
const LIMITE_JORNADA = 120;

// --- Estados ------------------------------------------------------------------------------------
// `em_teste --encerrar--> encerrado` e `em_teste --cancelar--> cancelado`. Os dois sao terminais.
// NAO existe reabertura (decisao de Marco) e nao existe exclusao fisica em nenhum momento.
export const statusTeste = ["em_teste", "encerrado", "cancelado"] as const;
export const statusTesteSchema = z.enum(statusTeste);
export type StatusTeste = z.infer<typeof statusTesteSchema>;

// Encerrar EXIGE resultado (correcao 10). `aprovado_para_admissao` NAO abre admissao nem cria
// colaborador: e so o registro da decisao do DP. A abertura da admissao e outra vertical.
export const resultadosTeste = ["aprovado_para_admissao", "nao_prosseguir"] as const;
export const resultadoTesteSchema = z.enum(resultadosTeste);
export type ResultadoTeste = z.infer<typeof resultadoTesteSchema>;

// SITUACAO E DERIVADA, NAO ARMAZENADA. Nao existe coluna, enum de banco, indice nem filtro
// independente de ativo/inativo — criar um seria a segunda fonte de status que o
// PROJECT_BRAIN/06 ja registrou como SUPERADA ("status Ativo/Inativo como workflow").
//
// Mora em `shared` porque a LISTA (front) e o FILTRO (repositorio) precisam da mesma resposta.
// Duplicar a regra no cliente faria a tela e a consulta divergirem no primeiro estado novo.
export const situacoesTeste = ["ativo", "inativo"] as const;
export const situacaoTesteSchema = z.enum(situacoesTeste);
export type SituacaoTeste = z.infer<typeof situacaoTesteSchema>;

export function situacaoDoTeste(status: StatusTeste): SituacaoTeste {
  return status === "em_teste" ? "ativo" : "inativo";
}

/** Estados tecnicos que compoem cada situacao. E a fonte do `where` da listagem. */
export function statusDaSituacao(situacao: SituacaoTeste): StatusTeste[] {
  return statusTeste.filter((status) => situacaoDoTeste(status) === situacao);
}

// Derivado pelo servidor no fuso do negocio (America/Sao_Paulo), nunca gravado em coluna.
// Somente dois alertas existem: vence hoje e vencido. `no_prazo` e a ausencia de alerta.
// O sistema NUNCA transiciona o teste por conta do prazo.
export const prazosTeste = ["no_prazo", "vence_hoje", "vencido"] as const;
export const prazoTesteSchema = z.enum(prazosTeste);
export type PrazoTeste = z.infer<typeof prazoTesteSchema>;

// Trilha append-only. `cpf_revelado` esta aqui, e nao numa tabela separada, porque revelar CPF e
// um ato sobre ESTE teste e o DP precisa ler tudo numa linha do tempo so.
export const acoesHistoricoTeste = ["criado", "alterado", "encerrado", "cancelado", "cpf_revelado"] as const;
export const acaoHistoricoTesteSchema = z.enum(acoesHistoricoTeste);
export type AcaoHistoricoTeste = z.infer<typeof acaoHistoricoTesteSchema>;

// Lista FECHADA (aprovada por Marco). Nao e texto livre de proposito: motivo aberto sobre pessoa em
// avaliacao atrai justamente a PII que o modulo inteiro evita ("saiu por problema de saude").
// O mesmo enum vira CHECK de dominio na tabela.
export const motivosCancelamentoTeste = ["nao_aprovado_no_teste", "sem_continuidade_apos_dia_de_teste"] as const;
export const motivoCancelamentoSchema = z.enum(motivosCancelamentoTeste);
export type MotivoCancelamento = z.infer<typeof motivoCancelamentoSchema>;

// --- Campos -------------------------------------------------------------------------------------
// Refine ANTES do transform: `cpfValido` ja normaliza por dentro, entao a ordem nao muda o
// resultado — mas mantem a entrada como string simples e a mensagem de erro presa ao campo.
export const cpfTesteSchema = z
  .string()
  .refine((valor) => cpfValido(valor), { message: "CPF invalido" })
  .transform(normalizarCpf);

// Instante absoluto em ISO-8601 com `Z`, como `Date.prototype.toISOString` produz. Guardado em
// `timestamptz`. O dia de negocio (America/Sao_Paulo) e derivado com `diaNegocio` na hora de
// calcular o prazo — nunca com `slice(0, 10)`, que devolve o dia em UTC.
const instanteSchema = z.string().datetime();

const camposEditaveisTeste = {
  nomeCompleto: z.string().trim().min(1).max(LIMITE_NOME),
  cpf: cpfTesteSchema,
  // FUNCAO OPERACIONAL (`funcoes_operacionais`), nunca cargo de acesso (`cargos`).
  //
  // `cargos` e a chave primaria de `permissoes_cargos`: apontar para la faria registrar um PADEIRO
  // exigir a criacao de um cargo de ACESSO chamado PADEIRO, visivel a toda regra de permissao por
  // cargo. O nome do campo carrega a distincao para ninguem reintroduzi-la por engano.
  funcaoId: uuidSchema,
  // Texto livre nesta vertical (decisao de Marco, correcao 5): o Pralis nao tem catalogo de
  // jornada. `turnos` e turno (nome + hora inicio/fim) e `colaboradores_jornadas` exige um
  // colaborador que ainda nao existe neste fluxo.
  jornadaHorario: z.string().trim().min(1).max(LIMITE_JORNADA),
  inicioEm: instanteSchema,
  fimCombinadoEm: instanteSchema
};

function periodoCoerente(dados: { inicioEm: string; fimCombinadoEm: string }) {
  return new Date(dados.fimCombinadoEm).getTime() > new Date(dados.inicioEm).getTime();
}

const mensagemPeriodo = { message: "O fim combinado precisa ser depois do inicio", path: ["fimCombinadoEm"] };

// --- Entradas -----------------------------------------------------------------------------------
export const criarTestePayloadSchema = z.object(camposEditaveisTeste).refine(periodoCoerente, mensagemPeriodo);

// `versao` obrigatoria em TODA escrita sobre registro existente: sem ela a ultima gravacao venceria
// em silencio e duas edicoes simultaneas do DP perderiam uma.
//
// `cpf` e o UNICO campo opcional na edicao, e omiti-lo PRESERVA o valor gravado. Nao e inconsistencia
// com o resto do payload, que e substituicao total — e a consequencia direta da regra de privacidade:
// o detalhe devolve o CPF MASCARADO, entao o formulario nao tem o valor para reenviar. As
// alternativas eram piores: revelar o CPF a cada abertura de edicao geraria um evento de auditoria
// falso (ninguem pediu para ver), e exigir o campo apagaria o CPF de quem so quis corrigir o nome.
// Mesmo idioma ja usado em `shared/src/cadastros` para `empresaIds`/`colaboradorId`.
export const editarTestePayloadSchema = z
  .object({ ...camposEditaveisTeste, cpf: cpfTesteSchema.optional(), versao: z.number().int().positive() })
  .refine(periodoCoerente, mensagemPeriodo);

export const encerrarTestePayloadSchema = z.object({
  versao: z.number().int().positive(),
  resultado: resultadoTesteSchema
});

export const cancelarTestePayloadSchema = z.object({
  versao: z.number().int().positive(),
  motivoCancelamento: motivoCancelamentoSchema
});

// CPF vai no CORPO, nunca na query: query string entra em log de acesso, historico do navegador e
// cabecalho referer. Por isso esta consulta e POST.
export const verificarCpfPayloadSchema = z.object({ cpf: cpfTesteSchema });

// REGRA DE CONTRATO: nenhum campo de CPF entra aqui, nem aqui nem em qualquer outro `*QuerySchema`
// deste modulo. Query string vaza para log de acesso, historico do navegador e cabecalho `referer`,
// e um filtro de listagem transportaria CPF em todos os tres. Localizar por CPF e feito por
// `verificarCpfPayloadSchema`, que e POST.
//
// O campo se chama `buscaNome`, e nao `busca`, exatamente para o proximo leitor nao "melhorar" a
// busca aceitando documento.
export const testesQuerySchema = paginationQuerySchema.extend({
  buscaNome: z.string().trim().max(LIMITE_NOME).optional(),
  // Filtro UNICO de situacao. Ausente = todos. Nao existe filtro paralelo por `status` tecnico:
  // seriam duas formas de pedir a mesma coisa, com respostas capazes de divergir.
  situacao: situacaoTesteSchema.optional(),
  funcaoId: uuidSchema.optional(),
  // `prazo` so tem efeito sobre `em_teste`; nos demais status o servidor ignora o filtro.
  prazo: z.enum(["vence_hoje", "vencido"]).optional()
});

export const testeParamsSchema = apiIdParamsSchema;
export const historicoQuerySchema = paginationQuerySchema;

// --- Saidas -------------------------------------------------------------------------------------
// A LISTA nunca carrega CPF, nem parcialmente: `cpfMascarado` e constante (correcao 2). Quem
// precisa do valor abre o detalhe e revela, e a revelacao fica na trilha.
export const testeListaDtoSchema = z.object({
  id: z.string(),
  nomeCompleto: z.string(),
  cpfMascarado: z.string(),
  funcaoId: z.string(),
  funcaoNome: z.string(),
  // CBO da funcao no momento da leitura. `null` quando a funcao nao tem codigo cadastrado.
  funcaoCbo: z.string().nullable(),
  jornadaHorario: z.string(),
  inicioEm: z.string(),
  fimCombinadoEm: z.string(),
  status: statusTesteSchema,
  // Derivada de `status` pelo servidor com `situacaoDoTeste`. Viaja no DTO para a tela nao
  // reimplementar a regra — e nao para ser gravada.
  situacao: situacaoTesteSchema,
  resultado: resultadoTesteSchema.nullable(),
  prazo: prazoTesteSchema.nullable(),
  versao: z.number().int().positive()
});

// Autoria resolvida por join em `perfis_usuarios`: SO o nome. E-mail nunca entra na projecao.
export const testeDetalheDtoSchema = testeListaDtoSchema.extend({
  motivoCancelamento: motivoCancelamentoSchema.nullable(),
  // ADM-002: o processo de admissao que nasceu deste teste, se houver. `null` em todo teste que nao
  // foi efetivado. Existe para a tela oferecer o caminho de volta ao processo depois de reabrir o
  // teste — sem ele, o link so funcionaria no instante da efetivacao.
  processoId: z.string().nullable(),
  criadoPorNome: z.string().nullable(),
  criadoEm: z.string(),
  atualizadoPorNome: z.string().nullable(),
  atualizadoEm: z.string(),
  encerradoPorNome: z.string().nullable(),
  encerradoEm: z.string().nullable(),
  canceladoPorNome: z.string().nullable(),
  canceladoEm: z.string().nullable()
});

export const cpfReveladoDtoSchema = z.object({ cpf: z.string() });

// Somente booleanos: nome, id e status do colaborador NAO saem daqui. Devolver o registro
// transformaria a rota num oraculo sobre pessoa fisica — foi isso que a CX-M05 removeu de
// `colaboradores` (api/src/colaboradores/colaboradores.service.ts).
export const verificacaoCpfDtoSchema = z.object({
  jaExisteColaborador: z.boolean(),
  jaExisteTesteAberto: z.boolean()
});

// `camposAlterados` guarda NOMES de campos, nunca valores: gravar antes/depois duplicaria a PII
// dentro da propria trilha. Em `cpf_revelado` vem vazio.
export const historicoTesteDtoSchema = z.object({
  id: z.string(),
  versao: z.number().int().positive(),
  acao: acaoHistoricoTesteSchema,
  atorNome: z.string().nullable(),
  camposAlterados: z.array(z.string()),
  ocorridoEm: z.string()
});

// Leitura MINIMA das FUNCOES OPERACIONAIS da empresa derivada, para o seletor do formulario.
//
// Nao e `GET /api/cargos`: aquilo lista cargo de ACESSO e exige `cadastro_colaboradores_visualizar`,
// permissao de outro dominio. Sao catalogos distintos, com donos distintos.
export const funcaoOpcaoDtoSchema = z.object({
  id: z.string(),
  nome: z.string(),
  cbo: z.string().nullable(),
  // Inativas TAMBEM viajam, marcadas. Omiti-las deixaria o formulario de edicao de um teste antigo
  // sem o proprio valor gravado na lista, e o seletor apareceria vazio. Impedir a ESCOLHA de uma
  // inativa e regra da tela e do servico, nao motivo para esconder o dado.
  ativo: z.boolean()
});

export type CriarTestePayload = z.infer<typeof criarTestePayloadSchema>;
export type EditarTestePayload = z.infer<typeof editarTestePayloadSchema>;
export type EncerrarTestePayload = z.infer<typeof encerrarTestePayloadSchema>;
export type CancelarTestePayload = z.infer<typeof cancelarTestePayloadSchema>;
export type VerificarCpfPayload = z.infer<typeof verificarCpfPayloadSchema>;
export type TestesQuery = z.infer<typeof testesQuerySchema>;
export type TesteListaDto = z.infer<typeof testeListaDtoSchema>;
export type TesteDetalheDto = z.infer<typeof testeDetalheDtoSchema>;
export type VerificacaoCpfDto = z.infer<typeof verificacaoCpfDtoSchema>;
export type HistoricoTesteDto = z.infer<typeof historicoTesteDtoSchema>;
export type FuncaoOpcaoDto = z.infer<typeof funcaoOpcaoDtoSchema>;
