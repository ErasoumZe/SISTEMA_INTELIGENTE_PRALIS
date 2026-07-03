import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type {
  RetiradaCriada,
  RetiradaDetalheDto,
  RetiradaDto,
  RetiradaPayload,
  RetiradasQuery
} from "@padaria/shared/retiradas";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { executarEmTransacao } from "../banco/conexao.js";
import { exigirPermissaoLancamento, obterCaixaParaLancamento } from "../lancamentos/lancamentos.dominio.js";
import {
  resolverComputarLancamento,
  resolverDataPagamentoLancamento,
  validarEdicaoNoCaixaAberto,
  validarReferenciasRetirada
} from "../lancamentos/lancamentos.dominio.js";
import {
  atualizarRetiradaRepository,
  buscarRetiradaDetalheRepository,
  criarRetiradaRepository,
  listarRetiradasRepository
} from "./retiradas.repository.js";

export async function listarRetiradas(
  query: RetiradasQuery,
  empresasPermitidasIds: string[] | null
): Promise<RetiradaDto[]> {
  if (empresasPermitidasIds?.length === 0) return [];
  return listarRetiradasRepository(query, empresasPermitidasIds);
}

export async function criarRetirada(dados: RetiradaPayload, perfil: PerfilUsuario): Promise<RetiradaCriada> {
  exigirPermissaoLancamento(perfil.permissoes, "retiradas_criar");
  const computar = resolverComputarLancamento(dados.computar, perfil.permissoes);
  const normalizados = {
    ...dados,
    dataPagamento: resolverDataPagamentoLancamento(dados.dataPagamento, perfil.permissoes)
  };
  return executarEmTransacao(async (tx) => {
    const referenciaInvalida = await validarReferenciasRetirada(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);

    const caixa = await obterCaixaParaLancamento(dados.empresaId, perfil.usuarioId, tx);
    const retirada = await criarRetiradaRepository(normalizados, computar, perfil.usuarioId, caixa.id, tx);
    return { id: retirada.id, computar };
  });
}

export async function obterRetirada(retiradaId: string, perfil: PerfilUsuario): Promise<RetiradaDetalheDto> {
  const retirada = await buscarRetiradaDetalheRepository(retiradaId);
  if (!retirada || !podeAcessarEmpresa(perfil, retirada.empresaId)) throw new Error("Registro nao encontrado");
  return retirada;
}

export async function atualizarRetirada(
  retiradaId: string,
  dados: RetiradaPayload,
  perfil: PerfilUsuario
): Promise<RetiradaCriada> {
  exigirPermissaoLancamento(perfil.permissoes, "retiradas_editar");
  const computar = resolverComputarLancamento(dados.computar, perfil.permissoes);
  const normalizados = {
    ...dados,
    dataPagamento: resolverDataPagamentoLancamento(dados.dataPagamento, perfil.permissoes)
  };
  return executarEmTransacao(async (tx) => {
    const existente = await buscarRetiradaDetalheRepository(retiradaId, tx);
    await validarEdicaoNoCaixaAberto(existente, dados, perfil, tx);
    const referenciaInvalida = await validarReferenciasRetirada(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);
    await atualizarRetiradaRepository(retiradaId, normalizados, computar, existente!.caixaId, perfil.usuarioId, tx);
    return { id: retiradaId, computar };
  });
}
