// R-228 · manha e tarde da maquininha pelo TURNO do caixa (PDV 1 MANHA, PDV 1 TARDE... nos 4 PDVs), por PDV e
// por dia. So a etiqueta do turno (M/T, cadastrada pelo DP) decide: o horario nao serve (turnos de feriado do DP
// comecam em horas que confundiriam manha e tarde). Sem etiqueta, ou "I" (integral), fica pela ordem dos caixas.
export type TipoTurnoMaquininha = "manha" | "tarde";

export function tipoDoTurnoMaquininha(turno: { etiqueta: string | null } | null): TipoTurnoMaquininha | null {
  if (turno?.etiqueta === "M") return "manha";
  if (turno?.etiqueta === "T") return "tarde";
  return null;
}
