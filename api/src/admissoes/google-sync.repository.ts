import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import {
  admissoesGoogleArquivos,
  admissoesGoogleDependentes,
  admissoesGoogleSincronizacoes
} from "@padaria/db/schema/admissoes";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

export type CriarSincronizacaoGoogleInput = {
  empresaId: string;
  processoId: string;
  driveRootFolderId: string;
};

export type CriarDependenteGoogleInput = {
  sincronizacaoId: string;
  empresaId: string;
  processoId: string;
  dependenteId: string;
};

export type CriarArquivoGoogleInput = {
  sincronizacaoId: string;
  empresaId: string;
  processoId: string;
  dependenteId?: string | null;
  origem: "colaborador" | "dependente";
  colaboradorAnexoId?: string | null;
  dependenteAnexoId?: string | null;
  tipoDocumento: string;
};

export async function obterOuCriarSincronizacaoGoogle(input: CriarSincronizacaoGoogleInput, db: ExecutorBanco = banco) {
  const [criada] = await db
    .insert(admissoesGoogleSincronizacoes)
    .values(input)
    .onConflictDoNothing({
      target: [admissoesGoogleSincronizacoes.processoId, admissoesGoogleSincronizacoes.empresaId]
    })
    .returning();
  if (criada) return criada;

  const [existente] = await db
    .select()
    .from(admissoesGoogleSincronizacoes)
    .where(
      and(
        eq(admissoesGoogleSincronizacoes.processoId, input.processoId),
        eq(admissoesGoogleSincronizacoes.empresaId, input.empresaId)
      )
    )
    .limit(1);
  return existente ?? null;
}

export async function reivindicarSincronizacaoGoogle(
  id: string,
  empresaId: string,
  bloqueioToken: string,
  bloqueioAte: Date,
  db: ExecutorBanco = banco
) {
  const agora = new Date();
  const [linha] = await db
    .update(admissoesGoogleSincronizacoes)
    .set({
      status: "processando",
      bloqueioToken,
      bloqueioAte,
      // Expressao fixa e sem entrada externa: evita template SQL na camada da API e preserva o
      // incremento atomico da tentativa no banco.
      tentativa: sql.raw("tentativa + 1"),
      iniciadoEm: agora,
      proximaTentativaEm: null,
      ultimoErroCodigo: null,
      ultimoErroMensagem: null,
      atualizadoEm: agora
    })
    .where(
      and(
        eq(admissoesGoogleSincronizacoes.id, id),
        eq(admissoesGoogleSincronizacoes.empresaId, empresaId),
        or(
          eq(admissoesGoogleSincronizacoes.status, "pendente"),
          eq(admissoesGoogleSincronizacoes.status, "falhou"),
          and(
            eq(admissoesGoogleSincronizacoes.status, "processando"),
            or(isNull(admissoesGoogleSincronizacoes.bloqueioAte), lt(admissoesGoogleSincronizacoes.bloqueioAte, agora))
          )
        )
      )
    )
    .returning();
  return linha ?? null;
}

export async function concluirSincronizacaoGoogle(
  id: string,
  empresaId: string,
  bloqueioToken: string,
  db: ExecutorBanco = banco
) {
  const agora = new Date();
  const [linha] = await db
    .update(admissoesGoogleSincronizacoes)
    .set({
      status: "concluida",
      bloqueioToken: null,
      bloqueioAte: null,
      concluidoEm: agora,
      atualizadoEm: agora
    })
    .where(
      and(
        eq(admissoesGoogleSincronizacoes.id, id),
        eq(admissoesGoogleSincronizacoes.empresaId, empresaId),
        eq(admissoesGoogleSincronizacoes.bloqueioToken, bloqueioToken)
      )
    )
    .returning();
  return linha ?? null;
}

export async function falharSincronizacaoGoogle(
  id: string,
  empresaId: string,
  bloqueioToken: string,
  erro: { codigo: string; mensagem: string; proximaTentativaEm: Date | null },
  db: ExecutorBanco = banco
) {
  const [linha] = await db
    .update(admissoesGoogleSincronizacoes)
    .set({
      status: "falhou",
      bloqueioToken: null,
      bloqueioAte: null,
      ultimoErroCodigo: erro.codigo,
      ultimoErroMensagem: erro.mensagem,
      proximaTentativaEm: erro.proximaTentativaEm,
      atualizadoEm: new Date()
    })
    .where(
      and(
        eq(admissoesGoogleSincronizacoes.id, id),
        eq(admissoesGoogleSincronizacoes.empresaId, empresaId),
        eq(admissoesGoogleSincronizacoes.bloqueioToken, bloqueioToken)
      )
    )
    .returning();
  return linha ?? null;
}

export async function atualizarPastaColaboradorGoogle(
  id: string,
  empresaId: string,
  bloqueioToken: string,
  pastaId: string,
  db: ExecutorBanco = banco
) {
  const [linha] = await db
    .update(admissoesGoogleSincronizacoes)
    .set({ driveColaboradorFolderId: pastaId, atualizadoEm: new Date() })
    .where(
      and(
        eq(admissoesGoogleSincronizacoes.id, id),
        eq(admissoesGoogleSincronizacoes.empresaId, empresaId),
        eq(admissoesGoogleSincronizacoes.bloqueioToken, bloqueioToken)
      )
    )
    .returning();
  return linha ?? null;
}

export async function obterOuCriarDependenteGoogle(input: CriarDependenteGoogleInput, db: ExecutorBanco = banco) {
  const [criada] = await db
    .insert(admissoesGoogleDependentes)
    .values(input)
    .onConflictDoNothing({
      target: [admissoesGoogleDependentes.sincronizacaoId, admissoesGoogleDependentes.dependenteId]
    })
    .returning();
  if (criada) return criada;

  const [existente] = await db
    .select()
    .from(admissoesGoogleDependentes)
    .where(
      and(
        eq(admissoesGoogleDependentes.sincronizacaoId, input.sincronizacaoId),
        eq(admissoesGoogleDependentes.dependenteId, input.dependenteId)
      )
    )
    .limit(1);
  return existente ?? null;
}

export async function obterOuCriarArquivoGoogle(input: CriarArquivoGoogleInput, db: ExecutorBanco = banco) {
  const condicaoAnexo = input.colaboradorAnexoId
    ? eq(admissoesGoogleArquivos.colaboradorAnexoId, input.colaboradorAnexoId)
    : input.dependenteAnexoId
      ? eq(admissoesGoogleArquivos.dependenteAnexoId, input.dependenteAnexoId)
      : undefined;
  if (!condicaoAnexo) throw new Error("Anexo de sincronizacao nao informado");

  const [existente] = await db.select().from(admissoesGoogleArquivos).where(condicaoAnexo).limit(1);
  if (existente) return existente;

  const [criado] = await db.insert(admissoesGoogleArquivos).values(input).onConflictDoNothing().returning();
  if (criado) return criado;

  const [concorrente] = await db.select().from(admissoesGoogleArquivos).where(condicaoAnexo).limit(1);
  return concorrente ?? null;
}

export async function atualizarArquivoGoogle(
  id: string,
  drive: { pastaId: string; arquivoId: string; link: string | null },
  db: ExecutorBanco = banco
) {
  const [linha] = await db
    .update(admissoesGoogleArquivos)
    .set({
      driveFolderId: drive.pastaId,
      driveFileId: drive.arquivoId,
      driveWebViewLink: drive.link,
      status: "concluida",
      enviadoEm: new Date(),
      atualizadoEm: new Date()
    })
    .where(eq(admissoesGoogleArquivos.id, id))
    .returning();
  return linha ?? null;
}

export async function atualizarDependenteGoogle(
  id: string,
  dados: { pastaId?: string; linha?: number; metadataId?: string },
  db: ExecutorBanco = banco
) {
  const [linha] = await db
    .update(admissoesGoogleDependentes)
    .set({
      driveDependenteFolderId: dados.pastaId,
      sheetsRowNumber: dados.linha,
      sheetsMetadataId: dados.metadataId,
      atualizadoEm: new Date()
    })
    .where(eq(admissoesGoogleDependentes.id, id))
    .returning();
  return linha ?? null;
}

export async function concluirDependenteGoogle(id: string, db: ExecutorBanco = banco) {
  const [linha] = await db
    .update(admissoesGoogleDependentes)
    .set({ status: "concluida", atualizadoEm: new Date() })
    .where(eq(admissoesGoogleDependentes.id, id))
    .returning();
  return linha ?? null;
}

export async function falharDependenteGoogle(
  id: string,
  erro: { codigo: string; mensagem: string },
  db: ExecutorBanco = banco
) {
  const [linha] = await db
    .update(admissoesGoogleDependentes)
    .set({
      status: "falhou",
      ultimoErroCodigo: erro.codigo,
      ultimoErroMensagem: erro.mensagem,
      atualizadoEm: new Date()
    })
    .where(eq(admissoesGoogleDependentes.id, id))
    .returning();
  return linha ?? null;
}

export async function falharArquivoGoogle(
  id: string,
  erro: { codigo: string; mensagem: string },
  db: ExecutorBanco = banco
) {
  const [linha] = await db
    .update(admissoesGoogleArquivos)
    .set({
      status: "falhou",
      ultimoErroCodigo: erro.codigo,
      ultimoErroMensagem: erro.mensagem,
      atualizadoEm: new Date()
    })
    .where(eq(admissoesGoogleArquivos.id, id))
    .returning();
  return linha ?? null;
}

export async function atualizarLinhaColaboradorGoogle(
  id: string,
  dados: { linha?: number; metadataId?: string },
  db: ExecutorBanco = banco
) {
  const [linha] = await db
    .update(admissoesGoogleSincronizacoes)
    .set({
      sheetsColaboradorRowNumber: dados.linha,
      sheetsColaboradorMetadataId: dados.metadataId,
      atualizadoEm: new Date()
    })
    .where(eq(admissoesGoogleSincronizacoes.id, id))
    .returning();
  return linha ?? null;
}
