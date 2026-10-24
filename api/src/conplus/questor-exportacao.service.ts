import { createHash } from "node:crypto";
import {
  ERROS_EXPORTACAO_QUESTOR,
  VERSAO_LAYOUT_ADMISSAO_QUESTOR,
  prepararArquivoAdmissaoQuestor,
  questorExportacaoAdmissaoRequisicaoSchema,
  questorExportacaoAdmissaoTecnicoSchema,
  questorExportacaoPreviaRequisicaoSchema,
  questorExportacoesQuerySchema,
  type QuestorEstadoExportacaoDto,
  type QuestorExportacaoHistoricoDto,
  type QuestorExportacaoPreviaDto,
  type QuestorExportacaoPreviaRegistro,
  type SnapshotAdmissaoPralis
} from "@padaria/shared/conplus";
import { temPermissao, type PerfilUsuario } from "@padaria/shared";
import type { DadosExternos } from "@padaria/shared/api";
import type { TransacaoBanco } from "../banco/conexao.js";
import { env } from "../env.js";
import {
  codigoPostgresDoErro,
  conflito,
  ErroDominio,
  naoEncontrado,
  naoProcessavel,
  type ErroEncadeado
} from "../erros.js";
import { atorDoPerfil, empresaDoAtor } from "../admissoes/ator.js";
import { obterProcessoRepository } from "../admissoes/processos.repository.js";
import { lerParametrosQuestorRepository } from "./questor-parametros.repository.js";
import { lerSnapshotQuestorRepository } from "./questor-prontidao.repository.js";
import { comMigrationQuestor } from "./questor-comum.service.js";
import { registrarAuditoriaQuestorRepository } from "./questor-auditoria.repository.js";
import {
  caminhoRelativoExportacaoQuestor,
  gravarArquivoExportacaoQuestor,
  lerArquivoExportacaoQuestor
} from "./questor-arquivos.js";
import {
  buscarExportacaoPorChaveRepository,
  listarQuestorExportacoesRepository,
  obterQuestorExportacaoRepository,
  processosJaExportadosRepository,
  registrarExportacaoQuestorRepository,
  type TipoExportacaoQuestor
} from "./questor-exportacoes.repository.js";

/** Os dois gates de homologação: ambos ligados explicitamente, nunca por ausência de configuração. */
export function exportacaoQuestorHomologada(): boolean {
  return env.CONPLUS_QUESTOR_EXPORT_ENABLED && env.CONPLUS_QUESTOR_EXPORT_HOMOLOGADA;
}

const MOTIVO_BLOQUEIO =
  "A exportação oficial do Questor está bloqueada até a homologação oficial da Conplus. A data prevista da API não libera nada: só os dois gates do servidor, ligados depois da homologação.";

/**
 * Ponto ÚNICO de liberação do arquivo oficial (TXT de admissão e eventos). Bloqueado por padrão; a
 * tentativa recusada fica na auditoria. Nada no navegador muda isto: a decisão é só do servidor.
 */
export async function exigirExportacaoHomologada(
  perfil: PerfilUsuario | undefined,
  tipo: TipoExportacaoQuestor
): Promise<void> {
  if (exportacaoQuestorHomologada()) return;
  await comMigrationQuestor(() =>
    registrarAuditoriaQuestorRepository({
      empresaId: empresaDoAtor(perfil),
      usuarioId: atorDoPerfil(perfil),
      acao: "recusa_homologacao",
      detalhes: { tipo }
    })
  );
  throw naoProcessavel(MOTIVO_BLOQUEIO, ERROS_EXPORTACAO_QUESTOR.naoHomologada);
}

/**
 * O técnico tem o MESMO layout do oficial e o Questor não lê o nome do arquivo. Depois da homologação
 * ele seria um segundo caminho de importação (sem reservar sequência nem marcar lançamento): encerra.
 */
export function exigirArquivoTecnicoDisponivel(): void {
  if (exportacaoQuestorHomologada()) {
    throw naoProcessavel(
      "Com a exportação homologada, gere o arquivo oficial: o técnico existe só para conferência antes da homologação",
      ERROS_EXPORTACAO_QUESTOR.tecnicoEncerrado
    );
  }
}

export function estadoExportacaoQuestor(): QuestorEstadoExportacaoDto {
  const oficialLiberado = exportacaoQuestorHomologada();
  return {
    oficialLiberado,
    gates: {
      exportacaoHabilitada: env.CONPLUS_QUESTOR_EXPORT_ENABLED,
      homologacaoConfirmada: env.CONPLUS_QUESTOR_EXPORT_HOMOLOGADA
    },
    tecnicoDisponivel: !oficialLiberado,
    apiConplusDisponivel: false,
    motivoBloqueio: oficialLiberado ? null : MOTIVO_BLOQUEIO
  };
}

/** Cada arquivo entregue (gerado, reaproveitado ou baixado do histórico) fica na auditoria. */
export async function registrarDownloadQuestor(
  perfil: PerfilUsuario | undefined,
  arquivo: { exportacaoId?: string; sha256: string; nomeArquivo: string; reutilizado?: boolean },
  origem: "geracao" | "historico",
  confirmacaoArquivoTecnico = false
) {
  if (!arquivo.exportacaoId) return;
  await comMigrationQuestor(() =>
    registrarAuditoriaQuestorRepository({
      empresaId: empresaDoAtor(perfil),
      usuarioId: atorDoPerfil(perfil),
      acao: "download",
      exportacaoId: arquivo.exportacaoId ?? null,
      detalhes: {
        origem,
        nomeArquivo: arquivo.nomeArquivo,
        sha256: arquivo.sha256,
        reutilizado: arquivo.reutilizado ?? false,
        confirmacaoArquivoTecnico
      }
    })
  );
}

export const sha256Texto = (conteudo: string) => createHash("sha256").update(conteudo, "utf8").digest("hex");

export type ArquivoExportadoQuestor = {
  exportacaoId: string;
  conteudo: string;
  nomeArquivo: string;
  mimeType: string;
  sha256: string;
  reutilizado: boolean;
};

/**
 * Grava arquivo + auditoria. Ordem deliberada: primeiro o arquivo (endereçado pelo SHA, regravar é
 * inofensivo), depois o registro. Se o registro falhar, sobra no máximo um arquivo órfão idêntico; o
 * contrário — auditoria apontando para arquivo que não existe — nunca acontece.
 */
export async function registrarArquivoQuestor(params: {
  empresaId: string;
  usuarioId: string;
  tipo: TipoExportacaoQuestor;
  resultado: "previa" | "gerado";
  competencia: string | null;
  layoutVersao: string;
  conteudo: string;
  extensao: "txt" | "csv";
  nomeArquivo: (sha: string) => string;
  mimeType: string;
  motivoRegeracao: string | null;
  processoIds?: readonly string[];
  codigoPeriodoCalculo?: string;
  lancamentos?: ReadonlyArray<{ lancamentoId: string; codigoContrato?: string; sequencia?: number }>;
  /** Trava e reconferência dentro da transação de gravação (eventos oficiais). */
  antesDeGravar?: (tx: TransacaoBanco) => Promise<void>;
}): Promise<ArquivoExportadoQuestor> {
  const sha256 = sha256Texto(params.conteudo);
  const chaveIdempotencia = `${params.resultado}:${sha256}`;
  const nomeArquivo = params.nomeArquivo(sha256);
  const existente = await buscarExportacaoPorChaveRepository(params.empresaId, params.tipo, chaveIdempotencia);
  if (existente) {
    return {
      exportacaoId: existente.id,
      conteudo: params.conteudo,
      nomeArquivo: existente.nomeArquivo ?? nomeArquivo,
      mimeType: params.mimeType,
      sha256,
      reutilizado: true
    };
  }
  const caminhoArquivo = caminhoRelativoExportacaoQuestor(params.empresaId, sha256, params.extensao);
  await gravarArquivoExportacaoQuestor(caminhoArquivo, params.conteudo);
  const registro = await registrarExportacaoQuestorRepository(
    {
      codigoPeriodoCalculo: params.codigoPeriodoCalculo ?? null,
      empresaId: params.empresaId,
      tipo: params.tipo,
      competencia: params.competencia,
      layoutVersao: params.layoutVersao,
      sha256,
      chaveIdempotencia,
      resultado: params.resultado,
      nomeArquivo,
      caminhoArquivo,
      diagnosticos: [],
      motivoRegeracao: params.motivoRegeracao,
      geradoPor: params.usuarioId,
      ...(params.processoIds ? { processoIds: params.processoIds } : {}),
      ...(params.lancamentos ? { lancamentos: params.lancamentos } : {})
    },
    params.antesDeGravar
  ).catch((erro: ErroEncadeado) => {
    // 23505 no índice da chave do Questor: outra geração usou a mesma sequência para o contrato no
    // mesmo período entre a prévia e a gravação. Gerar de novo recalcula as sequências. Qualquer outra
    // unicidade segue como erro de verdade.
    if (codigoPostgresDoErro(erro) === "23505" && violouRestricao(erro, INDICE_CHAVE_QUESTOR)) {
      throw conflito(
        "Outra exportação usou a mesma sequência neste período. Gere de novo para recalcular.",
        ERROS_EXPORTACAO_QUESTOR.sequenciaEmUso
      );
    }
    throw erro;
  });
  return {
    exportacaoId: registro.id,
    conteudo: params.conteudo,
    nomeArquivo,
    mimeType: params.mimeType,
    sha256,
    reutilizado: !registro.criada
  };
}

const INDICE_CHAVE_QUESTOR = "questor_exportacoes_eventos_chave_questor_unica";

/** A restrição violada aparece em `constraint` ou na mensagem do erro do pg, que o Drizzle embrulha em `cause`. */
function violouRestricao(erro: ErroEncadeado, nome: string): boolean {
  let atual: ErroEncadeado | undefined = erro;
  for (let nivel = 0; nivel < 10 && atual && typeof atual === "object"; nivel += 1) {
    const dados = atual as { constraint?: string; message?: string };
    if (dados.constraint === nome || dados.message?.includes(nome)) return true;
    atual = atual.cause;
  }
  return false;
}

/** Tentativa oficial recusada pelo layout: fica na auditoria, sem arquivo. */
export async function registrarBloqueioQuestor(params: {
  empresaId: string;
  usuarioId: string;
  tipo: TipoExportacaoQuestor;
  competencia: string | null;
  layoutVersao: string;
  conteudo: string;
  diagnosticos: string[];
}): Promise<void> {
  const sha256 = sha256Texto(params.conteudo);
  await registrarExportacaoQuestorRepository({
    empresaId: params.empresaId,
    tipo: params.tipo,
    competencia: params.competencia,
    layoutVersao: params.layoutVersao,
    sha256,
    // Cada tentativa recusada é um evento próprio da auditoria, não um arquivo reaproveitável.
    chaveIdempotencia: `bloqueado:${sha256}:${Date.now()}`,
    resultado: "bloqueado",
    nomeArquivo: null,
    caminhoArquivo: null,
    diagnosticos: params.diagnosticos.slice(0, 200),
    motivoRegeracao: null,
    geradoPor: params.usuarioId
  });
}

// --- Admissão: dados ---------------------------------------------------------------------------------

type ContratoCarregado = { processoId: string; contrato: SnapshotAdmissaoPralis };

async function carregarContrato(
  processoId: string,
  empresaId: string
): Promise<{ contrato: ContratoCarregado | null; motivo: string | null; fichaAprovada: boolean }> {
  const processo = await obterProcessoRepository(processoId, empresaId);
  const fichaAprovada = processo?.fichaSituacao === "aprovada";
  if (!processo) return { contrato: null, motivo: "Processo de admissão não encontrado", fichaAprovada };
  if (processo.status === "cancelado") return { contrato: null, motivo: "Processo cancelado", fichaAprovada };
  if (!fichaAprovada) return { contrato: null, motivo: "A ficha precisa estar aprovada pelo DP", fichaAprovada };
  const [snapshot, questor] = await Promise.all([
    lerSnapshotQuestorRepository(processoId, empresaId),
    lerParametrosQuestorRepository(processoId, empresaId)
  ]);
  if (!snapshot) return { contrato: null, motivo: "Processo de admissão não encontrado", fichaAprovada };
  return {
    contrato: { processoId, contrato: questor ? { ...snapshot, questor } : snapshot },
    motivo: null,
    fichaAprovada
  };
}

/** Todos os processos precisam ser exportáveis; qualquer um fora da regra recusa o lote inteiro. */
async function carregarLote(processoIds: readonly string[], empresaId: string): Promise<SnapshotAdmissaoPralis[]> {
  const contratos: SnapshotAdmissaoPralis[] = [];
  for (const processoId of processoIds) {
    const { contrato, motivo } = await carregarContrato(processoId, empresaId);
    if (!contrato) {
      throw naoProcessavel(
        `Processo ${processoId}: ${motivo ?? "não exportável"}`,
        ERROS_EXPORTACAO_QUESTOR.processoNaoExportavel
      );
    }
    contratos.push(contrato.contrato);
  }
  return contratos;
}

function descreverPendencias(arquivo: ReturnType<typeof prepararArquivoAdmissaoQuestor>) {
  return {
    pendencias: arquivo.pendencias.map((item) => `${item.registro}.${item.campo}: ${item.motivo}`),
    diagnosticos: arquivo.diagnosticos.map((item) => `${item.registro ?? "?"}.${item.campo ?? "?"}: ${item.mensagem}`)
  };
}

const nomeTxt = (prefixo: string) => (sha: string) => `${prefixo}admissao-questor-${sha.slice(0, 12)}.txt`;
const MIME_TXT = "text/plain; charset=utf-8";

// --- Admissão: rotas ---------------------------------------------------------------------------------

/** Prévia server-side: nunca confia em contratos, códigos ou valores enviados pelo navegador. */
export async function prepararPreviaAdmissaoQuestor(
  body: DadosExternos,
  perfil?: PerfilUsuario
): Promise<QuestorExportacaoPreviaDto> {
  const { processoIds } = questorExportacaoPreviaRequisicaoSchema.parse(body);
  const empresaId = empresaDoAtor(perfil);
  const homologada = exportacaoQuestorHomologada();

  const registros = await comMigrationQuestor(() =>
    Promise.all(
      processoIds.map(async (processoId): Promise<QuestorExportacaoPreviaRegistro> => {
        const { contrato, motivo, fichaAprovada } = await carregarContrato(processoId, empresaId);
        const base = { processoId, fichaAprovada, quantidadeLinhas: 0 };
        if (!contrato)
          return { ...base, situacao: "bloqueado", pendencias: [motivo ?? "Indisponível"], diagnosticos: [] };
        const arquivo = prepararArquivoAdmissaoQuestor([contrato.contrato]);
        const { pendencias, diagnosticos } = descreverPendencias(arquivo);
        return {
          ...base,
          situacao: arquivo.valido ? "pronto" : "bloqueado",
          quantidadeLinhas: arquivo.linhas.length,
          pendencias,
          diagnosticos
        };
      })
    )
  );

  return {
    tipo: "admissao",
    exportacaoDisponivel: homologada,
    homologacaoConplusConfirmada: homologada,
    bloqueio: homologada ? null : ERROS_EXPORTACAO_QUESTOR.naoHomologada,
    registros
  };
}

/**
 * TXT técnico: o arquivo como o Pralís o monta hoje, pendências incluídas (campos sem resposta da
 * Conplus saem vazios). Nome `TECNICO-NAO-IMPORTAR-…` e auditoria `previa`. Não depende dos gates
 * porque não é um arquivo de importação — é para conferência e amostra.
 */
export async function gerarArquivoTecnicoAdmissaoQuestor(
  body: DadosExternos,
  perfil?: PerfilUsuario
): Promise<ArquivoExportadoQuestor> {
  exigirArquivoTecnicoDisponivel();
  const { processoIds } = questorExportacaoAdmissaoTecnicoSchema.parse(body);
  const empresaId = empresaDoAtor(perfil);
  const usuarioId = atorDoPerfil(perfil);
  return comMigrationQuestor(async () => {
    const contratos = await carregarLote(processoIds, empresaId);
    const arquivo = prepararArquivoAdmissaoQuestor(contratos);
    return registrarArquivoQuestor({
      empresaId,
      usuarioId,
      tipo: "admissao",
      resultado: "previa",
      competencia: null,
      layoutVersao: VERSAO_LAYOUT_ADMISSAO_QUESTOR,
      conteudo: arquivo.conteudo,
      extensao: "txt",
      nomeArquivo: nomeTxt("TECNICO-NAO-IMPORTAR-"),
      mimeType: MIME_TXT,
      motivoRegeracao: null,
      processoIds
    });
  });
}

/** TXT oficial: gates de homologação + arquivo sem pendência + nenhum processo já exportado sem motivo. */
export async function gerarArquivoAdmissaoQuestor(
  body: DadosExternos,
  perfil?: PerfilUsuario
): Promise<ArquivoExportadoQuestor> {
  const { processoIds, motivoRegeracao } = questorExportacaoAdmissaoRequisicaoSchema.parse(body);
  await exigirExportacaoHomologada(perfil, "admissao");
  const empresaId = empresaDoAtor(perfil);
  const usuarioId = atorDoPerfil(perfil);
  return comMigrationQuestor(async () => {
    const contratos = await carregarLote(processoIds, empresaId);
    const arquivo = prepararArquivoAdmissaoQuestor(contratos);
    if (!arquivo.valido) {
      const { pendencias, diagnosticos } = descreverPendencias(arquivo);
      await registrarBloqueioQuestor({
        empresaId,
        usuarioId,
        tipo: "admissao",
        competencia: null,
        layoutVersao: VERSAO_LAYOUT_ADMISSAO_QUESTOR,
        conteudo: arquivo.conteudo,
        diagnosticos: [...pendencias, ...diagnosticos]
      });
      throw naoProcessavel(
        "A admissão possui pendências no layout oficial do Questor",
        ERROS_EXPORTACAO_QUESTOR.invalida,
        [...pendencias, ...diagnosticos]
      );
    }
    const sha256 = sha256Texto(arquivo.conteudo);
    const repetido = await buscarExportacaoPorChaveRepository(empresaId, "admissao", `gerado:${sha256}`);
    if (!repetido) {
      const jaExportados = await processosJaExportadosRepository(empresaId, processoIds);
      if (jaExportados.length && !motivoRegeracao) {
        throw conflito(
          "Há admissão neste lote que já saiu em arquivo oficial. Informe o motivo para gerar de novo.",
          ERROS_EXPORTACAO_QUESTOR.jaExportado,
          jaExportados
        );
      }
    }
    return registrarArquivoQuestor({
      empresaId,
      usuarioId,
      tipo: "admissao",
      resultado: "gerado",
      competencia: null,
      layoutVersao: VERSAO_LAYOUT_ADMISSAO_QUESTOR,
      conteudo: arquivo.conteudo,
      extensao: "txt",
      nomeArquivo: nomeTxt(""),
      mimeType: MIME_TXT,
      motivoRegeracao: motivoRegeracao ?? null,
      processoIds
    });
  });
}

// --- Histórico e novo download ---------------------------------------------------------------------

export async function listarHistoricoExportacoesQuestor(
  query: DadosExternos,
  perfil?: PerfilUsuario
): Promise<QuestorExportacaoHistoricoDto[]> {
  const filtro = questorExportacoesQuerySchema.parse(query ?? {});
  // Cada um vê o histórico do que pode exportar: admissões, eventos ou os dois.
  const permitidos = (["admissao", "eventos_variaveis"] as const).filter((tipo) =>
    temPermissao(perfil?.permissoes ?? [], PERMISSAO_POR_TIPO[tipo])
  );
  if (!permitidos.length) throw new ErroDominio("Permissao insuficiente", 403, "INSUFFICIENT_PERMISSION");
  if (filtro.tipo && !permitidos.includes(filtro.tipo)) {
    throw new ErroDominio("Permissao insuficiente", 403, "INSUFFICIENT_PERMISSION");
  }
  const tipo = filtro.tipo ?? (permitidos.length === 1 ? permitidos[0] : undefined);
  const linhas = await comMigrationQuestor(() =>
    listarQuestorExportacoesRepository(empresaDoAtor(perfil), tipo, filtro.limite)
  );
  return linhas.map(({ caminhoArquivo, diagnosticos, geradoEm, ...linha }) => ({
    ...linha,
    temArquivo: caminhoArquivo !== null,
    diagnosticos: Array.isArray(diagnosticos) ? diagnosticos.map(String) : [],
    geradoEm: geradoEm.toISOString()
  }));
}

const PERMISSAO_POR_TIPO = {
  admissao: "conplus_exportar_admissoes",
  eventos_variaveis: "conplus_exportar_eventos"
} as const;

/** Baixa de novo um arquivo do histórico, conferindo que o disco ainda guarda o que foi auditado. */
export async function baixarArquivoExportacaoQuestor(
  id: string,
  perfil?: PerfilUsuario
): Promise<{ exportacaoId: string; conteudo: Buffer; nomeArquivo: string; mimeType: string; sha256: string }> {
  const empresaId = empresaDoAtor(perfil);
  const exportacao = await comMigrationQuestor(() => obterQuestorExportacaoRepository(empresaId, id));
  if (!exportacao) throw naoEncontrado("Exportação não encontrada", ERROS_EXPORTACAO_QUESTOR.arquivoAusente);
  if (!temPermissao(perfil?.permissoes ?? [], PERMISSAO_POR_TIPO[exportacao.tipo])) {
    throw new ErroDominio("Permissao insuficiente", 403, "INSUFFICIENT_PERMISSION");
  }
  if (!exportacao.caminhoArquivo || !exportacao.nomeArquivo) {
    throw naoEncontrado("Esta exportação não gerou arquivo", ERROS_EXPORTACAO_QUESTOR.arquivoAusente);
  }
  const conteudo = await lerArquivoExportacaoQuestor(exportacao.caminhoArquivo);
  if (!conteudo) throw naoEncontrado("Arquivo não está mais no armazenamento", ERROS_EXPORTACAO_QUESTOR.arquivoAusente);
  const sha256 = createHash("sha256").update(conteudo).digest("hex");
  if (sha256 !== exportacao.sha256) {
    throw conflito("O arquivo armazenado não confere com a auditoria", "QUESTOR_EXPORTACAO_ARQUIVO_DIVERGENTE");
  }
  const csv = exportacao.nomeArquivo.endsWith(".csv");
  return {
    exportacaoId: exportacao.id,
    conteudo,
    nomeArquivo: exportacao.nomeArquivo,
    mimeType: csv ? "text/csv; charset=utf-8" : MIME_TXT,
    sha256
  };
}
