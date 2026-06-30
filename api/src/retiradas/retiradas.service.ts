import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type { RetiradaCriada, RetiradaDto, RetiradaPayload, RetiradasQuery } from "@padaria/shared/retiradas";
import { executarEmTransacao } from "../banco/conexao.js";
import { exigirPermissaoLancamento, obterCaixaParaLancamento } from "../lancamentos/lancamentos.dominio.js";
import { validarReferenciasRetirada } from "../lancamentos/lancamentos.dominio.js";
import { criarRetiradaRepository, listarRetiradasRepository } from "./retiradas.repository.js";

export async function listarRetiradas(
  query: RetiradasQuery,
  empresasPermitidasIds: string[] | null
): Promise<RetiradaDto[]> {
  if (empresasPermitidasIds?.length === 0) return [];
  return listarRetiradasRepository(query, empresasPermitidasIds);
}

export async function criarRetirada(dados: RetiradaPayload, perfil: PerfilUsuario): Promise<RetiradaCriada> {
  exigirPermissaoLancamento(perfil.permissoes, "retiradas_criar");
  return executarEmTransacao(async (tx) => {
    const referenciaInvalida = await validarReferenciasRetirada(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);

    const caixa = await obterCaixaParaLancamento(dados.empresaId, perfil.usuarioId, tx);
    const retirada = await criarRetiradaRepository(dados, dados.computar, perfil.usuarioId, caixa.id, tx);
    return { id: retirada.id, computar: dados.computar };
  });
}
