import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, max, min, ne, or, sum } from "drizzle-orm";
import {
  comprasHistoricoImportacaoItens,
  comprasHistoricoImportacoes,
  comprasHistoricoPrecos,
  fornecedores,
  fornecedoresAliases,
  fornecedoresProdutos,
  fornecedoresProdutosEventos,
  produtos
} from "@padaria/db/schema/cadastro";
import { LIMITE_PENDENCIAS_HISTORICO, type HistoricoResultado } from "@padaria/shared/compras";
import { banco, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";

// R-222: persistencia do historico de compras. SQL cru nao vive em api/src: agregacao e DISTINCT ON pelo builder.

// 14 colunas por item: 1.000 linhas usam 14.000 dos 65.535 parametros do protocolo do Postgres.
const LOTE = 1_000;

function* emLotes<T>(itens: T[], tamanho: number = LOTE): Generator<T[]> {
  for (let inicio = 0; inicio < itens.length; inicio += tamanho) yield itens.slice(inicio, inicio + tamanho);
}

export type ItemAnalisadoHistorico = {
  numeroLinha: number;
  fornecedorInformado: string;
  fornecedorNormalizado: string;
  produtoInformado: string;
  produtoNormalizado: string;
  dataCompra: string | null;
  quantidade: number | null;
  custoUnitario: number | null;
  documento: string | null;
  fornecedorId: string | null;
  produtoId: string | null;
  resultado: HistoricoResultado;
  detalhe: string | null;
};

export async function listarFornecedoresParaHistoricoRepository(empresaId: string, db: ExecutorBanco = banco) {
  // Todos, inclusive inativos: a compra feita a um fornecedor que depois parou continua sendo historico.
  return db
    .select({ id: fornecedores.id, nome: fornecedores.nome })
    .from(fornecedores)
    .where(eq(fornecedores.empresaId, empresaId));
}

export async function listarAliasesHistoricoRepository(empresaId: string, db: ExecutorBanco = banco) {
  return db
    .select({ aliasNormalizado: fornecedoresAliases.aliasNormalizado, fornecedorId: fornecedoresAliases.fornecedorId })
    .from(fornecedoresAliases)
    .where(eq(fornecedoresAliases.empresaId, empresaId));
}

export async function listarProdutosParaHistoricoRepository(empresaId: string, db: ExecutorBanco = banco) {
  // Todos os status (doc 55, decisao 5): "INATIVO X" pareia com o produto inativo de nome exato.
  return db
    .select({ id: produtos.id, descricao: produtos.descricao, nomeCatalogo: produtos.nomeCatalogo })
    .from(produtos)
    .where(eq(produtos.empresaId, empresaId));
}

export async function buscarImportacaoHistoricoPorHashRepository(
  empresaId: string,
  hashArquivo: string,
  db: ExecutorBanco = banco
) {
  const [linha] = await db
    .select({ id: comprasHistoricoImportacoes.id, status: comprasHistoricoImportacoes.status })
    .from(comprasHistoricoImportacoes)
    .where(
      and(
        eq(comprasHistoricoImportacoes.empresaId, empresaId),
        eq(comprasHistoricoImportacoes.hashArquivo, hashArquivo)
      )
    )
    .limit(1);
  return linha ?? null;
}

export async function criarAnaliseHistoricoRepository(
  input: {
    empresaId: string;
    nomeArquivo: string;
    hashArquivo: string;
    usuarioId: string;
    periodoInicio: string | null;
    periodoFim: string | null;
    itens: ItemAnalisadoHistorico[];
  },
  tx: TransacaoBanco
) {
  const pareadas = input.itens.filter((item) => item.resultado === "correspondencia").length;
  const [importacao] = await tx
    .insert(comprasHistoricoImportacoes)
    .values({
      empresaId: input.empresaId,
      nomeArquivo: input.nomeArquivo,
      hashArquivo: input.hashArquivo,
      totalLinhas: input.itens.length,
      totalPareadas: pareadas,
      totalPendentes: input.itens.length - pareadas,
      periodoInicio: input.periodoInicio,
      periodoFim: input.periodoFim,
      criadoPor: input.usuarioId
    })
    .returning({ id: comprasHistoricoImportacoes.id });
  if (!importacao) throw new Error("Importacao de historico nao criada");
  for (const lote of emLotes(input.itens)) {
    await tx.insert(comprasHistoricoImportacaoItens).values(
      lote.map((item) => ({
        importacaoId: importacao.id,
        numeroLinha: item.numeroLinha,
        fornecedorInformado: item.fornecedorInformado,
        fornecedorNormalizado: item.fornecedorNormalizado,
        produtoInformado: item.produtoInformado,
        produtoNormalizado: item.produtoNormalizado,
        dataCompra: item.dataCompra,
        quantidade: item.quantidade === null ? null : String(item.quantidade),
        custoUnitario: item.custoUnitario === null ? null : String(item.custoUnitario),
        documento: item.documento,
        fornecedorId: item.fornecedorId,
        produtoId: item.produtoId,
        resultado: item.resultado,
        detalhe: item.detalhe
      }))
    );
  }
  return importacao;
}

export async function travarImportacaoHistoricoRepository(id: string, empresaId: string, tx: TransacaoBanco) {
  const [importacao] = await tx
    .select({ id: comprasHistoricoImportacoes.id, status: comprasHistoricoImportacoes.status })
    .from(comprasHistoricoImportacoes)
    .where(and(eq(comprasHistoricoImportacoes.id, id), eq(comprasHistoricoImportacoes.empresaId, empresaId)))
    .for("update")
    .limit(1);
  return importacao ?? null;
}

const colunasImportacao = {
  id: comprasHistoricoImportacoes.id,
  nomeArquivo: comprasHistoricoImportacoes.nomeArquivo,
  status: comprasHistoricoImportacoes.status,
  totalLinhas: comprasHistoricoImportacoes.totalLinhas,
  totalPareadas: comprasHistoricoImportacoes.totalPareadas,
  totalPendentes: comprasHistoricoImportacoes.totalPendentes,
  totalAplicadas: comprasHistoricoImportacoes.totalAplicadas,
  periodoInicio: comprasHistoricoImportacoes.periodoInicio,
  periodoFim: comprasHistoricoImportacoes.periodoFim,
  criadoEm: comprasHistoricoImportacoes.criadoEm,
  aplicadoEm: comprasHistoricoImportacoes.aplicadoEm
};

export async function listarImportacoesHistoricoRepository(empresaId: string, db: ExecutorBanco = banco) {
  return db
    .select(colunasImportacao)
    .from(comprasHistoricoImportacoes)
    .where(eq(comprasHistoricoImportacoes.empresaId, empresaId))
    .orderBy(desc(comprasHistoricoImportacoes.criadoEm))
    .limit(50);
}

export async function buscarImportacaoHistoricoRepository(id: string, empresaId: string, db: ExecutorBanco = banco) {
  const [linha] = await db
    .select(colunasImportacao)
    .from(comprasHistoricoImportacoes)
    .where(and(eq(comprasHistoricoImportacoes.id, id), eq(comprasHistoricoImportacoes.empresaId, empresaId)))
    .limit(1);
  return linha ?? null;
}

export async function contarPorResultadoHistoricoRepository(importacaoId: string, db: ExecutorBanco = banco) {
  return db
    .select({ resultado: comprasHistoricoImportacaoItens.resultado, linhas: count() })
    .from(comprasHistoricoImportacaoItens)
    .where(eq(comprasHistoricoImportacaoItens.importacaoId, importacaoId))
    .groupBy(comprasHistoricoImportacaoItens.resultado);
}

export async function fornecedoresPendentesHistoricoRepository(importacaoId: string, db: ExecutorBanco = banco) {
  return (
    db
      .select({
        fornecedorNormalizado: comprasHistoricoImportacaoItens.fornecedorNormalizado,
        fornecedorInformado: min(comprasHistoricoImportacaoItens.fornecedorInformado),
        linhas: count()
      })
      .from(comprasHistoricoImportacaoItens)
      .where(
        and(
          eq(comprasHistoricoImportacaoItens.importacaoId, importacaoId),
          // Sem fornecedor definido (nao achado ou ambiguo): o operador resolve por apelido ou cadastro.
          isNull(comprasHistoricoImportacaoItens.fornecedorId),
          ne(comprasHistoricoImportacaoItens.resultado, "invalido")
        )
      )
      .groupBy(comprasHistoricoImportacaoItens.fornecedorNormalizado)
      .orderBy(desc(count()))
      // Um a mais: so para saber se a lista foi cortada (a tela avisa), sem uma segunda consulta.
      .limit(LIMITE_PENDENCIAS_HISTORICO + 1)
  );
}

export async function produtosPendentesHistoricoRepository(importacaoId: string, db: ExecutorBanco = banco) {
  return db
    .select({
      produtoNormalizado: comprasHistoricoImportacaoItens.produtoNormalizado,
      produtoInformado: min(comprasHistoricoImportacaoItens.produtoInformado),
      linhas: count()
    })
    .from(comprasHistoricoImportacaoItens)
    .where(
      and(
        eq(comprasHistoricoImportacaoItens.importacaoId, importacaoId),
        isNull(comprasHistoricoImportacaoItens.produtoId),
        ne(comprasHistoricoImportacaoItens.resultado, "invalido")
      )
    )
    .groupBy(comprasHistoricoImportacaoItens.produtoNormalizado)
    .orderBy(desc(count()))
    .limit(LIMITE_PENDENCIAS_HISTORICO + 1);
}

export async function linhasPendentesHistoricoRepository(importacaoId: string, db: ExecutorBanco = banco) {
  // So as que o operador nao resolve com apelido ou cadastro: invalidas e ambiguas.
  return db
    .select({
      numeroLinha: comprasHistoricoImportacaoItens.numeroLinha,
      resultado: comprasHistoricoImportacaoItens.resultado,
      fornecedorInformado: comprasHistoricoImportacaoItens.fornecedorInformado,
      produtoInformado: comprasHistoricoImportacaoItens.produtoInformado,
      detalhe: comprasHistoricoImportacaoItens.detalhe
    })
    .from(comprasHistoricoImportacaoItens)
    .where(
      and(
        eq(comprasHistoricoImportacaoItens.importacaoId, importacaoId),
        inArray(comprasHistoricoImportacaoItens.resultado, ["invalido", "ambiguidade"])
      )
    )
    .orderBy(asc(comprasHistoricoImportacaoItens.numeroLinha))
    .limit(LIMITE_PENDENCIAS_HISTORICO);
}

/** Itens a repear: tudo que nao e pareado nem invalido (invalido nao melhora com cadastro novo). */
export async function itensReparaveisHistoricoRepository(importacaoId: string, tx: TransacaoBanco) {
  return tx
    .select({
      id: comprasHistoricoImportacaoItens.id,
      fornecedorNormalizado: comprasHistoricoImportacaoItens.fornecedorNormalizado,
      produtoNormalizado: comprasHistoricoImportacaoItens.produtoNormalizado
    })
    .from(comprasHistoricoImportacaoItens)
    .where(
      and(
        eq(comprasHistoricoImportacaoItens.importacaoId, importacaoId),
        inArray(comprasHistoricoImportacaoItens.resultado, [
          "fornecedor_nao_encontrado",
          "produto_nao_encontrado",
          "ambiguidade"
        ])
      )
    );
}

export async function atualizarPareamentoHistoricoRepository(
  grupos: Array<{
    ids: string[];
    fornecedorId: string | null;
    produtoId: string | null;
    resultado: HistoricoResultado;
    detalhe: string | null;
  }>,
  tx: TransacaoBanco
) {
  for (const grupo of grupos) {
    for (const lote of emLotes(grupo.ids)) {
      await tx
        .update(comprasHistoricoImportacaoItens)
        .set({
          fornecedorId: grupo.fornecedorId,
          produtoId: grupo.produtoId,
          resultado: grupo.resultado,
          detalhe: grupo.detalhe
        })
        .where(inArray(comprasHistoricoImportacaoItens.id, lote));
    }
  }
}

/** Itens pareados que ainda nao viraram historico: base da aplicacao e da previa. */
export async function itensAplicaveisHistoricoRepository(importacaoId: string, db: ExecutorBanco = banco) {
  return db
    .select({
      id: comprasHistoricoImportacaoItens.id,
      numeroLinha: comprasHistoricoImportacaoItens.numeroLinha,
      fornecedorId: comprasHistoricoImportacaoItens.fornecedorId,
      produtoId: comprasHistoricoImportacaoItens.produtoId,
      dataCompra: comprasHistoricoImportacaoItens.dataCompra,
      quantidade: comprasHistoricoImportacaoItens.quantidade,
      custoUnitario: comprasHistoricoImportacaoItens.custoUnitario,
      documento: comprasHistoricoImportacaoItens.documento,
      fornecedorInformado: comprasHistoricoImportacaoItens.fornecedorInformado,
      produtoInformado: comprasHistoricoImportacaoItens.produtoInformado
    })
    .from(comprasHistoricoImportacaoItens)
    .leftJoin(comprasHistoricoPrecos, eq(comprasHistoricoPrecos.importacaoItemId, comprasHistoricoImportacaoItens.id))
    .where(
      and(
        eq(comprasHistoricoImportacaoItens.importacaoId, importacaoId),
        eq(comprasHistoricoImportacaoItens.resultado, "correspondencia"),
        isNull(comprasHistoricoPrecos.id)
      )
    );
}

export async function inserirHistoricoPrecosRepository(
  input: {
    empresaId: string;
    usuarioId: string;
    itens: Array<{
      id: string;
      fornecedorId: string;
      produtoId: string;
      dataCompra: string;
      quantidade: string;
      custoUnitario: string;
      documento: string | null;
    }>;
  },
  tx: TransacaoBanco
): Promise<number> {
  let inseridas = 0;
  for (const lote of emLotes(input.itens)) {
    const gravadas = await tx
      .insert(comprasHistoricoPrecos)
      .values(
        lote.map((item) => ({
          empresaId: input.empresaId,
          fornecedorId: item.fornecedorId,
          produtoId: item.produtoId,
          dataCompra: item.dataCompra,
          quantidade: item.quantidade,
          custoUnitario: item.custoUnitario,
          documento: item.documento,
          origem: "planilha" as const,
          importacaoItemId: item.id,
          criadoPor: input.usuarioId
        }))
      )
      // Reaplicar nunca duplica: o UNIQUE(importacao_item_id) e a garantia, nao a pre-checagem.
      .onConflictDoNothing()
      .returning({ id: comprasHistoricoPrecos.id });
    inseridas += gravadas.length;
  }
  return inseridas;
}

export async function vinculosDoCatalogoHistoricoRepository(
  empresaId: string,
  fornecedorIds: string[],
  produtoIds: string[],
  db: ExecutorBanco = banco
) {
  if (!fornecedorIds.length || !produtoIds.length) return [];
  const linhas: Array<{
    id: string;
    fornecedorId: string;
    produtoId: string;
    status: "pendente" | "aprovado" | "rejeitado";
  }> = [];
  // Os dois `inArray` crescem com a planilha: em lotes dos dois lados para nao estourar os parametros.
  for (const loteFornecedores of emLotes(fornecedorIds, 200)) {
    for (const loteProdutos of emLotes(produtoIds, 5_000)) {
      linhas.push(
        ...(await db
          .select({
            id: fornecedoresProdutos.id,
            fornecedorId: fornecedoresProdutos.fornecedorId,
            produtoId: fornecedoresProdutos.produtoId,
            status: fornecedoresProdutos.status
          })
          .from(fornecedoresProdutos)
          .where(
            and(
              eq(fornecedoresProdutos.empresaId, empresaId),
              inArray(fornecedoresProdutos.fornecedorId, loteFornecedores),
              inArray(fornecedoresProdutos.produtoId, loteProdutos)
            )
          ))
      );
    }
  }
  return linhas;
}

export async function criarVinculosHistoricoRepository(
  input: {
    empresaId: string;
    usuarioId: string;
    observacao: string;
    vinculos: Array<{ fornecedorId: string; produtoId: string; precoOfertado: string }>;
  },
  tx: TransacaoBanco
): Promise<number> {
  let criados = 0;
  const agora = new Date();
  for (const lote of emLotes(input.vinculos, 500)) {
    const inseridos = await tx
      .insert(fornecedoresProdutos)
      .values(
        lote.map((vinculo) => ({
          empresaId: input.empresaId,
          fornecedorId: vinculo.fornecedorId,
          produtoId: vinculo.produtoId,
          status: "aprovado" as const,
          origem: "compras" as const,
          precoOfertado: vinculo.precoOfertado,
          observacao: input.observacao,
          criadoPor: input.usuarioId,
          aprovadoPor: input.usuarioId,
          aprovadoEm: agora
        }))
      )
      // Um vinculo criado por outro caminho no meio da aplicacao nao derruba a transacao.
      .onConflictDoNothing()
      .returning({ id: fornecedoresProdutos.id, precoOfertado: fornecedoresProdutos.precoOfertado });
    criados += inseridos.length;
    if (inseridos.length)
      await tx.insert(fornecedoresProdutosEventos).values(
        inseridos.map((vinculo) => ({
          empresaId: input.empresaId,
          fornecedorProdutoId: vinculo.id,
          statusAnterior: null,
          statusNovo: "aprovado" as const,
          precoOfertado: vinculo.precoOfertado,
          atorTipo: "sistema" as const,
          usuarioId: null,
          observacao: input.observacao
        }))
      );
  }
  return criados;
}

export async function aprovarVinculosPendentesHistoricoRepository(
  input: { empresaId: string; usuarioId: string; ids: string[]; observacao: string },
  tx: TransacaoBanco
): Promise<number> {
  let aprovados = 0;
  const agora = new Date();
  for (const lote of emLotes(input.ids, 500)) {
    const atualizados = await tx
      .update(fornecedoresProdutos)
      .set({ status: "aprovado", aprovadoPor: input.usuarioId, aprovadoEm: agora })
      .where(
        and(
          eq(fornecedoresProdutos.empresaId, input.empresaId),
          inArray(fornecedoresProdutos.id, lote),
          // So o que ainda esta pendente: nunca reverte uma decisao tomada enquanto a aplicacao rodava.
          eq(fornecedoresProdutos.status, "pendente")
        )
      )
      .returning({ id: fornecedoresProdutos.id, precoOfertado: fornecedoresProdutos.precoOfertado });
    aprovados += atualizados.length;
    if (atualizados.length)
      await tx.insert(fornecedoresProdutosEventos).values(
        atualizados.map((vinculo) => ({
          empresaId: input.empresaId,
          fornecedorProdutoId: vinculo.id,
          statusAnterior: "pendente" as const,
          statusNovo: "aprovado" as const,
          precoOfertado: vinculo.precoOfertado,
          atorTipo: "sistema" as const,
          usuarioId: null,
          observacao: input.observacao
        }))
      );
  }
  return aprovados;
}

export async function atualizarTotaisImportacaoHistoricoRepository(
  input: { id: string; totalAplicadas: number; usuarioId: string },
  tx: TransacaoBanco
) {
  const contagens = await contarPorResultadoHistoricoRepository(input.id, tx);
  const pareadas = contagens.find((linha) => linha.resultado === "correspondencia")?.linhas ?? 0;
  const total = contagens.reduce((soma, linha) => soma + linha.linhas, 0);
  await tx
    .update(comprasHistoricoImportacoes)
    .set({
      status: "aplicada",
      totalPareadas: pareadas,
      totalPendentes: total - pareadas,
      totalAplicadas: input.totalAplicadas,
      aplicadoPor: input.usuarioId,
      aplicadoEm: new Date()
    })
    .where(eq(comprasHistoricoImportacoes.id, input.id));
}

export async function atualizarTotaisPareamentoHistoricoRepository(importacaoId: string, tx: TransacaoBanco) {
  const contagens = await contarPorResultadoHistoricoRepository(importacaoId, tx);
  const pareadas = contagens.find((linha) => linha.resultado === "correspondencia")?.linhas ?? 0;
  const total = contagens.reduce((soma, linha) => soma + linha.linhas, 0);
  await tx
    .update(comprasHistoricoImportacoes)
    .set({ totalPareadas: pareadas, totalPendentes: total - pareadas })
    .where(eq(comprasHistoricoImportacoes.id, importacaoId));
}

export async function totalAplicadasHistoricoRepository(importacaoId: string, db: ExecutorBanco = banco) {
  const [linha] = await db
    .select({ aplicadas: count() })
    .from(comprasHistoricoPrecos)
    .innerJoin(
      comprasHistoricoImportacaoItens,
      eq(comprasHistoricoImportacaoItens.id, comprasHistoricoPrecos.importacaoItemId)
    )
    .where(eq(comprasHistoricoImportacaoItens.importacaoId, importacaoId));
  return linha?.aplicadas ?? 0;
}

export async function cancelarImportacaoHistoricoRepository(id: string, tx: TransacaoBanco) {
  await tx
    .update(comprasHistoricoImportacoes)
    .set({ status: "cancelada" })
    .where(eq(comprasHistoricoImportacoes.id, id));
}

export async function validarFornecedorHistoricoRepository(
  empresaId: string,
  fornecedorId: string,
  db: ExecutorBanco = banco
) {
  const [linha] = await db
    .select({ id: fornecedores.id })
    .from(fornecedores)
    .where(and(eq(fornecedores.id, fornecedorId), eq(fornecedores.empresaId, empresaId)))
    .limit(1);
  return Boolean(linha);
}

export async function criarFornecedorHistoricoRepository(
  input: { empresaId: string; nome: string },
  tx: TransacaoBanco
) {
  const [criado] = await tx
    .insert(fornecedores)
    .values({ empresaId: input.empresaId, nome: input.nome })
    .returning({ id: fornecedores.id });
  if (!criado) throw new Error("Fornecedor nao criado");
  return criado;
}

export async function inserirAliasHistoricoRepository(
  input: { empresaId: string; fornecedorId: string; aliasNormalizado: string; usuarioId: string },
  tx: TransacaoBanco
): Promise<boolean> {
  const inseridos = await tx
    .insert(fornecedoresAliases)
    .values({
      empresaId: input.empresaId,
      fornecedorId: input.fornecedorId,
      aliasNormalizado: input.aliasNormalizado,
      criadoPor: input.usuarioId
    })
    .onConflictDoNothing()
    .returning({ id: fornecedoresAliases.id });
  return inseridos.length > 0;
}

export async function aliasExistenteHistoricoRepository(
  empresaId: string,
  aliasNormalizado: string,
  db: ExecutorBanco = banco
) {
  const [linha] = await db
    .select({ fornecedorId: fornecedoresAliases.fornecedorId })
    .from(fornecedoresAliases)
    .where(
      and(eq(fornecedoresAliases.empresaId, empresaId), eq(fornecedoresAliases.aliasNormalizado, aliasNormalizado))
    )
    .limit(1);
  return linha ?? null;
}

export async function nomeInformadoDoFornecedorHistoricoRepository(
  importacaoId: string,
  fornecedorNormalizado: string,
  db: ExecutorBanco = banco
) {
  const [linha] = await db
    .select({ nome: min(comprasHistoricoImportacaoItens.fornecedorInformado) })
    .from(comprasHistoricoImportacaoItens)
    .where(
      and(
        eq(comprasHistoricoImportacaoItens.importacaoId, importacaoId),
        eq(comprasHistoricoImportacaoItens.fornecedorNormalizado, fornecedorNormalizado)
      )
    );
  return linha?.nome ?? null;
}

export async function nomeDoFornecedorHistoricoRepository(ids: string[], db: ExecutorBanco = banco) {
  if (!ids.length) return [];
  return db
    .select({ id: fornecedores.id, nome: fornecedores.nome })
    .from(fornecedores)
    .where(inArray(fornecedores.id, ids));
}

export async function nomeDoProdutoHistoricoRepository(ids: string[], db: ExecutorBanco = banco) {
  if (!ids.length) return [];
  return db.select({ id: produtos.id, descricao: produtos.descricao }).from(produtos).where(inArray(produtos.id, ids));
}

// --- consulta ------------------------------------------------------------------------------------

/** Agregado por fornecedor x produto na janela. O ultimo custo vem de `ultimosCustosHistoricoRepository`. */
export async function resumoHistoricoRepository(
  filtro: {
    empresaId: string;
    desde: string;
    produtoId?: string | undefined;
    fornecedorId?: string | undefined;
    busca?: string | undefined;
  },
  db: ExecutorBanco = banco
) {
  const busca = filtro.busca ? `%${filtro.busca.replace(/[%_\\]/g, (caractere) => `\\${caractere}`)}%` : null;
  return db
    .select({
      fornecedorId: comprasHistoricoPrecos.fornecedorId,
      fornecedorNome: fornecedores.nome,
      produtoId: comprasHistoricoPrecos.produtoId,
      produtoDescricao: produtos.descricao,
      ultimaCompraEm: max(comprasHistoricoPrecos.dataCompra),
      menorCusto: min(comprasHistoricoPrecos.custoUnitario),
      maiorCusto: max(comprasHistoricoPrecos.custoUnitario),
      compras: count(),
      quantidadeTotal: sum(comprasHistoricoPrecos.quantidade)
    })
    .from(comprasHistoricoPrecos)
    .innerJoin(fornecedores, eq(fornecedores.id, comprasHistoricoPrecos.fornecedorId))
    .innerJoin(produtos, eq(produtos.id, comprasHistoricoPrecos.produtoId))
    .where(
      and(
        eq(comprasHistoricoPrecos.empresaId, filtro.empresaId),
        gte(comprasHistoricoPrecos.dataCompra, filtro.desde),
        filtro.produtoId ? eq(comprasHistoricoPrecos.produtoId, filtro.produtoId) : undefined,
        filtro.fornecedorId ? eq(comprasHistoricoPrecos.fornecedorId, filtro.fornecedorId) : undefined,
        busca ? or(ilike(produtos.descricao, busca), ilike(fornecedores.nome, busca)) : undefined
      )
    )
    .groupBy(
      comprasHistoricoPrecos.fornecedorId,
      fornecedores.nome,
      comprasHistoricoPrecos.produtoId,
      produtos.descricao
    )
    .orderBy(desc(max(comprasHistoricoPrecos.dataCompra)), asc(produtos.descricao));
}

/** A compra mais recente de cada par (empate de data: a ultima gravada). DISTINCT ON pelo builder. */
export async function ultimosCustosHistoricoRepository(
  filtro: { empresaId: string; desde: string; produtoId?: string | undefined; fornecedorId?: string | undefined },
  db: ExecutorBanco = banco
) {
  return db
    .selectDistinctOn([comprasHistoricoPrecos.fornecedorId, comprasHistoricoPrecos.produtoId], {
      fornecedorId: comprasHistoricoPrecos.fornecedorId,
      produtoId: comprasHistoricoPrecos.produtoId,
      custoUnitario: comprasHistoricoPrecos.custoUnitario
    })
    .from(comprasHistoricoPrecos)
    .where(
      and(
        eq(comprasHistoricoPrecos.empresaId, filtro.empresaId),
        gte(comprasHistoricoPrecos.dataCompra, filtro.desde),
        filtro.produtoId ? eq(comprasHistoricoPrecos.produtoId, filtro.produtoId) : undefined,
        filtro.fornecedorId ? eq(comprasHistoricoPrecos.fornecedorId, filtro.fornecedorId) : undefined
      )
    )
    .orderBy(
      comprasHistoricoPrecos.fornecedorId,
      comprasHistoricoPrecos.produtoId,
      desc(comprasHistoricoPrecos.dataCompra),
      desc(comprasHistoricoPrecos.criadoEm),
      desc(comprasHistoricoPrecos.id)
    );
}
