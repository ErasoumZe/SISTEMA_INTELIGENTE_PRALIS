import { and, asc, eq } from "drizzle-orm";
import { gruposMercadorias, produtos, produtosConversoes, unidadesMedida } from "@padaria/db/schema/cadastro";
import { banco, executarComTransacaoOpcional } from "../banco/conexao.js";
import type { ExecutorBanco } from "../banco/conexao.js";
import {
  filtrarOrigemEntidade,
  jaImportado,
  type FiltroOrigemEntidade,
  type ModoImportacaoEntidade,
  type ResultadoImportacaoEntidade
} from "../utils.js";

export async function listarProdutosRepository() {
  const linhas = await banco
    .select({
      id: produtos.id,
      empresaId: produtos.empresaId,
      grupoMercadoriaId: produtos.grupoMercadoriaId,
      unidadeMedidaId: produtos.unidadeMedidaId,
      unidadeIndividualId: produtos.unidadeIndividualId,
      codigo: produtos.codigo,
      codigoBarras: produtos.codigoBarras,
      descricao: produtos.descricao,
      marca: produtos.marca,
      quantidadeIndividual: produtos.quantidadeIndividual,
      custo: produtos.custo,
      margem: produtos.margem,
      precoVenda: produtos.precoVenda,
      auto: produtos.auto,
      status: produtos.status,
      tipo: produtos.tipo
    })
    .from(produtos)
    .orderBy(asc(produtos.descricao));
  const conversoes = await banco
    .select({
      id: produtosConversoes.id,
      produtoId: produtosConversoes.produtoId,
      unidadeMedidaId: produtosConversoes.unidadeMedidaId,
      quantidade: produtosConversoes.quantidade,
      unidadesIndividuais: produtosConversoes.unidadesIndividuais
    })
    .from(produtosConversoes);
  return linhas.map((produto) => ({
    ...produto,
    conversoes: conversoes.filter((conversao) => conversao.produtoId === produto.id)
  }));
}

export async function salvarProdutoRepository(input: {
  id?: string;
  empresaId: string;
  codigo: string | null;
  codigoBarras: string | null;
  descricao: string;
  marca: string | null;
  unidadeIndividualId: string;
  quantidadeIndividual: number;
  grupoMercadoriaId: string | null;
  custo: number | null;
  margem: number | null;
  precoVenda: number | null;
  auto: boolean;
  status: "ativo" | "inativo";
  tipo: "revenda" | "transformacao";
  conversoes: Array<{ unidadeMedidaId: string; quantidade: number; unidadesIndividuais: number }>;
}) {
  return banco.transaction(async (tx) => {
    const valores = {
      empresaId: input.empresaId,
      codigo: input.codigo,
      codigoBarras: input.codigoBarras,
      descricao: input.descricao,
      marca: input.marca,
      unidadeMedidaId: input.unidadeIndividualId,
      unidadeIndividualId: input.unidadeIndividualId,
      quantidadeIndividual: String(input.quantidadeIndividual),
      grupoMercadoriaId: input.grupoMercadoriaId,
      custo: input.custo != null ? String(input.custo) : null,
      margem: input.margem != null ? String(input.margem) : null,
      precoVenda: input.precoVenda != null ? String(input.precoVenda) : null,
      auto: input.auto,
      status: input.status,
      tipo: input.tipo
    };
    const produtoId = input.id
      ? input.id
      : (await tx.insert(produtos).values(valores).returning({ id: produtos.id }))[0]?.id;
    if (!produtoId) throw new Error("Produto nao criado");
    if (input.id) {
      await tx
        .update(produtos)
        .set(valores)
        .where(and(eq(produtos.id, input.id), eq(produtos.empresaId, input.empresaId)));
    }
    await tx.delete(produtosConversoes).where(eq(produtosConversoes.produtoId, produtoId));
    if (input.conversoes.length) {
      await tx.insert(produtosConversoes).values(
        input.conversoes.map((conversao) => ({
          produtoId,
          unidadeMedidaId: conversao.unidadeMedidaId,
          quantidade: String(conversao.quantidade),
          unidadesIndividuais: String(conversao.unidadesIndividuais)
        }))
      );
    }
    return { id: produtoId, empresaId: input.empresaId };
  });
}

async function completarProdutos(empresaDestinoId: string, db: ExecutorBanco) {
  const produtosDestino = await db.select().from(produtos).where(eq(produtos.empresaId, empresaDestinoId));
  const produtosOrigem = await db.select().from(produtos);
  const gruposDestino = await db
    .select()
    .from(gruposMercadorias)
    .where(eq(gruposMercadorias.empresaId, empresaDestinoId));
  const unidadesDestino = await db.select().from(unidadesMedida).where(eq(unidadesMedida.empresaId, empresaDestinoId));
  for (const destino of produtosDestino) {
    if (!destino.importadoDe || !destino.idImportado) continue;
    const origem = produtosOrigem.find((item) => item.id === destino.idImportado);
    if (!origem) continue;
    const grupoDestino = origem.grupoMercadoriaId
      ? gruposDestino.find(
          (item) => item.importadoDe === origem.empresaId && item.idImportado === origem.grupoMercadoriaId
        )
      : null;
    const unidadeDestino = origem.unidadeMedidaId
      ? unidadesDestino.find(
          (item) => item.importadoDe === origem.empresaId && item.idImportado === origem.unidadeMedidaId
        )
      : null;
    await db
      .update(produtos)
      .set({ grupoMercadoriaId: grupoDestino?.id ?? null, unidadeMedidaId: unidadeDestino?.id ?? null })
      .where(eq(produtos.id, destino.id));
  }
}

export async function copiarProdutosRepository(
  filtro: FiltroOrigemEntidade,
  empresaDestinoId: string,
  empresasPermitidasIds: string[] | null,
  modo: ModoImportacaoEntidade = "simples",
  db?: ExecutorBanco
): Promise<ResultadoImportacaoEntidade> {
  return executarComTransacaoOpcional(db, async (db) => {
    const origem = filtrarOrigemEntidade(await db.select().from(produtos), filtro, empresasPermitidasIds);
    const destinos = await db.select().from(produtos).where(eq(produtos.empresaId, empresaDestinoId));
    let inseridos = 0;
    for (const produto of origem) {
      if (jaImportado(destinos, produto.empresaId, produto.id)) continue;
      await db.insert(produtos).values({
        empresaId: empresaDestinoId,
        codigo: produto.codigo,
        codigoBarras: produto.codigoBarras,
        descricao: produto.descricao,
        marca: produto.marca,
        grupoMercadoriaId: null,
        unidadeMedidaId: null,
        unidadeIndividualId: null,
        quantidadeIndividual: produto.quantidadeIndividual,
        importadoDe: produto.empresaId,
        idImportado: produto.id
      });
      inseridos += 1;
    }
    if (modo === "completo") await completarProdutos(empresaDestinoId, db);
    return { tipo: "produtos", inseridos };
  });
}
