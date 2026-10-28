import type { HistoricoCaixaQuery } from "@padaria/shared/caixa";
import { temPermissao, type PerfilUsuario } from "@padaria/shared/autenticacao";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { caminhoAbsolutoDocumento } from "../lancamentos/foto-documento.js";
import {
  buscarAjusteCaixaRepository,
  buscarAnexoFechamentoCaixaRepository,
  buscarCaixaPorIdRepository,
  criarConferenciaTesourariaFechamentoRepository,
  buscarRelatorioMaquininhaFechamentoRepository,
  buscarRelatorioVendasFechamentoRepository,
  buscarResumoFechamentoCaixaRepository,
  listarAnexosFechamentoCaixaRepository,
  listarConferenciasFisicasCaixaRepository,
  listarConferenciasTesourariaFechamentoRepository,
  listarLancamentosCaixaRepository,
  listarQuebrasCaixaRepository,
  listarTransferenciasCaixaRepository,
  listarVendasCanceladasCaixaRepository,
  travarCaixaParaConferenciaTesourariaRepository
} from "../caixa/caixa.repository.js";
import { listarHistoricoCaixa } from "../caixa/caixa.service.js";
import { executarEmTransacao, type ExecutorBanco } from "../banco/conexao.js";

export type SituacaoTesouraria =
  | "aberto"
  | "em_fechamento"
  | "aguardando_tesouraria"
  | "fechado_sem_pendencias"
  | "com_quebra"
  | "conferido_tesouraria"
  | "divergencia_confirmada_tesouraria";

function situacaoDoFechamento(input: {
  status: string;
  temAjuste?: boolean;
  quebras: Array<{ id: string }>;
  transferencias: Array<{ status: string | null }>;
  conferencias: Array<{ resultado: string }>;
  conferenciasTesouraria: Array<{ resultado: "conferido" | "divergente" }>;
}): SituacaoTesouraria {
  const ultimaConferenciaTesouraria = input.conferenciasTesouraria.at(-1);
  if (ultimaConferenciaTesouraria?.resultado === "conferido") return "conferido_tesouraria";
  if (ultimaConferenciaTesouraria?.resultado === "divergente") return "divergencia_confirmada_tesouraria";
  if (
    input.temAjuste ||
    input.quebras.length ||
    input.conferencias.some((item) => item.resultado === "divergente") ||
    input.transferencias.some((item) => item.status === "divergente")
  ) {
    return "com_quebra";
  }
  if (input.status === "aberto") return "aberto";
  if (input.status === "em_fechamento") return "em_fechamento";
  if (input.transferencias.some((item) => item.status === "pendente")) return "aguardando_tesouraria";
  // Nao existe evento persistido de conferencia FINAL do malote pela Tesouraria. Este rotulo
  // descreve somente o que os fatos atuais permitem afirmar; "conferido" exigiria regra nova.
  return "fechado_sem_pendencias";
}

type ResultadoConferenciaTesouraria = "conferido" | "divergente";
type DadosConferenciaTesouraria = { resultado: ResultadoConferenciaTesouraria; observacao?: string | null | undefined };

function iso(valor: Date | string | null | undefined) {
  if (!valor) return null;
  return typeof valor === "string" ? valor : valor.toISOString();
}

function numero(valor: string | number | null | undefined) {
  return valor === null || valor === undefined ? null : Number(valor);
}

async function caixaPermitido(caixaId: string, perfil: PerfilUsuario, db?: ExecutorBanco) {
  const caixa = await buscarCaixaPorIdRepository(caixaId, db);
  if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
  return caixa;
}

export async function listarRelatoriosFechamento(query: HistoricoCaixaQuery, perfil: PerfilUsuario) {
  const historico = await listarHistoricoCaixa(query, perfil);
  const itens = await Promise.all(
    historico.itens.map(async (item) => {
      const [transferencias, conferencias, quebras, conferenciasTesouraria] = await Promise.all([
        listarTransferenciasCaixaRepository(item.id),
        listarConferenciasFisicasCaixaRepository(item.id, item.empresaId),
        listarQuebrasCaixaRepository(item.id, item.empresaId),
        listarConferenciasTesourariaFechamentoRepository(item.id, item.empresaId)
      ]);
      return {
        ...item,
        situacaoTesouraria: situacaoDoFechamento({
          status: item.status,
          temAjuste: item.temAjuste,
          quebras,
          transferencias,
          conferencias,
          conferenciasTesouraria
        })
      };
    })
  );
  return { ...historico, itens };
}

export async function obterDossieFechamento(caixaId: string, perfil: PerfilUsuario) {
  const caixa = await caixaPermitido(caixaId, perfil);
  const [
    resumo,
    transferencias,
    conferencias,
    quebras,
    conferenciasTesouraria,
    relatorioVendas,
    relatorioMaquininha,
    anexos,
    lancamentos,
    vendasCanceladas,
    ajuste
  ] = await Promise.all([
    buscarResumoFechamentoCaixaRepository(caixa.id, caixa.empresaId),
    listarTransferenciasCaixaRepository(caixa.id),
    listarConferenciasFisicasCaixaRepository(caixa.id, caixa.empresaId),
    listarQuebrasCaixaRepository(caixa.id, caixa.empresaId),
    listarConferenciasTesourariaFechamentoRepository(caixa.id, caixa.empresaId),
    buscarRelatorioVendasFechamentoRepository(caixa.id, caixa.empresaId),
    buscarRelatorioMaquininhaFechamentoRepository(caixa.id, caixa.empresaId),
    listarAnexosFechamentoCaixaRepository(caixa.id, caixa.empresaId),
    listarLancamentosCaixaRepository(caixa.id),
    listarVendasCanceladasCaixaRepository(caixa.id),
    buscarAjusteCaixaRepository(caixa.id)
  ]);

  return {
    caixa: {
      ...caixa,
      dataHoraAbertura: iso(caixa.dataHoraAbertura),
      dataHoraFechamento: iso(caixa.dataHoraFechamento),
      fechamentoIniciadoEm: iso(caixa.fechamentoIniciadoEm),
      fechadoEm: iso(caixa.fechadoEm)
    },
    resumo: resumo
      ? {
          ...resumo,
          dataHoraFechamento: iso(resumo.dataHoraFechamento),
          fechadoEm: iso(resumo.fechadoEm),
          valorEspecieFechamento: numero(resumo.valorEspecieFechamento),
          valorMoedasFechamento: numero(resumo.valorMoedasFechamento),
          valorFisicoEsperadoFechamento: numero(resumo.valorFisicoEsperadoFechamento),
          totalEntradas: numero(resumo.totalEntradas),
          totalTransferenciasEntrada: numero(resumo.totalTransferenciasEntrada),
          totalTransferenciasSaida: numero(resumo.totalTransferenciasSaida),
          totalDespesas: numero(resumo.totalDespesas),
          totalRetiradas: numero(resumo.totalRetiradas),
          totalMercadorias: numero(resumo.totalMercadorias),
          saldo: numero(resumo.saldo)
        }
      : null,
    situacaoTesouraria: situacaoDoFechamento({
      status: caixa.status,
      temAjuste: Boolean(ajuste),
      quebras,
      transferencias,
      conferencias,
      conferenciasTesouraria
    }),
    transferencias: transferencias.map((item) => ({
      ...item,
      valorOriginal: numero(item.valorOriginal),
      valorEspecieDeclarado: numero(item.valorEspecieDeclarado),
      valorMoedasDeclarado: numero(item.valorMoedasDeclarado),
      dataTransferencia: iso(item.dataTransferencia)
    })),
    conferencias: conferencias.map((item) => ({
      ...item,
      valorEspecieDeclarado: numero(item.valorEspecieDeclarado),
      valorMoedasDeclarado: numero(item.valorMoedasDeclarado),
      valorEspecieContado: numero(item.valorEspecieContado),
      valorMoedasContado: numero(item.valorMoedasContado),
      conferidoEm: iso(item.conferidoEm)
    })),
    conferenciasTesouraria: conferenciasTesouraria.map((item) => ({ ...item, conferidoEm: iso(item.conferidoEm) })),
    quebras: quebras.map((item) => ({ ...item, valor: numero(item.valor), criadoEm: iso(item.criadoEm) })),
    relatorioVendas: relatorioVendas
      ? {
          ...relatorioVendas,
          periodoInicio: iso(relatorioVendas.periodoInicio),
          periodoFim: iso(relatorioVendas.periodoFim),
          geradoEm: iso(relatorioVendas.geradoEm)
        }
      : null,
    relatorioMaquininha,
    anexos: anexos.map((item) => ({ ...item, criadoEm: iso(item.criadoEm) })),
    lancamentos,
    vendasCanceladas,
    ajuste: ajuste ? { ...ajuste, valorDiferenca: numero(ajuste.valorDiferenca), criadoEm: iso(ajuste.criadoEm) } : null
  };
}

export async function registrarConferenciaTesourariaFechamento(
  caixaId: string,
  dados: DadosConferenciaTesouraria,
  perfil: PerfilUsuario
) {
  if (!temPermissao(perfil.permissoes, "fechamentos_caixa_conferir")) throw new Error("Permissao insuficiente");

  return executarEmTransacao(async (tx) => {
    const caixa = await caixaPermitido(caixaId, perfil, tx);
    const trava = await travarCaixaParaConferenciaTesourariaRepository(caixa.id, caixa.empresaId, tx);
    if (!trava) throw new Error("Caixa nao encontrado");
    if (!["fechado", "ajustado"].includes(trava.status))
      throw new Error("O caixa precisa estar fechado para a Tesouraria conferir");

    const [transferencias, conferenciasFisicas, quebras, ajuste, conferenciasTesouraria] = await Promise.all([
      listarTransferenciasCaixaRepository(caixa.id, tx),
      listarConferenciasFisicasCaixaRepository(caixa.id, caixa.empresaId, tx),
      listarQuebrasCaixaRepository(caixa.id, caixa.empresaId, tx),
      buscarAjusteCaixaRepository(caixa.id, tx),
      listarConferenciasTesourariaFechamentoRepository(caixa.id, caixa.empresaId, tx)
    ]);
    const temPendencia = transferencias.some((item) => item.status === "pendente");
    const temDivergencia = Boolean(
      ajuste ||
      quebras.length ||
      transferencias.some((item) => item.status === "divergente") ||
      conferenciasFisicas.some((item) => item.resultado === "divergente")
    );
    const observacao = dados.observacao?.trim() || null;
    const ultima = conferenciasTesouraria.at(-1);
    // Revisao: a Tesouraria JA decidiu e agora muda a decisao (conferido <-> divergente). Exige motivo nos dois
    // sentidos e nao depende de haver quebra registrada; a decisao anterior fica no historico (so se acrescenta).
    const ehRevisao = Boolean(ultima) && ultima?.resultado !== dados.resultado;

    if (dados.resultado === "conferido") {
      if (temPendencia) throw new Error("Há transferência pendente de conferência pela Tesouraria");
      if (ehRevisao) {
        if (!observacao) throw new Error("Informe o motivo da revisão da conferência");
      } else {
        if (temDivergencia)
          throw new Error("Há divergência registrada; use a conferência com divergência e informe a justificativa");
        if (ultima?.resultado === "conferido") return ultima;
      }
    } else {
      if (!ehRevisao && !temDivergencia) throw new Error("Não há divergência registrada neste caixa para confirmar");
      if (!observacao) throw new Error("Informe a justificativa da conferência com divergência");
      if (
        ultima?.resultado === "divergente" &&
        ultima.observacao === observacao &&
        ultima.conferidoPor === perfil.usuarioId
      )
        return ultima;
    }

    return criarConferenciaTesourariaFechamentoRepository(
      {
        empresaId: caixa.empresaId,
        fechamentoCaixaId: caixa.id,
        resultado: dados.resultado,
        observacao,
        conferidoPor: perfil.usuarioId
      },
      tx
    );
  });
}

export async function obterAnexoDossieFechamento(caixaId: string, anexoId: string, perfil: PerfilUsuario) {
  const caixa = await caixaPermitido(caixaId, perfil);
  const anexo = await buscarAnexoFechamentoCaixaRepository(caixa.id, anexoId, caixa.empresaId);
  if (!anexo) throw new Error("Anexo nao encontrado");
  return { ...anexo, caminhoAbsoluto: caminhoAbsolutoDocumento(anexo.caminho) };
}
