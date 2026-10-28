import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { MultipartFile } from "@fastify/multipart";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { readFile, unlink } from "node:fs/promises";
import type {
  AbrirCaixaPayload,
  AjustarInicioVendasCaixaPayload,
  CancelarPlanejamentoRetornoPayload,
  CaixaOperacional,
  CaixaStatus,
  CategoriaLancamentosCaixa,
  DetalheCaixaResponse,
  EntregaCofrePendente,
  FecharCaixaPayload,
  HistoricoCaixaQuery,
  GerarRelatorioVendasFechamento,
  LinhaHistoricoCaixa,
  PlanejamentoRetorno,
  RegistrarIndisponibilidadeCaixaPayload,
  RelatorioMaquininhaFechamento,
  RelatorioMaquininhaIa,
  RelatorioVendasCreare,
  ResumoCaixa,
  TotaisCaixaCentavos,
  TotaisHistoricoCaixa,
  TransferenciaCofrePayload,
  TransferenciasCaixaResponse,
  VendaCanceladaCaixa,
  VendasDoCaixaQuery
} from "@padaria/shared/caixa";
import { montarResumoCaixa, saldoFisicoCaixaCentavos, statusCaixaSchema } from "@padaria/shared/caixa";
import { diaNegocio } from "@padaria/shared/datas";
import type { DadosExternos, ResultadoPaginado } from "@padaria/shared/api";
import { podeLancarSemCaixa, temPermissao, type PerfilUsuario, type Permissao } from "@padaria/shared/autenticacao";
import { deCentavos, liquidoCentavos, paraCentavos } from "@padaria/shared/dinheiro";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { banco, executarEmTransacao, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";
import { ErroDominio } from "../erros.js";
import {
  atualizarFechamentoCaixaRepository,
  buscarCaixaAbertoUsuarioRepository,
  buscarCaixaPorIdRepository,
  buscarColaboradorPorUsuarioRepository,
  buscarContaCofreEmpresaRepository,
  buscarMaquininhaEmpresaRepository,
  buscarTransferenciaPorLacreAberturaRepository,
  travarPdvDaAberturaRepository,
  buscarAjusteCaixaRepository,
  buscarPerfilUsuarioCaixaRepository,
  buscarPdvEmpresaRepository,
  caixasComAjusteRepository,
  calcularTotaisCaixaOperacionalRepository,
  criarCaixaRepository,
  criarConferenciaFisicaTransferenciaRepository,
  criarAnexoFechamentoCaixaRepository,
  buscarAnexoFechamentoCaixaRepository,
  buscarRelatorioMaquininhaFechamentoRepository,
  buscarRelatorioMaquininhaPrecedenteRepository,
  buscarRelatorioVendasFechamentoRepository,
  salvarRelatorioMaquininhaFechamentoRepository,
  salvarRelatorioVendasFechamentoRepository,
  invalidarRelatorioMaquininhaFechamentoRepository,
  invalidarRelatorioVendasFechamentoRepository,
  atualizarInicioVendasCaixaRepository,
  buscarFimDoCaixaAnteriorNoPdvRepository,
  registrarEdicaoCaixaRepository,
  removerAnexoFechamentoCaixaRepository,
  existeFolhaFechamentoCaixaRepository,
  listarAnexosFechamentoCaixaRepository,
  listarAnexosFechamentoCaixaComCaminhoRepository,
  listarConferenciasFisicasCaixaRepository,
  confirmarTransferenciaAberturaRepository,
  vincularPlanejamentosDaTransferenciaAoCaixaRepository,
  buscarPlanejamentoRetornoRepository,
  buscarPlanejamentoRetornoPorIdRepository,
  cancelarPlanejamentoRetornoRepository,
  criarLacreRetornoRepository,
  criarQuebraCaixaRepository,
  criarTransferenciaCofreRepository,
  existeCaixaAbertoPdvRepository,
  existePeriodoCaixaRepository,
  existePlanejamentoRetornoAgendadoRepository,
  executarPlanejamentoRetornoRepository,
  listarEdicoesCaixaRepository,
  listarAlteracoesPosFechamentoRepository,
  listarHistoricoCaixaRepository,
  listarCaixasAbertosHistoricoRepository,
  listarLancamentosCaixaRepository,
  listarVendasCanceladasCaixaRepository,
  listarPlanejamentosRetornoRepository,
  caixasAlteradosPosFechamentoRepository,
  listarUsuariosTesourariaRepository,
  listarTransferenciasCaixaRepository,
  listarCaixasAbertosDaContaPdvRepository,
  proximaOrdemTransferenciaRepository,
  revincularVendasAoCaixaRepository,
  totaisHistoricoCaixaRepository,
  travarCaixaCompartilhadoRepository,
  travarCaixaRepository,
  buscarTransferenciaPorIdempotenciaRepository,
  buscarLacreRetornoDoCaixaRepository,
  buscarLacreFechamentoPlanejadoDoCaixaRepository,
  buscarLacreFechamentoPlanejadoDaTransferenciaRepository,
  buscarIndisponibilidadeAbertaCaixaRepository,
  criarIndisponibilidadeCaixaRepository,
  iniciarFechamentoCaixaRepository,
  registrarRetornoIndisponibilidadeCaixaRepository,
  consumirLacreRetornoRepository,
  consumirLacreFechamentoPlanejadoRepository,
  listarLacresRetornoDaDistribuicaoRepository,
  listarLacresRetornoDisponiveisDoCaixaRepository,
  listarCandidatosConfirmacaoRepository,
  type FiltrosHistoricoCaixa,
  type IntencaoEntregaCofre,
  type VendaCanceladaCaixaLinha
} from "./caixa.repository.js";
import {
  listarRetornosPendentesRepository,
  ultimasRecusasPorTransferenciaRepository
} from "../transferencias/entrega-cofre.repository.js";
import { notificarCampanhasNaAberturaDeCaixa } from "../campanhas/campanhas.service.js";
import { materializarMensagensNaAberturaDeCaixa } from "../mensagens-admin/mensagens-admin.service.js";
import { criarNotificacoesRepository } from "../notificacoes/notificacoes.repository.js";
import { existeNumeroLacreRepository } from "../lacres/lacres.repository.js";
import { buscarPerfilUsuario } from "../auth/perfil.service.js";
import { caminhoAbsolutoDocumento, salvarFotoDocumento } from "../lancamentos/foto-documento.js";
import { env } from "../env.js";
import {
  extrairRelatorioMaquininhaComGemini,
  leituraRelatorioMaquininhaSimulada
} from "./gemini-relatorio-maquininha.js";
import {
  extrairRelatorioVendasCreareComGemini,
  extrairRelatorioVendasCreareDePdf
} from "./gemini-relatorio-vendas-creare.js";
import { transcreverObservacaoComGroq } from "./groq-transcricao-observacao.js";
import { listarVendasPaginadas, totaisVendas } from "../vendas/vendas.service.js";

const erroPeriodo = "A data e hora de abertura ja pertence a outro caixa aberto/fechado";
const erroOperadorComCaixaAberto = "Usuario do caixa ja possui um caixa aberto";
const indiceCaixaAbertoPdvUnico = "fechamentos_caixa_pdv_aberto_unico_idx";
const indiceCaixaAbertoOperadorUnico = "fechamentos_caixa_operador_aberto_unico_idx";
const tiposAudioTranscricao = new Set(["audio/webm", "audio/mp4", "audio/ogg", "audio/wav", "audio/mpeg"]);

type CaixaLinha = NonNullable<Awaited<ReturnType<typeof buscarCaixaPorIdRepository>>>;

export async function transcreverObservacaoFechamento(arquivo: MultipartFile | undefined) {
  if (!arquivo) throw new ErroDominio("Gravação de áudio obrigatória.", 400, "TRANSCRICAO_SEM_AUDIO");
  if (!env.GROQ_API_KEY) {
    throw new ErroDominio(
      "A transcrição por voz ainda não foi configurada. Você pode escrever a observação manualmente.",
      503,
      "TRANSCRICAO_NAO_CONFIGURADA"
    );
  }
  const mimeType = arquivo.mimetype.toLowerCase().split(";", 1)[0] ?? "";
  if (!tiposAudioTranscricao.has(mimeType)) {
    throw new ErroDominio(
      "Formato de áudio não suportado. Tente gravar novamente.",
      415,
      "TRANSCRICAO_FORMATO_INVALIDO"
    );
  }
  const dados = await arquivo.toBuffer();
  if (!dados.byteLength) throw new ErroDominio("A gravação não contém áudio.", 422, "TRANSCRICAO_SEM_AUDIO");
  const texto = await transcreverObservacaoComGroq(dados, mimeType, {
    chave: env.GROQ_API_KEY,
    modelo: env.GROQ_STT_MODEL,
    timeoutMs: env.GROQ_STT_TIMEOUT_MS
  });
  return { texto };
}

// Duas aberturas simultaneas do mesmo PDV podem passar pelos pre-checks; o indice unico
// parcial do banco decide o vencedor e o perdedor recebe o mesmo erro do caminho sequencial.
function indiceUnicoViolado(error: Error): string | undefined {
  const candidatos = [error, error.cause instanceof Error ? error.cause : null];
  for (const atual of candidatos) {
    if (!atual) continue;
    const detalhes = atual as Error & { code?: string; constraint?: string };
    if (detalhes.code === "23505") return detalhes.constraint;
  }
  return undefined;
}

function traduzirErroAberturaCaixa(error: Error): Error {
  const indice = indiceUnicoViolado(error);
  if (indice === indiceCaixaAbertoOperadorUnico) return new Error(erroOperadorComCaixaAberto);
  if (indice === indiceCaixaAbertoPdvUnico) return new Error(erroPeriodo);
  return error;
}

function gerarTokenEdicao() {
  return randomBytes(6).toString("hex").toUpperCase();
}

function numero(valor: string | number | null | undefined) {
  return deCentavos(paraCentavos(valor));
}

function serializarData(data: Date | string | null) {
  return data ? new Date(data).toISOString() : null;
}

function serializarCaixa(caixa: CaixaLinha): CaixaOperacional {
  if (!caixa.pdvId || !caixa.usuarioId || !caixa.usuarioCaixaId || !caixa.dataHoraAbertura || !caixa.abertoEm) {
    throw new Error("Caixa operacional invalido");
  }
  return {
    id: caixa.id,
    empresaId: caixa.empresaId,
    pdvId: caixa.pdvId,
    pdvNome: caixa.pdvNome,
    pdvContaId: caixa.pdvContaId ?? null,
    usuarioId: caixa.usuarioId,
    usuarioCaixaId: caixa.usuarioCaixaId,
    usuarioCaixaNome: caixa.usuarioCaixaNome ?? "Usuario",
    colaboradorId: caixa.colaboradorId,
    dataMovimento: caixa.dataMovimento,
    dataHoraAbertura: serializarData(caixa.dataHoraAbertura) ?? "",
    abertoEm: serializarData(caixa.abertoEm) ?? "",
    dataHoraFechamento: serializarData(caixa.dataHoraFechamento),
    fechamentoIniciadoEm: serializarData(caixa.fechamentoIniciadoEm),
    fechadoEm: serializarData(caixa.fechadoEm),
    tokenEdicao: caixa.tokenEdicao,
    turnoId: caixa.turnoId ?? null,
    turnoNome: caixa.turnoNome ?? null,
    maquininhaId: caixa.maquininhaId ?? null,
    maquininhaApelido: caixa.maquininhaApelido ?? null,
    maquininhaNumeroSerie: caixa.maquininhaNumeroSerie ?? null,
    caixaResponsavelNomeAbertura: caixa.caixaResponsavelNomeAbertura ?? null,
    supervisorResponsavelNomeAbertura: caixa.supervisorResponsavelNomeAbertura ?? null,
    observacao: caixa.observacao,
    status: caixa.status
  };
}

function podeOperarCaixa(perfil: PerfilUsuario, caixa: CaixaLinha) {
  return (
    temPermissao(perfil.permissoes, "caixas_gerenciar") ||
    caixa.usuarioId === perfil.usuarioId ||
    caixa.usuarioCaixaId === perfil.usuarioId
  );
}

export async function salvarAnexoFechamentoCaixa(
  caixaId: string,
  tipo: "folha_fechamento" | "comprovante_cartao" | "relatorio_vendas_creare",
  arquivo: MultipartFile | undefined,
  perfil: PerfilUsuario
) {
  if (!arquivo) throw new Error("Arquivo obrigatorio");
  return executarEmTransacao(async (tx) => {
    if (!(await travarCaixaRepository(caixaId, tx))) throw new Error("Caixa nao encontrado");
    const caixa = await buscarCaixaPorIdRepository(caixaId, tx);
    if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
    if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
    if (caixa.status !== "aberto" && caixa.status !== "em_fechamento") throw new Error("Caixa ja fechado");

    const salvo = await salvarFotoDocumento("fechamentos-caixa", `${caixa.empresaId}/${caixa.id}`, arquivo);
    const absoluto = caminhoAbsolutoDocumento(salvo.caminhoRelativo);
    try {
      const dados = await readFile(absoluto);
      const anexo = await criarAnexoFechamentoCaixaRepository(
        {
          empresaId: caixa.empresaId,
          fechamentoCaixaId: caixa.id,
          tipo,
          caminho: salvo.caminhoRelativo,
          nomeOriginal: arquivo.filename || "anexo",
          nomeArquivo: basename(salvo.caminhoRelativo),
          mimeType: salvo.mimeType,
          tamanhoBytes: dados.byteLength,
          sha256: createHash("sha256").update(dados).digest("hex"),
          criadoPor: perfil.usuarioId
        },
        tx
      );
      if (tipo === "comprovante_cartao") {
        await invalidarRelatorioMaquininhaFechamentoRepository(caixa.id, caixa.empresaId, tx);
      }
      return anexo;
    } catch (error) {
      await unlink(absoluto).catch(() => undefined);
      throw error;
    }
  });
}

async function obterCaixaParaAuditoria(caixaId: string, perfil: PerfilUsuario) {
  const caixa = await buscarCaixaPorIdRepository(caixaId);
  if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
  return caixa;
}

export async function listarAnexosFechamentoCaixa(caixaId: string, perfil: PerfilUsuario) {
  const caixa = await obterCaixaParaAuditoria(caixaId, perfil);
  // O operador precisa reler as provas que acabou de anexar antes de fechar. A consulta continua
  // limitada ao caixa dele; Tesouraria e Gerência podem auditar qualquer caixa permitido.
  if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
  return listarAnexosFechamentoCaixaRepository(caixa.id, caixa.empresaId);
}

function turnoDoRelatorio(caixa: CaixaLinha) {
  return caixa.turnoNome?.trim() || "Turno não informado na abertura";
}

function validarComprovantesParaIa(anexos: Array<{ tipo: string; mimeType: string }>) {
  if (!anexos.length) throw new Error("Anexe ao menos uma foto ou PDF da maquininha antes de ler.");
  for (const anexo of anexos) {
    if (anexo.tipo !== "comprovante_cartao") throw new Error("A IA só lê comprovantes de cartão");
    if (!anexo.mimeType.startsWith("image/") && anexo.mimeType !== "application/pdf") {
      throw new Error("Envie imagens ou PDFs para a leitura do comprovante");
    }
  }
}

async function contextoRelatorioMaquininha(caixaId: string, perfil: PerfilUsuario) {
  return executarEmTransacao(async (tx) => {
    if (!(await travarCaixaRepository(caixaId, tx))) throw new Error("Caixa nao encontrado");
    const caixa = await buscarCaixaPorIdRepository(caixaId, tx);
    if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
    if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
    return { caixa, anexos: await listarAnexosFechamentoCaixaComCaminhoRepository(caixa.id, caixa.empresaId, tx) };
  });
}

const formasRelatorioMaquininha = ["credito", "debito", "pix", "voucher"] as const;

function leituraCompleta(leitura: RelatorioMaquininhaIa) {
  return formasRelatorioMaquininha.every((forma) => leitura[forma] !== null);
}

function normalizarNumeroMaquininha(numero: string) {
  return numero.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export async function obterRelatorioMaquininhaFechamento(caixaId: string, perfil: PerfilUsuario) {
  const { caixa } = await contextoRelatorioMaquininha(caixaId, perfil);
  const relatorio = await buscarRelatorioMaquininhaFechamentoRepository(caixa.id, caixa.empresaId);
  const precedente =
    !caixa.maquininhaId || !caixa.pdvId || !caixa.dataMovimento
      ? null
      : await buscarRelatorioMaquininhaPrecedenteRepository({
          empresaId: caixa.empresaId,
          pdvId: caixa.pdvId,
          maquininhaId: caixa.maquininhaId,
          dataMovimento: caixa.dataMovimento,
          fechamentoCaixaId: caixa.id
        });
  const dadosPrecedentes = precedente?.dadosRevisados as Record<string, DadosExternos> | undefined;
  return {
    turnoNome: relatorio?.turnoNome ?? turnoDoRelatorio(caixa),
    etapaDia: precedente ? "tarde" : "manha",
    leituraReferencia: precedente
      ? {
          fechamentoCaixaId: precedente.fechamentoCaixaId,
          anexoId: precedente.anexoFinalId,
          leitura: dadosPrecedentes?.["leituraAcumulada"] ?? null,
          fechadoEm: serializarData(precedente.fechadoEm)
        }
      : null,
    relatorio: relatorio
      ? {
          dadosRevisados: relatorio.dadosRevisados,
          criadoEm: serializarData(relatorio.criadoEm),
          atualizadoEm: serializarData(relatorio.atualizadoEm)
        }
      : null
  };
}

export async function analisarRelatorioMaquininhaFechamento(caixaId: string, anexoId: string, perfil: PerfilUsuario) {
  const { caixa, anexos } = await contextoRelatorioMaquininha(caixaId, perfil);
  if (caixa.status !== "aberto" && caixa.status !== "em_fechamento") throw new Error("Caixa ja fechado");
  const comprovante = anexos.find((anexo) => anexo.id === anexoId && anexo.tipo === "comprovante_cartao");
  if (!comprovante) throw new Error("Comprovante da maquininha nao encontrado");
  validarComprovantesParaIa([comprovante]);
  const precedente =
    caixa.maquininhaId && caixa.pdvId && caixa.dataMovimento
      ? await buscarRelatorioMaquininhaPrecedenteRepository({
          empresaId: caixa.empresaId,
          pdvId: caixa.pdvId,
          maquininhaId: caixa.maquininhaId,
          dataMovimento: caixa.dataMovimento,
          fechamentoCaixaId: caixa.id
        })
      : null;
  const simulada = env.NODE_ENV === "development" && env.GEMINI_MAQUININHA_SIMULADA;
  if (simulada) {
    const numeroVinculado = caixa.maquininhaNumeroSerie?.trim() ?? null;
    return {
      turnoNome: turnoDoRelatorio(caixa),
      sugestao: leituraRelatorioMaquininhaSimulada(precedente ? "tarde" : "manha", numeroVinculado),
      anexoConsiderado: comprovante.id,
      numeroLidoDivergente: false,
      simulada: true
    };
  }
  if (!env.GEMINI_API_KEY) {
    throw new ErroDominio(
      "A leitura por IA ainda não foi configurada. As fotos continuam válidas como prova.",
      503,
      "IA_NAO_CONFIGURADA"
    );
  }
  const arquivos = await Promise.all(
    [comprovante].map(async (anexo) => ({
      dados: await readFile(caminhoAbsolutoDocumento(anexo.caminho)),
      mimeType: anexo.mimeType
    }))
  );
  const sugestao = await extrairRelatorioMaquininhaComGemini(arquivos, {
    chave: env.GEMINI_API_KEY,
    modelo: env.GEMINI_MODEL,
    timeoutMs: env.GEMINI_TIMEOUT_MS
  });
  const numeroVinculado = caixa.maquininhaNumeroSerie?.trim() ?? null;
  return {
    turnoNome: turnoDoRelatorio(caixa),
    sugestao,
    anexoConsiderado: comprovante.id,
    numeroLidoDivergente:
      Boolean(numeroVinculado && sugestao.numeroMaquininha) &&
      normalizarNumeroMaquininha(numeroVinculado!) !== normalizarNumeroMaquininha(sugestao.numeroMaquininha!),
    simulada: false
  };
}

export async function analisarRelatorioVendasCreareFechamento(
  caixaId: string,
  anexoId: string,
  perfil: PerfilUsuario
): Promise<{ sugestao: RelatorioVendasCreare; anexoConsiderado: string }> {
  const caixa = await buscarCaixaPorIdRepository(caixaId);
  if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
  if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
  if (caixa.status !== "aberto" && caixa.status !== "em_fechamento") throw new Error("Caixa ja fechado");
  const anexos = await listarAnexosFechamentoCaixaComCaminhoRepository(caixa.id, caixa.empresaId);
  const folha = anexos.find((anexo) => anexo.id === anexoId && anexo.tipo === "relatorio_vendas_creare");
  if (!folha) throw new Error("Relatorio CREARE nao encontrado");
  if (!folha.mimeType.startsWith("image/") && folha.mimeType !== "application/pdf") {
    throw new ErroDominio("Envie imagem ou PDF para a leitura da folha CREARE.", 415, "IA_FORMATO_INVALIDO");
  }
  const arquivo = await readFile(caminhoAbsolutoDocumento(folha.caminho));
  const leituraLocal = folha.mimeType === "application/pdf" ? await extrairRelatorioVendasCreareDePdf(arquivo) : null;
  if (leituraLocal) return { sugestao: leituraLocal, anexoConsiderado: folha.id };
  if (!env.GEMINI_API_KEY) {
    throw new ErroDominio(
      "A leitura por IA ainda nao foi configurada. Preencha os campos visiveis manualmente.",
      503,
      "IA_NAO_CONFIGURADA"
    );
  }
  const sugestao = await extrairRelatorioVendasCreareComGemini(
    { dados: arquivo, mimeType: folha.mimeType },
    { chave: env.GEMINI_API_KEY, modelo: env.GEMINI_MODEL, timeoutMs: env.GEMINI_TIMEOUT_MS }
  );
  return { sugestao, anexoConsiderado: folha.id };
}

export async function salvarRelatorioMaquininhaFechamento(
  caixaId: string,
  dados: RelatorioMaquininhaFechamento,
  perfil: PerfilUsuario
) {
  return executarEmTransacao(async (tx) => {
    if (!(await travarCaixaRepository(caixaId, tx))) throw new Error("Caixa nao encontrado");
    const caixa = await buscarCaixaPorIdRepository(caixaId, tx);
    if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
    if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
    if (caixa.status !== "aberto" && caixa.status !== "em_fechamento") throw new Error("Caixa ja fechado");
    const anexos = await listarAnexosFechamentoCaixaRepository(caixa.id, caixa.empresaId, tx);
    const comprovante = anexos.find((anexo) => anexo.tipo === "comprovante_cartao" && anexo.id === dados.anexoId);
    if (!comprovante) {
      throw new ErroDominio("Envie a foto da maquininha antes de salvar.", 409, "RELATORIO_DESATUALIZADO");
    }
    const numeroMaquininha = caixa.maquininhaNumeroSerie?.trim();
    if (!numeroMaquininha) {
      throw new ErroDominio(
        "Este caixa foi aberto sem maquininha vinculada. O relatório só pode usar a maquininha escolhida na abertura.",
        409,
        "MAQUININHA_NAO_VINCULADA"
      );
    }
    if (!leituraCompleta(dados.leituraAcumulada)) {
      throw new ErroDominio(
        "Informe crédito, débito, Pix e voucher no relatório da maquininha.",
        422,
        "LEITURAS_MAQUININHA_INCOMPLETAS"
      );
    }
    const maquininhaId = caixa.maquininhaId;
    if (!maquininhaId) throw new ErroDominio("Caixa sem maquininha vinculada.", 409, "MAQUININHA_NAO_VINCULADA");
    if (!caixa.pdvId || !caixa.dataMovimento) {
      throw new ErroDominio("Caixa sem PDV ou data operacional vinculados.", 409, "CAIXA_SEM_REFERENCIA_OPERACIONAL");
    }
    if (!(await travarPdvDaAberturaRepository(caixa.pdvId, caixa.empresaId, tx))) {
      throw new Error("PDV nao encontrado");
    }
    const precedente = await buscarRelatorioMaquininhaPrecedenteRepository(
      {
        empresaId: caixa.empresaId,
        pdvId: caixa.pdvId,
        maquininhaId,
        dataMovimento: caixa.dataMovimento,
        fechamentoCaixaId: caixa.id
      },
      tx
    );
    const dadosPrecedentes = precedente?.dadosRevisados as Record<string, DadosExternos> | undefined;
    if (dadosPrecedentes?.["etapaDia"] === "tarde") {
      throw new ErroDominio(
        "Este PDV já registrou manhã e tarde nesta maquininha hoje.",
        409,
        "MAQUININHA_DIA_CONCLUIDO"
      );
    }
    const leituraReferencia = dadosPrecedentes?.["leituraAcumulada"] as RelatorioMaquininhaIa | undefined;
    if (leituraReferencia && !leituraCompleta(leituraReferencia)) throw new Error("Leitura de referência inválida");
    for (const forma of formasRelatorioMaquininha) {
      if (leituraReferencia && dados.leituraAcumulada[forma]! < leituraReferencia[forma]!) {
        throw new ErroDominio(
          "A leitura acumulada não pode ser menor que a leitura da manhã.",
          422,
          "LEITURA_ACUMULADA_INVALIDA"
        );
      }
    }
    const liquidos = Object.fromEntries(
      formasRelatorioMaquininha.map((forma) => [
        forma,
        dados.leituraAcumulada[forma]! - (leituraReferencia?.[forma] ?? 0)
      ])
    ) as Record<(typeof formasRelatorioMaquininha)[number], number>;
    const relatorio = await salvarRelatorioMaquininhaFechamentoRepository(
      {
        fechamentoCaixaId: caixa.id,
        empresaId: caixa.empresaId,
        turnoNome: turnoDoRelatorio(caixa),
        versao: 6,
        numeroMaquininha,
        creditoInicial: leituraReferencia?.credito ?? null,
        debitoInicial: leituraReferencia?.debito ?? null,
        pixInicial: leituraReferencia?.pix ?? null,
        voucherInicial: leituraReferencia?.voucher ?? null,
        creditoFinal: dados.leituraAcumulada.credito,
        debitoFinal: dados.leituraAcumulada.debito,
        pixFinal: dados.leituraAcumulada.pix,
        voucherFinal: dados.leituraAcumulada.voucher,
        anexoInicialId: precedente?.anexoFinalId ?? null,
        anexoFinalId: dados.anexoId,
        leituraReferenciaRelatorioId: precedente?.id ?? null,
        dadosRevisados: {
          versao: 6,
          numeroMaquininha,
          etapaDia: precedente ? "tarde" : "manha",
          anexoId: dados.anexoId,
          leituraReferencia: leituraReferencia ?? null,
          leituraAcumulada: dados.leituraAcumulada,
          liquidos
        },
        criadoPor: perfil.usuarioId
      },
      tx
    );
    return {
      turnoNome: relatorio.turnoNome,
      relatorio,
      criadoEm: serializarData(relatorio.criadoEm),
      atualizadoEm: serializarData(relatorio.atualizadoEm)
    };
  });
}

export async function removerAnexoFechamentoCaixa(caixaId: string, anexoId: string, perfil: PerfilUsuario) {
  const removido = await executarEmTransacao(async (tx) => {
    if (!(await travarCaixaRepository(caixaId, tx))) throw new Error("Caixa nao encontrado");
    const caixa = await buscarCaixaPorIdRepository(caixaId, tx);
    if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
    if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
    if (caixa.status !== "aberto" && caixa.status !== "em_fechamento")
      throw new Error("Anexos so podem ser removidos antes do fechamento");
    const existente = await buscarAnexoFechamentoCaixaRepository(caixa.id, anexoId, caixa.empresaId, tx);
    if (!existente) throw new Error("Anexo nao encontrado");
    // O relatorio V2 referencia as duas provas. Invalida primeiro para a FK nunca permitir uma
    // leitura salva apontando para uma foto que o operador acabou de substituir.
    if (existente.tipo === "comprovante_cartao") {
      await invalidarRelatorioMaquininhaFechamentoRepository(caixa.id, caixa.empresaId, tx);
    }
    if (existente.tipo === "relatorio_vendas_creare") {
      await invalidarRelatorioVendasFechamentoRepository(caixa.id, caixa.empresaId, tx);
    }
    const anexo = await removerAnexoFechamentoCaixaRepository(caixa.id, anexoId, caixa.empresaId, tx);
    if (!anexo) throw new Error("Anexo nao encontrado");
    return anexo;
  });

  // O vínculo no banco já foi removido sob trava. Se a limpeza física falhar, o arquivo não fica
  // acessível pela API e poderá ser tratado pela rotina de retenção sem restaurar uma prova errada.
  await unlink(caminhoAbsolutoDocumento(removido.caminho)).catch(() => undefined);
}

export async function listarConferenciasFisicasCaixa(caixaId: string, perfil: PerfilUsuario) {
  const caixa = await obterCaixaParaAuditoria(caixaId, perfil);
  if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
  const conferencias = await listarConferenciasFisicasCaixaRepository(caixa.id, caixa.empresaId);
  return conferencias.map((item) => ({
    ...item,
    valorEspecieDeclarado: numero(item.valorEspecieDeclarado),
    valorMoedasDeclarado: numero(item.valorMoedasDeclarado),
    valorEspecieContado: numero(item.valorEspecieContado),
    valorMoedasContado: numero(item.valorMoedasContado),
    conferidoEm: serializarData(item.conferidoEm) ?? ""
  }));
}

export async function obterArquivoAnexoFechamentoCaixa(caixaId: string, anexoId: string, perfil: PerfilUsuario) {
  const caixa = await obterCaixaParaAuditoria(caixaId, perfil);
  if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
  const anexo = await buscarAnexoFechamentoCaixaRepository(caixa.id, anexoId, caixa.empresaId);
  if (!anexo) throw new Error("Anexo nao encontrado");
  return { ...anexo, caminhoAbsoluto: caminhoAbsolutoDocumento(anexo.caminho) };
}

async function calcularTotaisCaixaCentavos(caixa: CaixaLinha, db?: ExecutorBanco): Promise<TotaisCaixaCentavos> {
  if (!caixa.pdvContaId) throw new Error("PDV sem conta vinculada");
  return calcularTotaisCaixaOperacionalRepository(caixa.id, caixa.pdvContaId, db);
}

// Anexa as vendas integradas orfas que chegaram desde a abertura registrada pelo servidor. Nunca
// move venda de outro caixa nem venda manual â€” ver revincularVendasAoCaixaRepository.
export async function revincularVendasAoCaixa(
  caixa: CaixaLinha,
  db: ExecutorBanco
): Promise<{ anexadas: number; desanexadas: number }> {
  if (!caixa.pdvId || !caixa.dataHoraAbertura) return { anexadas: 0, desanexadas: 0 };
  const abertura = new Date(caixa.dataHoraAbertura);
  const limiteSuperior = caixa.dataHoraFechamento ? new Date(caixa.dataHoraFechamento) : new Date();
  return revincularVendasAoCaixaRepository(
    { caixaId: caixa.id, empresaId: caixa.empresaId, pdvId: caixa.pdvId, abertura, limiteSuperior },
    db
  );
}

export async function calcularResumoCaixaOperacional(caixa: CaixaLinha, db?: ExecutorBanco): Promise<ResumoCaixa> {
  const totais = await calcularTotaisCaixaCentavos(caixa, db);
  // dividaCofre e legado da R8, revogada pela R-001: hoje e sempre 0 (ver 18 D-08).
  return montarResumoCaixa(totais, paraCentavos(caixa.dividaCofre));
}

// G1/R-171 Â· a UNICA porta que monta o status de um caixa aberto.
//
// Existia como o mesmo literal repetido em oito lugares. Com um campo a mais â€” as entregas que
// travam o fechamento â€” repetir viraria dividir: bastaria uma rota esquecer o campo para a tela
// mostrar "pode fechar" sobre um caixa que a API recusa. Aqui isso nao tem como acontecer.
async function statusDoCaixaAberto(caixa: CaixaLinha, db?: ExecutorBanco): Promise<CaixaStatus> {
  const lacreFechamento = await buscarLacreFechamentoPlanejadoDoCaixaRepository(caixa.id, caixa.empresaId, db);
  return {
    caixaAberto: serializarCaixa(caixa),
    resumo: await calcularResumoCaixaOperacional(caixa, db),
    lacreFechamentoReservado: lacreFechamento?.rompido ? null : (lacreFechamento?.numero ?? null),
    indisponibilidadeAberta: serializarIndisponibilidade(
      await buscarIndisponibilidadeAbertaCaixaRepository(caixa.id, caixa.empresaId, db)
    ),
    entregasPendentes: await entregasPendentesDoCaixa(caixa.id, db),
    planejamentosPendentes: serializarPlanejamentos(await listarPlanejamentosRetornoRepository(caixa.id, db))
  };
}

function serializarIndisponibilidade(linha: Awaited<ReturnType<typeof buscarIndisponibilidadeAbertaCaixaRepository>>) {
  if (!linha) return null;
  return {
    id: linha.id,
    motivos: linha.motivos as NonNullable<CaixaStatus["indisponibilidadeAberta"]>["motivos"],
    motivoOutro: linha.motivoOutro,
    iniciadoEm: linha.iniciadoEm.toISOString()
  };
}

function serializarPlanejamentos(
  linhas: Array<{
    id: string;
    tipo: string;
    valorOriginal: string;
    nLacreDoc: string | null;
    contaDestinoId: string;
    contaDestinoNome: string;
    observacao: string | null;
    criadoEm: Date | null;
  }>
): PlanejamentoRetorno[] {
  return linhas.map((linha) => ({
    id: linha.id,
    tipo: "retorno",
    valor: deCentavos(paraCentavos(linha.valorOriginal)),
    lacre: linha.nLacreDoc ?? "",
    contaDestinoId: linha.contaDestinoId,
    contaDestinoNome: linha.contaDestinoNome,
    observacao: linha.observacao,
    criadoEm: linha.criadoEm?.toISOString() ?? new Date(0).toISOString()
  }));
}

// R-183 Â· a lista que a tela recebe carrega tambem o que o cofre JA CONTOU, quando ja contou.
// Sao duas situacoes muito diferentes que a tela precisa distinguir: entrega sem recusa trava o
// fechamento e nao tem saida nenhuma; entrega ja recusada trava tambem, mas a saida existe e esta
// no cofre. Sem o numero, o operador leria "travado" nos dois casos.
async function entregasPendentesDoCaixa(caixaId: string, db?: ExecutorBanco): Promise<EntregaCofrePendente[]> {
  const linhas = await listarRetornosPendentesRepository(caixaId, db);
  const ultimas = await ultimasRecusasPorTransferenciaRepository(
    linhas.map((linha) => linha.id),
    db
  );
  return serializarEntregasPendentes(linhas, ultimas);
}

function serializarEntregasPendentes(
  linhas: Array<{
    id: string;
    tipo: string;
    valorCentavos: number;
    lacre: string | null;
    contaDestinoNome: string;
    criadoEm: Date | null;
  }>,
  ultimas: Map<string, { id: string; valorInformadoCentavos: number | null }> = new Map()
): EntregaCofrePendente[] {
  return linhas.map((linha) => {
    const recusa = ultimas.get(linha.id);
    return {
      id: linha.id,
      tipo: "retorno",
      valor: deCentavos(linha.valorCentavos),
      lacre: linha.lacre,
      contaDestinoNome: linha.contaDestinoNome,
      criadoEm: serializarData(linha.criadoEm) ?? "",
      // R-183 Â· recusa SEM contagem vale zero contado, e nao "nao contou": e a leitura oficial do
      // "lacre violado, nao abro" â€” o cofre nao recebe credito e o declarado inteiro vira quebra.
      valorContado: recusa ? deCentavos(recusa.valorInformadoCentavos ?? 0) : null,
      recusaId: recusa?.id ?? null
    };
  });
}

// A recusa precisa dizer QUAL entrega trava. "Nao pode fechar" sozinho manda o operador adivinhar
// entre as entregas do turno â€” e, no fim do expediente, adivinhar vira ligar para a Tesouraria.
function _mensagemEntregasPendentes(entregas: EntregaCofrePendente[]): string {
  const VISIVEIS = 3;
  const descritas = entregas.slice(0, VISIVEIS).map((entrega) => {
    const nome = "Retorno";
    const lacre = entrega.lacre ? `, lacre ${entrega.lacre}` : "";
    return `${nome} de R$ ${entrega.valor.toFixed(2)} para ${entrega.contaDestinoNome}${lacre}`;
  });
  const excedente = entregas.length - descritas.length;
  if (excedente > 0) descritas.push(`e mais ${excedente}`);
  // R-183 Â· a saida depende de ja terem contado, e a tela ja diz isso antes do clique. Mandar
  // "confira no cofre" para quem ja conferiu seria o servidor contradizendo a propria tela â€” e o
  // operador ligando para a pessoa errada no fim do turno.
  const jaContadas = entregas.some((entrega) => entrega.valorContado !== null);
  const saida = jaContadas
    ? "a conta destino ja contou e precisa encerrar a divergencia antes de fechar o caixa"
    : "a conta destino precisa conferir antes de fechar o caixa";
  return `Transferencia de retorno aguardando conferencia (${descritas.join("; ")}): ${saida}`;
}

export async function obterStatusCaixa(empresaId: string, perfil: PerfilUsuario): Promise<CaixaStatus> {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw new Error("Empresa nao permitida");
  return executarEmTransacao(async (tx) => {
    const colaborador = await buscarColaboradorPorUsuarioRepository(perfil.usuarioId, empresaId, tx);
    const vinculoOperador =
      colaborador?.pdvPadraoId && colaborador.turnoPadraoId
        ? { pdvId: colaborador.pdvPadraoId, turnoId: colaborador.turnoPadraoId }
        : null;
    const caixa = await buscarCaixaAbertoUsuarioRepository(empresaId, perfil.usuarioId, tx);
    // Sem caixa aberto nao ha o que travar: lista VAZIA, nunca ausente.
    if (!caixa) {
      return {
        caixaAberto: null,
        resumo: null,
        vinculoOperador,
        lacreFechamentoReservado: null,
        indisponibilidadeAberta: null,
        entregasPendentes: [],
        planejamentosPendentes: []
      };
    }

    // O CREARE pode importar uma venda depois da abertura. O refresh de um minuto
    // precisa anexar essas vendas ao caixa antes de calcular os cards de pagamento.
    await revincularVendasAoCaixa(caixa, tx);
    const atualizado = await buscarCaixaPorIdRepository(caixa.id, tx);
    if (!atualizado) throw new Error("Caixa aberto nao encontrado");
    return { ...(await statusDoCaixaAberto(atualizado, tx)), vinculoOperador };
  });
}

export async function registrarIndisponibilidadeCaixa(
  caixaId: string,
  dados: RegistrarIndisponibilidadeCaixaPayload,
  perfil: PerfilUsuario
) {
  return executarEmTransacao(async (tx) => {
    if (!(await travarCaixaRepository(caixaId, tx))) throw new Error("Caixa nao encontrado");
    const caixa = await buscarCaixaPorIdRepository(caixaId, tx);
    if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
    if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
    if (caixa.status !== "aberto") throw new Error("Caixa ja fechado");
    if (await buscarIndisponibilidadeAbertaCaixaRepository(caixa.id, caixa.empresaId, tx)) {
      throw new Error("Ja existe uma indisponibilidade em andamento neste caixa");
    }
    return serializarIndisponibilidade(
      await criarIndisponibilidadeCaixaRepository(
        {
          empresaId: caixa.empresaId,
          fechamentoCaixaId: caixa.id,
          motivos: dados.motivos,
          motivoOutro: dados.motivoOutro?.trim() || null,
          registradoPor: perfil.usuarioId
        },
        tx
      )
    );
  });
}

export async function registrarRetornoIndisponibilidadeCaixa(caixaId: string, perfil: PerfilUsuario) {
  return executarEmTransacao(async (tx) => {
    if (!(await travarCaixaRepository(caixaId, tx))) throw new Error("Caixa nao encontrado");
    const caixa = await buscarCaixaPorIdRepository(caixaId, tx);
    if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
    if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
    if (caixa.status !== "aberto") throw new Error("Caixa ja fechado");
    const retorno = await registrarRetornoIndisponibilidadeCaixaRepository(
      caixa.id,
      caixa.empresaId,
      perfil.usuarioId,
      tx
    );
    if (!retorno) throw new Error("Nenhuma indisponibilidade em andamento neste caixa");
    return { id: retorno.id, retornadoEm: retorno.retornadoEm?.toISOString() ?? new Date().toISOString() };
  });
}

// R-224 · o operador recua o inicio das vendas do caixa (abriu no sistema depois de ja estar vendendo).
// Limites: no maximo 60 min antes da abertura OFICIAL (`abertoEm`, que nunca muda), no mesmo dia de negocio,
// nunca antes do fim do caixa anterior do mesmo PDV, e so com motivo. As vendas sem caixa desse intervalo passam
// a ser deste caixa (as que ja sao de outro caixa nunca sao tiradas de la). Se o fechamento ja comecou, o
// relatorio de vendas gerado fica invalido e precisa ser gerado de novo com o periodo novo.
const RECUO_MAXIMO_INICIO_VENDAS_MS = 60 * 60_000;
export async function ajustarInicioVendasCaixa(
  caixaId: string,
  dados: AjustarInicioVendasCaixaPayload,
  perfil: PerfilUsuario
) {
  return executarEmTransacao(async (tx) => {
    const caixa = await buscarCaixaPorIdRepository(caixaId, tx);
    if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
    if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
    if (!(await travarCaixaRepository(caixa.id, tx))) throw new Error("Caixa nao encontrado");
    const travado = await buscarCaixaPorIdRepository(caixa.id, tx);
    if (!travado || !["aberto", "em_fechamento"].includes(travado.status)) {
      throw new ErroDominio(
        "O inicio das vendas so pode ser ajustado com o caixa aberto ou em fechamento.",
        409,
        "CAIXA_NAO_AJUSTAVEL"
      );
    }
    if (!travado.abertoEm || !travado.pdvId || !travado.dataHoraAbertura)
      throw new Error("Caixa sem abertura registrada");
    const oficial = new Date(travado.abertoEm);
    const inicio = new Date(dados.inicio);
    if (inicio.getTime() > oficial.getTime()) {
      throw new ErroDominio("O inicio so pode ser antes da abertura oficial.", 422, "INICIO_VENDAS_FORA_DA_JANELA");
    }
    if (oficial.getTime() - inicio.getTime() > RECUO_MAXIMO_INICIO_VENDAS_MS) {
      throw new ErroDominio(
        "O inicio pode recuar no maximo 60 minutos da abertura oficial.",
        422,
        "INICIO_VENDAS_FORA_DA_JANELA"
      );
    }
    if (diaNegocio(inicio) !== diaNegocio(oficial)) {
      throw new ErroDominio("O inicio precisa ser no mesmo dia da abertura.", 422, "INICIO_VENDAS_FORA_DA_JANELA");
    }
    const fimAnterior = await buscarFimDoCaixaAnteriorNoPdvRepository(
      { empresaId: travado.empresaId, pdvId: travado.pdvId, caixaId: travado.id, abertoAte: oficial },
      tx
    );
    if (fimAnterior && inicio.getTime() < fimAnterior.getTime()) {
      throw new ErroDominio(
        "O inicio nao pode ser antes do fechamento do caixa anterior deste PDV.",
        422,
        "INICIO_VENDAS_ANTES_DO_CAIXA_ANTERIOR"
      );
    }

    await atualizarInicioVendasCaixaRepository(travado.id, inicio, tx);
    await registrarEdicaoCaixaRepository(
      {
        caixaId: travado.id,
        tokenUsado: null,
        autorizadorId: perfil.usuarioId,
        observacao: dados.motivo.trim(),
        editadoPor: perfil.usuarioId,
        valoresAntigos: {
          inicioVendas: new Date(travado.dataHoraAbertura).toISOString(),
          aberturaOficial: oficial.toISOString()
        },
        valoresNovos: { inicioVendas: inicio.toISOString(), aberturaOficial: oficial.toISOString() }
      },
      tx
    );
    const atualizado = await buscarCaixaPorIdRepository(travado.id, tx);
    if (!atualizado) throw new Error("Caixa nao encontrado");
    const { anexadas } = await revincularVendasAoCaixa(atualizado, tx);
    if (travado.status === "em_fechamento") {
      await invalidarRelatorioVendasFechamentoRepository(travado.id, travado.empresaId, tx);
    }
    return {
      inicioVendas: inicio.toISOString(),
      aberturaOficial: oficial.toISOString(),
      vendasAnexadas: anexadas,
      relatorioVendasInvalidado: travado.status === "em_fechamento"
    };
  });
}

export async function iniciarFechamentoCaixa(caixaId: string, perfil: PerfilUsuario) {
  return executarEmTransacao(async (tx) => {
    if (!(await travarCaixaRepository(caixaId, tx))) throw new Error("Caixa nao encontrado");
    const caixa = await buscarCaixaPorIdRepository(caixaId, tx);
    if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
    if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
    if (caixa.status !== "aberto") throw new Error("Caixa ja esta em fechamento ou fechado");
    if (await buscarIndisponibilidadeAbertaCaixaRepository(caixa.id, caixa.empresaId, tx)) {
      throw new Error("Registre o retorno do computador do PDV antes de encerrar as vendas");
    }
    const corte = new Date();
    if (!(await iniciarFechamentoCaixaRepository(caixa.id, perfil.usuarioId, corte, tx))) {
      throw new Error("Caixa ja esta em fechamento ou fechado");
    }
    return { dataHoraCorte: corte.toISOString() };
  });
}

export interface EscopoListagemCaixa {
  bloquear: boolean;
  caixaId: string | undefined;
  // Dia CONTABIL do caixa aberto. So a tela de Entradas usa (D7): la o escopo e o DIA, nao o caixa
  // â€” ver resolverEscopoEntradasDoDia.
  dia?: string | undefined;
}

/**
 * Impoe, no servidor, o escopo "somente caixa aberto" das telas de movimentacao.
 * Se o perfil tem `menu_<tela>_somente_caixa_aberto`, a listagem fica presa ao caixa
 * aberto do usuario (ignorando qualquer caixaId pedido pelo cliente); sem caixa aberto,
 * nao retorna nada. Sem a flag, mantem o comportamento livre (filtro opcional por caixaId).
 */
export async function resolverEscopoListagemPorCaixa(
  perfil: PerfilUsuario | undefined,
  telaId: string,
  empresaId: string | undefined,
  caixaIdSolicitado: string | undefined
): Promise<EscopoListagemCaixa> {
  const flag = `menu_${telaId}_somente_caixa_aberto` as Permissao;
  const exigeCaixaAberto = Boolean(perfil) && temPermissao(perfil?.permissoes, flag);
  if (!exigeCaixaAberto) return { bloquear: false, caixaId: caixaIdSolicitado };
  if (!perfil || !empresaId) return { bloquear: true, caixaId: undefined };
  const caixa = await buscarCaixaAbertoUsuarioRepository(empresaId, perfil.usuarioId);
  if (!caixa || caixa.status !== "aberto") return { bloquear: true, caixaId: undefined };
  return { bloquear: false, caixaId: caixa.id };
}

/**
 * Escopo da tela de ENTRADAS (PROJECT_BRAIN/17, D7): "a tela lista TODAS as entradas do DIA".
 *
 * Difere do escopo das demais telas em UMA coisa, que e o ponto do D7: quem tem
 * `menu_entradas_somente_caixa_aberto` continua PRECISANDO de caixa aberto para ver a tela, mas o
 * que ela lista passa a ser o DIA do caixa â€” nao o caixa.
 *
 * O motivo e concreto: a venda integrada do CREARE so recebe caixa_id quando existe um caixa aberto
 * NAQUELE PDV no instante da venda (integracoes.service). A venda da madrugada, a de antes da
 * abertura e a de PDV sem caixa ficam com caixa_id NULL â€” e sob o filtro por caixa elas sumiam
 * justamente da tela do operador, que e quem precisa conferir o dia.
 */
export async function resolverEscopoEntradasDoDia(
  perfil: PerfilUsuario | undefined,
  empresaId: string | undefined,
  caixaIdSolicitado: string | undefined
): Promise<EscopoListagemCaixa> {
  const exigeCaixaAberto = Boolean(perfil) && temPermissao(perfil?.permissoes, "menu_entradas_somente_caixa_aberto");
  // Sem a flag (gestao/retaguarda): nada muda â€” segue livre, com filtro opcional por caixa e as
  // datas que a propria tela mandar. Prender a gestao ao dia tiraria o acesso ao historico.
  if (!exigeCaixaAberto) return { bloquear: false, caixaId: caixaIdSolicitado };
  if (!perfil || !empresaId) return { bloquear: true, caixaId: undefined };
  const caixa = await buscarCaixaAbertoUsuarioRepository(empresaId, perfil.usuarioId);
  if (!caixa || caixa.status !== "aberto") return { bloquear: true, caixaId: undefined };
  // dataMovimento e o dia CONTABIL do caixa (nao "hoje"): num caixa que virou a meia-noite, o dia
  // do operador continua sendo o da abertura.
  return { bloquear: false, caixaId: undefined, dia: caixa.dataMovimento };
}

export async function abrirCaixa(dados: AbrirCaixaPayload, perfil: PerfilUsuario): Promise<CaixaStatus> {
  if (!podeAcessarEmpresa(perfil, dados.empresaId)) throw new Error("Empresa nao permitida");
  // A sessão autenticada é a única identidade que pode abrir o próprio caixa. Sem esta guarda, uma
  // requisição direta podia gravar a abertura em nome de outro colaborador da mesma empresa e dar
  // acesso operacional aos dois perfis.
  if (dados.usuarioCaixaId !== perfil.usuarioId) throw new Error("Caixa nao permitido");
  // R-184: o instante nasce no servidor. Aceitar um horario do navegador permitiria ao operador
  // abrir o Caixa fora da janela real do CREARE e mudaria quais vendas pertencem ao turno.
  const dataHoraAbertura = new Date();

  try {
    return await abrirCaixaEmTransacao(dados, perfil, dataHoraAbertura);
  } catch (error) {
    if (error instanceof Error) throw traduzirErroAberturaCaixa(error);
    throw error;
  }
}

// R-040: abrir o caixa informando o lacre E o ato de confirmar o recebimento da transferencia.
// Esta funcao so RESOLVE e valida (leitura) â€” a confirmacao atomica acontece depois, ja com o
// caixa criado, para que a disputa (R-030) seja decidida pelo banco e nao por leitura otimista.
type AberturaPorLacre = {
  transferenciaId: string;
  lacreId: string;
  numeroLacre: string;
  valorCentavos: number;
  valorEspecieDeclaradoCentavos: number;
  valorMoedasDeclaradoCentavos: number;
};

async function prepararAberturaPorLacre(
  empresaId: string,
  numeroLacre: string,
  contaCaixaId: string,
  usuarioId: string,
  tx: ExecutorBanco
): Promise<AberturaPorLacre> {
  const achado = await buscarTransferenciaPorLacreAberturaRepository(empresaId, numeroLacre, contaCaixaId, tx);
  // Motivos separados de proposito: "lacre inexistente" e "lacre ja rompido" mandam o operador para
  // acoes diferentes (redigitar x procurar a tesouraria).
  if (!achado) throw new Error("Lacre inexistente");
  if (achado.lacreRompido) throw new Error("Lacre ja rompido - nao pode ser reutilizado");
  if (achado.status === "agendada") throw new Error("Transferencia agendada ainda nao foi liberada");
  if (achado.status !== "pendente") throw new Error("Transferencia deste lacre nao esta pendente de recebimento");
  // S4 (R-164): transferencia ja vinculada a um caixa tem a saida CONTADA la â€” reivindica-la de
  // outro caixa migraria o movimento em silencio e tiraria a saida dos totais do primeiro.
  if (achado.caixaId) throw new Error("Transferencia deste lacre ja pertence a outro caixa");
  // R-030: so um dos destinos CANDIDATOS pode reivindicar. Caixa fora da lista nao disputa.
  if (!achado.candidatoId) throw new Error("A conta deste caixa não é destino desta transferência");
  // R-028: quem envia nao confirma o proprio envio.
  if (achado.criadoPor === usuarioId) throw new Error("Quem enviou a transferencia nao pode confirmar o recebimento");
  if (achado.contaOrigemId === contaCaixaId) throw new Error("Conta de origem nao pode ser a mesma do caixa");

  const valorCentavos = paraCentavos(achado.valorOriginal);
  if (achado.valorEspecieDeclarado === null || achado.valorMoedasDeclarado === null) {
    throw new Error("Transferencia do malote sem composicao de especie e moedas");
  }
  return {
    transferenciaId: achado.transferenciaId,
    lacreId: achado.lacreId,
    numeroLacre,
    valorCentavos,
    valorEspecieDeclaradoCentavos: paraCentavos(achado.valorEspecieDeclarado),
    valorMoedasDeclaradoCentavos: paraCentavos(achado.valorMoedasDeclarado)
  };
}

// Leitura previa para o operador conferir o malote antes de consumi-lo na abertura. Nao muda
// transferencia, lacre ou saldo; a confirmacao atomica continua exclusivamente em abrirCaixa.
export async function consultarMaloteParaAbertura(
  empresaId: string,
  pdvId: string,
  lacre: string,
  perfil: PerfilUsuario
) {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw new Error("Empresa nao permitida");
  const colaborador = await buscarColaboradorPorUsuarioRepository(perfil.usuarioId, empresaId);
  if (!colaborador?.pdvPadraoId || !colaborador.turnoPadraoId) {
    throw new Error("Usuario do caixa precisa ter PDV e turno vinculados pelo administrador");
  }
  if (colaborador.pdvPadraoId !== pdvId) {
    throw new Error("Usuario do caixa so pode consultar o malote do PDV vinculado ao seu cadastro");
  }
  const pdv = await buscarPdvEmpresaRepository(pdvId, empresaId);
  if (!pdv?.contaId) throw new Error("PDV sem conta vinculada");
  const abertura = await prepararAberturaPorLacre(empresaId, lacre.trim(), pdv.contaId, perfil.usuarioId, banco);
  const lacresRetorno = await listarLacresRetornoDaDistribuicaoRepository(abertura.transferenciaId, empresaId);
  const lacreFechamento = await buscarLacreFechamentoPlanejadoDaTransferenciaRepository(
    abertura.transferenciaId,
    empresaId,
    banco
  );
  return {
    valor: deCentavos(abertura.valorCentavos),
    valorEspecieDeclarado: deCentavos(abertura.valorEspecieDeclaradoCentavos),
    valorMoedasDeclarado: deCentavos(abertura.valorMoedasDeclaradoCentavos),
    lacre: abertura.numeroLacre,
    lacresRetorno,
    lacreFechamento
  };
}

export async function listarLacresRetornoDisponiveisCaixa(caixaId: string, perfil: PerfilUsuario) {
  const caixa = await buscarCaixaPorIdRepository(caixaId);
  if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
  if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
  if (caixa.status !== "aberto") return [];
  return listarLacresRetornoDisponiveisDoCaixaRepository(caixaId, caixa.empresaId);
}

async function abrirCaixaEmTransacao(
  dados: AbrirCaixaPayload,
  perfil: PerfilUsuario,
  dataHoraAbertura: Date
): Promise<CaixaStatus> {
  return executarEmTransacao(async (tx) => {
    // S3 (R-164): PRIMEIRO lock da abertura. Sem ele a conta do PDV era um retrato pre-lock â€” um
    // `PUT /api/pdvs/:id` que commitasse durante a abertura deixava o fundo do lacre confirmado na
    // conta ANTIGA de um PDV que ja apontava para outra (dinheiro fora dos sete totais). Travado,
    // quem chega durante a troca espera e decide pela conta ATUAL.
    const pdv = await travarPdvDaAberturaRepository(dados.pdvId, dados.empresaId, tx);
    if (!pdv || !pdv.ativo) throw new Error("PDV nao encontrado");
    if (!pdv.contaId) throw new Error("PDV sem conta vinculada");
    const usuarioCaixa = await buscarPerfilUsuarioCaixaRepository(dados.usuarioCaixaId, tx);
    if (!usuarioCaixa) throw new Error("Usuario do caixa nao encontrado");
    const colaborador = await buscarColaboradorPorUsuarioRepository(dados.usuarioCaixaId, dados.empresaId, tx);
    if (!colaborador) throw new Error("Usuario do caixa precisa estar vinculado a colaborador da empresa");
    if (!colaborador.pdvPadraoId || !colaborador.turnoPadraoId) {
      throw new Error("Usuario do caixa precisa ter PDV e turno vinculados pelo administrador");
    }
    if (dados.pdvId !== colaborador.pdvPadraoId) {
      throw new Error("Usuario do caixa so pode abrir o PDV vinculado ao seu cadastro");
    }
    if (dados.turnoId && dados.turnoId !== colaborador.turnoPadraoId) {
      throw new Error("Usuario do caixa so pode abrir o turno vinculado ao seu cadastro");
    }
    // Um operador representa uma unica gaveta sob responsabilidade. Sem esta guarda, o status
    // escolhia o caixa aberto mais recente e, ao fecha-lo, parecia "abrir" silenciosamente outro
    // caixa antigo do mesmo usuario. O indice parcial no banco e a barreira contra concorrencia;
    // esta leitura antecipa uma mensagem operacional clara no fluxo comum.
    if (await buscarCaixaAbertoUsuarioRepository(dados.empresaId, dados.usuarioCaixaId, tx)) {
      throw new Error(erroOperadorComCaixaAberto);
    }
    if (await existeCaixaAbertoPdvRepository(dados.pdvId, undefined, tx)) throw new Error(erroPeriodo);
    if (await existePeriodoCaixaRepository(dados.pdvId, dataHoraAbertura, undefined, tx)) throw new Error(erroPeriodo);
    if (!(await buscarMaquininhaEmpresaRepository(dados.maquininhaId, dados.empresaId, tx))) {
      throw new Error("Maquininha nao encontrada ou inativa");
    }

    // R-040/B1: o lacre identifica obrigatoriamente a transferência pendente que este caixa
    // vai reivindicar; abertura sem malote não existe no fluxo vigente.
    const lacreInformado = dados.lacreAbertura.trim();
    const abertura = await prepararAberturaPorLacre(dados.empresaId, lacreInformado, pdv.contaId, perfil.usuarioId, tx);

    const caixa = await criarCaixaRepository(
      {
        empresaId: dados.empresaId,
        pdvId: dados.pdvId,
        usuarioId: perfil.usuarioId,
        usuarioCaixaId: dados.usuarioCaixaId,
        colaboradorId: colaborador.id,
        dataHoraAbertura,
        tokenEdicao: gerarTokenEdicao(),
        // O turno do Caixa e configurado no usuario. A UI pode enviar o mesmo id para exibi-lo,
        // mas nunca decide a gravacao.
        turnoId: colaborador.turnoPadraoId,
        observacao: dados.observacao?.trim() || null,
        lacreAbertura: abertura.numeroLacre,
        caixaResponsavelNomeAbertura: dados.caixaResponsavelNome.trim(),
        supervisorResponsavelNomeAbertura: dados.supervisorResponsavelNome.trim(),
        maquininhaId: dados.maquininhaId
      },
      tx
    );

    // R-040 na MESMA transacao: vence a disputa (R-030), preenche data_recebimento/confirmado_por
    // (R-028), leva o dinheiro para ESTE caixa (R-036) e rompe o lacre (R-027). Perder a disputa
    // derruba a abertura inteira â€” nao existe caixa aberto com transferencia ainda pendente.
    {
      // Sem contagem declarada pelo Caixa, o clique de confirmação aceita integralmente a
      // composição registrada pela Tesouraria. Se houver divergência, os dois campos chegam juntos
      // (validado no contrato) e substituem os valores declarados para a conferência/auditoria.
      const valorEspecieContadoCentavos =
        dados.valorEspecieContado === undefined
          ? abertura.valorEspecieDeclaradoCentavos
          : paraCentavos(dados.valorEspecieContado);
      const valorMoedasContadoCentavos =
        dados.valorMoedasContado === undefined
          ? abertura.valorMoedasDeclaradoCentavos
          : paraCentavos(dados.valorMoedasContado);
      const valorContadoCentavos = valorEspecieContadoCentavos + valorMoedasContadoCentavos;
      const convergente =
        abertura.valorEspecieDeclaradoCentavos === valorEspecieContadoCentavos &&
        abertura.valorMoedasDeclaradoCentavos === valorMoedasContadoCentavos;
      if (!convergente && !dados.observacaoDivergencia?.trim()) {
        throw new Error("Observacao obrigatoria quando a conferencia do malote divergir");
      }
      const confirmada = await confirmarTransferenciaAberturaRepository(
        {
          transferenciaId: abertura.transferenciaId,
          lacreId: abertura.lacreId,
          contaCaixaId: pdv.contaId,
          caixaId: caixa.id,
          usuarioId: perfil.usuarioId,
          valorRecebidoCentavos: valorContadoCentavos,
          agora: new Date()
        },
        tx
      );
      if (!confirmada) throw new Error("Lacre ja utilizado por outro caixa");
      const conferencia = await criarConferenciaFisicaTransferenciaRepository(
        {
          empresaId: dados.empresaId,
          transferenciaId: abertura.transferenciaId,
          fechamentoCaixaId: caixa.id,
          etapa: "abertura",
          resultado: convergente ? "convergente" : "divergente",
          encerraConferencia: true,
          valorEspecieDeclaradoCentavos: abertura.valorEspecieDeclaradoCentavos,
          valorMoedasDeclaradoCentavos: abertura.valorMoedasDeclaradoCentavos,
          valorEspecieContadoCentavos,
          valorMoedasContadoCentavos,
          observacao: convergente ? null : dados.observacaoDivergencia!.trim(),
          conferidoPor: perfil.usuarioId,
          conferidoEm: dataHoraAbertura
        },
        tx
      );
      if (!convergente) {
        const destinatarios = (await listarUsuariosTesourariaRepository(dados.empresaId, tx))
          .map((item) => item.usuarioId)
          .filter((usuarioId): usuarioId is string => Boolean(usuarioId));
        await criarNotificacoesRepository(
          {
            empresaId: dados.empresaId,
            tipo: "quebra_caixa",
            destinatariosUsuarioIds: destinatarios,
            referenciaId: conferencia.id,
            titulo: "Divergencia na abertura do caixa",
            valorCentavos: valorContadoCentavos - abertura.valorCentavos
          },
          tx
        );
      }
      await vincularPlanejamentosDaTransferenciaAoCaixaRepository(
        {
          transferenciaOrigemId: abertura.transferenciaId,
          caixaId: caixa.id,
          empresaId: dados.empresaId,
          agora: dataHoraAbertura
        },
        tx
      );
    }

    const aberto = await buscarCaixaPorIdRepository(caixa.id, tx);
    if (!aberto) throw new Error("Caixa nao encontrado apos abertura");
    // Abertura e auditavel pelo relogio do servidor; por enquanto so puxa vendas posteriores a ela.
    await revincularVendasAoCaixa(aberto, tx);

    // R-195/R-196: quem abre caixa agora pode ser destinatario de mensagem enviada antes, e quem ja
    // tinha entrega SEM pdv passa a ter o PDV registrado nela. As duas metades sao idempotentes e
    // rodam na transacao da abertura. Uma mensagem administrativa nunca pode impedir a padaria de
    // abrir o caixa: falha aqui e registrada e engolida.
    try {
      await materializarMensagensNaAberturaDeCaixa(
        {
          empresaId: dados.empresaId,
          usuarioId: dados.usuarioCaixaId,
          pdvId: dados.pdvId,
          fechamentoCaixaId: caixa.id
        },
        tx
      );
    } catch (erroMensagens) {
      console.error("[caixa] falha ao materializar mensagens administrativas na abertura", erroMensagens);
    }

    // Campanha tambem e informativa: uma falha ao criar seu sino nunca pode impedir a abertura nem
    // misturar-se ao fluxo financeiro. Diferente da mensagem administrativa, a elegibilidade vem
    // diretamente dos PDVs persistidos na campanha e do dia contabil desta abertura.
    try {
      await notificarCampanhasNaAberturaDeCaixa(
        {
          empresaId: dados.empresaId,
          pdvId: dados.pdvId,
          usuarioId: dados.usuarioCaixaId,
          dia: diaNegocio(dataHoraAbertura)
        },
        tx
      );
    } catch (erroCampanhas) {
      console.error("[caixa] falha ao notificar campanhas na abertura", erroCampanhas);
    }

    return statusDoCaixaAberto(aberto, tx);
  });
}

export async function fecharCaixa(caixaId: string, dados: FecharCaixaPayload, perfil: PerfilUsuario) {
  return executarEmTransacao(async (tx) => {
    // B1: trava a linha antes de decidir. Dois fechamentos concorrentes deixam de correr juntos â€”
    // o segundo espera aqui e, ao passar, ja le 'fechado'. A guarda no UPDATE (abaixo) e a segunda
    // barreira, para o caso de a trava ser contornada por outro caminho.
    if (!(await travarCaixaRepository(caixaId, tx))) throw new Error("Caixa nao encontrado");

    const caixa = await buscarCaixaPorIdRepository(caixaId, tx);
    if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
    if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
    if (caixa.status !== "em_fechamento") {
      throw new ErroDominio(
        "Inicie o fechamento e conclua os relatorios antes de fechar o caixa.",
        409,
        "FECHAMENTO_NAO_INICIADO"
      );
    }
    if (await buscarIndisponibilidadeAbertaCaixaRepository(caixa.id, caixa.empresaId, tx)) {
      throw new Error("Registre o retorno do computador do PDV antes de fechar o caixa");
    }
    const lacreFechamentoReservado = await buscarLacreFechamentoPlanejadoDoCaixaRepository(
      caixa.id,
      caixa.empresaId,
      tx
    );
    if (lacreFechamentoReservado && dados.lacreFechamento.trim() !== lacreFechamentoReservado.numero) {
      throw new Error("O lacre informado nao corresponde ao lacre de fechamento reservado no malote");
    }
    if (!(await existeFolhaFechamentoCaixaRepository(caixa.id, caixa.empresaId, tx))) {
      throw new Error("Anexe ao menos uma foto da folha de fechamento antes de fechar o caixa");
    }
    if (!(await buscarRelatorioVendasFechamentoRepository(caixa.id, caixa.empresaId, tx))) {
      throw new ErroDominio(
        "Gere o relatorio completo de vendas antes de fechar o caixa.",
        409,
        "RELATORIO_VENDAS_OBRIGATORIO"
      );
    }
    const relatorioMaquininha = await buscarRelatorioMaquininhaFechamentoRepository(caixa.id, caixa.empresaId, tx);
    if (!relatorioMaquininha || relatorioMaquininha.versao < 5) {
      throw new ErroDominio(
        "Salve a conferencia da maquininha antes de fechar o caixa.",
        409,
        "RELATORIO_MAQUININHA_OBRIGATORIO"
      );
    }
    const dataHoraFechamento = caixa.dataHoraFechamento ? new Date(caixa.dataHoraFechamento) : new Date();
    if (caixa.dataHoraAbertura && dataHoraFechamento <= new Date(caixa.dataHoraAbertura)) {
      throw new Error("Fechamento precisa ser posterior a abertura");
    }

    // G1/R-171 Â· dinheiro que JA SAIU trava o fechamento comum.
    //
    // R-185/R-187 · o painel paralelo foi removido, mas o planejamento atomico voltou dentro da
    // transferencia inicial. A linha `agendada` nao move saldo e trava ate ser executada ou cancelada.
    //
    // Retornos e sangrias em transito NAO travam mais o fechamento: a Tesouraria pode conferir em
    // outro momento e resolver uma eventual divergencia na trilha de conferencia, mesmo depois de
    // o operador encerrar o turno. Planejamentos ainda travam porque dinheiro ainda nao saiu.
    if (await existePlanejamentoRetornoAgendadoRepository(caixa.id, tx)) {
      throw new Error("Existem transferencias de retorno planejadas: execute ou cancele antes de fechar o caixa");
    }
    let totais = await calcularTotaisCaixaCentavos(caixa, tx);
    const valorFisicoEsperadoCentavos = saldoFisicoCaixaCentavos(totais);
    // A composicao registrada no fechamento representa dinheiro que poderia existir na gaveta e
    // por isso o banco corretamente proibe valor esperado negativo. Sem esta guarda, saidas fisicas
    // acima do saldo chegavam ao UPDATE e a restricao virava 500 opaco. A formula continua a mesma:
    // apenas recusamos o fechamento ate que a saida indevida seja tratada na trilha auditavel.
    if (valorFisicoEsperadoCentavos < 0) {
      throw new ErroDominio(
        "O saldo fisico calculado esta negativo. Revise as saidas fisicas antes de fechar o caixa.",
        409,
        "SALDO_FISICO_NEGATIVO"
      );
    }
    const valorEspecieFechamentoCentavos = paraCentavos(dados.valorEspecieFechamento);
    const valorMoedasFechamentoCentavos = paraCentavos(dados.valorMoedasFechamento);
    const valorFisicoContadoCentavos = valorEspecieFechamentoCentavos + valorMoedasFechamentoCentavos;
    const diferencaFisicaCentavos = valorFisicoContadoCentavos - valorFisicoEsperadoCentavos;
    const observacao = dados.observacao?.trim() || null;
    if (diferencaFisicaCentavos !== 0 && !observacao) {
      throw new Error("Observacao obrigatoria quando a contagem fisica do fechamento divergir");
    }

    // D6/D7: a sobra NUNCA vira quebra positiva e nunca exige um segundo botao. O retorno final
    // sai aqui, no MESMO ato e na MESMA transacao do fechamento: se qualquer parte falhar depois,
    // este INSERT cai junto no rollback. Se o saldo ja estiver zero (retornos parciais durante o
    // turno), nada e criado e a mesma acao apenas fecha.
    if (valorFisicoContadoCentavos > 0) {
      if (!caixa.pdvContaId) throw new Error("Caixa operacional invalido");
      // Decisao 7: o retorno final TAMBEM entrega dinheiro fisico, entao exige responsavel no
      // cofre. A checagem fica DENTRO deste `if` de proposito: fechamento sem sobra nao gera
      // entrega nenhuma e nao pode ser bloqueado por falta de quem conferir.
      await exigirConfirmadorDoCofre(caixa.empresaId, perfil.usuarioId, tx);
      await registrarEntregaAoCofre(
        {
          caixa: { ...caixa, pdvContaId: caixa.pdvContaId },
          valorCentavos: valorFisicoContadoCentavos,
          valorEspecieCentavos: valorEspecieFechamentoCentavos,
          valorMoedasCentavos: valorMoedasFechamentoCentavos,
          lacre: null,
          observacao: dados.observacao ?? null,
          responsavelNome: null,
          criadoPor: perfil.usuarioId,
          // D6/B2: sem chave de proposito. Este ato ja e irrepetivel por construcao â€” roda sob a
          // trava da linha do caixa e o UPDATE so acerta caixa 'aberto', entao um retry encontra o
          // caixa fechado e nao chega ate aqui.
          idempotenciaChave: null
        },
        tx
      );
      totais = await calcularTotaisCaixaCentavos(caixa, tx);
      const saldoDepoisDoRetornoCentavos = saldoFisicoCaixaCentavos(totais);
      if (saldoDepoisDoRetornoCentavos !== -diferencaFisicaCentavos)
        throw new Error("Retorno final nao conferiu com a contagem fisica");
    }

    if (diferencaFisicaCentavos < 0) {
      if (!caixa.usuarioCaixaId) throw new Error("Caixa sem usuario responsavel");
      const quebra = await criarQuebraCaixaRepository(
        {
          empresaId: caixa.empresaId,
          fechamentoCaixaId: caixa.id,
          usuarioId: caixa.usuarioCaixaId,
          valorCentavos: diferencaFisicaCentavos,
          observacao: observacao!
        },
        tx
      );
      const destinatarios = (await listarUsuariosTesourariaRepository(caixa.empresaId, tx))
        .map((item) => item.usuarioId)
        .filter((usuarioId): usuarioId is string => Boolean(usuarioId));
      await criarNotificacoesRepository(
        {
          empresaId: caixa.empresaId,
          tipo: "quebra_caixa",
          destinatariosUsuarioIds: destinatarios,
          referenciaId: quebra.id,
          titulo: `Quebra de caixa - ${caixa.usuarioCaixaNome ?? "Usuario"}`,
          valorCentavos: diferencaFisicaCentavos
        },
        tx
      );
    }
    if (diferencaFisicaCentavos > 0) {
      const destinatarios = (await listarUsuariosTesourariaRepository(caixa.empresaId, tx))
        .map((item) => item.usuarioId)
        .filter((usuarioId): usuarioId is string => Boolean(usuarioId));
      await criarNotificacoesRepository(
        {
          empresaId: caixa.empresaId,
          tipo: "transferencia_divergencia",
          destinatariosUsuarioIds: destinatarios,
          referenciaId: caixa.id,
          titulo: `Sobra na conferencia de fechamento - ${caixa.usuarioCaixaNome ?? "Usuario"}`,
          valorCentavos: diferencaFisicaCentavos
        },
        tx
      );
    }

    const linhasFechadas = await atualizarFechamentoCaixaRepository(
      {
        caixaId: caixa.id,
        dataHoraFechamento,
        observacao: observacao || caixa.observacao,
        fechadoPor: perfil.usuarioId,
        lacreFechamento: dados.lacreFechamento,
        caixaResponsavelNomeFechamento: dados.caixaResponsavelNome.trim(),
        supervisorResponsavelNomeFechamento: dados.supervisorResponsavelNome.trim(),
        totais,
        saldoCentavos: 0,
        valorFisicoEsperadoCentavos,
        valorEspecieFechamentoCentavos,
        valorMoedasFechamentoCentavos
      },
      tx
    );
    // B1: o UPDATE so acerta caixa 'aberto'. Zero linhas significa que outro fechamento venceu a
    // corrida â€” erro de dominio (400), nunca 500 por violacao de UNIQUE da quebra.
    if (linhasFechadas === 0) throw new Error("Caixa ja fechado");
    if (lacreFechamentoReservado) {
      const consumido = await consumirLacreFechamentoPlanejadoRepository(
        {
          lacreId: lacreFechamentoReservado.id,
          empresaId: caixa.empresaId,
          numero: dados.lacreFechamento.trim()
        },
        tx
      );
      if (!consumido) throw new Error("Lacre de fechamento ja utilizado ou indisponivel");
    }

    return {
      caixaAberto: null,
      resumo: null,
      lacreFechamentoReservado: null,
      indisponibilidadeAberta: null,
      entregasPendentes: [],
      planejamentosPendentes: []
    } satisfies CaixaStatus;
  });
}

// B2: duas requisicoes com a MESMA chave so podem ser o mesmo ato. Se qualquer parte da intencao
// mudou, o cliente reaproveitou a chave para outra coisa â€” e devolver "ok" ali seria engolir uma
// entrega de dinheiro em silencio. Por isso o conflito e explicito, e nao um 200 conveniente.
function conferirIntencaoEntrega(
  existente: IntencaoEntregaCofre,
  pretendida: {
    caixaId: string;
    tipo: string;
    valorCentavos: number;
    valorEspecieCentavos: number;
    valorMoedasCentavos: number;
    lacre: string | null;
    observacao: string | null;
    responsavelNome: string | null;
  }
): void {
  // O lacre faz parte da intencao porque na entrega ao cofre ele existe DESDE A CRIACAO. O `status`
  // nunca entra: ele muda por atos posteriores (conferencia, divergencia) e nao descreve o que foi
  // pedido â€” compara-lo faria um retry legitimo responder 409 depois que o cofre agisse.
  const divergencias: string[] = [];
  if (existente.caixaId !== pretendida.caixaId) divergencias.push("caixa");
  const tipoExistente = existente.tipo === "sangria" ? "retorno" : existente.tipo;
  if (tipoExistente !== pretendida.tipo) divergencias.push("tipo");
  if (existente.valorCentavos !== pretendida.valorCentavos) divergencias.push("valor");
  if (existente.valorEspecieCentavos !== pretendida.valorEspecieCentavos) divergencias.push("especie");
  if (existente.valorMoedasCentavos !== pretendida.valorMoedasCentavos) divergencias.push("moedas");
  if ((existente.lacre ?? null) !== pretendida.lacre) divergencias.push("lacre");
  if ((existente.observacao ?? null) !== pretendida.observacao) divergencias.push("observacao");
  if ((existente.responsavelNome ?? null) !== pretendida.responsavelNome) divergencias.push("responsavel");
  if (divergencias.length > 0) {
    throw new ErroDominio(
      `Chave de idempotencia ja usada para outra intencao (${divergencias.join(", ")})`,
      409,
      "IDEMPOTENCIA_CONFLITO"
    );
  }
}

// Decisao 7 Â· sem CONFIRMADOR ELEGIVEL no Cofre, o dinheiro nao sai.
//
// A entrega ao cofre nasce `pendente` e so vira dinheiro no cofre quando alguem conferir
// (R-028/R-036). Se ninguem PODE conferir, a entrega fica pendente para sempre: ja saiu do caixa e
// nunca entra no cofre. Some do sistema.
//
// "Poder conferir" sao tres coisas juntas, e checar so o vinculo era insuficiente â€” o gate liberava
// a entrega e a confirmacao depois se revelava impossivel:
//   1. estar vinculado a conta do cofre da empresa (`contas_usuarios`);
//   2. nao ser quem criou/executou o movimento (R-028), exceto Tesouraria (R-189);
//   3. ter `transferencias_conferir` na permissao EFETIVA (setor + cargos + usuario).
//
// A (3) e resolvida aqui, e nao no SQL, para usar exatamente a mesma resolucao do guard das rotas.
// Duas regras de permissao para a mesma pergunta divergem no primeiro ajuste.
async function existeConfirmadorElegivel(
  input: { contaId: string; empresaId: string; excluirUsuariosIds: string[] },
  tx: ExecutorBanco
): Promise<boolean> {
  const excluidos = new Set(input.excluirUsuariosIds);
  const candidatos = await listarCandidatosConfirmacaoRepository(
    { contaId: input.contaId, empresaId: input.empresaId },
    tx
  );
  for (const usuarioId of candidatos) {
    const perfil = await buscarPerfilUsuario(usuarioId);
    if (!perfil || !temPermissao(perfil.permissoes, "transferencias_conferir")) continue;
    const ehTesouraria = perfil.cargos.some((cargo) =>
      cargo.nome
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/gu, "")
        .trim()
        .toLowerCase()
        .startsWith("tesouraria")
    );
    if (!excluidos.has(usuarioId) || ehTesouraria) return true;
  }
  return false;
}

// Bloqueio ANTES do ato, valendo para os dois atos que entregam dinheiro: a entrega avulsa do turno
// e o retorno final do fechamento. O fechamento SEM retorno fisico nao e bloqueado â€” nao ha entrega,
// entao nao ha o que conferir.
//
// `criadoPor` e quem VAI criar o movimento: se o unico vinculado ao cofre for ele mesmo, nao existe
// confirmador â€” e e melhor descobrir isso agora do que com o dinheiro fora do caixa.
//
// R-179/Fatia 3 Â· o parametro era uma LISTA de impedidos porque na solicitacao D4 quem programava e
// quem entregava eram pessoas diferentes, e as duas ficavam fora da conferencia (R-028). Com um
// unico caminho de entrega existe um unico autor. Quem continua lendo `executado_por` e a
// conferencia, para as linhas HISTORICAS que nasceram do fluxo antigo.
async function exigirConfirmadorDoCofre(empresaId: string, criadoPor: string, tx: ExecutorBanco): Promise<void> {
  const contaCofreId = await buscarContaCofreEmpresaRepository(empresaId, tx);
  if (!contaCofreId) throw new Error("Empresa sem conta de cofre configurada para transferencia ao cofre");
  await exigirConfirmadorDaConta(contaCofreId, empresaId, [criadoPor], tx, "Conta do cofre");
}

async function exigirConfirmadorDaConta(
  contaId: string,
  empresaId: string,
  excluirUsuariosIds: string[],
  tx: ExecutorBanco,
  nomeDaConta = "Conta de destino"
): Promise<void> {
  if (!(await existeConfirmadorElegivel({ contaId, empresaId, excluirUsuariosIds }, tx))) {
    throw new Error(`${nomeDaConta} sem responsavel elegivel para conferir a transferencia de retorno`);
  }
}

// D5/D9/R-179: cada entrega fisica ao cofre e um movimento IMUTAVEL, com valor e lacre proprios.
// Este e o UNICO lugar do sistema que cria a transferencia caixa -> cofre â€” a sangria do turno, o
// retorno avulso e o retorno final do fechamento passam todos por aqui. Corrigir um valor nunca
// edita um movimento ja feito: gera um segundo movimento, com outro lacre.
async function registrarEntregaAoCofre(
  input: {
    caixa: { id: string; empresaId: string; pdvContaId: string; dataMovimento: string | null };
    valorCentavos: number;
    valorEspecieCentavos: number;
    valorMoedasCentavos: number;
    lacre: string | null;
    lacreReservado?: { id: string; transferenciaDistribuicaoId: string } | null;
    observacao: string | null;
    responsavelNome: string | null;
    criadoPor: string;
    // B2: null SOMENTE no retorno final do fechamento (D6) â€” la a trava da linha do caixa e a
    // guarda `status = 'aberto'` do UPDATE ja tornam o ato irrepetivel, e o valor e a sobra inteira.
    idempotenciaChave: string | null;
  },
  tx: ExecutorBanco
): Promise<{ id: string; duplicada: boolean }> {
  const lacre = input.lacre?.trim() || null;
  const observacao = input.observacao?.trim() || null;
  const responsavelNome = input.responsavelNome?.trim() || null;
  const intencao = {
    caixaId: input.caixa.id,
    tipo: "retorno",
    valorCentavos: input.valorCentavos,
    valorEspecieCentavos: input.valorEspecieCentavos,
    valorMoedasCentavos: input.valorMoedasCentavos,
    lacre,
    observacao,
    responsavelNome
  };

  // B2: a idempotencia e resolvida ANTES da unicidade do lacre, e a ordem importa. Um retry
  // carrega o MESMO lacre; se a checagem do lacre viesse primeiro, o retry morreria com
  // "Lacre ja utilizado em outro movimento" â€” mensagem errada para um ato que ja deu certo, e que
  // levaria o operador a lancar de novo com outro lacre, duplicando a entrega.
  if (input.idempotenciaChave) {
    const existente = await buscarTransferenciaPorIdempotenciaRepository(
      input.caixa.empresaId,
      input.idempotenciaChave,
      tx
    );
    if (existente) {
      conferirIntencaoEntrega(existente, intencao);
      return { id: existente.id, duplicada: true };
    }
  }

  // Regra 5: destino = conta do cofre mapeada na empresa (sem inventar).
  const contaCofreId = await buscarContaCofreEmpresaRepository(input.caixa.empresaId, tx);
  if (!contaCofreId) throw new Error("Empresa sem conta de cofre configurada para transferencia ao cofre");
  if (contaCofreId === input.caixa.pdvContaId) throw new Error("Conta de cofre nao pode ser a mesma do caixa");

  // Lacre da volta: no retorno avulso vem da bolsa pre-enviada pela Tesouraria; o retorno final
  // continua sem bolsa de sangria porque e fechado pelo lacre proprio da gaveta.
  if (lacre && !input.lacreReservado && (await existeNumeroLacreRepository(input.caixa.empresaId, lacre, tx))) {
    throw new Error("Lacre ja utilizado em outro movimento");
  }

  const ordem = await proximaOrdemTransferenciaRepository(input.caixa.id, "retorno", tx);
  const transferencia = await criarTransferenciaCofreRepository(
    {
      empresaId: input.caixa.empresaId,
      caixaId: input.caixa.id,
      contaCaixaId: input.caixa.pdvContaId,
      contaCofreId,
      valorCentavos: input.valorCentavos,
      valorEspecieCentavos: input.valorEspecieCentavos,
      valorMoedasCentavos: input.valorMoedasCentavos,
      ordem,
      dataReferencia: input.caixa.dataMovimento ?? diaNegocio(new Date()),
      dataTransferencia: diaNegocio(new Date()),
      nLacreDoc: lacre,
      descricao: "Transferencia de retorno",
      observacao,
      responsavelNome,
      criadoPor: input.criadoPor,
      idempotenciaChave: input.idempotenciaChave
    },
    tx
  );

  // B2: DO NOTHING nao inseriu â€” outra transacao com a mesma chave commitou primeiro. A transacao
  // segue viva (era esse o ponto de nao usar INSERT cru): lemos a vencedora e respondemos com ela.
  if (!transferencia.criada) {
    if (!input.idempotenciaChave) throw new Error("Transferencia de cofre nao criada");
    const vencedora = await buscarTransferenciaPorIdempotenciaRepository(
      input.caixa.empresaId,
      input.idempotenciaChave,
      tx
    );
    if (!vencedora) throw new Error("Transferencia de cofre nao criada");
    // Item 8: a MESMA regra da leitura anterior. Comparar o lacre aqui faria o retry legitimo de
    // uma PROGRAMACAO responder 409 assim que alguem a executasse â€” o lacre nasce na execucao.
    conferirIntencaoEntrega(vencedora, intencao);
    return { id: vencedora.id, duplicada: true };
  }

  if (input.lacreReservado) {
    const consumido = await consumirLacreRetornoRepository(
      {
        lacreId: input.lacreReservado.id,
        empresaId: input.caixa.empresaId,
        transferenciaDistribuicaoId: input.lacreReservado.transferenciaDistribuicaoId,
        transferenciaId: transferencia.id
      },
      tx
    );
    if (!consumido) throw new Error("Lacre de retorno / sangria indisponivel ou ja utilizado");
  } else if (lacre) {
    await criarLacreRetornoRepository(
      { empresaId: input.caixa.empresaId, numero: lacre, transferenciaId: transferencia.id },
      tx
    );
  }
  return { id: transferencia.id, duplicada: false };
}

// M2 (R3/R4): sangria (durante o turno) e retorno (no fechamento) sao a MESMA entidade â€” uma
// transferencia caixa -> cofre. O servidor resolve a conta do cofre, o ordinal (R6) e consome o
// lacre novo (D5 opcional). O retorno da sobra em especie zera o saldo fisico e libera o fechamento.
export async function criarTransferenciaCofreCaixa(
  caixaId: string,
  dados: TransferenciaCofrePayload,
  perfil: PerfilUsuario
): Promise<CaixaStatus> {
  return executarEmTransacao(async (tx) => {
    // B1/B2: a trava serializa as entregas do mesmo caixa e o teto (abaixo) impede saldo negativo.
    // Trava e teto NAO sao idempotencia: com saldo 300, dois POSTs identicos de 100 passariam os
    // dois, porque o segundo ainda encontra 200 disponiveis. Quem distingue intencao nova de retry
    // e a `idempotenciaChave` do payload, persistida e protegida por UNIQUE parcial (B2).
    if (!(await travarCaixaRepository(caixaId, tx))) throw new Error("Caixa nao encontrado");

    const caixa = await buscarCaixaPorIdRepository(caixaId, tx);
    if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
    if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
    if (caixa.status !== "aberto") throw new Error("Caixa ja fechado");
    if (!caixa.pdvContaId) throw new Error("Caixa operacional invalido");
    const valorCentavos = paraCentavos(dados.valor);
    if (valorCentavos <= 0) throw new Error("Valor da transferencia deve ser positivo");
    const lacreSelecionado = await buscarLacreRetornoDoCaixaRepository(
      { lacreId: dados.lacreId, caixaId: caixa.id, empresaId: caixa.empresaId },
      tx
    );
    if (!lacreSelecionado) throw new Error("Lacre de retorno / sangria indisponivel para este caixa");

    // B2 x D1: a idempotencia tem de ser resolvida ANTES do teto, e este e o caso que prova por que.
    // Saldo 100, entrega de 100 com a chave K: o primeiro POST zera o caixa. O retry da MESMA chave
    // volta e encontra saldo 0 â€” se o teto rodasse primeiro, o retry morreria com "Caixa sem saldo",
    // o operador acharia que a entrega falhou e lancaria de novo. Duas entregas, um envelope.
    const jaRegistrada = await buscarTransferenciaPorIdempotenciaRepository(
      caixa.empresaId,
      dados.idempotenciaChave,
      tx
    );
    if (jaRegistrada) {
      if (lacreSelecionado.transferenciaId !== jaRegistrada.id) {
        throw new Error("Lacre de retorno / sangria ja utilizado em outro movimento");
      }
      conferirIntencaoEntrega(jaRegistrada, {
        caixaId: caixa.id,
        tipo: "retorno",
        valorCentavos,
        valorEspecieCentavos: paraCentavos(dados.valorEspecie),
        valorMoedasCentavos: paraCentavos(dados.valorMoedas),
        lacre: lacreSelecionado.numero,
        observacao: dados.observacao?.trim() || null,
        responsavelNome: dados.responsavelNome?.trim() || null
      });
      return statusDoCaixaAberto(caixa, tx);
    }
    if (lacreSelecionado.transferenciaId || lacreSelecionado.rompido) {
      throw new Error("Lacre de retorno / sangria ja utilizado");
    }

    // Decisao 7: entrega avulsa tambem entrega dinheiro â€” sem quem conferir, nao sai.
    await exigirConfirmadorDoCofre(caixa.empresaId, perfil.usuarioId, tx);

    // D1: Transferencia de retorno parcial e permitida, mas NUNCA acima do que existe em especie. Sem este
    // teto, dois cliques levavam o saldo a negativo e o fechamento gravava quebra falsa no nome do
    // operador. Recalculado aqui dentro, sob a trava â€” o saldo que a tela viu nao serve de prova.
    const saldoDisponivelCentavos = saldoFisicoCaixaCentavos(await calcularTotaisCaixaCentavos(caixa, tx));
    if (saldoDisponivelCentavos <= 0) {
      throw new Error("Caixa sem saldo em especie para enviar ao cofre");
    }
    const totalPlanejadoCentavos = (await listarPlanejamentosRetornoRepository(caixa.id, tx)).reduce(
      (total, planejamento) => total + paraCentavos(planejamento.valorOriginal),
      0
    );
    const saldoLivreCentavos = Math.max(0, saldoDisponivelCentavos - totalPlanejadoCentavos);
    if (saldoLivreCentavos <= 0) {
      throw new Error("Saldo disponivel reservado para transferencias de retorno planejadas");
    }
    if (valorCentavos > saldoLivreCentavos) {
      throw new Error(
        `Valor acima do saldo livre do caixa: disponivel R$ ${deCentavos(saldoLivreCentavos).toFixed(2)} apos reservar os retornos planejados`
      );
    }

    const responsavelNome = caixa.caixaResponsavelNomeAbertura?.trim();
    if (!responsavelNome) throw new Error("Caixa aberto sem responsavel declarado para a sangria");

    await registrarEntregaAoCofre(
      {
        caixa,
        valorCentavos,
        valorEspecieCentavos: paraCentavos(dados.valorEspecie),
        valorMoedasCentavos: paraCentavos(dados.valorMoedas),
        lacre: lacreSelecionado.numero,
        lacreReservado: {
          id: lacreSelecionado.id,
          transferenciaDistribuicaoId: lacreSelecionado.transferenciaDistribuicaoId
        },
        observacao: dados.observacao ?? null,
        // O responsavel da sangria e quem abriu este caixa. O cliente pode exibir o nome, mas nao
        // pode troca-lo no payload para deslocar a autoria da entrega.
        responsavelNome,
        criadoPor: perfil.usuarioId,
        idempotenciaChave: dados.idempotenciaChave
      },
      tx
    );

    const atualizado = await buscarCaixaPorIdRepository(caixa.id, tx);
    if (!atualizado) throw new Error("Caixa nao encontrado");
    return statusDoCaixaAberto(atualizado, tx);
  });
}

// R-179/Fatia 3 Â· aqui viviam `programarSolicitacaoCofre`, `executarSolicitacaoCofre`,
// `cancelarSolicitacaoCofre`, `listarSolicitacoesCofre` e `listarCaixasAbertos` â€” o fluxo D4
// "Programar entrega ao cofre". A retaguarda programava uma ordem `agendada` e o operador a
// executava; era um SEGUNDO caminho para o mesmo ato de `criarTransferenciaCofreCaixa`, com a mesma
// entidade e as mesmas contas. Removido inteiro, junto com as rotas â€” nao escondido atras de
// permissao. A entrega ao cofre acontece dentro do turno, por quem tem a gaveta.

// R-185: a programacao ja nasceu com a ida; a execucao muda a MESMA linha para pendente e usa o
// lacre reservado. Portanto nao existe segundo POST financeiro, nem possibilidade de duplicar saldo.
export async function listarPlanejamentosRetorno(
  caixaId: string,
  perfil: PerfilUsuario
): Promise<PlanejamentoRetorno[]> {
  const caixa = await buscarCaixaPorIdRepository(caixaId);
  if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
  if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
  return serializarPlanejamentos(await listarPlanejamentosRetornoRepository(caixaId));
}

export async function executarPlanejamentoRetorno(
  caixaId: string,
  planejamentoId: string,
  perfil: PerfilUsuario
): Promise<CaixaStatus> {
  return executarEmTransacao(async (tx) => {
    if (!(await travarCaixaRepository(caixaId, tx))) throw new Error("Caixa nao encontrado");
    const caixa = await buscarCaixaPorIdRepository(caixaId, tx);
    if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
    if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
    if (caixa.status !== "aberto" || !caixa.pdvContaId) throw new Error("Caixa ja fechado");
    const planejamento = await buscarPlanejamentoRetornoRepository(planejamentoId, caixaId, tx);
    if (!planejamento) throw new Error("Planejamento nao encontrado");
    if (planejamento.status === "cancelada") {
      throw new ErroDominio("Planejamento cancelado nao pode ser executado", 409, "PLANEJAMENTO_CANCELADO");
    }
    if (planejamento.status !== "agendada") return statusDoCaixaAberto(caixa, tx);
    const saldoDisponivel = saldoFisicoCaixaCentavos(await calcularTotaisCaixaCentavos(caixa, tx));
    if (planejamento.valorCentavos > saldoDisponivel) {
      throw new Error(
        `Saldo insuficiente para executar o planejamento: programado R$ ${deCentavos(planejamento.valorCentavos).toFixed(2)}, disponivel R$ ${deCentavos(saldoDisponivel).toFixed(2)}`
      );
    }
    await exigirConfirmadorDaConta(
      planejamento.contaDestinoId,
      caixa.empresaId,
      [perfil.usuarioId, ...(planejamento.criadoPor ? [planejamento.criadoPor] : [])],
      tx
    );
    const ordem = await proximaOrdemTransferenciaRepository(caixa.id, planejamento.tipo, tx);
    const agora = new Date();
    const executada = await executarPlanejamentoRetornoRepository(
      {
        planejamentoId,
        caixaId,
        ordem,
        dataTransferencia: diaNegocio(agora),
        prazoConfirmacaoEm: null,
        executadoPor: perfil.usuarioId,
        agora
      },
      tx
    );
    if (!executada)
      throw new ErroDominio("Planejamento alterado por outro usuario neste instante", 409, "PLANEJAMENTO_CONFLITO");
    const atualizado = await buscarCaixaPorIdRepository(caixa.id, tx);
    if (!atualizado) throw new Error("Caixa nao encontrado");
    return statusDoCaixaAberto(atualizado, tx);
  });
}

export async function cancelarPlanejamentoRetorno(
  planejamentoId: string,
  dados: CancelarPlanejamentoRetornoPayload,
  perfil: PerfilUsuario
): Promise<{ id: string; status: "cancelada" }> {
  return executarEmTransacao(async (tx) => {
    if (!podeLancarSemCaixa(perfil)) {
      throw new ErroDominio("Cancelar planejamento e exclusivo da retaguarda", 403, "PLANEJAMENTO_SEM_PERMISSAO");
    }
    const planejamento = await buscarPlanejamentoRetornoPorIdRepository(planejamentoId, tx);
    if (!planejamento) throw new Error("Planejamento nao encontrado");
    if (!podeAcessarEmpresa(perfil, planejamento.empresaId)) throw new Error("Planejamento nao encontrado");
    if (planejamento.status === "cancelada") return { id: planejamento.id, status: "cancelada" };
    if (planejamento.status !== "agendada") {
      throw new ErroDominio("Planejamento ja executado nao pode ser cancelado", 409, "PLANEJAMENTO_EXECUTADO");
    }
    const cancelada = await cancelarPlanejamentoRetornoRepository(
      { planejamentoId, canceladoPor: perfil.usuarioId, motivo: dados.motivo.trim() },
      tx
    );
    if (!cancelada)
      throw new ErroDominio("Planejamento alterado por outro usuario neste instante", 409, "PLANEJAMENTO_CONFLITO");
    return { id: planejamento.id, status: "cancelada" };
  });
}

// M2 (consultas, item 4): a "aba TRANSFERENCIAS" por caixa+dia â€” os movimentos com ordem 1a/2a/3a/4a
// e os totais na OTICA DO COFRE: SAIDA = cofre->caixa (abertura/suprimento); ENTRADA = caixa->cofre
// (sangria/retorno); SALDO = ENTRADA - SAIDA (o que o caixa devolveu alem do fundo emprestado).
export async function obterTransferenciasCaixa(
  caixaId: string,
  perfil: PerfilUsuario
): Promise<TransferenciasCaixaResponse> {
  const caixa = await buscarCaixaPorIdRepository(caixaId);
  if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
  if (!caixa.pdvContaId) throw new Error("Caixa operacional invalido");
  const linhas = await listarTransferenciasCaixaRepository(caixaId);

  let totalSaidaCentavos = 0; // cofre -> caixa (abertura/suprimento)
  let totalEntradaCentavos = 0; // caixa -> cofre (sangria/retorno)
  let ordemSaida = 0;
  let ordemEntrada = 0;
  const itens = linhas.map((linha) => {
    const valorCentavos = paraCentavos(linha.valorOriginal);
    const sentido = linha.contaDestinoId === caixa.pdvContaId ? ("saida" as const) : ("entrada" as const);
    // Ordinal 1a/2a/3a por sentido, cronologico (independe do ordem gravado â€” abertura nao tem).
    const ordem = sentido === "saida" ? ++ordemSaida : ++ordemEntrada;
    if (sentido === "saida") totalSaidaCentavos += valorCentavos;
    else totalEntradaCentavos += valorCentavos;
    return {
      id: linha.id,
      tipo: z.enum(["abertura", "suprimento", "sangria", "retorno"]).parse(linha.tipo),
      ordem,
      valor: deCentavos(valorCentavos),
      valorEspecie: linha.valorEspecieDeclarado === null ? null : deCentavos(paraCentavos(linha.valorEspecieDeclarado)),
      valorMoedas: linha.valorMoedasDeclarado === null ? null : deCentavos(paraCentavos(linha.valorMoedasDeclarado)),
      sentido,
      lacre: linha.lacreNumero,
      dataTransferencia: linha.dataTransferencia
    };
  });

  return {
    itens,
    totalSaida: deCentavos(totalSaidaCentavos),
    totalEntrada: deCentavos(totalEntradaCentavos),
    saldo: deCentavos(totalEntradaCentavos - totalSaidaCentavos)
  };
}

export async function listarHistoricoCaixa(
  query: HistoricoCaixaQuery,
  perfil: PerfilUsuario
): Promise<ResultadoPaginado<LinhaHistoricoCaixa> & { totais: TotaisHistoricoCaixa }> {
  if (!podeAcessarEmpresa(perfil, query.empresaId)) throw new Error("Empresa nao permitida");
  if (query.dataInicio && query.dataFim && query.dataInicio > query.dataFim) {
    throw new Error("Data inicial nao pode ser maior que a final");
  }

  const filtros = filtrosDoHistorico(query);
  const { itens, total } = await listarHistoricoCaixaRepository(filtros, query.page, query.pageSize);
  // Totais do filtro inteiro (rodape) e o flag de acerto so das linhas da pagina. Os fechados
  // continuam sendo o snapshot persistido; o aberto recebe o MESMO calculo operacional que o
  // proprio Caixa ja exibe, sem gravar nada antes do fechamento.
  const [totais, ajustes, alterados, caixasAbertos] = await Promise.all([
    totaisHistoricoCaixaRepository(filtros),
    caixasComAjusteRepository(itens.map((caixa) => caixa.id)),
    caixasAlteradosPosFechamentoRepository(itens.map((caixa) => caixa.id)),
    listarCaixasAbertosHistoricoRepository(filtros)
  ]);
  const totaisAbertos = new Map(
    (
      await Promise.all(
        caixasAbertos.map(async (caixa) => {
          if (!caixa.pdvContaId) return null;
          return [
            caixa.id,
            totaisHistoricoAoVivo(await calcularTotaisCaixaOperacionalRepository(caixa.id, caixa.pdvContaId))
          ] as const;
        })
      )
    ).filter((item): item is readonly [string, TotaisHistoricoAoVivo] => item !== null)
  );
  const comAjuste = new Set(ajustes.map((ajuste) => ajuste.caixaId));
  const alteradoPosFechamento = new Set(alterados.map((alteracao) => alteracao.caixaId));

  return {
    itens: itens.map((caixa) => {
      const aoVivo = totaisAbertos.get(caixa.id);
      // `pdvContaId` e somente insumo interno do calculo ao vivo; o contrato do historico nunca
      // expoe a conta do PDV junto de uma linha de caixa.
      const { pdvContaId: _pdvContaId, ...caixaPublico } = caixa;
      return {
        ...caixaPublico,
        dataHoraAbertura: serializarData(caixa.dataHoraAbertura),
        dataHoraFechamento: serializarData(caixa.dataHoraFechamento),
        fechamentoIniciadoEm: serializarData(caixa.fechamentoIniciadoEm),
        fechadoPor: caixa.fechadoPor,
        fechadoPorNome: caixa.fechadoPorNome,
        totalEntradas: aoVivo?.totalEntradas ?? numero(caixa.totalEntradas),
        totalTransferencias: aoVivo?.totalTransferencias ?? numero(caixa.totalTransferencias),
        totalTransferenciasEntrada: aoVivo?.totalTransferenciasEntrada ?? numero(caixa.totalTransferenciasEntrada),
        totalTransferenciasSaida: aoVivo?.totalTransferenciasSaida ?? numero(caixa.totalTransferenciasSaida),
        totalDespesas: aoVivo?.totalDespesas ?? numero(caixa.totalDespesas),
        totalRetiradas: aoVivo?.totalRetiradas ?? numero(caixa.totalRetiradas),
        totalMercadorias: aoVivo?.totalMercadorias ?? numero(caixa.totalMercadorias),
        saldo: aoVivo?.saldo ?? numero(caixa.saldo),
        status: statusCaixaSchema.parse(caixa.status),
        temAjuste: comAjuste.has(caixa.id),
        alteradoAposFechamento: alteradoPosFechamento.has(caixa.id)
      };
    }),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totais: {
      totalEntradas: numero(totais?.totalEntradas) + somarTotaisAoVivo(totaisAbertos, "totalEntradas"),
      totalTransferenciasEntrada:
        numero(totais?.totalTransferenciasEntrada) + somarTotaisAoVivo(totaisAbertos, "totalTransferenciasEntrada"),
      totalTransferenciasSaida:
        numero(totais?.totalTransferenciasSaida) + somarTotaisAoVivo(totaisAbertos, "totalTransferenciasSaida"),
      totalDespesas: numero(totais?.totalDespesas) + somarTotaisAoVivo(totaisAbertos, "totalDespesas"),
      totalRetiradas: numero(totais?.totalRetiradas) + somarTotaisAoVivo(totaisAbertos, "totalRetiradas"),
      totalMercadorias: numero(totais?.totalMercadorias) + somarTotaisAoVivo(totaisAbertos, "totalMercadorias"),
      saldo: numero(totais?.saldo) + somarTotaisAoVivo(totaisAbertos, "saldo"),
      caixas: totais?.caixas ?? 0
    }
  };
}

type TotaisHistoricoAoVivo = Pick<
  LinhaHistoricoCaixa,
  | "totalEntradas"
  | "totalTransferencias"
  | "totalTransferenciasEntrada"
  | "totalTransferenciasSaida"
  | "totalDespesas"
  | "totalRetiradas"
  | "totalMercadorias"
  | "saldo"
>;

// Projecao do mesmo acumulador em centavos usado pelo Caixa aberto para a forma da linha do
// historico. A transferencia total do snapshot e liquida (entrada - saida), igual ao fechamento.
function totaisHistoricoAoVivo(totais: TotaisCaixaCentavos): TotaisHistoricoAoVivo {
  return {
    totalEntradas: deCentavos(totais.entradas),
    totalTransferencias: deCentavos(totais.transferenciasEntrada - totais.transferenciasSaida),
    totalTransferenciasEntrada: deCentavos(totais.transferenciasEntrada),
    totalTransferenciasSaida: deCentavos(totais.transferenciasSaida),
    totalDespesas: deCentavos(totais.despesas),
    totalRetiradas: deCentavos(totais.retiradas),
    totalMercadorias: deCentavos(totais.mercadorias),
    saldo: deCentavos(saldoFisicoCaixaCentavos(totais))
  };
}

function somarTotaisAoVivo(
  totais: ReadonlyMap<string, TotaisHistoricoAoVivo>,
  campo: Exclude<keyof TotaisHistoricoAoVivo, "totalTransferencias">
) {
  return [...totais.values()].reduce((soma, caixa) => soma + caixa[campo], 0);
}

// Query (wire) -> filtros do repositorio: so o que veio preenchido vira condicao.
function filtrosDoHistorico(query: HistoricoCaixaQuery): FiltrosHistoricoCaixa {
  return {
    empresaId: query.empresaId,
    ...(query.dataInicio ? { dataInicio: query.dataInicio } : {}),
    ...(query.dataFim ? { dataFim: query.dataFim } : {}),
    ...(query.pdvId ? { pdvId: query.pdvId } : {}),
    ...(query.usuarioCaixaId ? { usuarioCaixaId: query.usuarioCaixaId } : {}),
    ...(query.colaboradorId ? { colaboradorId: query.colaboradorId } : {}),
    ...(query.turnoId ? { turnoId: query.turnoId } : {}),
    ...(query.status ? { status: query.status } : {})
  };
}

// Detalhe de auditoria de um caixa: alteracoes de horario + acerto de saldo (se houve).
// Os lancamentos NAO vem daqui â€” a tela reusa as listagens existentes filtradas por caixaId.
export async function obterDetalheCaixa(caixaId: string, perfil: PerfilUsuario): Promise<DetalheCaixaResponse> {
  const caixa = await buscarCaixaPorIdRepository(caixaId);
  if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
  if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");

  const [edicoes, ajuste, lancamentos, alteracoesPosFechamento, vendasCanceladas] = await Promise.all([
    listarEdicoesCaixaRepository(caixaId),
    buscarAjusteCaixaRepository(caixaId),
    listarLancamentosCaixaRepository(caixaId),
    listarAlteracoesPosFechamentoRepository(caixaId),
    listarVendasCanceladasCaixaRepository(caixaId)
  ]);

  return {
    lancamentos: montarLancamentosPorCategoria(lancamentos, caixa.pdvContaId),
    vendasCanceladas: serializarVendasCanceladas(vendasCanceladas),
    alteracoesPosFechamento: alteracoesPosFechamento.map((alteracao) => ({
      id: alteracao.id,
      vendaId: alteracao.vendaId,
      identificadorExterno: alteracao.identificadorExterno,
      descricao: alteracao.descricao,
      valor: numero(alteracao.valor),
      dataVenda: serializarData(alteracao.dataVenda),
      alteradoEm: serializarData(alteracao.alteradoEm) ?? ""
    })),
    edicoes: edicoes.map((edicao) => ({
      id: edicao.id,
      editadoPor: edicao.editadoPor,
      editadoPorNome: edicao.editadoPorNome,
      autorizadorId: edicao.autorizadorId,
      autorizadorNome: edicao.autorizadorNome,
      observacao: edicao.observacao,
      editadoEm: serializarData(edicao.editadoEm) ?? "",
      // tokenUsado e segredo: sai so como "foi por token?" â€” o valor nunca vai para o cliente.
      porToken: Boolean(edicao.tokenUsado),
      valoresAntigos: horariosAuditados(edicao.valoresAntigos),
      valoresNovos: horariosAuditados(edicao.valoresNovos)
    })),
    ajuste: ajuste
      ? {
          id: ajuste.id,
          valorDiferenca: numero(ajuste.valorDiferenca),
          despesaId: ajuste.despesaId,
          criadoEm: serializarData(ajuste.criadoEm) ?? "",
          colaboradorId: ajuste.colaboradorId,
          colaboradorNome: ajuste.colaboradorNome,
          observacao: ajuste.observacao
        }
      : null
  };
}

// Rota operacional do proprio caixa: a lista e leitura de auditoria, mas nao transforma o
// operador em gerente de historico. Ele so pode consultar o caixa ao qual esta vinculado; gerencia
// continua podendo consultar qualquer caixa permitido da empresa.
export async function listarVendasCanceladasCaixa(
  caixaId: string,
  perfil: PerfilUsuario
): Promise<VendaCanceladaCaixa[]> {
  const caixa = await buscarCaixaPorIdRepository(caixaId);
  if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
  if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
  return serializarVendasCanceladas(await listarVendasCanceladasCaixaRepository(caixaId));
}

function serializarRelatorioVendasFechamento(relatorio: {
  periodoInicio: Date;
  periodoFim: Date;
  dados: DadosExternos;
  geradoEm: Date;
}) {
  return {
    periodoInicio: relatorio.periodoInicio.toISOString(),
    periodoFim: relatorio.periodoFim.toISOString(),
    dados: relatorio.dados,
    geradoEm: relatorio.geradoEm.toISOString()
  };
}

export async function obterRelatorioVendasFechamento(caixaId: string, perfil: PerfilUsuario) {
  const caixa = await buscarCaixaPorIdRepository(caixaId);
  if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
  if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
  const relatorio = await buscarRelatorioVendasFechamentoRepository(caixa.id, caixa.empresaId);
  return relatorio ? serializarRelatorioVendasFechamento(relatorio) : null;
}

export async function gerarRelatorioVendasFechamento(
  caixaId: string,
  leituraCreare: GerarRelatorioVendasFechamento,
  perfil: PerfilUsuario
) {
  const caixa = await buscarCaixaPorIdRepository(caixaId);
  if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
  if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
  if (caixa.status !== "em_fechamento") {
    throw new ErroDominio(
      "Inicie o fechamento para gerar o relatorio do turno encerrado.",
      409,
      "RELATORIO_FORA_DO_CORTE"
    );
  }

  // A hora limite e gravada pelo servidor antes desta etapa. Regerar atualiza somente o retrato
  // de leitura; nenhuma venda posterior consegue entrar no periodo encerrado.
  // O fechamento guarda o consolidado, e não replica potencialmente milhares de cupons no JSON.
  // A consulta usa o corte gravado do Caixa; a linha desta página existe porque a função compartilhada
  // também devolve uma página, enquanto `totais` cobre integralmente o período.
  const primeiraPagina = await listarVendasDoCaixaAberto(caixa.id, { page: 1, pageSize: 1 }, perfil);
  const canceladas = await listarVendasCanceladasCaixa(caixa.id, perfil);
  const relatorio = await executarEmTransacao(async (tx) => {
    if (!(await travarCaixaRepository(caixa.id, tx))) throw new Error("Caixa nao encontrado");
    const travado = await buscarCaixaPorIdRepository(caixa.id, tx);
    if (!travado || travado.status !== "em_fechamento") {
      throw new ErroDominio(
        "O fechamento nao esta mais disponivel para gerar o relatorio.",
        409,
        "RELATORIO_FORA_DO_CORTE"
      );
    }
    if (!travado.dataHoraAbertura) throw new Error("Caixa sem horario de abertura");
    const anexo = await buscarAnexoFechamentoCaixaRepository(travado.id, leituraCreare.anexoId, travado.empresaId, tx);
    if (!anexo || anexo.tipo !== "relatorio_vendas_creare") {
      throw new ErroDominio("O relatório informado não pertence a este caixa.", 409, "RELATORIO_CREARE_INVALIDO");
    }
    const totaisOperacionais = await calcularTotaisCaixaCentavos(travado, tx);
    const saidasSemSangria = deCentavos(
      totaisOperacionais.despesas + totaisOperacionais.mercadorias + totaisOperacionais.retiradas
    );
    const leitura = leituraCreare.leituraCreare;
    const comparar = (creare: number | null, pralis: number) =>
      creare === null ? "pendente" : paraCentavos(creare) === paraCentavos(pralis) ? "ok" : "divergente";
    const porCategoria = (categoria: string) =>
      primeiraPagina.totais.porFormaPagamento
        .filter((item) => item.categoriaFechamentoCaixa === categoria)
        .reduce((soma, item) => soma + item.total, 0);
    const comparacaoCreare = {
      totalBruto: comparar(leitura.totalBruto, primeiraPagina.totais.totalGeral),
      dinheiro: comparar(leitura.dinheiro, porCategoria("dinheiro")),
      credito: comparar(leitura.credito, porCategoria("credito")),
      debito: comparar(leitura.debito, porCategoria("debito")),
      pix: comparar(leitura.pix, porCategoria("pix")),
      voucher: comparar(leitura.voucher, porCategoria("voucher")),
      despesasExcetoSangria: comparar(leitura.despesasExcetoSangria, saidasSemSangria),
      resultadoFinal: comparar(leitura.resultadoFinal, primeiraPagina.totais.totalGeral - saidasSemSangria)
    };
    return salvarRelatorioVendasFechamentoRepository(
      {
        fechamentoCaixaId: travado.id,
        empresaId: travado.empresaId,
        periodoInicio: new Date(travado.dataHoraAbertura),
        periodoFim: new Date(travado.dataHoraFechamento ?? new Date()),
        dados: {
          versao: 3,
          vendas: {
            quantidade: primeiraPagina.totais.quantidade,
            totalGeral: primeiraPagina.totais.totalGeral,
            porFormaPagamento: primeiraPagina.totais.porFormaPagamento
          },
          canceladas,
          creare: { anexoId: leituraCreare.anexoId, leitura, comparacao: comparacaoCreare, saidasSemSangria }
        },
        geradoPor: perfil.usuarioId
      },
      tx
    );
  });
  return serializarRelatorioVendasFechamento(relatorio);
}

/**
 * Consulta de conferencia do proprio turno. Diferente do relatorio de vendas, ela nunca aceita
 * escopo do navegador: caixa, empresa e PDV sao lidos do caixa do path. O operador ganha apenas
 * a leitura do caixa que abriu; `caixas_gerenciar` conserva a mesma excecao de auditoria das
 * demais rotas de Caixa. Durante `em_fechamento`, a mesma consulta vira o relatorio unico do
 * periodo congelado: a ultima venda e limitada pelo corte gravado no servidor, nunca por agora
 * nem por data informada pelo navegador.
 */
export async function listarVendasDoCaixaAberto(caixaId: string, filtros: VendasDoCaixaQuery, perfil: PerfilUsuario) {
  const caixa = await buscarCaixaPorIdRepository(caixaId);
  if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
  if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
  if (caixa.status !== "aberto" && caixa.status !== "em_fechamento") {
    throw new Error("Consulta disponivel apenas para caixa aberto ou em fechamento");
  }
  if (!caixa.dataHoraAbertura || !caixa.pdvId) throw new Error("Caixa sem dados operacionais de abertura");

  // `caixa_id` ja e o vinculo operacional atomico. Assim vendas manuais sem `data_venda` continuam
  // visiveis sem filtro de horario. Quando o operador pede hora, elas ficam fora da busca porque
  // nao existe um instante real para comparar; o dialogo explica isso antes da lista.
  const dataHoraAbertura = new Date(caixa.dataHoraAbertura);
  const limiteOperacional = caixa.dataHoraFechamento ? new Date(caixa.dataHoraFechamento) : new Date();
  const inicioSolicitado = filtros.dataHoraInicio ? new Date(filtros.dataHoraInicio) : null;
  const fimSolicitado = filtros.dataHoraFim ? new Date(filtros.dataHoraFim) : null;
  const inicio = inicioSolicitado && inicioSolicitado > dataHoraAbertura ? inicioSolicitado : dataHoraAbertura;
  const fim = fimSolicitado && fimSolicitado < limiteOperacional ? fimSolicitado : limiteOperacional;
  const temFiltroHorario = Boolean(inicioSolicitado || fimSolicitado);

  const query = {
    page: filtros.page,
    pageSize: filtros.pageSize,
    produto: filtros.produto,
    formaPagamentoId: filtros.formaPagamentoId,
    caixaId: caixa.id,
    empresaId: caixa.empresaId,
    pdvId: caixa.pdvId,
    // Canceladas ja tem a consulta de auditoria propria na tela do Caixa e nao compoem saldo.
    status: "aprovado",
    ordem: "asc" as const,
    ...(temFiltroHorario && inicio <= fim
      ? { dataHoraInicio: inicio.toISOString(), dataHoraFim: fim.toISOString() }
      : {})
  };

  // Nao deixa um intervalo invertido escapar como consulta ampla (ex.: fim anterior a abertura).
  if (temFiltroHorario && inicio > fim) {
    return {
      resultado: { itens: [], total: 0, page: filtros.page, pageSize: filtros.pageSize },
      totais: { totalGeral: 0, quantidade: 0, porFormaPagamento: [] },
      abertura: dataHoraAbertura.toISOString(),
      limiteSuperior: limiteOperacional.toISOString(),
      manuaisSemHorarioForaDoFiltro: true
    };
  }

  const empresas = [caixa.empresaId];
  const [resultado, totais] = await Promise.all([
    listarVendasPaginadas(query, empresas),
    totaisVendas(query, empresas)
  ]);
  return {
    resultado,
    totais,
    abertura: dataHoraAbertura.toISOString(),
    limiteSuperior: limiteOperacional.toISOString(),
    manuaisSemHorarioForaDoFiltro: temFiltroHorario
  };
}

function serializarVendasCanceladas(vendasCanceladas: VendaCanceladaCaixaLinha[]): VendaCanceladaCaixa[] {
  return vendasCanceladas.map((venda) => ({
    id: venda.id,
    identificadorExterno: venda.identificadorExterno,
    descricao: venda.descricao,
    data: venda.data,
    dataHora: serializarData(venda.dataHora),
    valor: deCentavos(liquidoCentavos(venda)),
    canceladoPor: venda.cancelamentoAutorizadoPorAutomacao,
    justificativaCancelamento: venda.cancelamentoJustificativa,
    motivoCancelamento: venda.cancelamentoMotivo,
    pagamentos: venda.pagamentos.map((pagamento) => ({
      id: pagamento.id,
      formaPagamento: pagamento.formaPagamento ?? pagamento.tipoPagamentoAutomacao ?? "Forma não informada pelo CREARE",
      valor: numero(pagamento.valor)
    })),
    produtos: venda.produtos.map((produto) => ({
      id: produto.id,
      descricao: produto.descricao,
      quantidade: numero(produto.quantidade),
      valorUnitario: numero(produto.valorUnitario),
      valorTotal: numero(produto.valorTotal),
      cancelado: produto.cancelado
    }))
  }));
}

// Agrupa por categoria, na mesma ordem em que a tela do caixa apresenta os totais.
function montarLancamentosPorCategoria(
  lancamentos: Awaited<ReturnType<typeof listarLancamentosCaixaRepository>>,
  pdvContaId: string | null
): CategoriaLancamentosCaixa[] {
  // Categorias sem hora real: so despesa/retirada/mercadoria/transferencia, que tem apenas a data
  // contabil. Venda tem data_venda e passa pelo mapa proprio abaixo.
  const simples = (itens: { id: string; descricao: string | null; data: string | null; valor: string | null }[]) =>
    itens.map((item) => ({
      id: item.id,
      descricao: item.descricao,
      data: item.data,
      dataHora: null,
      valor: numero(item.valor),
      sentido: null
    }));

  // Venda entra pelo LIQUIDO (valor_original e o subtotal): assim a soma do grupo bate com a
  // coluna Entradas da linha, que tambem soma liquido.
  const entradas = lancamentos.linhasVendas.map((item) => ({
    id: item.id,
    descricao: item.descricao,
    data: item.data,
    dataHora: serializarData(item.dataHora),
    valor: deCentavos(liquidoCentavos({ valorOriginal: item.valor, ...item })),
    sentido: null
  }));

  const somar = (itens: { valor: number }[]) => itens.reduce((soma, item) => soma + paraCentavos(item.valor), 0);

  // Mesma regra de calcularTotaisCaixaOperacionalRepository: entrada quando o dinheiro CAI na conta
  // do PDV, saida quando SAI dela â€” testes independentes. Uma transferencia entre duas contas que
  // nao sao a do PDV nao e nem uma nem outra (nao entra em nenhum dos dois totais); marcar como
  // "saida" faria o detalhe contradizer as colunas.
  const transferencias = lancamentos.linhasTransferencias.map((item) => ({
    id: item.id,
    descricao: item.descricao,
    data: item.data,
    dataHora: null,
    valor: numero(item.valor),
    sentido:
      item.contaDestinoId === pdvContaId
        ? ("entrada" as const)
        : item.contaOrigemId === pdvContaId
          ? ("saida" as const)
          : null
  }));

  // total_transferencias persistido e o LIQUIDO (entrada - saida); o total da categoria segue o
  // mesmo criterio, senao a soma do grupo nao bate com a coluna da linha.
  const liquidoTransferencias =
    somar(transferencias.filter((item) => item.sentido === "entrada")) -
    somar(transferencias.filter((item) => item.sentido === "saida"));

  const despesas = simples(lancamentos.linhasDespesas);
  const retiradas = simples(lancamentos.linhasRetiradas);
  const mercadorias = simples(lancamentos.linhasMercadorias);

  return [
    { categoria: "entradas", titulo: "Entradas", itens: entradas, total: deCentavos(somar(entradas)) },
    {
      categoria: "transferencias",
      titulo: "Transferencias (liquido)",
      itens: transferencias,
      total: deCentavos(liquidoTransferencias)
    },
    { categoria: "despesas", titulo: "Despesas", itens: despesas, total: deCentavos(somar(despesas)) },
    { categoria: "retiradas", titulo: "Retiradas", itens: retiradas, total: deCentavos(somar(retiradas)) },
    { categoria: "mercadorias", titulo: "Mercadorias", itens: mercadorias, total: deCentavos(somar(mercadorias)) }
  ];
}

// valores_antigos/novos sao jsonb livre: le so os horarios, tolerando registro antigo sem o campo.
function horariosAuditados(valores: DadosExternos) {
  const dados = z
    .object({
      dataHoraAbertura: z.union([z.string(), z.date()]).nullish(),
      dataHoraFechamento: z.union([z.string(), z.date()]).nullish()
    })
    .safeParse(valores);
  return {
    dataHoraAbertura: dados.success ? serializarData(dados.data.dataHoraAbertura ?? null) : null,
    dataHoraFechamento: dados.success ? serializarData(dados.data.dataHoraFechamento ?? null) : null
  };
}

// P0 lancamento x fechamento â€” a PORTA UNICA do caixa do ator, agora com o contrato de lock:
// resolver -> travar FOR SHARE -> revalidar o status POS-lock. O SELECT resolve o id sem lock
// (tem joins); a trava e por PK; e o status decisivo e o do locked-read, nunca o do retrato
// anterior. Se o caixa fechou no meio da corrida, o chamador recebe o MESMO desfecho de sempre â€”
// nada de comportamento novo fora da janela.
//
// `TransacaoBanco` obrigatorio: todo caminho de escrita ja roda em `executarEmTransacao`; um
// FOR SHARE fora de transacao evaporaria na instrucao seguinte.

/** Retaguarda (caixa opcional): devolve o caixa aberto TRAVADO, ou quem fechou durante a corrida. */
export async function travarCaixaAbertoDoAtor(
  empresaId: string,
  usuarioId: string,
  tx: TransacaoBanco
): Promise<{
  caixa: Awaited<ReturnType<typeof buscarCaixaAbertoUsuarioRepository>>;
  caixaFechadoNaCorrida: Awaited<ReturnType<typeof buscarCaixaAbertoUsuarioRepository>>;
}> {
  const caixa = await buscarCaixaAbertoUsuarioRepository(empresaId, usuarioId, tx);
  if (!caixa) return { caixa: null, caixaFechadoNaCorrida: null };
  const trava = await travarCaixaCompartilhadoRepository(caixa.id, tx);
  if (trava?.status === "aberto") return { caixa, caixaFechadoNaCorrida: null };
  // Fechou entre o SELECT e o lock (ou a linha sumiu, o que a FK impede): quem decide o desfecho e
  // o chamador â€” Q2 recusa se a conta em uso for a do PDV deste caixa; qualquer outra conta segue
  // como se nao houvesse caixa (A-1/R-032).
  return { caixa: null, caixaFechadoNaCorrida: caixa };
}

// Suprimento criado pela Tesouraria: ela nao tem (nem deve ter) um caixa proprio para que o
// dinheiro entre no PDV. A conta de destino identifica o caixa aberto que recebe o malote. So a
// transferencia direta usa esta resolucao; em multiplo destino a conta vencedora so existe na
// conferencia, e no planejamento o vinculo nasce na abertura pelo lacre.
export async function travarCaixaAbertoDaContaPdv(
  empresaId: string,
  contaId: string,
  tx: TransacaoBanco
): Promise<CaixaLinha | null> {
  const caixas = await listarCaixasAbertosDaContaPdvRepository(empresaId, contaId, tx);
  if (caixas.length > 1) {
    throw new Error("Mais de um caixa aberto usa esta conta de PDV; corrija o cadastro antes de transferir");
  }
  const caixaAberto = caixas[0];
  if (!caixaAberto) return null;

  // A trava compartilha a mesma porta do fechamento. Se ele venceu a corrida, a transferencia
  // continua um movimento entre contas, mas nao e anexada ao turno que ja encerrou.
  const trava = await travarCaixaCompartilhadoRepository(caixaAberto.id, tx);
  if (trava?.status !== "aberto") return null;
  return buscarCaixaPorIdRepository(caixaAberto.id, tx);
}

export async function obterCaixaAbertoParaLancamento(empresaId: string, usuarioId: string, tx: TransacaoBanco) {
  const { caixa } = await travarCaixaAbertoDoAtor(empresaId, usuarioId, tx);
  // Caixa que fechou na corrida = caixa que nao existe mais para o operador: o erro oficial e o
  // MESMO que ele receberia fora da janela (matriz P0, linha "fechamento antes").
  if (!caixa) throw new Error("Abra um caixa antes de registrar este lancamento");
  if (!caixa.pdvId || !caixa.pdvContaId) throw new Error("Caixa operacional invalido");
  return caixa;
}
