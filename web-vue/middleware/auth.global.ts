// Default-deny no cliente (espelha o hook global do backend): toda rota exige sessao, exceto
// a allowlist de telas publicas. Rodar aqui garante que uma pagina NOVA nasce protegida sem
// precisar lembrar de um guard, e o redirect acontece ANTES de renderizar (sem flash de
// conteudo protegido). Os guards de pagina (AppWorkspace/integracoes) permanecem como backstop.
//
// Sem cache de sessao de proposito: le /api/me a cada navegacao (cookie sempre fresco),
// desacoplado do logout — evita sessao stale. Custo desprezivel num ERP interno.
const ROTAS_PUBLICAS = new Set(["/login", "/forgot-password", "/reset-password"]);

export default defineNuxtRouteMiddleware(async (to) => {
  // SPA (ssr:false): so faz sentido no cliente.
  if (import.meta.server) return;
  if (ROTAS_PUBLICAS.has(to.path)) return;

  try {
    const { carregarSessao } = useApi();
    const sessao = await carregarSessao();
    if (!sessao) return navigateTo("/login");
  } catch {
    // Erro transiente (API fora): nao bloqueia — o guard da propria pagina e o backstop.
    return;
  }
});
