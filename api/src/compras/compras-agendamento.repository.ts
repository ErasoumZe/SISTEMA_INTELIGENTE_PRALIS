import { and, asc, eq, gte, inArray, isNotNull, ne, sum } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  comprasHistoricoPrecos,
  comprasSolicitacoes,
  comprasSolicitacoesItens,
  fornecedores,
  fornecedoresProdutos,
  gruposMercadorias,
  pedidosAgendaOcorrencias,
  pedidosAgendas,
  pedidosAgendasProdutos,
  perfisUsuarios,
  produtos
} from "@padaria/db/schema/cadastro";
import { vendas, vendasProdutos } from "@padaria/db/schema/venda";
import type { RegraRecorrencia } from "@padaria/shared/compras";
import { banco, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";
import type { ItemEntrada } from "./compras-solicitacoes.repository.js";

// Agendamento de pedido (PROJECT_BRAIN/56). Persistencia da serie, dos produtos marcados e das ocorrencias.

export type AgendaEntrada = {
  empresaId: string;
  grupoMercadoriaId: string;
  responsavelId: string;
  inicioEm: Date;
  fusoHorario: string;
  regra: RegraRecorrencia;
  terminoTipo: "nunca" | "data" | "quantidade";
  terminoEm: string | null;
  terminoQuantidade: number | null;
  prazoRespostaHoras: number;
  margemVariacaoPercentual: number;
  recebimentoInicio: string | null;
  recebimentoFim: string | null;
  produtos: Array<{ produtoId: string; quantidadePadrao: number | null }>;
};

const grupoPai = alias(gruposMercadorias, "grupo_pai");

const colunasAgenda = {
  id: pedidosAgendas.id,
  empresaId: pedidosAgendas.empresaId,
  grupoMercadoriaId: pedidosAgendas.grupoMercadoriaId,
  grupoNome: gruposMercadorias.nome,
  grupoPaiNome: grupoPai.nome,
  responsavelId: pedidosAgendas.responsavelId,
  responsavelNome: perfisUsuarios.nome,
  inicioEm: pedidosAgendas.inicioEm,
  fusoHorario: pedidosAgendas.fusoHorario,
  regra: pedidosAgendas.regra,
  terminoTipo: pedidosAgendas.terminoTipo,
  terminoEm: pedidosAgendas.terminoEm,
  terminoQuantidade: pedidosAgendas.terminoQuantidade,
  prazoRespostaHoras: pedidosAgendas.prazoRespostaHoras,
  margemVariacaoPercentual: pedidosAgendas.margemVariacaoPercentual,
  recebimentoInicio: pedidosAgendas.recebimentoInicio,
  recebimentoFim: pedidosAgendas.recebimentoFim,
  status: pedidosAgendas.status,
  criadoEm: pedidosAgendas.criadoEm
};

function consultaAgendas(db: ExecutorBanco) {
  return db
    .select(colunasAgenda)
    .from(pedidosAgendas)
    .innerJoin(gruposMercadorias, eq(gruposMercadorias.id, pedidosAgendas.grupoMercadoriaId))
    .leftJoin(grupoPai, eq(grupoPai.id, gruposMercadorias.grupoPaiId))
    .innerJoin(perfisUsuarios, eq(perfisUsuarios.usuarioId, pedidosAgendas.responsavelId));
}

export async function listarAgendasRepository(empresaId: string, db: ExecutorBanco = banco) {
  return consultaAgendas(db)
    .where(and(eq(pedidosAgendas.empresaId, empresaId), eq(pedidosAgendas.status, "ativa")))
    .orderBy(asc(pedidosAgendas.inicioEm));
}

export async function buscarAgendaRepository(id: string, empresaId: string, db: ExecutorBanco = banco) {
  const [linha] = await consultaAgendas(db)
    .where(and(eq(pedidosAgendas.id, id), eq(pedidosAgendas.empresaId, empresaId)))
    .limit(1);
  return linha ?? null;
}

/** Trava a serie: o agendador e as acoes do comprador nunca disputam a mesma agenda ao mesmo tempo. */
export async function travarAgendaRepository(id: string, empresaId: string, tx: TransacaoBanco) {
  const [linha] = await tx
    .select({ id: pedidosAgendas.id, status: pedidosAgendas.status })
    .from(pedidosAgendas)
    .where(and(eq(pedidosAgendas.id, id), eq(pedidosAgendas.empresaId, empresaId)))
    .for("update")
    .limit(1);
  return linha ?? null;
}

export async function produtosDasAgendasRepository(agendaIds: string[], db: ExecutorBanco = banco) {
  if (!agendaIds.length) return [];
  return db
    .select({
      agendaId: pedidosAgendasProdutos.agendaId,
      produtoId: pedidosAgendasProdutos.produtoId,
      descricao: produtos.descricao,
      quantidadePadrao: pedidosAgendasProdutos.quantidadePadrao
    })
    .from(pedidosAgendasProdutos)
    .innerJoin(produtos, eq(produtos.id, pedidosAgendasProdutos.produtoId))
    .where(inArray(pedidosAgendasProdutos.agendaId, agendaIds))
    .orderBy(asc(produtos.descricao));
}

export async function ocorrenciasDasAgendasRepository(agendaIds: string[], db: ExecutorBanco = banco) {
  if (!agendaIds.length) return [];
  return db
    .select({
      id: pedidosAgendaOcorrencias.id,
      agendaId: pedidosAgendaOcorrencias.agendaId,
      previstoPara: pedidosAgendaOcorrencias.previstoPara,
      dataAtual: pedidosAgendaOcorrencias.dataAtual,
      situacao: pedidosAgendaOcorrencias.situacao,
      solicitacaoId: pedidosAgendaOcorrencias.solicitacaoId
    })
    .from(pedidosAgendaOcorrencias)
    .where(inArray(pedidosAgendaOcorrencias.agendaId, agendaIds));
}

export async function validarGrupoAgendaRepository(empresaId: string, grupoId: string, db: ExecutorBanco = banco) {
  const [linha] = await db
    .select({ id: gruposMercadorias.id })
    .from(gruposMercadorias)
    .where(and(eq(gruposMercadorias.id, grupoId), eq(gruposMercadorias.empresaId, empresaId)))
    .limit(1);
  return Boolean(linha);
}

export async function produtosDaEmpresaRepository(empresaId: string, produtoIds: string[], db: ExecutorBanco = banco) {
  if (!produtoIds.length) return [];
  return db
    .select({ id: produtos.id })
    .from(produtos)
    .where(and(eq(produtos.empresaId, empresaId), inArray(produtos.id, produtoIds)));
}

export async function responsavelDaEmpresaRepository(empresaId: string, usuarioId: string, db: ExecutorBanco = banco) {
  const [linha] = await db
    .select({ usuarioId: perfisUsuarios.usuarioId })
    .from(perfisUsuarios)
    .where(and(eq(perfisUsuarios.usuarioId, usuarioId), eq(perfisUsuarios.empresaId, empresaId)))
    .limit(1);
  return Boolean(linha);
}

export async function criarAgendaRepository(
  input: AgendaEntrada & { criadoPor: string; serieAnteriorId: string | null },
  tx: TransacaoBanco
) {
  const [agenda] = await tx
    .insert(pedidosAgendas)
    .values({
      empresaId: input.empresaId,
      grupoMercadoriaId: input.grupoMercadoriaId,
      responsavelId: input.responsavelId,
      inicioEm: input.inicioEm,
      fusoHorario: input.fusoHorario,
      regra: input.regra,
      terminoTipo: input.terminoTipo,
      terminoEm: input.terminoEm,
      terminoQuantidade: input.terminoQuantidade,
      prazoRespostaHoras: input.prazoRespostaHoras,
      margemVariacaoPercentual: input.margemVariacaoPercentual,
      recebimentoInicio: input.recebimentoInicio,
      recebimentoFim: input.recebimentoFim,
      serieAnteriorId: input.serieAnteriorId,
      criadoPor: input.criadoPor
    })
    .returning({ id: pedidosAgendas.id });
  if (!agenda) throw new Error("Agendamento nao criado");
  await substituirProdutosDaAgenda(input.empresaId, agenda.id, input.produtos, tx);
  return agenda;
}

async function substituirProdutosDaAgenda(
  empresaId: string,
  agendaId: string,
  itens: AgendaEntrada["produtos"],
  tx: TransacaoBanco
) {
  await tx.delete(pedidosAgendasProdutos).where(eq(pedidosAgendasProdutos.agendaId, agendaId));
  await tx.insert(pedidosAgendasProdutos).values(
    itens.map((item) => ({
      empresaId,
      agendaId,
      produtoId: item.produtoId,
      quantidadePadrao: item.quantidadePadrao === null ? null : String(item.quantidadePadrao)
    }))
  );
}

/** Edicao da serie inteira (nada dela aconteceu ainda). */
export async function atualizarAgendaRepository(id: string, input: AgendaEntrada, tx: TransacaoBanco) {
  await tx
    .update(pedidosAgendas)
    .set({
      grupoMercadoriaId: input.grupoMercadoriaId,
      responsavelId: input.responsavelId,
      inicioEm: input.inicioEm,
      fusoHorario: input.fusoHorario,
      regra: input.regra,
      terminoTipo: input.terminoTipo,
      terminoEm: input.terminoEm,
      terminoQuantidade: input.terminoQuantidade,
      prazoRespostaHoras: input.prazoRespostaHoras,
      margemVariacaoPercentual: input.margemVariacaoPercentual,
      recebimentoInicio: input.recebimentoInicio,
      recebimentoFim: input.recebimentoFim
    })
    .where(eq(pedidosAgendas.id, id));
  await substituirProdutosDaAgenda(input.empresaId, id, input.produtos, tx);
}

/** "Esta e as futuras": a serie antiga passa a terminar no dia anterior (passado nunca e reescrito). */
export async function encerrarAgendaNaDataRepository(id: string, terminoEm: string, tx: TransacaoBanco) {
  await tx
    .update(pedidosAgendas)
    .set({ terminoTipo: "data", terminoEm, terminoQuantidade: null })
    .where(eq(pedidosAgendas.id, id));
}

export async function encerrarAgendaRepository(id: string, tx: TransacaoBanco) {
  await tx
    .update(pedidosAgendas)
    .set({ status: "encerrada", encerradaEm: new Date() })
    .where(eq(pedidosAgendas.id, id));
}

export async function ocorrenciaPorPrevistoRepository(agendaId: string, previstoPara: Date, tx: TransacaoBanco) {
  const [linha] = await tx
    .select({
      id: pedidosAgendaOcorrencias.id,
      situacao: pedidosAgendaOcorrencias.situacao,
      solicitacaoId: pedidosAgendaOcorrencias.solicitacaoId
    })
    .from(pedidosAgendaOcorrencias)
    .where(
      and(eq(pedidosAgendaOcorrencias.agendaId, agendaId), eq(pedidosAgendaOcorrencias.previstoPara, previstoPara))
    )
    .for("update")
    .limit(1);
  return linha ?? null;
}

export async function registrarOcorrenciaRepository(
  input: {
    empresaId: string;
    agendaId: string;
    previstoPara: Date;
    dataAtual: Date;
    situacao: "agendada" | "aguardando_conferencia" | "cancelada";
    solicitacaoId: string | null;
    canceladaPor: string | null;
  },
  tx: TransacaoBanco
) {
  const cancelada = input.situacao === "cancelada";
  const [linha] = await tx
    .insert(pedidosAgendaOcorrencias)
    .values({
      empresaId: input.empresaId,
      agendaId: input.agendaId,
      previstoPara: input.previstoPara,
      dataAtual: input.dataAtual,
      situacao: input.situacao,
      solicitacaoId: input.solicitacaoId,
      canceladaPor: cancelada ? input.canceladaPor : null,
      canceladaEm: cancelada ? new Date() : null
    })
    .onConflictDoUpdate({
      target: [pedidosAgendaOcorrencias.agendaId, pedidosAgendaOcorrencias.previstoPara],
      set: {
        dataAtual: input.dataAtual,
        situacao: input.situacao,
        solicitacaoId: input.solicitacaoId,
        canceladaPor: cancelada ? input.canceladaPor : null,
        canceladaEm: cancelada ? new Date() : null
      }
    })
    .returning({ id: pedidosAgendaOcorrencias.id });
  if (!linha) throw new Error("Ocorrencia nao registrada");
  return linha;
}

/** A solicitacao do dia: sem item quando nada tinha quantidade (o comprador preenche na conferencia). */
export async function criarSolicitacaoDoAgendamentoRepository(
  input: { empresaId: string; criadoPor: string; observacao: string; itens: ItemEntrada[] },
  tx: TransacaoBanco
) {
  const [solicitacao] = await tx
    .insert(comprasSolicitacoes)
    .values({
      empresaId: input.empresaId,
      origem: "agendamento",
      observacao: input.observacao,
      criadoPor: input.criadoPor
    })
    .returning({ id: comprasSolicitacoes.id });
  if (!solicitacao) throw new Error("Solicitacao nao criada");
  if (!input.itens.length) return { id: solicitacao.id, itens: [] };
  const itens = await tx
    .insert(comprasSolicitacoesItens)
    .values(
      input.itens.map((item) => ({
        empresaId: input.empresaId,
        solicitacaoId: solicitacao.id,
        produtoId: item.produtoId,
        descricaoProduto: item.descricaoProduto,
        quantidade: String(item.quantidade),
        estoqueAtual: item.estoqueAtual === null ? null : String(item.estoqueAtual),
        estoqueMin: item.estoqueMin === null ? null : String(item.estoqueMin),
        estoqueMax: item.estoqueMax === null ? null : String(item.estoqueMax)
      }))
    )
    .returning({ id: comprasSolicitacoesItens.id, produtoId: comprasSolicitacoesItens.produtoId });
  return { id: solicitacao.id, itens };
}

export async function cancelarSolicitacaoDoAgendamentoRepository(solicitacaoId: string, tx: TransacaoBanco) {
  await tx
    .update(comprasSolicitacoes)
    .set({ status: "cancelada", encerradaEm: new Date() })
    .where(and(eq(comprasSolicitacoes.id, solicitacaoId), eq(comprasSolicitacoes.status, "rascunho")));
}

/** Chamada na abertura da rodada: se a solicitacao veio de um agendamento, a ocorrencia vira "enviada". */
export async function marcarOcorrenciaEnviadaRepository(solicitacaoId: string, usuarioId: string, tx: TransacaoBanco) {
  await tx
    .update(pedidosAgendaOcorrencias)
    .set({ situacao: "enviada", enviadaPor: usuarioId, enviadaEm: new Date() })
    .where(
      and(
        eq(pedidosAgendaOcorrencias.solicitacaoId, solicitacaoId),
        eq(pedidosAgendaOcorrencias.situacao, "aguardando_conferencia")
      )
    );
}

export async function agendasAtivasRepository(db: ExecutorBanco = banco) {
  return db
    .select({
      id: pedidosAgendas.id,
      empresaId: pedidosAgendas.empresaId,
      grupoNome: gruposMercadorias.nome,
      responsavelId: pedidosAgendas.responsavelId,
      inicioEm: pedidosAgendas.inicioEm,
      fusoHorario: pedidosAgendas.fusoHorario,
      regra: pedidosAgendas.regra,
      terminoTipo: pedidosAgendas.terminoTipo,
      terminoEm: pedidosAgendas.terminoEm,
      terminoQuantidade: pedidosAgendas.terminoQuantidade,
      prazoRespostaHoras: pedidosAgendas.prazoRespostaHoras,
      margemVariacaoPercentual: pedidosAgendas.margemVariacaoPercentual,
      recebimentoInicio: pedidosAgendas.recebimentoInicio,
      recebimentoFim: pedidosAgendas.recebimentoFim
    })
    .from(pedidosAgendas)
    .innerJoin(gruposMercadorias, eq(gruposMercadorias.id, pedidosAgendas.grupoMercadoriaId))
    .where(eq(pedidosAgendas.status, "ativa"));
}

/** Fornecedores com vinculo APROVADO no catalogo, por produto (doc 56 §7, decisao 3). */
export async function fornecedoresDoCatalogoRepository(
  empresaId: string,
  produtoIds: string[],
  db: ExecutorBanco = banco
) {
  if (!produtoIds.length) return [];
  return db
    .select({
      produtoId: fornecedoresProdutos.produtoId,
      fornecedorId: fornecedores.id,
      nome: fornecedores.nome,
      whatsapp: fornecedores.whatsapp,
      situacao: fornecedores.situacao,
      precoOfertado: fornecedoresProdutos.precoOfertado
    })
    .from(fornecedoresProdutos)
    .innerJoin(fornecedores, eq(fornecedores.id, fornecedoresProdutos.fornecedorId))
    .where(
      and(
        eq(fornecedoresProdutos.empresaId, empresaId),
        eq(fornecedoresProdutos.status, "aprovado"),
        inArray(fornecedoresProdutos.produtoId, produtoIds)
      )
    )
    .orderBy(asc(fornecedores.nome));
}

export async function gruposDaEmpresaRepository(empresaId: string, db: ExecutorBanco = banco) {
  return db
    .select({ id: gruposMercadorias.id, nome: gruposMercadorias.nome, grupoPaiId: gruposMercadorias.grupoPaiId })
    .from(gruposMercadorias)
    .where(and(eq(gruposMercadorias.empresaId, empresaId), eq(gruposMercadorias.ativa, true)))
    .orderBy(asc(gruposMercadorias.nome));
}

// --- bolinhas: rankings dos ultimos meses ---------------------------------------------------------

export async function quantidadeVendidaRepository(empresaId: string, desde: string, db: ExecutorBanco = banco) {
  return db
    .select({ produtoId: vendasProdutos.produtoId, quantidade: sum(vendasProdutos.quantidade) })
    .from(vendasProdutos)
    .innerJoin(vendas, eq(vendas.id, vendasProdutos.vendaId))
    .where(
      and(
        eq(vendas.empresaId, empresaId),
        eq(vendas.status, "aprovado"),
        gte(vendas.dataReferencia, desde),
        isNotNull(vendasProdutos.produtoId)
      )
    )
    .groupBy(vendasProdutos.produtoId);
}

/** Quantidade comprada por (produto, custo): o valor gasto e quantidade x custo, multiplicado no servico. */
export async function compradoPorCustoRepository(empresaId: string, desde: string, db: ExecutorBanco = banco) {
  return db
    .select({
      produtoId: comprasHistoricoPrecos.produtoId,
      custoUnitario: comprasHistoricoPrecos.custoUnitario,
      quantidade: sum(comprasHistoricoPrecos.quantidade)
    })
    .from(comprasHistoricoPrecos)
    .where(and(eq(comprasHistoricoPrecos.empresaId, empresaId), gte(comprasHistoricoPrecos.dataCompra, desde)))
    .groupBy(comprasHistoricoPrecos.produtoId, comprasHistoricoPrecos.custoUnitario);
}

export async function margensDosProdutosRepository(empresaId: string, db: ExecutorBanco = banco) {
  return db
    .select({ id: produtos.id, custo: produtos.custo, precoVenda: produtos.precoVenda })
    .from(produtos)
    .where(and(eq(produtos.empresaId, empresaId), ne(produtos.status, "inativo")));
}
