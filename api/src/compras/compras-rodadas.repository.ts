import { and, asc, desc, eq, inArray, isNull, max } from "drizzle-orm";
import {
  comprasConvitesItens,
  comprasRodadas,
  comprasRodadasConvites,
  comprasRodadasItens,
  comprasSolicitacoes,
  comprasSolicitacoesItens,
  empresas,
  fornecedores,
  produtosPrecosBase
} from "@padaria/db/schema";
import { sqlTravarRodadaDeCompras } from "@padaria/db/sessao";
import { banco, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";

export async function travarRodadaDaSolicitacao(solicitacaoId: string, tx: TransacaoBanco): Promise<void> {
  await tx.execute(sqlTravarRodadaDeCompras(solicitacaoId));
}

export type SolicitacaoParaRodada = {
  id: string;
  status: string;
  itens: Array<{ id: string; produtoId: string; descricaoProduto: string; quantidade: string }>;
};

/** Trava a solicitacao e devolve seus itens — o envelope da rodada e congelado a partir daqui. */
export async function buscarSolicitacaoParaRodadaRepository(
  solicitacaoId: string,
  empresaId: string,
  tx: TransacaoBanco
): Promise<SolicitacaoParaRodada | null> {
  const [solicitacao] = await tx
    .select({ id: comprasSolicitacoes.id, status: comprasSolicitacoes.status })
    .from(comprasSolicitacoes)
    .where(and(eq(comprasSolicitacoes.id, solicitacaoId), eq(comprasSolicitacoes.empresaId, empresaId)))
    .limit(1)
    .for("update");
  if (!solicitacao) return null;
  const itens = await tx
    .select({
      id: comprasSolicitacoesItens.id,
      produtoId: comprasSolicitacoesItens.produtoId,
      descricaoProduto: comprasSolicitacoesItens.descricaoProduto,
      quantidade: comprasSolicitacoesItens.quantidade
    })
    .from(comprasSolicitacoesItens)
    .where(eq(comprasSolicitacoesItens.solicitacaoId, solicitacaoId));
  return { ...solicitacao, itens };
}

export async function buscarEmpresaComprasRepository(
  empresaId: string,
  db: ExecutorBanco = banco
): Promise<{ fusoHorario: string; comprasPrazoRespostaHoras: number | null } | null> {
  const [empresa] = await db
    .select({ fusoHorario: empresas.fusoHorario, comprasPrazoRespostaHoras: empresas.comprasPrazoRespostaHoras })
    .from(empresas)
    .where(eq(empresas.id, empresaId))
    .limit(1);
  return empresa ?? null;
}

/** Preco-base vigente (validoAte is null) por conjunto de produtos. Modulo do comprador (pode ler base). */
export async function buscarPrecosBaseVigentesRepository(
  empresaId: string,
  produtoIds: string[],
  db: ExecutorBanco = banco
): Promise<Map<string, { id: string; valor: string }>> {
  if (!produtoIds.length) return new Map();
  const linhas = await db
    .select({ id: produtosPrecosBase.id, produtoId: produtosPrecosBase.produtoId, valor: produtosPrecosBase.valor })
    .from(produtosPrecosBase)
    .where(
      and(
        eq(produtosPrecosBase.empresaId, empresaId),
        isNull(produtosPrecosBase.validoAte),
        inArray(produtosPrecosBase.produtoId, [...new Set(produtoIds)])
      )
    );
  return new Map(linhas.map((linha) => [linha.produtoId, { id: linha.id, valor: linha.valor }]));
}

export type FornecedorConvite = { id: string; nome: string; situacao: string; whatsapp: string | null };

export async function buscarFornecedoresParaConviteRepository(
  empresaId: string,
  fornecedorIds: string[],
  db: ExecutorBanco = banco
): Promise<FornecedorConvite[]> {
  if (!fornecedorIds.length) return [];
  return db
    .select({
      id: fornecedores.id,
      nome: fornecedores.nome,
      situacao: fornecedores.situacao,
      whatsapp: fornecedores.whatsapp
    })
    .from(fornecedores)
    .where(and(eq(fornecedores.empresaId, empresaId), inArray(fornecedores.id, [...new Set(fornecedorIds)])));
}

export async function proximoNumeroRodadaRepository(solicitacaoId: string, tx: TransacaoBanco): Promise<number> {
  const [linha] = await tx
    .select({ maximo: max(comprasRodadas.numero) })
    .from(comprasRodadas)
    .where(eq(comprasRodadas.solicitacaoId, solicitacaoId));
  return (linha?.maximo ?? 0) + 1;
}

export type ItemEnvelope = {
  solicitacaoItemId: string;
  quantidade: string;
  precoBaseId: string | null;
  precoBaseValor: string | null;
};
export type ConviteParaCriar = {
  fornecedorId: string;
  tokenHash: string;
  // solicitacaoItemIds que este fornecedor vai cotar — resolvidos para rodadaItemId no insert.
  solicitacaoItemIds: string[];
};

export type RodadaCriada = {
  rodadaId: string;
  itens: Array<{ id: string; solicitacaoItemId: string }>;
  convites: Array<{ id: string; fornecedorId: string }>;
};

export async function criarRodadaRepository(
  input: {
    empresaId: string;
    solicitacaoId: string;
    numero: number;
    prazoRespostaHoras: number | null;
    expiraEm: Date;
    fusoHorario: string;
    tetoValor: number | null;
    margemVariacaoPercentual: number;
    abertaPor: string;
    itens: ItemEnvelope[];
    convites: ConviteParaCriar[];
  },
  tx: TransacaoBanco
): Promise<RodadaCriada> {
  const [rodada] = await tx
    .insert(comprasRodadas)
    .values({
      empresaId: input.empresaId,
      solicitacaoId: input.solicitacaoId,
      numero: input.numero,
      status: "aberta",
      prazoRespostaHoras: input.prazoRespostaHoras,
      expiraEm: input.expiraEm,
      fusoHorario: input.fusoHorario,
      tetoValor: input.tetoValor === null ? null : String(input.tetoValor),
      margemVariacaoPercentual: input.margemVariacaoPercentual,
      abertaPor: input.abertaPor
    })
    .returning({ id: comprasRodadas.id });
  if (!rodada) throw new Error("Rodada nao criada");

  const itensInseridos = await tx
    .insert(comprasRodadasItens)
    .values(
      input.itens.map((item) => ({
        empresaId: input.empresaId,
        rodadaId: rodada.id,
        solicitacaoItemId: item.solicitacaoItemId,
        quantidade: item.quantidade,
        precoBaseId: item.precoBaseId,
        precoBaseValor: item.precoBaseValor
      }))
    )
    .returning({ id: comprasRodadasItens.id, solicitacaoItemId: comprasRodadasItens.solicitacaoItemId });
  const rodadaItemPorSolicitacaoItem = new Map(itensInseridos.map((item) => [item.solicitacaoItemId, item.id]));

  const convitesCriados: Array<{ id: string; fornecedorId: string }> = [];
  for (const convite of input.convites) {
    const [conviteInserido] = await tx
      .insert(comprasRodadasConvites)
      .values({
        empresaId: input.empresaId,
        rodadaId: rodada.id,
        fornecedorId: convite.fornecedorId,
        tokenHash: convite.tokenHash,
        status: "aberto",
        criadoPor: input.abertaPor
      })
      .returning({ id: comprasRodadasConvites.id });
    if (!conviteInserido) throw new Error("Convite nao criado");
    await tx.insert(comprasConvitesItens).values(
      convite.solicitacaoItemIds.map((solicitacaoItemId) => {
        const rodadaItemId = rodadaItemPorSolicitacaoItem.get(solicitacaoItemId);
        if (!rodadaItemId) throw new Error("Item do convite fora do envelope da rodada");
        return { empresaId: input.empresaId, conviteId: conviteInserido.id, rodadaItemId };
      })
    );
    convitesCriados.push({ id: conviteInserido.id, fornecedorId: convite.fornecedorId });
  }

  return {
    rodadaId: rodada.id,
    itens: itensInseridos.map((item) => ({ id: item.id, solicitacaoItemId: item.solicitacaoItemId })),
    convites: convitesCriados
  };
}

export async function marcarSolicitacaoEmCotacaoRepository(
  solicitacaoId: string,
  empresaId: string,
  tx: TransacaoBanco
): Promise<void> {
  await tx
    .update(comprasSolicitacoes)
    .set({ status: "em_cotacao" })
    .where(and(eq(comprasSolicitacoes.id, solicitacaoId), eq(comprasSolicitacoes.empresaId, empresaId)));
}

// ---- Leitura (lista e detalhe) ----

export type RodadaCabecalho = {
  id: string;
  empresaId: string;
  solicitacaoId: string;
  numero: number;
  status: "aberta" | "fechada" | "cancelada";
  prazoRespostaHoras: number | null;
  expiraEm: Date;
  fusoHorario: string;
  tetoValor: string | null;
  abertaEm: Date;
};

export async function listarRodadasRepository(
  empresaId: string,
  filtros: { solicitacaoId?: string | undefined; status?: string | undefined },
  db: ExecutorBanco = banco
): Promise<RodadaCabecalho[]> {
  return db
    .select({
      id: comprasRodadas.id,
      empresaId: comprasRodadas.empresaId,
      solicitacaoId: comprasRodadas.solicitacaoId,
      numero: comprasRodadas.numero,
      status: comprasRodadas.status,
      prazoRespostaHoras: comprasRodadas.prazoRespostaHoras,
      expiraEm: comprasRodadas.expiraEm,
      fusoHorario: comprasRodadas.fusoHorario,
      tetoValor: comprasRodadas.tetoValor,
      abertaEm: comprasRodadas.abertaEm
    })
    .from(comprasRodadas)
    .where(
      and(
        eq(comprasRodadas.empresaId, empresaId),
        ...(filtros.solicitacaoId ? [eq(comprasRodadas.solicitacaoId, filtros.solicitacaoId)] : []),
        ...(filtros.status ? [eq(comprasRodadas.status, filtros.status as "aberta")] : [])
      )
    )
    .orderBy(desc(comprasRodadas.abertaEm));
}

export async function detalharRodadaRepository(rodadaId: string, empresaId: string, db: ExecutorBanco = banco) {
  const [cabecalho] = await db
    .select({
      id: comprasRodadas.id,
      empresaId: comprasRodadas.empresaId,
      solicitacaoId: comprasRodadas.solicitacaoId,
      numero: comprasRodadas.numero,
      status: comprasRodadas.status,
      prazoRespostaHoras: comprasRodadas.prazoRespostaHoras,
      expiraEm: comprasRodadas.expiraEm,
      fusoHorario: comprasRodadas.fusoHorario,
      tetoValor: comprasRodadas.tetoValor,
      abertaEm: comprasRodadas.abertaEm
    })
    .from(comprasRodadas)
    .where(and(eq(comprasRodadas.id, rodadaId), eq(comprasRodadas.empresaId, empresaId)))
    .limit(1);
  if (!cabecalho) return null;

  const itens = await db
    .select({
      id: comprasRodadasItens.id,
      solicitacaoItemId: comprasRodadasItens.solicitacaoItemId,
      produtoId: comprasSolicitacoesItens.produtoId,
      descricaoProduto: comprasSolicitacoesItens.descricaoProduto,
      quantidade: comprasRodadasItens.quantidade,
      precoBaseValor: comprasRodadasItens.precoBaseValor
    })
    .from(comprasRodadasItens)
    .innerJoin(comprasSolicitacoesItens, eq(comprasSolicitacoesItens.id, comprasRodadasItens.solicitacaoItemId))
    .where(eq(comprasRodadasItens.rodadaId, rodadaId))
    .orderBy(asc(comprasSolicitacoesItens.descricaoProduto));

  const convites = await db
    .select({
      id: comprasRodadasConvites.id,
      fornecedorId: comprasRodadasConvites.fornecedorId,
      fornecedorNome: fornecedores.nome,
      fornecedorWhatsapp: fornecedores.whatsapp,
      status: comprasRodadasConvites.status,
      enviadoEm: comprasRodadasConvites.enviadoEm,
      respondidoEm: comprasRodadasConvites.respondidoEm
    })
    .from(comprasRodadasConvites)
    .innerJoin(fornecedores, eq(fornecedores.id, comprasRodadasConvites.fornecedorId))
    .where(eq(comprasRodadasConvites.rodadaId, rodadaId))
    .orderBy(asc(fornecedores.nome));

  const itensPorConvite = convites.length
    ? await db
        .select({ conviteId: comprasConvitesItens.conviteId, rodadaItemId: comprasConvitesItens.rodadaItemId })
        .from(comprasConvitesItens)
        .where(
          inArray(
            comprasConvitesItens.conviteId,
            convites.map((convite) => convite.id)
          )
        )
    : [];
  const rodadaItensPorConvite = new Map<string, string[]>();
  for (const linha of itensPorConvite) {
    const atual = rodadaItensPorConvite.get(linha.conviteId) ?? [];
    atual.push(linha.rodadaItemId);
    rodadaItensPorConvite.set(linha.conviteId, atual);
  }

  return { cabecalho, itens, convites, rodadaItensPorConvite };
}

export async function travarConviteRepository(
  conviteId: string,
  empresaId: string,
  tx: TransacaoBanco
): Promise<{ id: string; rodadaId: string; status: string; enviadoEm: Date | null } | null> {
  const [convite] = await tx
    .select({
      id: comprasRodadasConvites.id,
      rodadaId: comprasRodadasConvites.rodadaId,
      status: comprasRodadasConvites.status,
      enviadoEm: comprasRodadasConvites.enviadoEm
    })
    .from(comprasRodadasConvites)
    .where(and(eq(comprasRodadasConvites.id, conviteId), eq(comprasRodadasConvites.empresaId, empresaId)))
    .limit(1)
    .for("update");
  return convite ?? null;
}
