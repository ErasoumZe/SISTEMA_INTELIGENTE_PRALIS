import type { MultipartFile } from "@fastify/multipart";
import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type {
  AprovarMercadoriaPayload,
  DiscriminarMercadoriaPayload,
  MercadoriaAprovacaoDto,
  MercadoriaCriada,
  MercadoriaDetalheDto,
  MercadoriaDto,
  MercadoriaPayload,
  MercadoriasAprovacaoQuery,
  MercadoriasQuery,
  RecusarMercadoriaPayload
} from "@padaria/shared/mercadorias";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { executarEmTransacao } from "../banco/conexao.js";
import {
  calcularTotalItemMercadoria,
  exigirPermissaoEditarPago,
  exigirPermissaoLancamento,
  exigirPermissaoPagar,
  obterCaixaParaLancamento,
  podeVerLancamentosPagos,
  somaConfereCentavos,
  validarReferenciasItensMercadoria
} from "../lancamentos/lancamentos.dominio.js";
import {
  resolverComputarLancamento,
  validarEdicaoNoCaixaAberto,
  validarReferenciasMercadoria
} from "../lancamentos/lancamentos.dominio.js";
import { deveComputarMercadoria } from "./mercadorias.regras.js";
import {
  aprovarMercadoriaRepository,
  atualizarFotoMercadoriaRepository,
  atualizarMercadoriaRepository,
  buscarMercadoriaDetalheRepository,
  criarMercadoriaRepository,
  discriminarMercadoriaRepository,
  listarMercadoriasAguardandoAprovacaoRepository,
  listarMercadoriasRepository,
  recusarMercadoriaRepository
} from "./mercadorias.repository.js";
import { caminhoAbsolutoDocumento, mimePorCaminho, salvarFotoDocumento } from "../lancamentos/foto-documento.js";

export function validarMercadoria(dados: MercadoriaPayload): void {
  if (!dados.grupoMercadoriaId && !dados.itensMercadoria.length) {
    throw new Error("Grupo ou itens de mercadoria obrigatorios");
  }
  if (dados.itensMercadoria.length) {
    const valores = dados.itensMercadoria.map(calcularTotalItemMercadoria);
    if (!somaConfereCentavos(valores, dados.valorOriginal))
      throw new Error("Soma das mercadorias deve bater com o valor original");
  }
}

export async function listarMercadorias(
  query: MercadoriasQuery,
  empresasPermitidasIds: string[] | null,
  perfil?: PerfilUsuario
): Promise<MercadoriaDto[]> {
  if (empresasPermitidasIds?.length === 0) return [];
  // visualizar_dpago (R7): sem a permissao, a listagem nunca traz lancamentos ja pagos (server-side).
  const esconderPagos = !perfil || !podeVerLancamentosPagos(perfil.permissoes, "mercadorias");
  return listarMercadoriasRepository(query, empresasPermitidasIds, esconderPagos);
}

export async function criarMercadoria(dados: MercadoriaPayload, perfil: PerfilUsuario): Promise<MercadoriaCriada> {
  exigirPermissaoLancamento(perfil.permissoes, "mercadorias_criar");
  validarMercadoria(dados);
  // Ciclo de vida (R7): definir dataPagamento na criacao exige *_pagar (aditivo com caixas_gerenciar).
  exigirPermissaoPagar(perfil.permissoes, "mercadorias", dados.dataPagamento);
  return executarEmTransacao(async (tx) => {
    const referenciaInvalida = await validarReferenciasMercadoria(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);

    const computar = deveComputarMercadoria(
      dados.temNotaFiscal,
      resolverComputarLancamento(dados.computar, perfil.permissoes)
    );
    const normalizados = { ...dados, dataPagamento: dados.dataPagamento ?? null };
    const caixa = await obterCaixaParaLancamento(dados.empresaId, perfil.usuarioId, tx);
    const mercadoria = await criarMercadoriaRepository(normalizados, computar, perfil.usuarioId, caixa.id, tx);
    return { id: mercadoria.id, computar };
  });
}

export async function obterMercadoria(mercadoriaId: string, perfil: PerfilUsuario): Promise<MercadoriaDetalheDto> {
  const mercadoria = await buscarMercadoriaDetalheRepository(mercadoriaId);
  if (!mercadoria || !podeAcessarEmpresa(perfil, mercadoria.empresaId)) throw new Error("Registro nao encontrado");
  return mercadoria;
}

// Anexo de foto do documento (nota/cupom) — insumo de quem discrimina depois.
export async function salvarFotoMercadoria(
  mercadoriaId: string,
  arquivo: MultipartFile | undefined,
  perfil: PerfilUsuario
): Promise<{ fotoDocumentoUrl: string }> {
  const mercadoria = await buscarMercadoriaDetalheRepository(mercadoriaId);
  if (!mercadoria || !podeAcessarEmpresa(perfil, mercadoria.empresaId)) throw new Error("Registro nao encontrado");
  if (!arquivo) throw new Error("Arquivo obrigatorio");
  const { caminhoRelativo } = await salvarFotoDocumento("mercadorias", mercadoriaId, arquivo);
  await atualizarFotoMercadoriaRepository(mercadoriaId, mercadoria.empresaId, caminhoRelativo);
  return { fotoDocumentoUrl: caminhoRelativo };
}

export async function obterFotoMercadoria(
  mercadoriaId: string,
  perfil: PerfilUsuario
): Promise<{ caminhoAbsoluto: string; mimeType: string }> {
  const mercadoria = await buscarMercadoriaDetalheRepository(mercadoriaId);
  if (!mercadoria || !podeAcessarEmpresa(perfil, mercadoria.empresaId)) throw new Error("Registro nao encontrado");
  if (!mercadoria.fotoDocumentoUrl) throw new Error("Foto nao encontrada");
  return {
    caminhoAbsoluto: caminhoAbsolutoDocumento(mercadoria.fotoDocumentoUrl),
    mimeType: mimePorCaminho(mercadoria.fotoDocumentoUrl)
  };
}

export async function atualizarMercadoria(
  mercadoriaId: string,
  dados: MercadoriaPayload,
  perfil: PerfilUsuario
): Promise<MercadoriaCriada> {
  exigirPermissaoLancamento(perfil.permissoes, "mercadorias_editar");
  validarMercadoria(dados);
  return executarEmTransacao(async (tx) => {
    const existente = await buscarMercadoriaDetalheRepository(mercadoriaId, tx);
    await validarEdicaoNoCaixaAberto(existente, dados, perfil, tx);
    // Ciclo de vida (R7): editar mercadoria JA PAGA exige *_editar_dpago; alterar dataPagamento exige *_pagar.
    exigirPermissaoEditarPago(perfil.permissoes, "mercadorias", existente!.dataPagamento);
    exigirPermissaoPagar(perfil.permissoes, "mercadorias", dados.dataPagamento, existente!.dataPagamento ?? null);
    const referenciaInvalida = await validarReferenciasMercadoria(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);
    const computar = deveComputarMercadoria(
      dados.temNotaFiscal,
      resolverComputarLancamento(dados.computar, perfil.permissoes)
    );
    const normalizados = { ...dados, dataPagamento: dados.dataPagamento ?? null };
    await atualizarMercadoriaRepository(mercadoriaId, normalizados, computar, tx);
    return { id: mercadoriaId, computar };
  });
}

// Discriminacao feita por outro setor DEPOIS: substitui os itens do cabecalho existente.
// De proposito NAO passa por validarEdicaoNoCaixaAberto — desacopla do caixa (pode estar fechado).
export async function discriminarMercadoria(
  mercadoriaId: string,
  dados: DiscriminarMercadoriaPayload,
  perfil: PerfilUsuario
): Promise<MercadoriaCriada> {
  exigirPermissaoLancamento(perfil.permissoes, "mercadorias_discriminar");
  return executarEmTransacao(async (tx) => {
    const existente = await buscarMercadoriaDetalheRepository(mercadoriaId, tx);
    if (!existente || !podeAcessarEmpresa(perfil, existente.empresaId)) throw new Error("Registro nao encontrado");
    if (existente.empresaId !== dados.empresaId) throw new Error("Nao e possivel mover o lancamento de empresa");

    const valores = dados.itensMercadoria.map(calcularTotalItemMercadoria);
    if (!somaConfereCentavos(valores, existente.valorOriginal))
      throw new Error("Soma das mercadorias deve bater com o valor original");

    const referenciaInvalida = await validarReferenciasItensMercadoria(dados.empresaId, dados.itensMercadoria, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);

    await discriminarMercadoriaRepository(mercadoriaId, dados.itensMercadoria, existente.grupoMercadoriaId ?? null, tx);
    return { id: mercadoriaId, computar: existente.computar };
  });
}

// Fila de aprovacao (NF-e): lista os cabecalhos aguardando aprovacao (com itens do XML).
export async function listarMercadoriasAguardandoAprovacao(
  query: MercadoriasAprovacaoQuery,
  empresasPermitidasIds: string[] | null
): Promise<MercadoriaAprovacaoDto[]> {
  if (empresasPermitidasIds?.length === 0) return [];
  return listarMercadoriasAguardandoAprovacaoRepository(query, empresasPermitidasIds);
}

// Aprova a mercadoria da NF-e definindo se computa (decisao da reuniao: nota so fiscal nao computa).
export async function aprovarMercadoria(
  mercadoriaId: string,
  dados: AprovarMercadoriaPayload,
  perfil: PerfilUsuario
): Promise<{ id: string; computar: boolean }> {
  exigirPermissaoLancamento(perfil.permissoes, "mercadorias_aprovar");
  const mercadoria = await buscarMercadoriaDetalheRepository(mercadoriaId);
  if (!mercadoria || !podeAcessarEmpresa(perfil, mercadoria.empresaId)) throw new Error("Registro nao encontrado");
  if (mercadoria.empresaId !== dados.empresaId) throw new Error("Nao e possivel mover o lancamento de empresa");
  if (mercadoria.status !== "aguardando_aprovacao") throw new Error("Mercadoria nao esta aguardando aprovacao");
  const afetadas = await aprovarMercadoriaRepository(mercadoriaId, dados.empresaId, dados.computar);
  if (!afetadas) throw new Error("Mercadoria nao esta aguardando aprovacao");
  return { id: mercadoriaId, computar: dados.computar };
}

// Recusa a mercadoria da NF-e (aguardando_aprovacao -> recusado).
export async function recusarMercadoria(
  mercadoriaId: string,
  dados: RecusarMercadoriaPayload,
  perfil: PerfilUsuario
): Promise<{ id: string }> {
  exigirPermissaoLancamento(perfil.permissoes, "mercadorias_aprovar");
  const mercadoria = await buscarMercadoriaDetalheRepository(mercadoriaId);
  if (!mercadoria || !podeAcessarEmpresa(perfil, mercadoria.empresaId)) throw new Error("Registro nao encontrado");
  if (mercadoria.empresaId !== dados.empresaId) throw new Error("Nao e possivel mover o lancamento de empresa");
  if (mercadoria.status !== "aguardando_aprovacao") throw new Error("Mercadoria nao esta aguardando aprovacao");
  const afetadas = await recusarMercadoriaRepository(mercadoriaId, dados.empresaId);
  if (!afetadas) throw new Error("Mercadoria nao esta aguardando aprovacao");
  return { id: mercadoriaId };
}
