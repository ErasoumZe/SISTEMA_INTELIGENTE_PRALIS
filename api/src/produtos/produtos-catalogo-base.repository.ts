import { and, asc, count, eq, ilike, or } from "drizzle-orm";
import { produtosCatalogoBase } from "@padaria/db/schema/cadastro";
import { banco } from "../banco/conexao.js";

export async function listarCatalogoBaseRepository(input: {
  busca?: string | undefined;
  status?: "ativo" | "inativo" | undefined;
  page: number;
  pageSize: number;
}) {
  const filtros = [];
  if (input.status) filtros.push(eq(produtosCatalogoBase.status, input.status));
  if (input.busca) {
    const termo = `%${input.busca.replace(/[\\%_]/gu, (caractere) => `\\${caractere}`)}%`;
    filtros.push(
      or(
        ilike(produtosCatalogoBase.nome, termo),
        ilike(produtosCatalogoBase.codigoInterno, termo),
        ilike(produtosCatalogoBase.codigoBarras, termo)
      )!
    );
  }
  const where = and(...filtros);
  const [total] = await banco.select({ total: count() }).from(produtosCatalogoBase).where(where);
  const itens = await banco
    .select({
      id: produtosCatalogoBase.id,
      idOrigem: produtosCatalogoBase.idOrigem,
      codigoInterno: produtosCatalogoBase.codigoInterno,
      codigoBarras: produtosCatalogoBase.codigoBarras,
      nome: produtosCatalogoBase.nome,
      status: produtosCatalogoBase.status,
      grupoIdOrigem: produtosCatalogoBase.grupoIdOrigem,
      dadosOficiais: produtosCatalogoBase.dadosOficiais,
      atualizadoEm: produtosCatalogoBase.atualizadoEm
    })
    .from(produtosCatalogoBase)
    .where(where)
    .orderBy(asc(produtosCatalogoBase.nome), asc(produtosCatalogoBase.codigoInterno))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
  return { itens, total: Number(total?.total ?? 0) };
}
