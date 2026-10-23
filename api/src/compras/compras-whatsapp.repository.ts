import { and, asc, count, desc, eq, inArray, lt } from "drizzle-orm";
import {
  comprasConvitesItens,
  comprasRodadas,
  comprasRodadasConvites,
  comprasWhatsappEnvios,
  empresas,
  fornecedores,
  pedidos,
  pedidosItens
} from "@padaria/db/schema";
import { banco, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";

// Fila de saida do WhatsApp (doc 57 §3). Uma linha por mensagem; o tick de Compras envia.

export const TENTATIVAS_MAXIMAS = 5;

export async function enfileirarEnviosRepository(
  linhas: Array<{
    empresaId: string;
    tipo: "convite" | "pedido_confirmado";
    conviteId?: string | null;
    pedidoId?: string | null;
    telefone: string;
  }>,
  tx: ExecutorBanco
) {
  if (!linhas.length) return;
  await tx.insert(comprasWhatsappEnvios).values(
    linhas.map((linha) => ({
      empresaId: linha.empresaId,
      tipo: linha.tipo,
      conviteId: linha.conviteId ?? null,
      pedidoId: linha.pedidoId ?? null,
      telefone: linha.telefone
    }))
  );
}

/** Proximas da fila, travadas para este processo (SKIP LOCKED: duas instancias nunca mandam a mesma). */
export async function proximosEnviosRepository(limite: number, tx: TransacaoBanco) {
  return tx
    .select({
      id: comprasWhatsappEnvios.id,
      empresaId: comprasWhatsappEnvios.empresaId,
      tipo: comprasWhatsappEnvios.tipo,
      conviteId: comprasWhatsappEnvios.conviteId,
      pedidoId: comprasWhatsappEnvios.pedidoId,
      telefone: comprasWhatsappEnvios.telefone,
      tentativas: comprasWhatsappEnvios.tentativas
    })
    .from(comprasWhatsappEnvios)
    .where(and(eq(comprasWhatsappEnvios.status, "pendente"), lt(comprasWhatsappEnvios.tentativas, TENTATIVAS_MAXIMAS)))
    .orderBy(asc(comprasWhatsappEnvios.criadoEm))
    .limit(limite)
    .for("update", { skipLocked: true });
}

export async function registrarResultadoEnvioRepository(
  input: { id: string; ok: boolean; idExterno: string | null; erro: string | null; tentativas: number },
  tx: TransacaoBanco
) {
  await tx
    .update(comprasWhatsappEnvios)
    .set(
      input.ok
        ? {
            status: "enviado",
            mensagemExternaId: input.idExterno,
            enviadoEm: new Date(),
            tentativas: input.tentativas,
            ultimoErro: null
          }
        : {
            status: input.tentativas >= TENTATIVAS_MAXIMAS ? "falhou" : "pendente",
            tentativas: input.tentativas,
            ultimoErro: input.erro?.slice(0, 500) ?? null
          }
    )
    .where(eq(comprasWhatsappEnvios.id, input.id));
}

/** O que vai na mensagem do convite: quem, de quem, ate quando e quantos itens. */
export async function dadosDoConviteParaEnvioRepository(conviteId: string, tx: TransacaoBanco) {
  const [linha] = await tx
    .select({
      fornecedorNome: fornecedores.nome,
      empresaNome: empresas.nome,
      expiraEm: comprasRodadas.expiraEm,
      fusoHorario: comprasRodadas.fusoHorario,
      status: comprasRodadasConvites.status
    })
    .from(comprasRodadasConvites)
    .innerJoin(comprasRodadas, eq(comprasRodadas.id, comprasRodadasConvites.rodadaId))
    .innerJoin(fornecedores, eq(fornecedores.id, comprasRodadasConvites.fornecedorId))
    .innerJoin(empresas, eq(empresas.id, comprasRodadasConvites.empresaId))
    .where(eq(comprasRodadasConvites.id, conviteId))
    .limit(1);
  if (!linha) return null;
  const [itens] = await tx
    .select({ total: count() })
    .from(comprasConvitesItens)
    .where(eq(comprasConvitesItens.conviteId, conviteId));
  return { ...linha, totalItens: itens?.total ?? 0 };
}

/** Novo token do convite: so o hash fica no banco; o token em claro vai so na mensagem. */
export async function trocarTokenDoConviteRepository(
  input: { conviteId: string; tokenHash: string; telefone: string },
  tx: TransacaoBanco
) {
  await tx
    .update(comprasRodadasConvites)
    .set({ tokenHash: input.tokenHash, whatsappEnviado: input.telefone, enviadoEm: new Date() })
    .where(eq(comprasRodadasConvites.id, input.conviteId));
}

export async function dadosDoPedidoParaEnvioRepository(pedidoId: string, tx: TransacaoBanco) {
  const [linha] = await tx
    .select({ fornecedorNome: fornecedores.nome, empresaNome: empresas.nome })
    .from(pedidos)
    .innerJoin(fornecedores, eq(fornecedores.id, pedidos.fornecedorId))
    .innerJoin(empresas, eq(empresas.id, pedidos.empresaId))
    .where(eq(pedidos.id, pedidoId))
    .limit(1);
  if (!linha) return null;
  const itens = await tx
    .select({ descricao: pedidosItens.descricaoProduto, quantidade: pedidosItens.quantidade })
    .from(pedidosItens)
    .where(eq(pedidosItens.pedidoId, pedidoId));
  return { ...linha, itens };
}

/** Situacao do ultimo envio de cada convite (para a tela mostrar "enviado", "pendente" ou "falhou"). */
export async function ultimoEnvioDosConvitesRepository(conviteIds: string[], db: ExecutorBanco = banco) {
  if (!conviteIds.length) return new Map<string, { status: string; ultimoErro: string | null }>();
  const linhas = await db
    .select({
      conviteId: comprasWhatsappEnvios.conviteId,
      status: comprasWhatsappEnvios.status,
      ultimoErro: comprasWhatsappEnvios.ultimoErro
    })
    .from(comprasWhatsappEnvios)
    .where(inArray(comprasWhatsappEnvios.conviteId, conviteIds))
    .orderBy(desc(comprasWhatsappEnvios.criadoEm));
  const mapa = new Map<string, { status: string; ultimoErro: string | null }>();
  for (const linha of linhas) if (linha.conviteId && !mapa.has(linha.conviteId)) mapa.set(linha.conviteId, linha);
  return mapa;
}
