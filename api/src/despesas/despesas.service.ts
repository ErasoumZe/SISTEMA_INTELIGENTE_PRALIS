import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type { DespesaCriada, DespesaDto, DespesaPayload, DespesasQuery } from "@padaria/shared/despesas";
import { arredondar, exigirPermissaoLancamento, obterCaixaParaLancamento } from "../lancamentos/service-utils.js";
import { validarReferenciasDespesa } from "../lancamentos/referencias.js";
import { criarDespesaRepository, listarDespesasRepository } from "./despesas.repository.js";

export function validarDespesa(dados: DespesaPayload): void {
  if (!dados.grupoDespesaId && !dados.itensDespesa.length) throw new Error("Grupo ou itens da despesa obrigatorios");
  if (dados.itensDespesa.length) {
    const soma = arredondar(dados.itensDespesa.reduce((total, item) => total + item.valor, 0));
    if (soma !== arredondar(dados.valorOriginal)) throw new Error("Soma dos itens da despesa deve bater com o valor original");
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
  const referenciaInvalida = await validarReferenciasDespesa(dados);
  if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);

  const caixa = await obterCaixaParaLancamento(dados.empresaId, perfil.usuarioId);
  const despesa = await criarDespesaRepository(dados, dados.computar, perfil.usuarioId, caixa.id);
  return { id: despesa.id, computar: dados.computar };
}
