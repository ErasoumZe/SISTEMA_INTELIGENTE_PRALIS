import { and, eq, ilike, or } from "drizzle-orm";
import type { JsonValue } from "@padaria/shared/api";
import type { ValoresHerdados } from "@padaria/shared/produtos";
import {
  gruposMercadorias,
  produtos,
  produtosCatalogoBase,
  produtosTransformacao,
  unidadesMedida
} from "@padaria/db/schema/cadastro";
import { banco, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";
import { valoresHerdadosDaCopia } from "./produtos-base.dados.js";

/** Linha do catalogo mestre BASE como o ERP a grava. */
export interface LinhaProdutoBase {
  codigoInterno: string | null;
  codigoBarras: string | null;
  nome: string;
  status: "ativo" | "inativo";
  grupoIdOrigem: string | null;
  dadosOficiais: Record<string, JsonValue>;
}

/** Sigla da unidade e nome do grupo escolhidos na tela, na empresa de referencia de quem cadastra. */
export async function nomesDaReferenciaRepository(
  tx: TransacaoBanco,
  entrada: { empresaId: string; unidadeId: string; grupoId: string | null }
): Promise<{ sigla: string | null; grupoNome: string | null }> {
  const [unidade] = await tx
    .select({ sigla: unidadesMedida.sigla })
    .from(unidadesMedida)
    .where(and(eq(unidadesMedida.id, entrada.unidadeId), eq(unidadesMedida.empresaId, entrada.empresaId)))
    .limit(1);
  const [grupo] = entrada.grupoId
    ? await tx
        .select({ nome: gruposMercadorias.nome })
        .from(gruposMercadorias)
        .where(and(eq(gruposMercadorias.id, entrada.grupoId), eq(gruposMercadorias.empresaId, entrada.empresaId)))
        .limit(1)
    : [];
  return { sigla: unidade?.sigla ?? null, grupoNome: grupo?.nome ?? null };
}

/** Oficial `findDuplicate` na BASE: mesmo nome (sem diferenciar maiusculas) OU mesmo codigo de barras. */
export async function duplicadoNaBaseRepository(
  tx: TransacaoBanco,
  entrada: { nome: string; codigoBarras: string | null }
): Promise<{ nome: string } | null> {
  const nomeExato = entrada.nome.replace(/[\\%_]/gu, (caractere) => `\\${caractere}`);
  const condicoes = [ilike(produtosCatalogoBase.nome, nomeExato)];
  if (entrada.codigoBarras) condicoes.push(eq(produtosCatalogoBase.codigoBarras, entrada.codigoBarras));
  const [achado] = await tx
    .select({ nome: produtosCatalogoBase.nome })
    .from(produtosCatalogoBase)
    .where(or(...condicoes))
    .limit(1);
  return achado ?? null;
}

export async function inserirProdutoBaseRepository(
  tx: TransacaoBanco,
  linha: LinhaProdutoBase & { idOrigem: string }
): Promise<string> {
  const [inserido] = await tx
    .insert(produtosCatalogoBase)
    .values({ ...linha, atualizadoEm: new Date() })
    .returning({ id: produtosCatalogoBase.id });
  if (!inserido) throw new Error("Produto da BASE nao criado");
  return inserido.id;
}

/** Le a linha da BASE sem travar (detalhe para a tela e selo de heranca). */
export async function buscarProdutoBaseRepository(id: string, db: ExecutorBanco = banco) {
  const [linha] = await db.select().from(produtosCatalogoBase).where(eq(produtosCatalogoBase.id, id)).limit(1);
  return linha ?? null;
}

/** Carrega e TRAVA a linha da BASE antes de editar (a propagacao compara com o valor antigo). */
export async function carregarProdutoBaseRepository(tx: TransacaoBanco, id: string) {
  const [linha] = await tx.select().from(produtosCatalogoBase).where(eq(produtosCatalogoBase.id, id)).for("update");
  return linha ?? null;
}

export async function atualizarProdutoBaseRepository(tx: TransacaoBanco, id: string, linha: LinhaProdutoBase) {
  await tx
    .update(produtosCatalogoBase)
    .set({ ...linha, atualizadoEm: new Date() })
    .where(eq(produtosCatalogoBase.id, id));
}

/** Unidades e grupos de uma loja — a BASE guarda sigla e nome; cada loja resolve para o seu id. */
export async function unidadesEGruposDaEmpresaRepository(empresaId: string, tx: ExecutorBanco = banco) {
  const [unidades, grupos] = await Promise.all([
    tx
      .select({ id: unidadesMedida.id, sigla: unidadesMedida.sigla })
      .from(unidadesMedida)
      .where(eq(unidadesMedida.empresaId, empresaId)),
    tx
      .select({ id: gruposMercadorias.id, nome: gruposMercadorias.nome })
      .from(gruposMercadorias)
      .where(eq(gruposMercadorias.empresaId, empresaId))
  ]);
  return { unidades, grupos };
}

/** Copias deste produto da BASE nas lojas, travadas, com os campos herdados como estao gravados. */
export async function copiasDaBaseRepository(
  tx: TransacaoBanco,
  produtoBaseId: string
): Promise<Array<{ id: string; empresaId: string; valores: ValoresHerdados }>> {
  const linhas = await tx
    .select({
      id: produtos.id,
      empresaId: produtos.empresaId,
      descricao: produtos.descricao,
      nomeCatalogo: produtos.nomeCatalogo,
      quantidadeIndividual: produtos.quantidadeIndividual,
      unidadeIndividualId: produtos.unidadeIndividualId,
      pesavel: produtos.pesavel,
      teclaBalanca: produtos.teclaBalanca,
      validadeBalanca: produtos.validadeBalanca,
      codigoBarras: produtos.codigoBarras,
      marca: produtos.marca,
      embalagem: produtos.embalagem,
      cDe: produtos.cDe,
      quantidadeCaixa: produtos.quantidadeCaixa,
      medidaCompra: produtos.medidaCompra,
      compraAproximada: produtos.compraAproximada,
      codigoInterno: produtos.codigoInterno,
      fotoUrl: produtos.fotoUrl,
      grupoMercadoriaId: produtos.grupoMercadoriaId,
      grupoIdExterno: produtos.grupoIdExterno,
      tipo: produtos.tipo,
      habilitarAjuda: produtos.habilitarAjuda
    })
    .from(produtos)
    .where(eq(produtos.produtoBaseId, produtoBaseId))
    .for("update");
  const resultado: Array<{ id: string; empresaId: string; valores: ValoresHerdados }> = [];
  for (const linha of linhas) {
    const [transformacao] = await tx
      .select({
        precisao: produtosTransformacao.precisao,
        quantidade: produtosTransformacao.quantidade,
        unidade: produtosTransformacao.unidade,
        produtoReceituario: produtosTransformacao.produtoReceituario,
        refReceituario: produtosTransformacao.refReceituario
      })
      .from(produtosTransformacao)
      .where(eq(produtosTransformacao.produtoId, linha.id))
      .limit(1);
    resultado.push({
      id: linha.id,
      empresaId: linha.empresaId,
      valores: valoresHerdadosDaCopia({ ...linha, transformacao: transformacao ?? null })
    });
  }
  return resultado;
}

/** Grava na copia so os campos herdados que a BASE mudou e que a loja ainda seguia. */
export async function aplicarHerancaNaCopiaRepository(
  tx: TransacaoBanco,
  produtoId: string,
  patch: Partial<ValoresHerdados>
): Promise<void> {
  const { transformacao, quantidadeIndividual, unidadeIndividualId, ...colunas } = patch;
  const valores = {
    ...colunas,
    ...(quantidadeIndividual === undefined ? {} : { quantidadeIndividual: String(quantidadeIndividual) }),
    ...(unidadeIndividualId === undefined ? {} : { unidadeIndividualId, unidadeMedidaId: unidadeIndividualId })
  };
  if (Object.keys(valores).length) {
    await tx.update(produtos).set(valores).where(eq(produtos.id, produtoId));
  }
  if (transformacao === undefined) return;
  await tx.delete(produtosTransformacao).where(eq(produtosTransformacao.produtoId, produtoId));
  if (transformacao) {
    await tx.insert(produtosTransformacao).values({
      produtoId,
      precisao: transformacao.precisao,
      quantidade: transformacao.quantidade == null ? null : String(transformacao.quantidade),
      unidade: transformacao.unidade,
      produtoReceituario: transformacao.produtoReceituario,
      refReceituario: transformacao.refReceituario
    });
  }
}
