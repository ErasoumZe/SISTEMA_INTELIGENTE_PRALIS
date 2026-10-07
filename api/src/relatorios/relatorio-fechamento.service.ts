import type { HistoricoCaixaQuery } from "@padaria/shared/caixa";
import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { caminhoAbsolutoDocumento } from "../lancamentos/foto-documento.js";
import {
  buscarAjusteCaixaRepository,
  buscarAnexoFechamentoCaixaRepository,
  buscarCaixaPorIdRepository,
  buscarRelatorioMaquininhaFechamentoRepository,
  buscarRelatorioVendasFechamentoRepository,
  buscarResumoFechamentoCaixaRepository,
  listarAnexosFechamentoCaixaRepository,
  listarConferenciasFisicasCaixaRepository,
  listarLancamentosCaixaRepository,
  listarTransferenciasCaixaRepository,
  listarVendasCanceladasCaixaRepository
} from "../caixa/caixa.repository.js";
import { listarHistoricoCaixa } from "../caixa/caixa.service.js";

export type SituacaoTesouraria = "aberto" | "em_fechamento" | "aguardando_tesouraria" | "conferido" | "com_quebra";

function situacaoDoFechamento(input: {
  status: string;
  temAjuste?: boolean;
  transferencias: Array<{ status: string | null }>;
  conferencias: Array<{ resultado: string }>;
}): SituacaoTesouraria {
  if (input.temAjuste || input.conferencias.some((item) => item.resultado === "divergente") || input.transferencias.some((item) => item.status === "divergente")) {
    return "com_quebra";
  }
  if (input.status === "aberto") return "aberto";
  if (input.status === "em_fechamento") return "em_fechamento";
  if (input.transferencias.some((item) => item.status === "pendente")) return "aguardando_tesouraria";
  return "conferido";
}

function iso(valor: Date | string | null | undefined) {
  if (!valor) return null;
  return typeof valor === "string" ? valor : valor.toISOString();
}

function numero(valor: string | number | null | undefined) {
  return valor === null || valor === undefined ? null : Number(valor);
}

async function caixaPermitido(caixaId: string, perfil: PerfilUsuario) {
  const caixa = await buscarCaixaPorIdRepository(caixaId);
  if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
  return caixa;
}

export async function listarRelatoriosFechamento(query: HistoricoCaixaQuery, perfil: PerfilUsuario) {
  const historico = await listarHistoricoCaixa(query, perfil);
  const itens = await Promise.all(
    historico.itens.map(async (item) => {
      const [transferencias, conferencias] = await Promise.all([
        listarTransferenciasCaixaRepository(item.id),
        listarConferenciasFisicasCaixaRepository(item.id, item.empresaId)
      ]);
      return {
        ...item,
        situacaoTesouraria: situacaoDoFechamento({
          status: item.status,
          temAjuste: item.temAjuste,
          transferencias,
          conferencias
        })
      };
    })
  );
  return { ...historico, itens };
}

export async function obterDossieFechamento(caixaId: string, perfil: PerfilUsuario) {
  const caixa = await caixaPermitido(caixaId, perfil);
  const [resumo, transferencias, conferencias, relatorioVendas, relatorioMaquininha, anexos, lancamentos, vendasCanceladas, ajuste] =
    await Promise.all([
      buscarResumoFechamentoCaixaRepository(caixa.id, caixa.empresaId),
      listarTransferenciasCaixaRepository(caixa.id),
      listarConferenciasFisicasCaixaRepository(caixa.id, caixa.empresaId),
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
          valorMoedasFechamento: numero(resumo.valorMoedasFechamento)
        }
      : null,
    situacaoTesouraria: situacaoDoFechamento({
      status: caixa.status,
      temAjuste: Boolean(ajuste),
      transferencias,
      conferencias
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
    relatorioVendas: relatorioVendas
      ? { ...relatorioVendas, periodoInicio: iso(relatorioVendas.periodoInicio), periodoFim: iso(relatorioVendas.periodoFim), geradoEm: iso(relatorioVendas.geradoEm) }
      : null,
    relatorioMaquininha,
    anexos: anexos.map((item) => ({ ...item, criadoEm: iso(item.criadoEm) })),
    lancamentos,
    vendasCanceladas,
    ajuste: ajuste
      ? { ...ajuste, valorDiferenca: numero(ajuste.valorDiferenca), criadoEm: iso(ajuste.criadoEm) }
      : null
  };
}

export async function obterAnexoDossieFechamento(caixaId: string, anexoId: string, perfil: PerfilUsuario) {
  const caixa = await caixaPermitido(caixaId, perfil);
  const anexo = await buscarAnexoFechamentoCaixaRepository(caixa.id, anexoId, caixa.empresaId);
  if (!anexo) throw new Error("Anexo nao encontrado");
  return { ...anexo, caminhoAbsoluto: caminhoAbsolutoDocumento(anexo.caminho) };
}
