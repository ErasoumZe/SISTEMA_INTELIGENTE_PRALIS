import { and, desc, eq, inArray } from "drizzle-orm";
import { fechamentosCaixa } from "@padaria/db/schema/caixa";
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
