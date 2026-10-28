import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

/** Normaliza EANs do PDV e do catálogo removendo zeros à esquerda no próprio SQL. */
export function codigoBarrasSemZerosIniciais(valor: SQLWrapper): SQL {
  return sql`nullif(ltrim(${valor}, '0'), '')`;
}
