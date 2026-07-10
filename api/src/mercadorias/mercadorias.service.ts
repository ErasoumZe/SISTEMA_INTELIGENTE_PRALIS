import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type {
  DiscriminarMercadoriaPayload,
  MercadoriaCriada,
  MercadoriaDetalheDto,
  MercadoriaDto,
  MercadoriaPayload,
  MercadoriasQuery
} from "@padaria/shared/mercadorias";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { executarEmTransacao } from "../banco/conexao.js";
import {
  calcularTotalItemMercadoria,
  exigirPermissaoLancamento,
  obterCaixaParaLancamento,
  somaConfereCentavos,
  validarReferenciasItensMercadoria
} from "../lancamentos/lancamentos.dominio.js";
import {
  resolverComputarLancamento,
  resolverDataPagamentoLancamento,
  validarEdicaoNoCaixaAberto,
  validarReferenciasMercadoria
} from "../lancamentos/lancamentos.dominio.js";
import { deveComputarMercadoria } from "./mercadorias.regras.js";
import {
  atualizarMercadoriaRepository,
  buscarMercadoriaDetalheRepository,
  criarMercadoriaRepository,
  discriminarMercadoriaRepository,
  listarMercadoriasRepository
} from "./mercadorias.repository.js";

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
  empresasPermitidasIds: string[] | null
): Promise<MercadoriaDto[]> {
  if (empresasPermitidasIds?.length === 0) return [];
  return listarMercadoriasRepository(query, empresasPermitidasIds);
}

export async function criarMercadoria(dados: MercadoriaPayload, perfil: PerfilUsuario): Promise<MercadoriaCriada> {
  exigirPermissaoLancamento(perfil.permissoes, "mercadorias_criar");
  validarMercadoria(dados);
  return executarEmTransacao(async (tx) => {
    const referenciaInvalida = await validarReferenciasMercadoria(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);

    const computar = deveComputarMercadoria(
      dados.temNotaFiscal,
      resolverComputarLancamento(dados.computar, perfil.permissoes)
    );
    const normalizados = {
      ...dados,
      dataPagamento: resolverDataPagamentoLancamento(dados.dataPagamento, perfil.permissoes)
    };
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
    const referenciaInvalida = await validarReferenciasMercadoria(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);
    const computar = deveComputarMercadoria(
      dados.temNotaFiscal,
      resolverComputarLancamento(dados.computar, perfil.permissoes)
    );
    const normalizados = {
      ...dados,
      dataPagamento: resolverDataPagamentoLancamento(dados.dataPagamento, perfil.permissoes)
    };
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
