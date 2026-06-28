import { obterTemaComFallback, salvarTema } from "./tema.repository.js";
import type { TemaPayload, TemaQuery } from "@padaria/shared/tema";

export async function carregarTema(query: TemaQuery) {
  return obterTemaComFallback(query.empresaId, query.tela);
}

export async function atualizarTema(payload: TemaPayload, usuarioId?: string) {
  await salvarTema({ ...payload, atualizadoPor: usuarioId ?? null });
  return payload;
}
