import { and, desc, eq, inArray } from "drizzle-orm";
import type { JsonValue } from "@padaria/shared/api";
import { empresas, perfisUsuarios } from "@padaria/db/schema/cadastro";
import { fechamentosCaixa, planilhaTesourariaEnvios } from "@padaria/db/schema/caixa";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

/**
 * TARDE (Marco, 12/11/2026): o relatorio da maquininha da tarde vem acumulado do dia; para gravar so a tarde, precisa
 * do caixa da MANHA do mesmo PDV e do mesmo dia (mesma maquininha). So caixa ja encerrado conta.
 */
export async function buscarCaixaDaManhaRepository(
  input: { empresaId: string; pdvId: string; dataMovimento: string },
  db: ExecutorBanco = banco
) {
  const [linha] = await db
    .select({ id: fechamentosCaixa.id })
    .from(fechamentosCaixa)
    .where(
      and(
        eq(fechamentosCaixa.empresaId, input.empresaId),
        eq(fechamentosCaixa.pdvId, input.pdvId),
        eq(fechamentosCaixa.dataMovimento, input.dataMovimento),
        eq(fechamentosCaixa.turnoCaixa, "manha"),
        inArray(fechamentosCaixa.status, ["fechado", "ajustado"])
      )
    )
    .orderBy(desc(fechamentosCaixa.dataHoraAbertura))
    .limit(1);
  return linha ?? null;
}

/** Sigla da empresa no nome das abas. Sem sigla, a empresa nao envia para a planilha. */
export async function buscarSiglaPlanilhaRepository(empresaId: string, db: ExecutorBanco = banco) {
  const [linha] = await db
    .select({ sigla: empresas.siglaPlanilha })
    .from(empresas)
    .where(eq(empresas.id, empresaId))
    .limit(1);
  return linha?.sigla ?? null;
}

export async function listarEnviosDoCaixaRepository(fechamentoCaixaId: string, db: ExecutorBanco = banco) {
  return db
    .select({
      aba: planilhaTesourariaEnvios.aba,
      linhaInicial: planilhaTesourariaEnvios.linhaInicial,
      enviadoEm: planilhaTesourariaEnvios.enviadoEm,
      enviadoPor: perfisUsuarios.nome
    })
    .from(planilhaTesourariaEnvios)
    .innerJoin(perfisUsuarios, eq(perfisUsuarios.usuarioId, planilhaTesourariaEnvios.enviadoPor))
    .where(eq(planilhaTesourariaEnvios.fechamentoCaixaId, fechamentoCaixaId));
}

/** Registra o envio confirmado. O unique (caixa, aba) impede o segundo registro do mesmo envio. */
export async function registrarEnvioPlanilhaRepository(
  input: {
    empresaId: string;
    fechamentoCaixaId: string;
    aba: string;
    linhaInicial: number;
    linhas: number;
    lido: JsonValue;
    enviado: JsonValue;
    enviadoPor: string;
  },
  db: ExecutorBanco = banco
) {
  await db.insert(planilhaTesourariaEnvios).values(input).onConflictDoNothing();
}
