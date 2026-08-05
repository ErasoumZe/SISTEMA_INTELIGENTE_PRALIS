export interface ApiHealth {
  status: "ok";
  service: "api";
  /**
   * Resultado do `SELECT 1` (G-04 / D-21). Só existe o valor "ok" de propósito: banco fora do ar
   * responde **503**, e não um 200 com `banco: "indisponivel"`. Quem consome o health — healthcheck
   * do Compose, do Coolify e o `verificarApi()` do agente CREARE — lê o STATUS HTTP, não o corpo.
   * Um 200 com o aviso dentro deixaria o container verde exatamente no caso que a G-04 corrige.
   *
   * O campo existe para quem abre o endpoint na mão: é ele que prova que o banco foi tocado.
   */
  banco: "ok";
}
