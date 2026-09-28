import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

/**
 * Expressões PostgreSQL compartilhadas pelos repositórios.
 *
 * SQL específico do banco permanece no pacote `db`; a API apenas compõe
 * consultas Drizzle sobre essas expressões tipadas.
 */
export function coalescerSql<T>(...valores: SQLWrapper[]): SQL<T> {
  return sql<T>`coalesce(${sql.join(valores, sql`, `)})`;
}

/** Normaliza CPF apenas para comparação, sem alterar o valor histórico gravado. */
export function cpfNormalizadoSql(coluna: SQLWrapper): SQL<string> {
  return sql<string>`regexp_replace(${coluna}, '\\D', '', 'g')`;
}
