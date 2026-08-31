/**
 * Devolve o menu lateral a uma posicao em que o item da tela atual esta visivel.
 *
 * O DEFEITO. Ao navegar, o menu voltava ao topo e o item recem-clicado sumia. E facil culpar o
 * reset de scroll do `AppShell.vue` — mas aquele reset e do `.padaria-main`, e do CONTEUDO, e esta
 * certo. A causa e outra: cada pagina renderiza o SEU proprio `AppWorkspace` -> `AppShell`, entao
 * trocar de rota desmonta e remonta a casca inteira. A `.sidebar-nav` nao PERDE o scroll — ela e
 * outro elemento, e nasce com `scrollTop` 0.
 *
 * A PROVA (Playwright, 1440x900, diretor@email.com): marcamos o no do DOM antes de navegar. Com o
 * menu rolado ate o fim (`scrollTop` 1183 de 1183 possiveis) clicamos em "Colaboradores". Depois
 * da navegacao a marca NAO existe mais — no trocado — e o item ativo reaparece a 1322px enquanto a
 * caixa visivel da nav vai de 309 a 878. O item escolhido ficava 444px abaixo da borda de baixo.
 *
 * O CONSERTO. Nao ha `scrollTop` a preservar num no destruido, entao a posicao e RE-DERIVADA do
 * item ativo. `block: "nearest"` rola o minimo necessario e nao faz nada quando o item ja esta
 * visivel — por isso o Painel, cujo item fica no topo, continua sem mexer em nada.
 *
 * SEM ANIMACAO, de proposito. Navegar pelo menu e o ato mais repetido do sistema; animar um
 * reposicionamento que ninguem pediu chama atencao para uma correcao que deveria passar
 * despercebida. Sendo instantaneo, `prefers-reduced-motion` fica atendido por construcao — nao ha
 * movimento a reduzir. E a mesma razao pela qual nao animamos abrir a paleta de comandos.
 */
export function useItemAtivoVisivel() {
  onMounted(async () => {
    // Espera o menu existir no DOM. `onMounted` ja roda com a marcacao inserida, mas o item ativo
    // depende de props que o AppWorkspace resolve, e um tick e mais barato que uma condicao de
    // corrida silenciosa.
    await nextTick();
    const ativo = document.querySelector<HTMLElement>(".sidebar-nav .sidebar-item.active");
    if (!ativo) return;
    // Item dentro de categoria fechada nao tem caixa: o `.sidebar-subitens-wrap` fechado e
    // `grid-template-rows: 0fr`, entao a altura e 0. Rolar ate um elemento sem altura levaria a nav
    // para um ponto que o usuario nao ve. Nesse caso nao se mexe em nada.
    if (!ativo.getBoundingClientRect().height) return;
    ativo.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
  });
}
