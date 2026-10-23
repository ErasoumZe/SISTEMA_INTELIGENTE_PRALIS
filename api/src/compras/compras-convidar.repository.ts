import { and, eq, inArray, ne } from "drizzle-orm";
import {
  comprasRodadas,
  comprasRodadasConvites,
  fornecedores,
  fornecedoresProdutos,
  fornecedoresProdutosEventos
} from "@padaria/db/schema";
import { banco, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";

// MODULO DO COMPRADOR — reenvio do convite e o vinculo que o responsavel escolhe na Solicitacao de compra
// (doc 58 §2: o vinculo vai para o catalogo e a proxima data ja manda).

export async function rodadaParaConviteRepository(rodadaId: string, empresaId: string, db: ExecutorBanco = banco) {
  const [linha] = await db
    .select({ id: comprasRodadas.id, solicitacaoId: comprasRodadas.solicitacaoId })
    .from(comprasRodadas)
    .where(and(eq(comprasRodadas.id, rodadaId), eq(comprasRodadas.empresaId, empresaId)))
    .limit(1);
  return linha ?? null;
}

export async function travarRodadaRepository(rodadaId: string, tx: TransacaoBanco) {
  const [linha] = await tx
    .select({ id: comprasRodadas.id, status: comprasRodadas.status, expiraEm: comprasRodadas.expiraEm })
    .from(comprasRodadas)
    .where(eq(comprasRodadas.id, rodadaId))
    .for("update")
    .limit(1);
  return linha ?? null;
}

/** Os itens pedidos que sao desta rodada, com o produto (para o catalogo). */
/**
 * O comprador escolheu este fornecedor para estes produtos: o vinculo do catalogo fica aprovado (nasce
 * aprovado ou sai de pendente/rejeitado), com a trilha de quem decidiu.
 */
export async function aprovarVinculosRepository(
  input: { empresaId: string; fornecedorId: string; produtoIds: string[]; usuarioId: string },
  tx: TransacaoBanco
) {
  const observacao = "Escolhido pelo comprador para um item A fazer";
  const agora = new Date();
  const criados = await tx
    .insert(fornecedoresProdutos)
    .values(
      input.produtoIds.map((produtoId) => ({
        empresaId: input.empresaId,
        fornecedorId: input.fornecedorId,
        produtoId,
        status: "aprovado" as const,
        origem: "compras" as const,
        criadoPor: input.usuarioId,
        aprovadoPor: input.usuarioId,
        aprovadoEm: agora,
        observacao
      }))
    )
    .onConflictDoNothing()
    .returning({ id: fornecedoresProdutos.id });
  const criadosIds = new Set(criados.map((vinculo) => vinculo.id));
  const naoAprovados = (
    await tx
      .select({ id: fornecedoresProdutos.id, status: fornecedoresProdutos.status })
      .from(fornecedoresProdutos)
      .where(
        and(
          eq(fornecedoresProdutos.empresaId, input.empresaId),
          eq(fornecedoresProdutos.fornecedorId, input.fornecedorId),
          inArray(fornecedoresProdutos.produtoId, input.produtoIds),
          ne(fornecedoresProdutos.status, "aprovado")
        )
      )
      .for("update")
  ).filter((vinculo) => !criadosIds.has(vinculo.id));
  if (naoAprovados.length)
    await tx
      .update(fornecedoresProdutos)
      .set({ status: "aprovado", aprovadoPor: input.usuarioId, aprovadoEm: agora })
      .where(
        inArray(
          fornecedoresProdutos.id,
          naoAprovados.map((vinculo) => vinculo.id)
        )
      );
  const eventos = [
    ...criados.map((vinculo) => ({ id: vinculo.id, anterior: null })),
    ...naoAprovados.map((vinculo) => ({ id: vinculo.id, anterior: vinculo.status as "pendente" | "rejeitado" }))
  ];
  if (eventos.length)
    await tx.insert(fornecedoresProdutosEventos).values(
      eventos.map((evento) => ({
        empresaId: input.empresaId,
        fornecedorProdutoId: evento.id,
        statusAnterior: evento.anterior,
        statusNovo: "aprovado" as const,
        atorTipo: "usuario" as const,
        usuarioId: input.usuarioId,
        observacao
      }))
    );
}

export async function conviteParaReenvioRepository(
  conviteId: string,
  rodadaId: string,
  empresaId: string,
  tx: TransacaoBanco
) {
  const [linha] = await tx
    .select({
      id: comprasRodadasConvites.id,
      status: comprasRodadasConvites.status,
      whatsapp: fornecedores.whatsapp,
      situacao: fornecedores.situacao,
      nome: fornecedores.nome
    })
    .from(comprasRodadasConvites)
    .innerJoin(fornecedores, eq(fornecedores.id, comprasRodadasConvites.fornecedorId))
    .where(
      and(
        eq(comprasRodadasConvites.id, conviteId),
        eq(comprasRodadasConvites.rodadaId, rodadaId),
        eq(comprasRodadasConvites.empresaId, empresaId)
      )
    )
    .for("update", { of: comprasRodadasConvites })
    .limit(1);
  return linha ?? null;
}
