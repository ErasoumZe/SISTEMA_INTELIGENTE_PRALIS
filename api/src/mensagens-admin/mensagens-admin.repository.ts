import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { mensagensAdmin, mensagensAdminAlvos, mensagensAdminEntregas } from "@padaria/db/schema/mensagens";
import { fechamentosCaixa } from "@padaria/db/schema/caixa";
import { pdvs, perfisUsuarios, usuariosEmpresas } from "@padaria/db/schema/cadastro";
import type { AlvoMensagem } from "@padaria/shared/mensagens-admin";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

export type EntregaResolvida = {
  usuarioId: string;
  pdvId: string | null;
  fechamentoCaixaId: string | null;
};

export async function criarMensagemRepository(
  input: {
    empresaId: string;
    titulo: string;
    corpo: string;
    validoAte: Date | null;
    criadoPor: string;
  },
  db: ExecutorBanco = banco
) {
  const [linha] = await db
    .insert(mensagensAdmin)
    .values({
      empresaId: input.empresaId,
      titulo: input.titulo,
      corpo: input.corpo,
      validoAte: input.validoAte,
      criadoPor: input.criadoPor
    })
    .returning({ id: mensagensAdmin.id });
  if (!linha) throw new Error("Mensagem nao foi criada");
  return linha.id;
}

export async function criarAlvosRepository(
  input: { empresaId: string; mensagemId: string; alvos: AlvoMensagem[] },
  db: ExecutorBanco = banco
) {
  if (!input.alvos.length) return;
  await db
    .insert(mensagensAdminAlvos)
    .values(
      input.alvos.map((alvo) => ({
        empresaId: input.empresaId,
        mensagemId: input.mensagemId,
        tipo: alvo.tipo,
        pdvId: alvo.tipo === "pdv" ? alvo.pdvId : null,
        usuarioId: alvo.tipo === "operador" ? alvo.usuarioId : null
      }))
    )
    // O mesmo PDV escolhido duas vezes na tela nao pode derrubar o envio inteiro.
    .onConflictDoNothing();
}

export function listarAlvosRepository(mensagemId: string, db: ExecutorBanco = banco) {
  return db
    .select({
      tipo: mensagensAdminAlvos.tipo,
      pdvId: mensagensAdminAlvos.pdvId,
      usuarioId: mensagensAdminAlvos.usuarioId
    })
    .from(mensagensAdminAlvos)
    .where(eq(mensagensAdminAlvos.mensagemId, mensagemId));
}

/** Operadores com caixa ABERTO agora, opcionalmente restritos a uma lista de PDVs. */
export function listarOperadoresComCaixaAbertoRepository(
  empresaId: string,
  pdvIds: string[] | null,
  db: ExecutorBanco = banco
) {
  return db
    .select({
      usuarioId: fechamentosCaixa.usuarioCaixaId,
      pdvId: fechamentosCaixa.pdvId,
      fechamentoCaixaId: fechamentosCaixa.id
    })
    .from(fechamentosCaixa)
    .where(
      and(
        eq(fechamentosCaixa.empresaId, empresaId),
        eq(fechamentosCaixa.status, "aberto"),
        ...(pdvIds ? [inArray(fechamentosCaixa.pdvId, pdvIds)] : [])
      )
    );
}

/** Todo usuario vinculado a empresa. A permissao efetiva e conferida no servico, perfil a perfil. */
export function listarUsuariosDaEmpresaRepository(empresaId: string, db: ExecutorBanco = banco) {
  return db
    .select({ usuarioId: usuariosEmpresas.usuarioId })
    .from(usuariosEmpresas)
    .where(eq(usuariosEmpresas.empresaId, empresaId));
}

/**
 * O caixa aberto de cada usuario, se houver. `fechamentos_caixa_operador_aberto_unico_idx` garante
 * NO MAXIMO UM por (empresa, operador) — e por isso o PDV de um destinatario e deterministico no
 * instante da resolucao. O mesmo operador em dois PDVs so acontece ao longo do TEMPO, e e a R-195
 * (promocao na abertura do caixa) que cuida disso.
 */
export async function caixasAbertosPorUsuarioRepository(
  empresaId: string,
  usuarioIds: string[],
  db: ExecutorBanco = banco
) {
  if (!usuarioIds.length) return new Map<string, { pdvId: string | null; fechamentoCaixaId: string }>();
  const linhas = await db
    .select({
      usuarioId: fechamentosCaixa.usuarioCaixaId,
      pdvId: fechamentosCaixa.pdvId,
      fechamentoCaixaId: fechamentosCaixa.id
    })
    .from(fechamentosCaixa)
    .where(
      and(
        eq(fechamentosCaixa.empresaId, empresaId),
        eq(fechamentosCaixa.status, "aberto"),
        inArray(fechamentosCaixa.usuarioCaixaId, usuarioIds)
      )
    );
  const mapa = new Map<string, { pdvId: string | null; fechamentoCaixaId: string }>();
  for (const linha of linhas) {
    if (linha.usuarioId) mapa.set(linha.usuarioId, { pdvId: linha.pdvId, fechamentoCaixaId: linha.fechamentoCaixaId });
  }
  return mapa;
}

/**
 * Grava as entregas e devolve as que REALMENTE nasceram agora.
 *
 * `onConflictDoNothing` sobre os dois uniques parciais e o que torna o envio idempotente: reenviar o
 * mesmo alvo, ou a abertura de caixa materializar de novo, nao duplica linha nem reabre o sino de
 * quem ja confirmou. As linhas devolvidas por `returning` sao SOMENTE as inseridas — e so para elas
 * a notificacao do sino e criada.
 */
export async function criarEntregasRepository(
  input: { empresaId: string; mensagemId: string; destinatarios: EntregaResolvida[] },
  db: ExecutorBanco = banco
) {
  if (!input.destinatarios.length) return [];
  return db
    .insert(mensagensAdminEntregas)
    .values(
      input.destinatarios.map((destinatario) => ({
        empresaId: input.empresaId,
        mensagemId: input.mensagemId,
        destinatarioUsuarioId: destinatario.usuarioId,
        pdvId: destinatario.pdvId,
        fechamentoCaixaId: destinatario.fechamentoCaixaId
      }))
    )
    .onConflictDoNothing()
    .returning({ id: mensagensAdminEntregas.id, destinatarioUsuarioId: mensagensAdminEntregas.destinatarioUsuarioId });
}

/** Mensagens ATIVAS e ainda validas da empresa. `valido_ate` nulo = sem prazo. */
export function listarMensagensVigentesRepository(empresaId: string, agora: Date, db: ExecutorBanco = banco) {
  return db
    .select({ id: mensagensAdmin.id })
    .from(mensagensAdmin)
    .where(
      and(
        eq(mensagensAdmin.empresaId, empresaId),
        eq(mensagensAdmin.status, "ativa"),
        or(isNull(mensagensAdmin.validoAte), gt(mensagensAdmin.validoAte, agora))
      )
    );
}

export function listarEntregasDoUsuarioRepository(
  input: { empresaId: string; usuarioId: string; mensagemIds: string[] },
  db: ExecutorBanco = banco
) {
  if (!input.mensagemIds.length) return Promise.resolve([]);
  return db
    .select({
      id: mensagensAdminEntregas.id,
      mensagemId: mensagensAdminEntregas.mensagemId,
      pdvId: mensagensAdminEntregas.pdvId,
      confirmadaEm: mensagensAdminEntregas.confirmadaEm
    })
    .from(mensagensAdminEntregas)
    .where(
      and(
        eq(mensagensAdminEntregas.empresaId, input.empresaId),
        eq(mensagensAdminEntregas.destinatarioUsuarioId, input.usuarioId),
        inArray(mensagensAdminEntregas.mensagemId, input.mensagemIds)
      )
    );
}

/** R-195: preenche PDV e caixa na entrega que ja existia sem PDV, em vez de criar uma segunda. */
export async function promoverEntregasRepository(
  input: { entregaIds: string[]; pdvId: string; fechamentoCaixaId: string },
  db: ExecutorBanco = banco
) {
  if (!input.entregaIds.length) return;
  await db
    .update(mensagensAdminEntregas)
    .set({ pdvId: input.pdvId, fechamentoCaixaId: input.fechamentoCaixaId })
    .where(and(inArray(mensagensAdminEntregas.id, input.entregaIds), isNull(mensagensAdminEntregas.pdvId)));
}

/**
 * O que o operador ainda precisa ver. Traz o corpo, que o sino nao carrega.
 * Filtra pela PROPRIA entrega — nunca por empresa solta — e por isso nao exige permissao de tela.
 */
export function listarMensagensDoOperadorRepository(
  input: { empresaId: string; usuarioId: string; agora: Date },
  db: ExecutorBanco = banco
) {
  return db
    .select({
      entregaId: mensagensAdminEntregas.id,
      mensagemId: mensagensAdmin.id,
      titulo: mensagensAdmin.titulo,
      corpo: mensagensAdmin.corpo,
      pdvId: mensagensAdminEntregas.pdvId,
      entregueEm: mensagensAdminEntregas.entregueEm,
      visualizadaEm: mensagensAdminEntregas.visualizadaEm,
      confirmadaEm: mensagensAdminEntregas.confirmadaEm,
      fechadaEm: mensagensAdminEntregas.fechadaEm,
      criadoEm: mensagensAdminEntregas.criadoEm
    })
    .from(mensagensAdminEntregas)
    .innerJoin(mensagensAdmin, eq(mensagensAdmin.id, mensagensAdminEntregas.mensagemId))
    .where(
      and(
        eq(mensagensAdminEntregas.empresaId, input.empresaId),
        eq(mensagensAdminEntregas.destinatarioUsuarioId, input.usuarioId),
        isNull(mensagensAdminEntregas.confirmadaEm),
        eq(mensagensAdmin.status, "ativa"),
        or(isNull(mensagensAdmin.validoAte), gt(mensagensAdmin.validoAte, input.agora))
      )
    )
    .orderBy(desc(mensagensAdminEntregas.criadoEm));
}

/**
 * Carimba a entrega na PRIMEIRA leitura bem-sucedida do cliente. `isNull(entregueEm)` faz disso uma
 * operacao idempotente: reler cem vezes nao move o carimbo, e e assim que "entregar quando voltar"
 * funciona sem push — a linha espera no banco e a data gravada e a da chegada real.
 */
export async function marcarEntregueRepository(entregaIds: string[], db: ExecutorBanco = banco) {
  if (!entregaIds.length) return;
  await db
    .update(mensagensAdminEntregas)
    .set({ entregueEm: new Date() })
    .where(and(inArray(mensagensAdminEntregas.id, entregaIds), isNull(mensagensAdminEntregas.entregueEm)));
}

/**
 * Avanca um carimbo da entrega do PROPRIO usuario. O `WHERE` carrega empresa e destinatario: nenhum
 * usuario move a entrega de outro, nem que saiba o id. Devolve null quando nada casou.
 */
export async function carimbarEntregaRepository(
  input: {
    entregaId: string;
    empresaId: string;
    usuarioId: string;
    campo: "visualizadaEm" | "confirmadaEm" | "fechadaEm";
  },
  db: ExecutorBanco = banco
) {
  const agora = new Date();
  // "Fechar" apenas adia (R-194) e pode acontecer varias vezes: o carimbo passa a ser o do ultimo
  // fechamento. Visualizar e confirmar so valem a PRIMEIRA vez — sobrescrever apagaria o instante
  // em que a pessoa de fato leu.
  const valores =
    input.campo === "fechadaEm"
      ? { fechadaEm: agora }
      : input.campo === "visualizadaEm"
        ? { visualizadaEm: agora }
        : { confirmadaEm: agora };
  const [linha] = await db
    .update(mensagensAdminEntregas)
    .set(valores)
    .where(
      and(
        eq(mensagensAdminEntregas.id, input.entregaId),
        eq(mensagensAdminEntregas.empresaId, input.empresaId),
        eq(mensagensAdminEntregas.destinatarioUsuarioId, input.usuarioId),
        ...(input.campo === "fechadaEm" ? [] : [isNull(mensagensAdminEntregas[input.campo])])
      )
    )
    .returning({ id: mensagensAdminEntregas.id });
  return linha ?? null;
}

export async function buscarEntregaRepository(
  input: { entregaId: string; empresaId: string; usuarioId: string },
  db: ExecutorBanco = banco
) {
  const [linha] = await db
    .select({
      id: mensagensAdminEntregas.id,
      entregueEm: mensagensAdminEntregas.entregueEm,
      visualizadaEm: mensagensAdminEntregas.visualizadaEm
    })
    .from(mensagensAdminEntregas)
    .where(
      and(
        eq(mensagensAdminEntregas.id, input.entregaId),
        eq(mensagensAdminEntregas.empresaId, input.empresaId),
        eq(mensagensAdminEntregas.destinatarioUsuarioId, input.usuarioId)
      )
    )
    .limit(1);
  return linha ?? null;
}

// --- Painel do administrador --------------------------------------------------------------------

export function listarMensagensRepository(empresaId: string, db: ExecutorBanco = banco) {
  return db
    .select({
      id: mensagensAdmin.id,
      empresaId: mensagensAdmin.empresaId,
      titulo: mensagensAdmin.titulo,
      corpo: mensagensAdmin.corpo,
      validoAte: mensagensAdmin.validoAte,
      status: mensagensAdmin.status,
      criadoPor: mensagensAdmin.criadoPor,
      criadoPorNome: perfisUsuarios.nome,
      criadoEm: mensagensAdmin.criadoEm
    })
    .from(mensagensAdmin)
    .leftJoin(perfisUsuarios, eq(perfisUsuarios.usuarioId, mensagensAdmin.criadoPor))
    .where(eq(mensagensAdmin.empresaId, empresaId))
    .orderBy(desc(mensagensAdmin.criadoEm));
}

export function listarEntregasDasMensagensRepository(
  input: { empresaId: string; mensagemIds: string[] },
  db: ExecutorBanco = banco
) {
  if (!input.mensagemIds.length) return Promise.resolve([]);
  return db
    .select({
      id: mensagensAdminEntregas.id,
      mensagemId: mensagensAdminEntregas.mensagemId,
      destinatarioUsuarioId: mensagensAdminEntregas.destinatarioUsuarioId,
      destinatarioNome: perfisUsuarios.nome,
      pdvId: mensagensAdminEntregas.pdvId,
      pdvNome: pdvs.nome,
      entregueEm: mensagensAdminEntregas.entregueEm,
      visualizadaEm: mensagensAdminEntregas.visualizadaEm,
      confirmadaEm: mensagensAdminEntregas.confirmadaEm,
      fechadaEm: mensagensAdminEntregas.fechadaEm
    })
    .from(mensagensAdminEntregas)
    .leftJoin(perfisUsuarios, eq(perfisUsuarios.usuarioId, mensagensAdminEntregas.destinatarioUsuarioId))
    .leftJoin(pdvs, eq(pdvs.id, mensagensAdminEntregas.pdvId))
    .where(
      and(
        eq(mensagensAdminEntregas.empresaId, input.empresaId),
        inArray(mensagensAdminEntregas.mensagemId, input.mensagemIds)
      )
    )
    .orderBy(desc(mensagensAdminEntregas.criadoEm));
}

export async function encerrarMensagemRepository(
  input: { mensagemId: string; empresaId: string },
  db: ExecutorBanco = banco
) {
  const [linha] = await db
    .update(mensagensAdmin)
    .set({ status: "encerrada" })
    .where(
      and(
        eq(mensagensAdmin.id, input.mensagemId),
        eq(mensagensAdmin.empresaId, input.empresaId),
        eq(mensagensAdmin.status, "ativa")
      )
    )
    .returning({ id: mensagensAdmin.id });
  return linha ?? null;
}
