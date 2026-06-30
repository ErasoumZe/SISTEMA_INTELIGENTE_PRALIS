import { and, asc, eq } from "drizzle-orm";
import { areas, setores } from "@padaria/db/schema/cadastro";
import { banco, executarComTransacaoOpcional, type ExecutorBanco } from "../banco/conexao.js";
import {
  filtrarOrigemEntidade,
  jaImportado,
  type FiltroOrigemEntidade,
  type ModoImportacaoEntidade,
  type ResultadoImportacaoEntidade
} from "../utils.js";

export async function listarAreasRepository() {
  return banco
    .select({ id: areas.id, empresaId: areas.empresaId, nome: areas.nome })
    .from(areas)
    .orderBy(asc(areas.nome));
}

export async function salvarAreaRepository(
  input: { id?: string; empresaId: string; nome: string },
  db: ExecutorBanco = banco
) {
  if (input.id) {
    await db
      .update(areas)
      .set({ nome: input.nome })
      .where(and(eq(areas.id, input.id), eq(areas.empresaId, input.empresaId)));
    return { id: input.id, empresaId: input.empresaId, nome: input.nome };
  }
  const [criada] = await db
    .insert(areas)
    .values({ empresaId: input.empresaId, nome: input.nome })
    .returning({ id: areas.id });
  return criada;
}

async function completarAreasSetores(empresaDestinoId: string, db: ExecutorBanco) {
  const areasDestino = await db.select().from(areas).where(eq(areas.empresaId, empresaDestinoId));
  const setoresDestino = await db.select().from(setores).where(eq(setores.empresaId, empresaDestinoId));
  const setoresOrigem = await db.select().from(setores);
  for (const destino of setoresDestino) {
    if (!destino.importadoDe || !destino.idImportado) continue;
    const origem = setoresOrigem.find((item) => item.id === destino.idImportado);
    if (!origem) continue;
    const areaDestino = origem.areaId
      ? areasDestino.find((item) => item.importadoDe === origem.empresaId && item.idImportado === origem.areaId)
      : null;
    const setorPaiDestino = origem.setorPaiId
      ? setoresDestino.find((item) => item.importadoDe === origem.empresaId && item.idImportado === origem.setorPaiId)
      : null;
    await db
      .update(setores)
      .set({ areaId: areaDestino?.id ?? null, setorPaiId: setorPaiDestino?.id ?? null })
      .where(eq(setores.id, destino.id));
  }
}

export async function copiarAreasSetoresRepository(
  filtro: FiltroOrigemEntidade,
  empresaDestinoId: string,
  empresasPermitidasIds: string[] | null,
  modo: ModoImportacaoEntidade = "simples",
  db?: ExecutorBanco
): Promise<ResultadoImportacaoEntidade> {
  return executarComTransacaoOpcional(db, async (db) => {
    const areasOrigem = filtrarOrigemEntidade(await db.select().from(areas), filtro, empresasPermitidasIds);
    const setoresOrigem = filtrarOrigemEntidade(await db.select().from(setores), filtro, empresasPermitidasIds);
    const areasDestino = await db.select().from(areas).where(eq(areas.empresaId, empresaDestinoId));
    const setoresDestino = await db.select().from(setores).where(eq(setores.empresaId, empresaDestinoId));
    let inseridos = 0;
    for (const area of areasOrigem) {
      if (jaImportado(areasDestino, area.empresaId, area.id)) continue;
      await db
        .insert(areas)
        .values({ empresaId: empresaDestinoId, nome: area.nome, importadoDe: area.empresaId, idImportado: area.id });
      inseridos += 1;
    }
    for (const setor of setoresOrigem) {
      if (jaImportado(setoresDestino, setor.empresaId, setor.id)) continue;
      await db.insert(setores).values({
        empresaId: empresaDestinoId,
        nome: setor.nome,
        areaId: null,
        setorPaiId: null,
        importadoDe: setor.empresaId,
        idImportado: setor.id
      });
      inseridos += 1;
    }
    if (modo === "completo") await completarAreasSetores(empresaDestinoId, db);
    return { tipo: "areas_setores", inseridos };
  });
}
