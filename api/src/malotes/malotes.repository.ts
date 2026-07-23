import { and, asc, eq, ilike, inArray, ne } from "drizzle-orm";
import { malotes } from "@padaria/db/schema/cadastro";
import { banco, executarComTransacaoOpcional, type ExecutorBanco } from "../banco/conexao.js";
import {
  filtrarOrigemEntidade,
  jaImportado,
  type FiltroOrigemEntidade,
  type ModoImportacaoEntidade,
  type ResultadoImportacaoEntidade
} from "../utils.js";

export type MaloteLinha = {
  id: string;
  empresaId: string;
  numeroLacre: string;
  valor: string;
  status: string;
};

export async function listarMalotesRepository(): Promise<MaloteLinha[]> {
  return banco
    .select({
      id: malotes.id,
      empresaId: malotes.empresaId,
      numeroLacre: malotes.numeroLacre,
      valor: malotes.valor,
      status: malotes.status
    })
    .from(malotes)
    .orderBy(asc(malotes.numeroLacre));
}

export async function buscarMaloteEmpresaRepository(maloteId: string): Promise<{ empresaId: string } | null> {
  const [malote] = await banco
    .select({ empresaId: malotes.empresaId })
    .from(malotes)
    .where(eq(malotes.id, maloteId))
    .limit(1);
  return malote ?? null;
}

// Existe outro malote (que nao o ignorado) com este numero de lacre na empresa? (duplicidade —
// o lacre e a identidade unica do malote).
export async function existeNumeroLacreRepository(
  empresaId: string,
  numeroLacre: string,
  maloteIdIgnorado?: string
): Promise<{ numeroLacre: string } | null> {
  const filtros = [eq(malotes.empresaId, empresaId), ilike(malotes.numeroLacre, numeroLacre)];
  if (maloteIdIgnorado) filtros.push(ne(malotes.id, maloteIdIgnorado));
  const [existente] = await banco
    .select({ numeroLacre: malotes.numeroLacre })
    .from(malotes)
    .where(and(...filtros))
    .limit(1);
  return existente ?? null;
}

// Malote por numero de lacre nas empresas permitidas (validacao de lacre no caixa: abertura/retorno).
export async function buscarMalotePorNumeroLacreRepository(
  numeroLacre: string,
  empresaIds: string[]
): Promise<{ id: string; numeroLacre: string; status: string; empresaId: string } | null> {
  if (!empresaIds.length) return null;
  const [malote] = await banco
    .select({ id: malotes.id, numeroLacre: malotes.numeroLacre, status: malotes.status, empresaId: malotes.empresaId })
    .from(malotes)
    .where(and(inArray(malotes.empresaId, empresaIds), ilike(malotes.numeroLacre, numeroLacre)))
    .limit(1);
  return malote ?? null;
}

export async function criarMaloteRepository(input: {
  empresaId: string;
  numeroLacre: string;
  valor: string;
  usuarioId?: string;
}): Promise<{ id: string | undefined }> {
  const [malote] = await banco
    .insert(malotes)
    .values({
      empresaId: input.empresaId,
      numeroLacre: input.numeroLacre,
      valor: input.valor,
      criadoPor: input.usuarioId ?? null
    })
    .returning({ id: malotes.id });
  return { id: malote?.id };
}

export async function atualizarMaloteRepository(input: {
  maloteId: string;
  empresaId: string;
  numeroLacre: string;
  valor: string;
}): Promise<void> {
  // status NAO e alterado aqui: e do ciclo do caixa (abertura -> em_uso, M2 -> devolvido).
  await banco
    .update(malotes)
    .set({ numeroLacre: input.numeroLacre, valor: input.valor })
    .where(and(eq(malotes.id, input.maloteId), eq(malotes.empresaId, input.empresaId)));
}

export async function copiarMalotesRepository(
  filtro: FiltroOrigemEntidade,
  empresaDestinoId: string,
  empresasPermitidasIds: string[] | null,
  _modo: ModoImportacaoEntidade = "simples",
  db?: ExecutorBanco
): Promise<ResultadoImportacaoEntidade> {
  return executarComTransacaoOpcional(db, async (db) => {
    const origem = filtrarOrigemEntidade(await db.select().from(malotes), filtro, empresasPermitidasIds);
    const destinos = await db.select().from(malotes).where(eq(malotes.empresaId, empresaDestinoId));
    let inseridos = 0;
    for (const malote of origem) {
      if (jaImportado(destinos, malote.empresaId, malote.id)) continue;
      await db
        .insert(malotes)
        .values({
          empresaId: empresaDestinoId,
          numeroLacre: malote.numeroLacre,
          // Copia nasce disponivel (status e do ciclo do caixa na empresa destino, nao se importa).
          valor: malote.valor,
          criadoPor: null,
          importadoDe: malote.empresaId,
          idImportado: malote.id
        })
        .onConflictDoNothing();
      inseridos += 1;
    }
    return { tipo: "malotes", inseridos };
  });
}
