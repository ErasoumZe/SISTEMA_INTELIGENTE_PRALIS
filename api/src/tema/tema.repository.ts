import { and, eq } from "drizzle-orm";
import { configuracoesTemasTelas } from "@padaria/db/schema";
import { banco, type ExecutorBanco } from "../banco/conexao.js";
import type { TemaDto, TemaPayload } from "@padaria/shared/tema";

const temaPadrao: TemaDto = {
  corPrimaria: "#6d28d9",
  corSecundaria: "#0891b2",
  corFundo: "#eaf1f9",
  corCartao: "#ffffff",
  corSucesso: "#16a34a",
  corAviso: "#f59e0b",
  corErro: "#ef4444"
};

function paraDto(linha: typeof configuracoesTemasTelas.$inferSelect): TemaDto {
  return {
    corPrimaria: linha.corPrimaria,
    corSecundaria: linha.corSecundaria,
    corFundo: linha.corFundo,
    corCartao: linha.corCartao,
    corSucesso: linha.corSucesso,
    corAviso: linha.corAviso,
    corErro: linha.corErro
  };
}

export async function obterTema(empresaId: string, tela: string, db: ExecutorBanco = banco): Promise<TemaDto | null> {
  const [linha] = await db
    .select()
    .from(configuracoesTemasTelas)
    .where(and(eq(configuracoesTemasTelas.empresaId, empresaId), eq(configuracoesTemasTelas.tela, tela)))
    .limit(1);
  return linha ? paraDto(linha) : null;
}

export async function obterTemaComFallback(
  empresaId: string,
  tela: string,
  db: ExecutorBanco = banco
): Promise<TemaDto> {
  return (await obterTema(empresaId, tela, db)) ?? (await obterTema(empresaId, "padrao", db)) ?? temaPadrao;
}

export async function salvarTema(
  input: TemaPayload & { atualizadoPor?: string | null },
  db: ExecutorBanco = banco
): Promise<TemaDto> {
  const [linha] = await db
    .insert(configuracoesTemasTelas)
    .values({
      empresaId: input.empresaId,
      tela: input.tela,
      corPrimaria: input.corPrimaria,
      corSecundaria: input.corSecundaria,
      corFundo: input.corFundo,
      corCartao: input.corCartao,
      corSucesso: input.corSucesso,
      corAviso: input.corAviso,
      corErro: input.corErro,
      atualizadoPor: input.atualizadoPor ?? null
    })
    .onConflictDoUpdate({
      target: [configuracoesTemasTelas.empresaId, configuracoesTemasTelas.tela],
      set: {
        corPrimaria: input.corPrimaria,
        corSecundaria: input.corSecundaria,
        corFundo: input.corFundo,
        corCartao: input.corCartao,
        corSucesso: input.corSucesso,
        corAviso: input.corAviso,
        corErro: input.corErro,
        atualizadoPor: input.atualizadoPor ?? null,
        atualizadoEm: new Date()
      }
    })
    .returning();

  if (!linha) throw new Error("Tema nao foi salvo");
  return paraDto(linha);
}
