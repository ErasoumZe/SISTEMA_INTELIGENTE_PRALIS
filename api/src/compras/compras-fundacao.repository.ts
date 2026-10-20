import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import {
  comprasImportacoesPrecoBase,
  comprasImportacoesPrecoBaseItens,
  fornecedores,
  fornecedoresProdutos,
  fornecedoresProdutosEventos,
  produtos,
  produtosPrecosBase
} from "@padaria/db/schema/cadastro";
import { LIMITE_PAGINA_PRECO_BASE } from "@padaria/shared/compras";
import { sqlTravarPrecoBaseDaEmpresa } from "@padaria/db/sessao";
import { banco, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";

// Quantas linhas por INSERT. O limite do protocolo do Postgres e 65.535 PARAMETROS, e cada linha
// consome uma coluna por parametro: com 10 colunas, 1.000 linhas usam 10.000 parametros, com folga
// confortavel para a tabela crescer de coluna sem que o teto precise ser recalculado.
const LOTE_INSERCAO_ITENS = 1_000;

function* emLotes<T>(itens: T[], tamanho: number): Generator<T[]> {
  for (let inicio = 0; inicio < itens.length; inicio += tamanho) {
    yield itens.slice(inicio, inicio + tamanho);
  }
}

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
      // `aprovado_por`/`aprovado_em` so na APROVACAO. Preencher tambem ao rejeitar fazia a coluna
      // dizer "aprovado por X" num vinculo recusado; quem rejeitou fica no evento, que e a trilha.
      ...(input.statusNovo === "aprovado" ? { aprovadoPor: input.usuarioId, aprovadoEm: new Date() } : {}),
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
  return (
    db
      .select({
        id: produtos.id,
        codigo: produtos.codigo,
        codigoInterno: produtos.codigoInterno,
        ean: produtos.codigoBarras,
        descricao: produtos.descricao
      })
      .from(produtos)
      // R-220: produto inativo fica fora do pareamento. Dar preco-base a item descontinuado e ruido, e
      // um inativo com a mesma descricao do ativo criava ambiguidade que o operador nao tem como
      // resolver — a planilha esta certa, o cadastro e que tem duas linhas.
      .where(and(eq(produtos.empresaId, empresaId), eq(produtos.status, "ativo")))
  );
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
  const valores = input.itens.map((item) => ({
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
  }));
  // Em lotes, na MESMA transacao. Um INSERT unico com 10 colunas por linha estourava os 65.535
  // parametros do protocolo estendido do Postgres a partir de ~6.550 linhas — bem abaixo do teto de
  // 50.000 do contrato. Uma planilha de 7.000 linhas, aceita pela validacao, morria com 08P01 e o
  // operador recebia "Erro interno".
  for (const lote of emLotes(valores, LOTE_INSERCAO_ITENS)) {
    await tx.insert(comprasImportacoesPrecoBaseItens).values(lote);
  }
  return { id: importacao.id, ...totais };
}

export async function listarImportacoesPrecoBaseRepository(empresaId: string, db: ExecutorBanco = banco) {
  return db
    .select()
    .from(comprasImportacoesPrecoBase)
    .where(eq(comprasImportacoesPrecoBase.empresaId, empresaId))
    .orderBy(desc(comprasImportacoesPrecoBase.criadoEm));
}

export async function detalharImportacaoPrecoBaseRepository(
  id: string,
  empresaId: string,
  opcoes: { somentePendencias?: boolean } = {},
  db: ExecutorBanco = banco
) {
  const [importacao] = await db
    .select()
    .from(comprasImportacoesPrecoBase)
    .where(and(eq(comprasImportacoesPrecoBase.id, id), eq(comprasImportacoesPrecoBase.empresaId, empresaId)))
    .limit(1);
  if (!importacao) return null;
  // Projecao explicita e filtro no SERVIDOR. A tela de pendencias precisa de 7 colunas das linhas que
  // bloqueiam; mandar `select()` de todos os itens fazia o navegador baixar a planilha inteira para
  // descartar quase tudo, e expunha `descricao_normalizada`/`produto_id` sem ninguem usar.
  const itens = await db
    .select({
      id: comprasImportacoesPrecoBaseItens.id,
      numeroLinha: comprasImportacoesPrecoBaseItens.numeroLinha,
      codigoInformado: comprasImportacoesPrecoBaseItens.codigoInformado,
      eanInformado: comprasImportacoesPrecoBaseItens.eanInformado,
      descricaoInformada: comprasImportacoesPrecoBaseItens.descricaoInformada,
      valorInformado: comprasImportacoesPrecoBaseItens.valorInformado,
      resultado: comprasImportacoesPrecoBaseItens.resultado,
      detalhe: comprasImportacoesPrecoBaseItens.detalhe
    })
    .from(comprasImportacoesPrecoBaseItens)
    .where(
      and(
        eq(comprasImportacoesPrecoBaseItens.importacaoId, id),
        ...(opcoes.somentePendencias ? [ne(comprasImportacoesPrecoBaseItens.resultado, "correspondencia")] : [])
      )
    )
    .orderBy(asc(comprasImportacoesPrecoBaseItens.numeroLinha))
    .limit(LIMITE_PAGINA_PRECO_BASE);
  return { ...importacao, itens };
}

/**
 * Descarta uma analise ainda NAO aplicada, liberando o hash do arquivo.
 *
 * Por que apagar em vez de marcar `cancelada`: a unicidade `(empresa_id, hash_arquivo)` nao olha o
 * status, entao uma analise cancelada continuaria reservando aquele arquivo e o operador nunca
 * poderia reenviar o MESMO .xlsx depois de corrigir o cadastro do produto — que e justamente o fluxo
 * normal (analisar, ver a pendencia, acertar o codigo/EAN, reenviar). Tornar a unicidade parcial
 * exigiria migration; apagar nao, e nao ha o que preservar: analise nao aplicada nao gerou preco
 * nenhum, e `produtos_precos_base.importacao_item_id` so aponta para itens de analise aplicada.
 *
 * Analise JA aplicada nunca e apagada: ela e a procedencia do preco-base vigente.
 */
export async function descartarImportacaoPrecoBaseRepository(id: string, empresaId: string, tx: TransacaoBanco) {
  const [importacao] = await tx
    .select({ id: comprasImportacoesPrecoBase.id, status: comprasImportacoesPrecoBase.status })
    .from(comprasImportacoesPrecoBase)
    .where(and(eq(comprasImportacoesPrecoBase.id, id), eq(comprasImportacoesPrecoBase.empresaId, empresaId)))
    .limit(1)
    .for("update");
  if (!importacao) return { tipo: "nao_encontrada" as const };
  if (importacao.status !== "analisada") return { tipo: "status_invalido" as const, status: importacao.status };
  // Os itens saem por `on delete cascade` (migration 0060).
  await tx.delete(comprasImportacoesPrecoBase).where(eq(comprasImportacoesPrecoBase.id, id));
  return { tipo: "descartada" as const };
}

export async function aplicarImportacaoPrecoBaseRepository(
  id: string,
  empresaId: string,
  usuarioId: string,
  tx: TransacaoBanco
) {
  // Antes de qualquer leitura: a decisao "esta empresa ja importou?" olha o conjunto, nao a linha.
  await tx.execute(sqlTravarPrecoBaseDaEmpresa(empresaId));
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
    // `inArray` e `insert` tambem em lotes: cada id e cada coluna e um parametro, e uma carga de
    // 50.000 produtos (o teto do contrato) estouraria o limite do protocolo nas duas instrucoes.
    for (const lote of emLotes(produtoIds, LOTE_INSERCAO_ITENS)) {
      await tx
        .update(produtosPrecosBase)
        .set({ validoAte: agora })
        .where(
          and(
            eq(produtosPrecosBase.empresaId, empresaId),
            inArray(produtosPrecosBase.produtoId, lote),
            isNull(produtosPrecosBase.validoAte)
          )
        );
    }
    const novos = itens.flatMap((item) =>
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
    );
    for (const lote of emLotes(novos, LOTE_INSERCAO_ITENS)) {
      await tx.insert(produtosPrecosBase).values(lote);
    }
  }
  await tx
    .update(comprasImportacoesPrecoBase)
    .set({ status: "aplicada", aplicadoPor: usuarioId, aplicadoEm: agora })
    .where(eq(comprasImportacoesPrecoBase.id, id));
  return { tipo: "aplicada" as const, total: itens.length };
}

export async function listarPrecosBaseAtuaisRepository(
  empresaId: string,
  limite = LIMITE_PAGINA_PRECO_BASE,
  db: ExecutorBanco = banco
) {
  return (
    db
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
      .orderBy(asc(produtos.descricao))
      // Uma linha por produto da empresa: a carga inicial suporta 50.000: sem teto, a tela que o
      // comprador abre todo dia montava dezenas de milhares de celulas a cada acesso.
      .limit(limite)
  );
}
