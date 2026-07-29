import { and, asc, eq } from "drizzle-orm";
import { gruposPatrimonio, patrimonioItens, setores } from "@padaria/db/schema/cadastro";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

export async function listarGruposPatrimonioRepository() {
  return banco
    .select({
      id: gruposPatrimonio.id,
      empresaId: gruposPatrimonio.empresaId,
      sig: gruposPatrimonio.sig,
      nome: gruposPatrimonio.nome
    })
    .from(gruposPatrimonio)
    .orderBy(asc(gruposPatrimonio.sig));
}

export async function listarPatrimonioItensRepository() {
  return banco
    .select({
      id: patrimonioItens.id,
      empresaId: patrimonioItens.empresaId,
      nome: patrimonioItens.nome,
      marca: patrimonioItens.marca,
      grupoPatrimonioId: patrimonioItens.grupoPatrimonioId,
      grupo: gruposPatrimonio.nome,
      sig: gruposPatrimonio.sig,
      setorId: patrimonioItens.setorId,
      setor: setores.nome
    })
    .from(patrimonioItens)
    .innerJoin(gruposPatrimonio, eq(gruposPatrimonio.id, patrimonioItens.grupoPatrimonioId))
    .leftJoin(setores, eq(setores.id, patrimonioItens.setorId))
    .orderBy(asc(gruposPatrimonio.sig), asc(patrimonioItens.nome));
}

export async function salvarGrupoPatrimonioRepository(
  input: { id?: string; empresaId: string; sig: string; nome: string },
  db: ExecutorBanco = banco
) {
  if (input.id) {
    await db
      .update(gruposPatrimonio)
      .set({ sig: input.sig, nome: input.nome })
      .where(and(eq(gruposPatrimonio.id, input.id), eq(gruposPatrimonio.empresaId, input.empresaId)));
    return { id: input.id };
  }
  const [criado] = await db
    .insert(gruposPatrimonio)
    .values({ empresaId: input.empresaId, sig: input.sig, nome: input.nome })
    .returning({ id: gruposPatrimonio.id });
  return criado;
}

export async function salvarPatrimonioItemRepository(
  input: {
    id?: string;
    empresaId: string;
    grupoPatrimonioId: string;
    setorId: string | null;
    nome: string;
    marca: string | null;
  },
  db: ExecutorBanco = banco
) {
  const valores = {
    grupoPatrimonioId: input.grupoPatrimonioId,
    setorId: input.setorId,
    nome: input.nome,
    marca: input.marca
  };
  if (input.id) {
    await db
      .update(patrimonioItens)
      .set(valores)
      .where(and(eq(patrimonioItens.id, input.id), eq(patrimonioItens.empresaId, input.empresaId)));
    return { id: input.id };
  }
  const [criado] = await db
    .insert(patrimonioItens)
    .values({ empresaId: input.empresaId, ...valores })
    .returning({ id: patrimonioItens.id });
  return criado;
}

export async function excluirGrupoPatrimonioRepository(id: string, empresasPermitidasIds: string[] | null) {
  const [grupo] = await banco.select().from(gruposPatrimonio).where(eq(gruposPatrimonio.id, id)).limit(1);
  if (!grupo) return { removido: false, motivo: "nao_encontrado" as const };
  if (empresasPermitidasIds && !empresasPermitidasIds.includes(grupo.empresaId))
    return { removido: false, motivo: "empresa" as const };
  // Grupo com item vinculado nao some: o item ficaria orfao de classificacao.
  const [item] = await banco
    .select({ id: patrimonioItens.id })
    .from(patrimonioItens)
    .where(eq(patrimonioItens.grupoPatrimonioId, id))
    .limit(1);
  if (item) return { removido: false, motivo: "em_uso" as const };
  await banco.delete(gruposPatrimonio).where(eq(gruposPatrimonio.id, id));
  return { removido: true, motivo: null };
}

export async function excluirPatrimonioItemRepository(id: string, empresasPermitidasIds: string[] | null) {
  const [item] = await banco.select().from(patrimonioItens).where(eq(patrimonioItens.id, id)).limit(1);
  if (!item) return { removido: false, motivo: "nao_encontrado" as const };
  if (empresasPermitidasIds && !empresasPermitidasIds.includes(item.empresaId))
    return { removido: false, motivo: "empresa" as const };
  await banco.delete(patrimonioItens).where(eq(patrimonioItens.id, id));
  return { removido: true, motivo: null };
}
