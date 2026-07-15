import type { MultipartFile } from "@fastify/multipart";
import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type {
  DespesaCriada,
  DespesaDetalheDto,
  DespesaDto,
  DespesaPayload,
  DespesasQuery,
  DiscriminarDespesaPayload
} from "@padaria/shared/despesas";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { executarEmTransacao } from "../banco/conexao.js";
import {
  exigirPermissaoLancamento,
  obterCaixaParaLancamento,
  somaConfereCentavos,
  validarReferenciasItensDespesa
} from "../lancamentos/lancamentos.dominio.js";
import {
  resolverComputarLancamento,
  resolverDataPagamentoLancamento,
  validarEdicaoNoCaixaAberto,
  validarReferenciasDespesa
} from "../lancamentos/lancamentos.dominio.js";
import {
  atualizarDespesaRepository,
  atualizarFotoDespesaRepository,
  buscarDespesaDetalheRepository,
  criarDespesaRepository,
  discriminarDespesaRepository,
  listarDespesasRepository
} from "./despesas.repository.js";
import { caminhoAbsolutoDocumento, mimePorCaminho, salvarFotoDocumento } from "../lancamentos/foto-documento.js";

export function validarDespesa(dados: DespesaPayload): void {
  if (!dados.grupoDespesaId && !dados.itensDespesa.length) throw new Error("Grupo ou itens da despesa obrigatorios");
  if (dados.itensDespesa.length) {
    const valores = dados.itensDespesa.map((item) => item.valor);
    if (!somaConfereCentavos(valores, dados.valorOriginal))
      throw new Error("Soma dos itens da despesa deve bater com o valor original");
  }
}

export async function listarDespesas(
  query: DespesasQuery,
  empresasPermitidasIds: string[] | null
): Promise<DespesaDto[]> {
  if (empresasPermitidasIds?.length === 0) return [];
  return listarDespesasRepository(query, empresasPermitidasIds);
}

export async function criarDespesa(dados: DespesaPayload, perfil: PerfilUsuario): Promise<DespesaCriada> {
  exigirPermissaoLancamento(perfil.permissoes, "despesas_criar");
  validarDespesa(dados);
  const computar = resolverComputarLancamento(dados.computar, perfil.permissoes);
  const normalizados = {
    ...dados,
    dataPagamento: resolverDataPagamentoLancamento(dados.dataPagamento, perfil.permissoes)
  };
  return executarEmTransacao(async (tx) => {
    const referenciaInvalida = await validarReferenciasDespesa(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);

    const caixa = await obterCaixaParaLancamento(dados.empresaId, perfil.usuarioId, tx);
    const despesa = await criarDespesaRepository(normalizados, computar, perfil.usuarioId, caixa.id, tx);
    return { id: despesa.id, computar };
  });
}

export async function obterDespesa(despesaId: string, perfil: PerfilUsuario): Promise<DespesaDetalheDto> {
  const despesa = await buscarDespesaDetalheRepository(despesaId);
  if (!despesa || !podeAcessarEmpresa(perfil, despesa.empresaId)) throw new Error("Registro nao encontrado");
  return despesa;
}

// Anexo de foto do documento (nota/cupom) — insumo de quem discrimina depois.
export async function salvarFotoDespesa(
  despesaId: string,
  arquivo: MultipartFile | undefined,
  perfil: PerfilUsuario
): Promise<{ fotoDocumentoUrl: string }> {
  const despesa = await buscarDespesaDetalheRepository(despesaId);
  if (!despesa || !podeAcessarEmpresa(perfil, despesa.empresaId)) throw new Error("Registro nao encontrado");
  if (!arquivo) throw new Error("Arquivo obrigatorio");
  const { caminhoRelativo } = await salvarFotoDocumento("despesas", despesaId, arquivo);
  await atualizarFotoDespesaRepository(despesaId, despesa.empresaId, caminhoRelativo);
  return { fotoDocumentoUrl: caminhoRelativo };
}

export async function obterFotoDespesa(
  despesaId: string,
  perfil: PerfilUsuario
): Promise<{ caminhoAbsoluto: string; mimeType: string }> {
  const despesa = await buscarDespesaDetalheRepository(despesaId);
  if (!despesa || !podeAcessarEmpresa(perfil, despesa.empresaId)) throw new Error("Registro nao encontrado");
  if (!despesa.fotoDocumentoUrl) throw new Error("Foto nao encontrada");
  return {
    caminhoAbsoluto: caminhoAbsolutoDocumento(despesa.fotoDocumentoUrl),
    mimeType: mimePorCaminho(despesa.fotoDocumentoUrl)
  };
}

export async function atualizarDespesa(
  despesaId: string,
  dados: DespesaPayload,
  perfil: PerfilUsuario
): Promise<DespesaCriada> {
  exigirPermissaoLancamento(perfil.permissoes, "despesas_editar");
  validarDespesa(dados);
  const computar = resolverComputarLancamento(dados.computar, perfil.permissoes);
  const normalizados = {
    ...dados,
    dataPagamento: resolverDataPagamentoLancamento(dados.dataPagamento, perfil.permissoes)
  };
  return executarEmTransacao(async (tx) => {
    const existente = await buscarDespesaDetalheRepository(despesaId, tx);
    await validarEdicaoNoCaixaAberto(existente, dados, perfil, tx);
    const referenciaInvalida = await validarReferenciasDespesa(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);
    await atualizarDespesaRepository(despesaId, normalizados, computar, existente!.caixaId, perfil.usuarioId, tx);
    return { id: despesaId, computar };
  });
}

// Discriminacao feita por outro setor DEPOIS: substitui os itens do cabecalho existente.
// De proposito NAO passa por validarEdicaoNoCaixaAberto — desacopla do caixa (pode estar fechado).
export async function discriminarDespesa(
  despesaId: string,
  dados: DiscriminarDespesaPayload,
  perfil: PerfilUsuario
): Promise<DespesaCriada> {
  exigirPermissaoLancamento(perfil.permissoes, "despesas_discriminar");
  return executarEmTransacao(async (tx) => {
    const existente = await buscarDespesaDetalheRepository(despesaId, tx);
    if (!existente || !podeAcessarEmpresa(perfil, existente.empresaId)) throw new Error("Registro nao encontrado");
    if (existente.empresaId !== dados.empresaId) throw new Error("Nao e possivel mover o lancamento de empresa");

    const valores = dados.itensDespesa.map((item) => item.valor);
    if (!somaConfereCentavos(valores, existente.valorOriginal))
      throw new Error("Soma dos itens da despesa deve bater com o valor original");

    const referenciaInvalida = await validarReferenciasItensDespesa(dados.empresaId, dados.itensDespesa, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);

    await discriminarDespesaRepository(
      despesaId,
      dados.itensDespesa,
      existente.grupoDespesaId ?? null,
      existente.colaboradorId ?? null,
      tx
    );
    return { id: despesaId, computar: existente.computar };
  });
}
