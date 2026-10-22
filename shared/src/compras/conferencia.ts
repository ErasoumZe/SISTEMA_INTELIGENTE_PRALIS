// Doc 57 §2: recorte da conferencia de estoque pelos rankings das bolinhas (top 20%, ultimos 3 meses).
export const rankingsConferencia = ["mais_vendidos", "mais_comprados", "mais_lucro"] as const;
export type RankingConferencia = (typeof rankingsConferencia)[number];
