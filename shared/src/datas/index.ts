// Fuso do negocio. A padaria opera em Sao Paulo; a data CONTABIL (data_referencia, data_movimento)
// e o dia como o operador o vive, nao o dia em UTC.
export const FUSO_NEGOCIO = "America/Sao_Paulo";

// en-CA formata como "yyyy-MM-dd", que e exatamente o formato das colunas `date` do Postgres.
const formatadorDiaNegocio = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO_NEGOCIO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

/**
 * Dia CONTABIL ("yyyy-MM-dd") de um instante, no fuso do negocio.
 *
 * Nao use `data.toISOString().slice(0, 10)` para isso: ela devolve o dia em UTC e, em fuso
 * negativo, uma venda das 22:00 de 16/07 (01:00Z de 17/07) cairia no dia 17 — no caixa errado,
 * no fechamento errado e divergindo do CREARE. Era o BUG B.
 */
export function diaNegocio(instante: Date | string): string {
  return formatadorDiaNegocio.format(new Date(instante));
}

/**
 * Janela [inicio, fim) de um dia contabil, em instantes UTC — para filtrar timestamps por dia
 * local. Ex.: "2026-07-16" em BRT -> [2026-07-16T03:00Z, 2026-07-17T03:00Z).
 *
 * Deriva o offset a partir do proprio dia (nao de um valor fixo), entao horario de verao e
 * qualquer mudanca de regra do fuso continuam corretos.
 */
export function janelaDiaNegocio(dia: string): { inicio: Date; fim: Date } {
  return { inicio: inicioDoDiaNegocio(dia), fim: inicioDoDiaNegocio(somarDias(dia, 1)) };
}

// Meia-noite local do dia, como instante UTC. Parte do palpite "meia-noite UTC" e corrige pelo
// offset que o fuso realmente aplica naquele instante.
function inicioDoDiaNegocio(dia: string): Date {
  const palpite = new Date(`${dia}T00:00:00Z`);
  const offsetMs = palpite.getTime() - new Date(`${diaNegocio(palpite)}T${horaNegocio(palpite)}Z`).getTime();
  return new Date(palpite.getTime() + offsetMs);
}

function horaNegocio(instante: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: FUSO_NEGOCIO,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(instante);
}

export function somarDias(dia: string, dias: number): string {
  const data = new Date(`${dia}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}
