import { and, asc, desc, eq, sql } from "drizzle-orm";
import { comprasSolicitacoes, comprasSolicitacoesItens } from "@padaria/db/schema/cadastro";
import { banco, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";

export type ItemEntrada = {
  produtoId: string;
  descricaoProduto: string;
  quantidade: number;
  estoqueAtual: number | null;
  estoqueMin: number | null;
  estoqueMax: number | null;
};

function valoresItens(empresaId: string, solicitacaoId: string, itens: ItemEntrada[]) {
  return itens.map((item) => ({
    empresaId,
    solicitacaoId,
    produtoId: item.produtoId,
    descricaoProduto: item.descricaoProduto,
    quantidade: String(item.quantidade),
    estoqueAtual: item.estoqueAtual === null ? null : String(item.estoqueAtual),
    estoqueMin: item.estoqueMin === null ? null : String(item.estoqueMin),
    estoqueMax: item.estoqueMax === null ? null : String(item.estoqueMax)
  }));
}

export async function criarSolicitacaoRepository(
  input: {
    empresaId: string;
    origem: "manual" | "sugestao" | "rapida";
    observacao: string | null;
    criadoPor: string;
    itens: ItemEntrada[];
  },
  tx: TransacaoBanco
) {
  const [solicitacao] = await tx
    .insert(comprasSolicitacoes)
    .values({
      empresaId: input.empresaId,
      origem: input.origem,
      observacao: input.observacao,
      criadoPor: input.criadoPor
    })
    .returning({ id: comprasSolicitacoes.id });
  if (!solicitacao) throw new Error("Solicitacao nao criada");
  await tx.insert(comprasSolicitacoesItens).values(valoresItens(input.empresaId, solicitacao.id, input.itens));
  return { id: solicitacao.id };
}

/** Trava a solicitacao e devolve o status, para a edicao so acontecer em rascunho. */
export async function buscarSolicitacaoParaEdicaoRepository(id: string, empresaId: string, tx: TransacaoBanco) {
  const [linha] = await tx
    .select({ id: comprasSolicitacoes.id, status: comprasSolicitacoes.status })
    .from(comprasSolicitacoes)
    .where(and(eq(comprasSolicitacoes.id, id), eq(comprasSolicitacoes.empresaId, empresaId)))
    .limit(1)
    .for("update");
  return linha ?? null;
}

export async function atualizarSolicitacaoRepository(
  input: { id: string; empresaId: string; observacao: string | null; itens: ItemEntrada[] },
  tx: TransacaoBanco
) {
  await tx
    .update(comprasSolicitacoes)
    .set({ observacao: input.observacao })
    .where(and(eq(comprasSolicitacoes.id, input.id), eq(comprasSolicitacoes.empresaId, input.empresaId)));
  // Itens substituem os anteriores (mesmo padrao do pedido legado). O cascade do FK nao se aplica a
  // delete manual, entao apagamos por solicitacao_id.
  await tx.delete(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.solicitacaoId, input.id));
  await tx.insert(comprasSolicitacoesItens).values(valoresItens(input.empresaId, input.id, input.itens));
  return { id: input.id };
}

export async function listarSolicitacoesRepository(
  empresaId: string,
  status: string | undefined,
  db: ExecutorBanco = banco
) {
  return db
    .select({
      id: comprasSolicitacoes.id,
      empresaId: comprasSolicitacoes.empresaId,
      status: comprasSolicitacoes.status,
      origem: comprasSolicitacoes.origem,
      observacao: comprasSolicitacoes.observacao,
      criadoEm: comprasSolicitacoes.criadoEm,
      totalItens: sql<number>`count(${comprasSolicitacoesItens.id})::int`
    })
    .from(comprasSolicitacoes)
    .leftJoin(comprasSolicitacoesItens, eq(comprasSolicitacoesItens.solicitacaoId, comprasSolicitacoes.id))
    .where(
      and(
        eq(comprasSolicitacoes.empresaId, empresaId),
        ...(status ? [eq(comprasSolicitacoes.status, status as "rascunho")] : [])
      )
    )
    .groupBy(
      comprasSolicitacoes.id,
      comprasSolicitacoes.empresaId,
      comprasSolicitacoes.status,
      comprasSolicitacoes.origem,
      comprasSolicitacoes.observacao,
      comprasSolicitacoes.criadoEm
    )
    .orderBy(desc(comprasSolicitacoes.criadoEm));
}

export async function detalharSolicitacaoRepository(id: string, empresaId?: string, db: ExecutorBanco = banco) {
  const [solicitacao] = await db
    .select()
    .from(comprasSolicitacoes)
    .where(and(eq(comprasSolicitacoes.id, id), ...(empresaId ? [eq(comprasSolicitacoes.empresaId, empresaId)] : [])))
    .limit(1);
  if (!solicitacao) return null;
  const itens = await db
    .select({
      id: comprasSolicitacoesItens.id,
      produtoId: comprasSolicitacoesItens.produtoId,
      descricaoProduto: comprasSolicitacoesItens.descricaoProduto,
      quantidade: comprasSolicitacoesItens.quantidade,
      estoqueAtual: comprasSolicitacoesItens.estoqueAtual,
      estoqueMin: comprasSolicitacoesItens.estoqueMin,
      estoqueMax: comprasSolicitacoesItens.estoqueMax
    })
    .from(comprasSolicitacoesItens)
    .where(eq(comprasSolicitacoesItens.solicitacaoId, id))
    .orderBy(asc(comprasSolicitacoesItens.descricaoProduto));
  return { ...solicitacao, itens };
}
