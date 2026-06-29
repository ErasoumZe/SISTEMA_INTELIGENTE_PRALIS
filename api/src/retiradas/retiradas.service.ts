import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type { RetiradaCriada, RetiradaDto, RetiradaPayload, RetiradasQuery } from "@padaria/shared/retiradas";
import { exigirPermissaoLancamento, obterCaixaParaLancamento } from "../lancamentos/service-utils.js";
import { validarReferenciasRetirada } from "../lancamentos/referencias.js";
import { criarRetiradaRepository, listarRetiradasRepository } from "./retiradas.repository.js";

export async function listarRetiradas(
  query: RetiradasQuery,
  empresasPermitidasIds: string[] | null
): Promise<RetiradaDto[]> {
  if (empresasPermitidasIds?.length === 0) return [];
  return listarRetiradasRepository(query, empresasPermitidasIds);
}

export async function criarRetirada(dados: RetiradaPayload, perfil: PerfilUsuario): Promise<RetiradaCriada> {
  exigirPermissaoLancamento(perfil.permissoes, "retiradas");
  const referenciaInvalida = await validarReferenciasRetirada(dados);
  if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);

  const caixa = await obterCaixaParaLancamento(dados.empresaId, perfil.usuarioId);
  const retirada = await criarRetiradaRepository(dados, dados.computar, perfil.usuarioId, caixa.id);
  return { id: retirada.id, computar: dados.computar };
}
