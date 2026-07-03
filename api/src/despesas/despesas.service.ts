import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type {
  DespesaCriada,
  DespesaDetalheDto,
  DespesaDto,
  DespesaPayload,
  DespesasQuery
} from "@padaria/shared/despesas";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { executarEmTransacao } from "../banco/conexao.js";
import {
  exigirPermissaoLancamento,
  obterCaixaParaLancamento,
  somaConfereCentavos
} from "../lancamentos/lancamentos.dominio.js";
import {
  resolverComputarLancamento,
  resolverDataPagamentoLancamento,
  validarEdicaoNoCaixaAberto,
  validarReferenciasDespesa
} from "../lancamentos/lancamentos.dominio.js";
import {
  atualizarDespesaRepository,
  buscarDespesaDetalheRepository,
  criarDespesaRepository,
  listarDespesasRepository
} from "./despesas.repository.js";

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
