import { and, eq } from "drizzle-orm";
import { gruposDespesas, gruposMercadorias, gruposRetiradas, gruposVendas } from "@padaria/db/schema/cadastro";
import { banco, executarComTransacaoOpcional, type ExecutorBanco } from "../banco/conexao.js";
import {
  filtrarOrigemEntidade,
  jaImportado,
  type FiltroOrigemEntidade,
  type ModoImportacaoEntidade,
  type ResultadoImportacaoEntidade
} from "../utils.js";

type GrupoTipo = "despesa" | "mercadoria" | "retirada" | "vendas";
type TabelaGrupo = typeof gruposDespesas | typeof gruposMercadorias | typeof gruposRetiradas | typeof gruposVendas;
type GrupoLinhaBase = { id: string; empresaId: string; nome: string; grupoPaiId: string | null };

function tabelaGrupo(tipo: GrupoTipo): TabelaGrupo {
  if (tipo === "despesa") return gruposDespesas;
  if (tipo === "mercadoria") return gruposMercadorias;
  if (tipo === "retirada") return gruposRetiradas;
  return gruposVendas;
}

function ordenarGrupos(linhas: GrupoLinhaBase[]) {
  const filhosPorPai = new Map<string | null, GrupoLinhaBase[]>();
  for (const linha of linhas) {
    const filhos = filhosPorPai.get(linha.grupoPaiId) ?? [];
    filhos.push(linha);
    filhosPorPai.set(linha.grupoPaiId, filhos);
  }
  for (const filhos of filhosPorPai.values()) filhos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const resultado: Array<GrupoLinhaBase & { nivel: number; selecionavel: boolean }> = [];
  const visitar = (grupo: GrupoLinhaBase, nivel: number) => {
    const filhos = filhosPorPai.get(grupo.id) ?? [];
    resultado.push({ ...grupo, nivel, selecionavel: filhos.length === 0 });
    for (const filho of filhos) visitar(filho, nivel + 1);
  };
  for (const raiz of filhosPorPai.get(null) ?? []) visitar(raiz, 0);
  return resultado;
}

export async function listarGruposRepository() {
  const [despesas, mercadorias, retiradas, vendas] = await Promise.all([
    banco
      .select({
        id: gruposDespesas.id,
        empresaId: gruposDespesas.empresaId,
        nome: gruposDespesas.nome,
        grupoPaiId: gruposDespesas.grupoPaiId
      })
      .from(gruposDespesas),
    banco
      .select({
        id: gruposMercadorias.id,
        empresaId: gruposMercadorias.empresaId,
        nome: gruposMercadorias.nome,
        grupoPaiId: gruposMercadorias.grupoPaiId
      })
      .from(gruposMercadorias),
    banco
      .select({
        id: gruposRetiradas.id,
        empresaId: gruposRetiradas.empresaId,
        nome: gruposRetiradas.nome,
        grupoPaiId: gruposRetiradas.grupoPaiId
      })
      .from(gruposRetiradas),
    banco
      .select({
        id: gruposVendas.id,
        empresaId: gruposVendas.empresaId,
        nome: gruposVendas.nome,
        grupoPaiId: gruposVendas.grupoPaiId
      })
      .from(gruposVendas)
  ]);
  return {
    gruposDespesas: ordenarGrupos(despesas),
    gruposMercadorias: ordenarGrupos(mercadorias),
    gruposRetiradas: ordenarGrupos(retiradas),
    gruposVendas: ordenarGrupos(vendas)
  };
}

export async function salvarGrupoRepository(
  input: { id?: string; empresaId: string; tipoGrupo: GrupoTipo; nome: string; grupoPaiId: string | null },
  db: ExecutorBanco = banco
) {
  const tabela = tabelaGrupo(input.tipoGrupo);
  if (input.id) {
    await db
      .update(tabela)
      .set({ nome: input.nome, grupoPaiId: input.grupoPaiId })
      .where(and(eq(tabela.id, input.id), eq(tabela.empresaId, input.empresaId)));
    return input;
  }
  const [criado] = await db
    .insert(tabela)
    .values({ empresaId: input.empresaId, nome: input.nome, grupoPaiId: input.grupoPaiId })
    .returning({ id: tabela.id });
  return criado;
}

async function completarGrupos(empresaDestinoId: string, db: ExecutorBanco) {
  for (const tabela of [gruposDespesas, gruposMercadorias, gruposRetiradas] as const) {
    const destinos = await db.select().from(tabela).where(eq(tabela.empresaId, empresaDestinoId));
    const origens = await db.select().from(tabela);
    for (const destino of destinos) {
      if (!destino.importadoDe || !destino.idImportado) continue;
      const origem = origens.find((item) => item.id === destino.idImportado);
      if (!origem?.grupoPaiId) continue;
      const paiDestino = destinos.find(
        (item) => item.importadoDe === origem.empresaId && item.idImportado === origem.grupoPaiId
      );
      if (paiDestino) await db.update(tabela).set({ grupoPaiId: paiDestino.id }).where(eq(tabela.id, destino.id));
    }
  }
}

export async function copiarGruposRepository(
  filtro: FiltroOrigemEntidade,
  empresaDestinoId: string,
  empresasPermitidasIds: string[] | null,
  modo: ModoImportacaoEntidade = "simples",
  db?: ExecutorBanco
): Promise<ResultadoImportacaoEntidade> {
  return executarComTransacaoOpcional(db, async (db) => {
    let inseridos = 0;
    for (const tabela of [gruposDespesas, gruposMercadorias, gruposRetiradas] as const) {
      const origem = filtrarOrigemEntidade(await db.select().from(tabela), filtro, empresasPermitidasIds);
      const destinos = await db.select().from(tabela).where(eq(tabela.empresaId, empresaDestinoId));
      for (const grupo of origem) {
        if (jaImportado(destinos, grupo.empresaId, grupo.id)) continue;
        await db
          .insert(tabela)
          .values({
            empresaId: empresaDestinoId,
            nome: grupo.nome,
            grupoPaiId: null,
            importadoDe: grupo.empresaId,
            idImportado: grupo.id
          });
        inseridos += 1;
      }
    }
    if (modo === "completo") await completarGrupos(empresaDestinoId, db);
    return { tipo: "grupos", inseridos };
  });
}
