import { sql } from "drizzle-orm";
import { jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import type { EstruturaMenuEmpresa } from "@padaria/shared";
import { empresas } from "../app.schema.js";

/** Organização visual comum da empresa; permissões continuam sendo avaliadas por usuário. */
export const configuracoesMenuEmpresas = pgTable("configuracoes_menu_empresas", {
  empresaId: uuid("empresa_id")
    .primaryKey()
    .references(() => empresas.id, { onDelete: "cascade" }),
  estrutura: jsonb("estrutura")
    .$type<EstruturaMenuEmpresa>()
    .notNull()
    .default(sql`'{"versao":1,"secoes":[]}'::jsonb`),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow()
});
