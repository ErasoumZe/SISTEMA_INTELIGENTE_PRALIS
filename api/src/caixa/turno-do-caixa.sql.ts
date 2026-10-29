import { sql } from "drizzle-orm";
import { turnos } from "@padaria/db/schema/cadastro";
import { fechamentosCaixa } from "@padaria/db/schema/caixa";

// R-229 · o turno mostrado nas listagens e o do posto ("Manhã"/"Tarde"); caixa antigo, sem posto, usa o turno do DP.
// So o turno: as telas ja mostram o PDV ao lado ("PDV 2 · Manhã"); com o PDV aqui dentro saia "PDV 2 · PDV 2 · Manhã".
// Exige `turnos` no join da consulta.
export const turnoNomeDoCaixaSql = sql<string | null>`coalesce(
  case ${fechamentosCaixa.turnoCaixa} when 'manha' then 'Manhã' when 'tarde' then 'Tarde' end,
  ${turnos.nome}
)`;
