import { and } from "drizzle-orm";
import { mercadorias, mercadoriasItens } from "@padaria/db/schema/mercadoria";
import type { MercadoriaDto, MercadoriaPayload, MercadoriasQuery } from "@padaria/shared/mercadorias";
import { banco } from "../banco/conexao.js";
import { filtrosEmpresa, valoresBase } from "./mercadorias.lancamento.js";

export async function listarMercadoriasRepository(
  query: MercadoriasQuery,
  empresasPermitidasIds: string[] | null
): Promise<MercadoriaDto[]> {
  const filtros = filtrosEmpresa(mercadorias, query, empresasPermitidasIds);
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
  caixaId?: string | null
): Promise<{ id: string }> {
  return banco.transaction(async (tx) => {
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

