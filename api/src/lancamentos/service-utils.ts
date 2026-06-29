import type { Permissao } from "@padaria/shared";
import { obterCaixaAbertoParaLancamento } from "../caixa/caixa.service.js";
import { marcarLacreComoUsado, obterLacrePorId } from "./referencias.js";

export class PermissaoLancamentoInsuficienteError extends Error {
  constructor(readonly permissao: Permissao) {
    super("Permissao insuficiente");
  }
}

export function exigirPermissaoLancamento(permissoes: readonly Permissao[], permissao: Permissao) {
  if (!permissoes.includes(permissao)) throw new PermissaoLancamentoInsuficienteError(permissao);
}

export function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export async function usarLacreSeInformado(lacreId: string | null | undefined): Promise<void> {
  if (!lacreId) return;

  const lacre = await obterLacrePorId(lacreId);
  if (!lacre) throw new Error("Lacre inexistente");
  if (lacre.status !== "disponivel") throw new Error("Lacre indisponivel");

  await marcarLacreComoUsado(lacreId);
}

export async function obterCaixaParaLancamento(empresaId: string, usuarioId: string) {
  return obterCaixaAbertoParaLancamento(empresaId, usuarioId);
}
