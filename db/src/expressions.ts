import { and, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";

/** Normaliza EANs do PDV e do catálogo removendo zeros à esquerda no próprio SQL. */
export function codigoBarrasSemZerosIniciais(valor: SQLWrapper): SQL {
  return sql`nullif(ltrim(${valor}, '0'), '')`;
}

/**
 * Janela diaria pela hora LOCAL (America/Sao_Paulo) de um timestamp: "das 06:00 as 14:00" em cada dia do periodo.
 * Inicio > fim cruza a meia-noite (22:00 a 02:00). Linha sem hora (null) nunca entra. Sem os dois limites, null.
 */
export function janelaDiariaBrasilia(momento: SQLWrapper, inicio?: string, fim?: string): SQL | undefined {
  if (!inicio && !fim) return undefined;
  const horaLocal = sql`(${momento} at time zone 'America/Sao_Paulo')::time`;
  const aPartirDe = (hora: string) => sql`${horaLocal} >= ${hora}::time`;
  const ate = (hora: string) => sql`${horaLocal} <= ${hora}::time`;
  if (inicio && fim) return inicio <= fim ? and(aPartirDe(inicio), ate(fim)) : or(aPartirDe(inicio), ate(fim));
  return inicio ? aPartirDe(inicio) : ate(fim!);
}
