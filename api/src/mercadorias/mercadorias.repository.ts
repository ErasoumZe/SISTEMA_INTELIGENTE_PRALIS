import { and, eq } from "drizzle-orm";
import { mercadorias, mercadoriasItens } from "@padaria/db/schema/mercadoria";
import type {
  MercadoriaDetalheDto,
  MercadoriaDto,
  MercadoriaPayload,
  MercadoriasQuery
} from "@padaria/shared/mercadorias";
import { banco, executarComTransacaoOpcional, type ExecutorBanco } from "../banco/conexao.js";
import { filtrosEmpresa, numeroDecimal, valoresBase, valoresBaseEdicao } from "../lancamentos/lancamentos.dominio.js";

export async function listarMercadoriasRepository(
  query: MercadoriasQuery,
  empresasPermitidasIds: string[] | null
): Promise<MercadoriaDto[]> {
  const filtros = filtrosEmpresa(mercadorias, query, empresasPermitidasIds);
  if (query.caixaId) filtros.push(eq(mercadorias.caixaId, query.caixaId));
  return banco
    .select({
      id: mercadorias.id,
      empresaId: mercadorias.empresaId,
      dataReferencia: mercadorias.dataReferencia,
      descricao: mercadorias.descricao,
      valorOriginal: mercadorias.valorOriginal,
      computar: mercadorias.computar,
      status: mercadorias.status
    })
    .from(mercadorias)
    .where(filtros.length ? and(...filtros) : undefined);
}

export async function criarMercadoriaRepository(
  dados: MercadoriaPayload,
  computar: boolean,
  criadoPor: string,
  caixaId?: string | null,
  db?: ExecutorBanco
): Promise<{ id: string }> {
  return executarComTransacaoOpcional(db, async (tx) => {
    const [mercadoria] = await tx
      .insert(mercadorias)
      .values({
        ...valoresBase(dados, computar, criadoPor, caixaId),
        dataVencimento: dados.dataVencimento,
        fornecedorId: dados.fornecedorId,
        grupoMercadoriaId: dados.grupoMercadoriaId ?? null,
        notaFiscalId: dados.notaFiscalId ?? null,
        temNotaFiscal: dados.temNotaFiscal,
        fotoDocumentoUrl: dados.fotoDocumentoUrl ?? null
      })
      .returning({ id: mercadorias.id });
    if (!mercadoria) throw new Error("Mercadoria nao criada");

    for (const item of dados.itensMercadoria) {
      await tx.insert(mercadoriasItens).values({
        mercadoriaId: mercadoria.id,
        produtoId: item.produtoId ?? null,
        grupoMercadoriaId: item.grupoMercadoriaId ?? dados.grupoMercadoriaId ?? null,
        unidadeMedidaId: item.unidadeMedidaId ?? null,
        descricao: item.descricao,
        quantidade: String(item.quantidade),
        valorUnitario: String(item.valorUnitario),
        valorTotal: String(item.valorTotal)
      });
    }

    return mercadoria;
  });
}

export async function buscarMercadoriaDetalheRepository(
  mercadoriaId: string,
  db: ExecutorBanco = banco
): Promise<MercadoriaDetalheDto | null> {
  const [mercadoria] = await db
    .select({
      id: mercadorias.id,
      empresaId: mercadorias.empresaId,
      caixaId: mercadorias.caixaId,
      status: mercadorias.status,
      dataReferencia: mercadorias.dataReferencia,
      dataVencimento: mercadorias.dataVencimento,
      dataPagamento: mercadorias.dataPagamento,
      descricao: mercadorias.descricao,
      observacao: mercadorias.observacao,
      valorOriginal: mercadorias.valorOriginal,
      valorAcrescimo: mercadorias.valorAcrescimo,
      descricaoAcrescimo: mercadorias.descricaoAcrescimo,
      valorDesconto: mercadorias.valorDesconto,
      descricaoDesconto: mercadorias.descricaoDesconto,
      contaOrigemId: mercadorias.contaOrigemId,
      fornecedorId: mercadorias.fornecedorId,
      grupoMercadoriaId: mercadorias.grupoMercadoriaId,
      notaFiscalId: mercadorias.notaFiscalId,
      temNotaFiscal: mercadorias.temNotaFiscal,
      fotoDocumentoUrl: mercadorias.fotoDocumentoUrl,
      computar: mercadorias.computar
    })
    .from(mercadorias)
    .where(eq(mercadorias.id, mercadoriaId))
    .limit(1);
  if (!mercadoria) return null;
  if (!mercadoria.fornecedorId) return null;

  const itens = await db
    .select({
      produtoId: mercadoriasItens.produtoId,
      grupoMercadoriaId: mercadoriasItens.grupoMercadoriaId,
      unidadeMedidaId: mercadoriasItens.unidadeMedidaId,
      descricao: mercadoriasItens.descricao,
      quantidade: mercadoriasItens.quantidade,
      valorUnitario: mercadoriasItens.valorUnitario,
      valorTotal: mercadoriasItens.valorTotal
    })
    .from(mercadoriasItens)
    .where(eq(mercadoriasItens.mercadoriaId, mercadoriaId));

  return {
    ...mercadoria,
    fornecedorId: mercadoria.fornecedorId,
    valorOriginal: numeroDecimal(mercadoria.valorOriginal),
    valorAcrescimo: numeroDecimal(mercadoria.valorAcrescimo),
    valorDesconto: numeroDecimal(mercadoria.valorDesconto),
    itensMercadoria: itens.map((item) => ({
      ...item,
      quantidade: Number(item.quantidade),
      valorUnitario: Number(item.valorUnitario),
      valorTotal: numeroDecimal(item.valorTotal)
    }))
  };
}

export async function atualizarMercadoriaRepository(
  mercadoriaId: string,
  dados: MercadoriaPayload,
  computar: boolean,
  db?: ExecutorBanco
): Promise<void> {
  await executarComTransacaoOpcional(db, async (tx) => {
    await tx
      .update(mercadorias)
      .set({
        ...valoresBaseEdicao(dados, computar),
        dataVencimento: dados.dataVencimento,
        fornecedorId: dados.fornecedorId,
        grupoMercadoriaId: dados.grupoMercadoriaId ?? null,
        notaFiscalId: dados.notaFiscalId ?? null,
        temNotaFiscal: dados.temNotaFiscal,
        fotoDocumentoUrl: dados.fotoDocumentoUrl ?? null
      })
      .where(eq(mercadorias.id, mercadoriaId));

    await tx.delete(mercadoriasItens).where(eq(mercadoriasItens.mercadoriaId, mercadoriaId));
    for (const item of dados.itensMercadoria) {
      await tx.insert(mercadoriasItens).values({
        mercadoriaId,
        produtoId: item.produtoId ?? null,
        grupoMercadoriaId: item.grupoMercadoriaId ?? dados.grupoMercadoriaId ?? null,
        unidadeMedidaId: item.unidadeMedidaId ?? null,
        descricao: item.descricao,
        quantidade: String(item.quantidade),
        valorUnitario: String(item.valorUnitario),
        valorTotal: String(item.valorTotal)
      });
    }
  });
}
