import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type { DespesaCriada, DespesaDto, DespesaPayload, DespesasQuery } from "@padaria/shared/despesas";
import { executarEmTransacao } from "../banco/conexao.js";
import {
  exigirPermissaoLancamento,
  obterCaixaParaLancamento,
  somaConfereCentavos
} from "../lancamentos/lancamentos.dominio.js";
import { validarReferenciasDespesa } from "../lancamentos/lancamentos.dominio.js";
import { criarDespesaRepository, listarDespesasRepository } from "./despesas.repository.js";

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
  return executarEmTransacao(async (tx) => {
    const referenciaInvalida = await validarReferenciasDespesa(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);

    const caixa = await obterCaixaParaLancamento(dados.empresaId, perfil.usuarioId, tx);
    const despesa = await criarDespesaRepository(dados, dados.computar, perfil.usuarioId, caixa.id, tx);
    return { id: despesa.id, computar: dados.computar };
  });
}
