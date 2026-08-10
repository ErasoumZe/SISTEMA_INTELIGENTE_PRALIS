// Default-deny no cliente (espelha o hook global do backend): toda rota exige sessao, exceto
// a allowlist de telas publicas. Rodar aqui garante que uma pagina NOVA nasce protegida sem
// precisar lembrar de um guard, e o redirect acontece ANTES de renderizar (sem flash de
// conteudo protegido). Os guards de pagina (AppWorkspace/integracoes) permanecem como backstop.
//
// Sem cache de sessao de proposito: le /api/me a cada navegacao (cookie sempre fresco),
// desacoplado do logout — evita sessao stale. Custo desprezivel num ERP interno.
//
// A allowlist e a normalizacao do caminho vivem em `utils/rotas-publicas.ts` para serem testaveis
// sem runtime Nuxt: a comparacao exata contra `to.path` reprovava `/reset-password/` (com a barra
// final que o Nginx acrescenta) e mandava o visitante para /login, com o token do e-mail na mao.
import { ehRotaPublica } from "~/utils/rotas-publicas";

export default defineNuxtRouteMiddleware(async (to) => {
  // SPA (ssr:false): so faz sentido no cliente.
  if (import.meta.server) return;
  // So o pathname entra na comparacao — `to.path` ja vem sem query nem hash, entao o `?token=...`
  // do link de recuperacao segue intacto para a pagina.
  if (ehRotaPublica(to.path)) return;

  try {
    const { carregarSessao } = useApi();
    const sessao = await carregarSessao();
    if (!sessao) return navigateTo("/login");
  } catch {
    // Erro transiente (API fora): nao bloqueia — o guard da propria pagina e o backstop.
    return;
  }
});
