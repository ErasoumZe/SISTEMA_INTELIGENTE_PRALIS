/**
 * Quais grupos do menu estao abertos (VIS-E7c).
 *
 * MORA FORA DO COMPONENTE, e isso nao e preferencia de estilo: a casca REMONTA a cada rota — cada
 * pagina renderiza o seu proprio AppWorkspace -> AppShell —, e foi isso que o VIS-E6i mediu marcando
 * o no do DOM e vendo a marca sumir. Um `ref` dentro do AppSidebar nasceria `{}` em toda navegacao,
 * e a sanfona fecharia na cara do usuario tudo o que ele tivesse aberto. E o defeito que a categoria
 * "Lancamentos" tem hoje e que ninguem nota so porque o watch dela reabre a categoria da tela ativa.
 *
 * `useState` do Nuxt e nao `sessionStorage`: o requisito e sobreviver a NAVEGACAO, e o `useState`
 * faz isso por viver no app e nao no componente. `sessionStorage` traria risco de descompasso de
 * hidratacao (nao existe no servidor) para comprar sobrevivencia a um recarregamento de pagina
 * inteira — que nem e o caso pedido, e que o `gruposIniciais` cobre de outro jeito: depois de um
 * recarregamento o grupo da tela ativa reabre sozinho.
 *
 * Banco esta fora de questao: e outra frente e exigiria autorizacao do Marco (RD-04).
 */
export function useGruposAbertos() {
  return useState<Record<string, boolean>>("sidebar-grupos-abertos", () => ({}));
}
