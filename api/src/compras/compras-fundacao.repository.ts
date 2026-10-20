import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  comprasImportacoesPrecoBase,
  comprasImportacoesPrecoBaseItens,
  fornecedores,
  fornecedoresProdutos,
  fornecedoresProdutosEventos,
  produtos,
  produtosPrecosBase
} from "@padaria/db/schema/cadastro";
import { banco, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";

export async function listarCatalogoFornecedorRepository(
  filtro: {
    empresaId: string;
    fornecedorId?: string | undefined;
    status?: "pendente" | "aprovado" | "rejeitado" | undefined;
  },
  db: ExecutorBanco = banco
) {
  return db
    .select({
      id: fornecedoresProdutos.id,
      empresaId: fornecedoresProdutos.empresaId,
      fornecedorId: fornecedoresProdutos.fornecedorId,
      fornecedorNome: fornecedores.nome,
      produtoId: fornecedoresProdutos.produtoId,
      produtoDescricao: produtos.descricao,
      produtoCodigo: produtos.codigo,
      produtoEan: produtos.codigoBarras,
      status: fornecedoresProdutos.status,
      origem: fornecedoresProdutos.origem,
      precoOfertado: fornecedoresProdutos.precoOfertado,
      observacao: fornecedoresProdutos.observacao,
      aprovadoEm: fornecedoresProdutos.aprovadoEm,
      criadoEm: fornecedoresProdutos.criadoEm,
      atualizadoEm: fornecedoresProdutos.atualizadoEm
    })
    .from(fornecedoresProdutos)
    .innerJoin(fornecedores, eq(fornecedores.id, fornecedoresProdutos.fornecedorId))
    .innerJoin(produtos, eq(produtos.id, fornecedoresProdutos.produtoId))
    .where(
      and(
        eq(fornecedoresProdutos.empresaId, filtro.empresaId),
        filtro.fornecedorId ? eq(fornecedoresProdutos.fornecedorId, filtro.fornecedorId) : undefined,
        filtro.status ? eq(fornecedoresProdutos.status, filtro.status) : undefined
      )
    )
    .orderBy(asc(fornecedores.nome), asc(produtos.descricao));
}

export async function buscarVinculoCatalogoRepository(id: string, empresaId: string, db: ExecutorBanco = banco) {
  const [linha] = await db
    .select()
    .from(fornecedoresProdutos)
    .where(and(eq(fornecedoresProdutos.id, id), eq(fornecedoresProdutos.empresaId, empresaId)))
    .limit(1);
  return linha ?? null;
}

export async function buscarVinculoCatalogoPorChaveRepository(
  empresaId: string,
  fornecedorId: string,
  produtoId: string,
  db: ExecutorBanco = banco
) {
  const [linha] = await db
    .select()
    .from(fornecedoresProdutos)
    .where(
      and(
        eq(fornecedoresProdutos.empresaId, empresaId),
        eq(fornecedoresProdutos.fornecedorId, fornecedorId),
        eq(fornecedoresProdutos.produtoId, produtoId)
      )
    )
    .limit(1);
  return linha ?? null;
}

export async function validarFornecedorEProdutoRepository(
  empresaId: string,
  fornecedorId: string,
  produtoId: string,
  db: ExecutorBanco = banco
) {
  const [fornecedor, produto] = await Promise.all([
    db
      .select({ id: fornecedores.id })
      .from(fornecedores)
      .where(and(eq(fornecedores.id, fornecedorId), eq(fornecedores.empresaId, empresaId)))
      .limit(1),
    db
      .select({ id: produtos.id })
      .from(produtos)
      .where(and(eq(produtos.id, produtoId), eq(produtos.empresaId, empresaId)))
      .limit(1)
  ]);
  return { fornecedorExiste: Boolean(fornecedor[0]), produtoExiste: Boolean(produto[0]) };
}

export async function criarVinculoCatalogoRepository(
  input: {
    empresaId: string;
    fornecedorId: string;
    produtoId: string;
    precoOfertado: number | null;
    observacao: string | null;
    usuarioId: string;
  },
  tx: TransacaoBanco
) {
  const [criado] = await tx
    .insert(fornecedoresProdutos)
    .values({
      empresaId: input.empresaId,
      fornecedorId: input.fornecedorId,
      produtoId: input.produtoId,
      status: "aprovado",
      origem: "compras",
      precoOfertado: input.precoOfertado == null ? null : String(input.precoOfertado),
      observacao: input.observacao,
      criadoPor: input.usuarioId,
      aprovadoPor: input.usuarioId,
      aprovadoEm: new Date()
    })
    .returning({ id: fornecedoresProdutos.id });
  if (!criado) throw new Error("Vinculo de catalogo nao criado");
  await tx.insert(fornecedoresProdutosEventos).values({
    empresaId: input.empresaId,
    fornecedorProdutoId: criado.id,
    statusAnterior: null,
    statusNovo: "aprovado",
    precoOfertado: input.precoOfertado == null ? null : String(input.precoOfertado),
    atorTipo: "usuario",
    usuarioId: input.usuarioId,
    observacao: input.observacao
  });
  return criado;
}

export async function decidirVinculoCatalogoRepository(
  input: {
    id: string;
    empresaId: string;
    statusAnterior: "pendente" | "aprovado" | "rejeitado";
    statusNovo: "aprovado" | "rejeitado";
    precoOfertado: string | null;
    observacao: string | null;
    usuarioId: string;
  },
  tx: TransacaoBanco
) {
  const [atualizado] = await tx
    .update(fornecedoresProdutos)
    .set({
      status: input.statusNovo,
      aprovadoPor: input.usuarioId,
      aprovadoEm: new Date(),
      observacao: input.observacao
    })
    .where(and(eq(fornecedoresProdutos.id, input.id), eq(fornecedoresProdutos.empresaId, input.empresaId)))
    .returning({ id: fornecedoresProdutos.id });
  if (!atualizado) return null;
  await tx.insert(fornecedoresProdutosEventos).values({
    empresaId: input.empresaId,
    fornecedorProdutoId: input.id,
    statusAnterior: input.statusAnterior,
    statusNovo: input.statusNovo,
    precoOfertado: input.precoOfertado,
    atorTipo: "usuario",
    usuarioId: input.usuarioId,
    observacao: input.observacao
  });
  return atualizado;
}

export async function listarProdutosParaImportacaoRepository(empresaId: string, db: ExecutorBanco = banco) {
  return db
    .select({
      id: produtos.id,
      codigo: produtos.codigo,
      codigoInterno: produtos.codigoInterno,
      ean: produtos.codigoBarras,
      descricao: produtos.descricao
    })
    .from(produtos)
    .where(eq(produtos.empresaId, empresaId));
}

export async function buscarImportacaoPorHashRepository(
  empresaId: string,
  hashArquivo: string,
  db: ExecutorBanco = banco
) {
  const [linha] = await db
    .select({ id: comprasImportacoesPrecoBase.id, status: comprasImportacoesPrecoBase.status })
    .from(comprasImportacoesPrecoBase)
    .where(
      and(
        eq(comprasImportacoesPrecoBase.empresaId, empresaId),
        eq(comprasImportacoesPrecoBase.hashArquivo, hashArquivo)
      )
    )
    .limit(1);
  return linha ?? null;
}

export async function criarAnaliseImportacaoRepository(
  input: {
    empresaId: string;
    nomeArquivo: string;
    hashArquivo: string;
    usuarioId: string;
    itens: Array<{
      numeroLinha: number;
      codigo: string | null;
      ean: string | null;
      descricao: string;
      descricaoNormalizada: string;
      valor: number;
      produtoId: string | null;
      resultado: "correspondencia" | "ambiguidade" | "nao_encontrado" | "invalido";
      detalhe: string | null;
    }>;
  },
  tx: TransacaoBanco
) {
  const totais = input.itens.reduce(
    (acc, item) => {
      if (item.resultado === "correspondencia") acc.correspondencias += 1;
      if (item.resultado === "ambiguidade") acc.ambiguidades += 1;
      if (item.resultado === "nao_encontrado" || item.resultado === "invalido") acc.naoEncontrados += 1;
      return acc;
    },
    { correspondencias: 0, ambiguidades: 0, naoEncontrados: 0 }
  );
  const [importacao] = await tx
    .insert(comprasImportacoesPrecoBase)
    .values({
      empresaId: input.empresaId,
      nomeArquivo: input.nomeArquivo,
      hashArquivo: input.hashArquivo,
      totalLinhas: input.itens.length,
      totalCorrespondencias: totais.correspondencias,
      totalAmbiguidades: totais.ambiguidades,
      totalNaoEncontrados: totais.naoEncontrados,
      criadoPor: input.usuarioId
    })
    .returning({ id: comprasImportacoesPrecoBase.id });
  if (!importacao) throw new Error("Analise de importacao nao criada");
  await tx.insert(comprasImportacoesPrecoBaseItens).values(
    input.itens.map((item) => ({
      importacaoId: importacao.id,
      numeroLinha: item.numeroLinha,
      codigoInformado: item.codigo,
      eanInformado: item.ean,
      descricaoInformada: item.descricao,
      descricaoNormalizada: item.descricaoNormalizada,
      valorInformado: String(item.valor),
      produtoId: item.produtoId,
      resultado: item.resultado,
      detalhe: item.detalhe
    }))
  );
  return { id: importacao.id, ...totais };
}

export async function listarImportacoesPrecoBaseRepository(empresaId: string, db: ExecutorBanco = banco) {
  return db
    .select()
    .from(comprasImportacoesPrecoBase)
    .where(eq(comprasImportacoesPrecoBase.empresaId, empresaId))
    .orderBy(desc(comprasImportacoesPrecoBase.criadoEm));
}

export async function detalharImportacaoPrecoBaseRepository(id: string, empresaId: string, db: ExecutorBanco = banco) {
  const [importacao] = await db
    .select()
    .from(comprasImportacoesPrecoBase)
    .where(and(eq(comprasImportacoesPrecoBase.id, id), eq(comprasImportacoesPrecoBase.empresaId, empresaId)))
    .limit(1);
  if (!importacao) return null;
  const itens = await db
    .select()
    .from(comprasImportacoesPrecoBaseItens)
    .where(eq(comprasImportacoesPrecoBaseItens.importacaoId, id))
    .orderBy(asc(comprasImportacoesPrecoBaseItens.numeroLinha));
  return { ...importacao, itens };
}

export async function aplicarImportacaoPrecoBaseRepository(
  id: string,
  empresaId: string,
  usuarioId: string,
  tx: TransacaoBanco
) {
  const [importacao] = await tx
    .select()
    .from(comprasImportacoesPrecoBase)
    .where(and(eq(comprasImportacoesPrecoBase.id, id), eq(comprasImportacoesPrecoBase.empresaId, empresaId)))
    .limit(1)
    .for("update");
  if (!importacao) return { tipo: "nao_encontrada" as const };
  if (importacao.status !== "analisada") return { tipo: "status_invalido" as const, status: importacao.status };
  if (importacao.totalAmbiguidades > 0 || importacao.totalNaoEncontrados > 0) return { tipo: "pendencias" as const };

  const [jaAplicada] = await tx
    .select({ id: comprasImportacoesPrecoBase.id })
    .from(comprasImportacoesPrecoBase)
    .where(
      and(eq(comprasImportacoesPrecoBase.empresaId, empresaId), eq(comprasImportacoesPrecoBase.status, "aplicada"))
    )
    .limit(1);
  if (jaAplicada) return { tipo: "ja_importada" as const };

  const itens = await tx
    .select({
      id: comprasImportacoesPrecoBaseItens.id,
      produtoId: comprasImportacoesPrecoBaseItens.produtoId,
      valor: comprasImportacoesPrecoBaseItens.valorInformado
    })
    .from(comprasImportacoesPrecoBaseItens)
    .where(
      and(
        eq(comprasImportacoesPrecoBaseItens.importacaoId, id),
        eq(comprasImportacoesPrecoBaseItens.resultado, "correspondencia")
      )
    );
  const produtoIds = itens.map((item) => item.produtoId).filter((produtoId): produtoId is string => Boolean(produtoId));
  const agora = new Date();
  if (produtoIds.length) {
    await tx
      .update(produtosPrecosBase)
      .set({ validoAte: agora })
      .where(
        and(
          eq(produtosPrecosBase.empresaId, empresaId),
          inArray(produtosPrecosBase.produtoId, produtoIds),
          isNull(produtosPrecosBase.validoAte)
        )
      );
    await tx.insert(produtosPrecosBase).values(
      itens.flatMap((item) =>
        item.produtoId
          ? [
              {
                empresaId,
                produtoId: item.produtoId,
                valor: item.valor,
                origem: "importacao" as const,
                importacaoItemId: item.id,
                criadoPor: usuarioId,
                validoDesde: agora
              }
            ]
          : []
      )
    );
  }
  await tx
    .update(comprasImportacoesPrecoBase)
    .set({ status: "aplicada", aplicadoPor: usuarioId, aplicadoEm: agora })
    .where(eq(comprasImportacoesPrecoBase.id, id));
  return { tipo: "aplicada" as const, total: itens.length };
}

export async function listarPrecosBaseAtuaisRepository(empresaId: string, db: ExecutorBanco = banco) {
  return db
    .select({
      id: produtosPrecosBase.id,
      produtoId: produtosPrecosBase.produtoId,
      produtoDescricao: produtos.descricao,
      produtoCodigo: produtos.codigo,
      valor: produtosPrecosBase.valor,
      origem: produtosPrecosBase.origem,
      validoDesde: produtosPrecosBase.validoDesde
    })
    .from(produtosPrecosBase)
    .innerJoin(produtos, eq(produtos.id, produtosPrecosBase.produtoId))
    .where(and(eq(produtosPrecosBase.empresaId, empresaId), isNull(produtosPrecosBase.validoAte)))
    .orderBy(asc(produtos.descricao));
}
