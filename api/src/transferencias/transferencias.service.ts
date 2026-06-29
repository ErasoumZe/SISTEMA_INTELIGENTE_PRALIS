import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type {
  TransferenciaCriada,
  TransferenciaDto,
  TransferenciaPayload,
  TransferenciasQuery
} from "@padaria/shared/transferencias";
import {
  exigirPermissaoLancamento,
  obterCaixaParaLancamento,
  usarLacreSeInformado
} from "./transferencias.lancamento.js";
import { validarReferenciasTransferencia } from "./transferencias.lancamento.js";
import { criarTransferenciaRepository, listarTransferenciasRepository } from "./transferencias.repository.js";

export function validarTransferencia(dados: TransferenciaPayload): void {
  if (dados.contaOrigemId === dados.contaDestinoId) throw new Error("Conta de destino deve ser diferente da origem");
}

export async function listarTransferencias(
  query: TransferenciasQuery,
  empresasPermitidasIds: string[] | null
): Promise<TransferenciaDto[]> {
  if (empresasPermitidasIds?.length === 0) return [];
  return listarTransferenciasRepository(query, empresasPermitidasIds);
}

export async function criarTransferencia(
  dados: TransferenciaPayload,
  perfil: PerfilUsuario
): Promise<TransferenciaCriada> {
  exigirPermissaoLancamento(perfil.permissoes, "transferencias_criar");
  validarTransferencia(dados);
  const referenciaInvalida = await validarReferenciasTransferencia(dados);
  if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);
  await usarLacreSeInformado(dados.lacreMaloteId);

  const caixa = await obterCaixaParaLancamento(dados.empresaId, perfil.usuarioId);
  if (dados.contaOrigemId !== caixa.pdvContaId && dados.contaDestinoId !== caixa.pdvContaId) {
    throw new Error("Transferencia precisa envolver a conta do PDV aberto");
  }

  const transferencia = await criarTransferenciaRepository(dados, dados.computar, perfil.usuarioId, caixa.id);
  return { id: transferencia.id, computar: dados.computar };
}

