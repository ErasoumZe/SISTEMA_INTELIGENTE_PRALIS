import { and, asc, count, eq, ilike, inArray, ne, type SQL } from "drizzle-orm";
import { lacresMalotes, malotes } from "@padaria/db/schema/cadastro";
import { transferencias } from "@padaria/db/schema/transferencia";
import { banco, executarComTransacaoOpcional, executarEmTransacao, type ExecutorBanco } from "../banco/conexao.js";
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
  codigo: string;
  descricao: string | null;
  totalLacres: number;
};

export type LacreLinha = {
  id: string;
  empresaId: string;
  numero: string;
  status: string;
};

export type LacreValidadoLinha = LacreLinha & {
  maloteId: string;
  maloteCodigo: string;
};

export async function listarMalotesRepository(): Promise<MaloteLinha[]> {
  const linhas = await banco
    .select({
      id: malotes.id,
      empresaId: malotes.empresaId,
      codigo: malotes.codigo,
      descricao: malotes.descricao,
      totalLacres: count(lacresMalotes.id)
    })
    .from(malotes)
    .leftJoin(lacresMalotes, eq(lacresMalotes.maloteId, malotes.id))
    .groupBy(malotes.id)
    .orderBy(asc(malotes.codigo));

  return linhas.map((linha) => ({ ...linha, totalLacres: Number(linha.totalLacres) }));
}

export async function buscarMaloteEmpresaRepository(maloteId: string): Promise<{ empresaId: string } | null> {
  const [malote] = await banco
    .select({ empresaId: malotes.empresaId })
    .from(malotes)
    .where(eq(malotes.id, maloteId))
    .limit(1);
  return malote ?? null;
}

function filtroEmpresasPermitidas(empresasPermitidasIds: string[] | null): SQL | undefined {
  return empresasPermitidasIds === null ? undefined : inArray(lacresMalotes.empresaId, empresasPermitidasIds);
}

export async function listarLacresMaloteRepository(
  maloteId: string,
  empresasPermitidasIds: string[] | null
): Promise<LacreLinha[]> {
  const filtros = [eq(lacresMalotes.maloteId, maloteId)];
  const filtroEmpresas = filtroEmpresasPermitidas(empresasPermitidasIds);
  if (filtroEmpresas) filtros.push(filtroEmpresas);
  return banco
    .select({
      id: lacresMalotes.id,
      empresaId: lacresMalotes.empresaId,
      numero: lacresMalotes.numero,
      status: lacresMalotes.status
    })
    .from(lacresMalotes)
    .where(and(...filtros))
    .orderBy(asc(lacresMalotes.numero));
}

export async function buscarLacrePorNumeroRepository(
  numero: string,
  empresasPermitidasIds: string[] | null
): Promise<LacreValidadoLinha | null> {
  const filtros = [ilike(lacresMalotes.numero, numero)];
  const filtroEmpresas = filtroEmpresasPermitidas(empresasPermitidasIds);
  if (filtroEmpresas) filtros.push(filtroEmpresas);
  const [lacre] = await banco
    .select({
      id: lacresMalotes.id,
      empresaId: lacresMalotes.empresaId,
      numero: lacresMalotes.numero,
      status: lacresMalotes.status,
      maloteId: malotes.id,
      maloteCodigo: malotes.codigo
    })
    .from(lacresMalotes)
    .innerJoin(malotes, eq(malotes.id, lacresMalotes.maloteId))
    .where(and(...filtros))
    .limit(1);
  return lacre ?? null;
}

export async function buscarLacrePorEmpresaRepository(
  empresaId: string,
  lacres: string[],
  maloteIdIgnorado?: string
): Promise<{ numero: string } | null> {
  for (const lacre of lacres) {
    const filtros = [eq(lacresMalotes.empresaId, empresaId), ilike(lacresMalotes.numero, lacre)];
    if (maloteIdIgnorado) filtros.push(ne(lacresMalotes.maloteId, maloteIdIgnorado));
    const [existente] = await banco
      .select({ numero: lacresMalotes.numero })
      .from(lacresMalotes)
      .where(and(...filtros))
      .limit(1);
    if (existente) return existente;
  }
  return null;
}

async function inserirLacres(empresaId: string, maloteId: string, lacres: string[], db: ExecutorBanco) {
  if (!lacres.length) return;
  await db
    .insert(lacresMalotes)
    .values(lacres.map((numero) => ({ empresaId, maloteId, numero })))
    .onConflictDoNothing();
}

// Quantas transferencias referenciam este malote. Se houver, o malote esta EM USO: a FK
// transferencias.malote_id e RESTRICT, entao a exclusao e barrada com um erro claro em vez do 23503 cru.
export async function contarTransferenciasDoMaloteRepository(
  maloteId: string,
  db: ExecutorBanco = banco
): Promise<number> {
  const [linha] = await db.select({ total: count() }).from(transferencias).where(eq(transferencias.maloteId, maloteId));
  return Number(linha?.total ?? 0);
}

// Exclui o malote; os lacres saem em cascata pela FK. Escopo por empresa para nunca apagar de outra.
export async function excluirMaloteRepository(
  maloteId: string,
  empresaId: string,
  db: ExecutorBanco = banco
): Promise<void> {
  await db.delete(malotes).where(and(eq(malotes.id, maloteId), eq(malotes.empresaId, empresaId)));
}

export async function criarMaloteRepository(input: {
  empresaId: string;
  codigo: string;
  lacres: string[];
  usuarioId?: string;
}): Promise<{ id: string | undefined }> {
  return executarEmTransacao(async (tx) => {
    const [malote] = await tx
      .insert(malotes)
      .values({
        empresaId: input.empresaId,
        codigo: input.codigo,
        descricao: null,
        criadoPor: input.usuarioId ?? null
      })
      .returning({ id: malotes.id });

    if (malote?.id) await inserirLacres(input.empresaId, malote.id, input.lacres, tx);
    return { id: malote?.id };
  });
}

export async function atualizarMaloteRepository(input: {
  maloteId: string;
  empresaId: string;
  codigo: string;
  lacres: string[];
}): Promise<void> {
  await executarEmTransacao(async (tx) => {
    await tx
      .update(malotes)
      .set({ codigo: input.codigo, descricao: null })
      .where(and(eq(malotes.id, input.maloteId), eq(malotes.empresaId, input.empresaId)));
    await inserirLacres(input.empresaId, input.maloteId, input.lacres, tx);
  });
}

async function completarMalotes(empresaDestinoId: string, db: ExecutorBanco) {
  const destinos = await db.select().from(malotes).where(eq(malotes.empresaId, empresaDestinoId));
  const lacresExistentes = await db.select({ numero: lacresMalotes.numero }).from(lacresMalotes);
  const lacresExistentesChaves = new Set(lacresExistentes.map((lacre) => lacre.numero.toLocaleLowerCase("pt-BR")));
  for (const destino of destinos) {
    if (!destino.idImportado) continue;
    const lacresOrigem = await db.select().from(lacresMalotes).where(eq(lacresMalotes.maloteId, destino.idImportado));
    const novos = lacresOrigem
      .filter((lacre) => !lacresExistentesChaves.has(lacre.numero.toLocaleLowerCase("pt-BR")))
      .map((lacre) => ({
        empresaId: empresaDestinoId,
        maloteId: destino.id,
        numero: lacre.numero,
        status: "disponivel"
      }));
    if (novos.length) await db.insert(lacresMalotes).values(novos).onConflictDoNothing();
  }
}

export async function copiarMalotesRepository(
  filtro: FiltroOrigemEntidade,
  empresaDestinoId: string,
  empresasPermitidasIds: string[] | null,
  modo: ModoImportacaoEntidade = "simples",
  db?: ExecutorBanco
): Promise<ResultadoImportacaoEntidade> {
  return executarComTransacaoOpcional(db, async (db) => {
    const origem = filtrarOrigemEntidade(await db.select().from(malotes), filtro, empresasPermitidasIds);
    const destinos = await db.select().from(malotes).where(eq(malotes.empresaId, empresaDestinoId));
    let inseridos = 0;
    for (const malote of origem) {
      if (jaImportado(destinos, malote.empresaId, malote.id)) continue;
      await db.insert(malotes).values({
        empresaId: empresaDestinoId,
        codigo: malote.codigo,
        descricao: malote.descricao,
        criadoPor: null,
        importadoDe: malote.empresaId,
        idImportado: malote.id
      });
      inseridos += 1;
    }
    if (modo === "completo") await completarMalotes(empresaDestinoId, db);
    return { tipo: "malotes", inseridos };
  });
}
