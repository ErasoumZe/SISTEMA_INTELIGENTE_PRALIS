import { sql } from "drizzle-orm";
import { pdvs, turnos } from "@padaria/db/schema/cadastro";
import { fechamentosCaixa } from "@padaria/db/schema/caixa";

// R-229 · o turno mostrado nas listagens e o do posto (PDV 1 · Tarde); caixa antigo, sem posto, usa o turno do DP.
// Exige `pdvs` e `turnos` no join da consulta.
export const turnoNomeDoCaixaSql = sql<string | null>`coalesce(
  ${pdvs.nome} || ' · ' || case ${fechamentosCaixa.turnoCaixa} when 'manha' then 'Manhã' when 'tarde' then 'Tarde' end,
  ${turnos.nome}
)`;
