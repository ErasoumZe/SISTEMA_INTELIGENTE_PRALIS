<script setup lang="ts">
/* O FUNDO VIVO DAS TELAS DE ENTRADA. Extraido do `login.vue` em 28/08/2026, quando `forgot-password`
   e `reset-password` passaram a receber o mesmo tratamento: manter tres copias de duzentas linhas de
   CSS e de um laco de `requestAnimationFrame` seria garantir que elas divergissem. De quebra o
   `login.vue` estava com 607 linhas contra o limite de ~400 do `16` R5.

   REFATORACAO PURA: nenhuma mancha mudou de cor, tamanho, tempo ou profundidade. O que era
   `.login-fundo`/`.login-blob` virou `.entrada-fundo`/`.entrada-blob`, e as variaveis de forca, que
   viviam na `.login-page`, passaram para a raiz deste componente — que e quem as consome. */
// O FUNDO SEGUE O MOUSE — so em ponteiro fino, so com movimento permitido.
//
// NUNCA escreve no DOM dentro do `mousemove`: o evento dispara mais vezes que os quadros da tela,
// e escrever ali significa recalcular estilo varias vezes por quadro para nada. O `mousemove` so
// guarda dois numeros; quem escreve e o `requestAnimationFrame`, uma vez por quadro.
//
// O AMORTECIMENTO tambem esta aqui, e nao no CSS com `transition`: uma transicao por cima de uma
// propriedade que muda a cada quadro reinicia a interpolacao a cada quadro e o resultado e um
// arrasto irregular. A interpolacao e feita na mao (`atual += (alvo - atual) * 0.06`), que da o
// atraso suave e continuo que se espera de paralaxe.
const raiz = ref<HTMLElement | null>(null);
let quadro = 0;
const alvo = { x: 0, y: 0 };
const atual = { x: 0, y: 0 };

function aoMoverMouse(e: MouseEvent) {
  // -1..1 a partir do centro da janela. So guarda; nao toca no DOM.
  alvo.x = (e.clientX / window.innerWidth) * 2 - 1;
  alvo.y = (e.clientY / window.innerHeight) * 2 - 1;
}

function passo() {
  atual.x += (alvo.x - atual.x) * 0.06;
  atual.y += (alvo.y - atual.y) * 0.06;
  const el = raiz.value;
  if (el) {
    // Duas custom properties em UM elemento. As manchas leem dali e cada uma multiplica pela
    // propria profundidade — o navegador nao recalcula gradiente nenhum, so recompoe camadas.
    el.style.setProperty("--mx", `${(atual.x * 26).toFixed(2)}px`);
    el.style.setProperty("--my", `${(atual.y * 26).toFixed(2)}px`);
  }
  quadro = requestAnimationFrame(passo);
}

onMounted(() => {
  if (typeof window === "undefined") return;
  // As duas condicoes que Marco pos: ponteiro fino (em toque nao existe mouse) e movimento
  // permitido. Sem qualquer uma delas o ouvinte nem chega a ser registrado — nao e um `if` dentro
  // do laco, e o laco nao existir.
  const fino = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const parado = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!fino || parado) return;
  window.addEventListener("mousemove", aoMoverMouse, { passive: true });
  quadro = requestAnimationFrame(passo);
});

onUnmounted(() => {
  if (typeof window === "undefined") return;
  window.removeEventListener("mousemove", aoMoverMouse);
  cancelAnimationFrame(quadro);
});
</script>

<template>
  <!-- Sete manchas: uma por categoria do sistema, mais a marca. A paleta nao foi escolhida para
       estas telas — ela E a paleta que o sistema ja usa para classificar dinheiro.
       `aria-hidden` e `pointer-events: none` porque isto nao e conteudo nem alvo: quem usa leitor
       de tela nao ouve nada a mais, e o clique atravessa como se nao existisse. -->
  <div ref="raiz" class="entrada-fundo" aria-hidden="true">
    <span v-for="i in 7" :key="i" class="entrada-blob" :class="'blob-' + i" />
  </div>
</template>

<style scoped>
/* ---------------------------------------------------------------------------------------------
   O FUNDO ANIMADO (28/08/2026)

   RECORTA, e isso e obrigatorio e nao estetico: o `html` tem `overflow-y: scroll` e o `body`
   computa `overflow-y: auto`, entao mancha que estoure para baixo NAO e cortada — ela aumenta a
   altura do documento e cria rolagem vertical numa tela que hoje nao rola. O `overflow: hidden`
   daqui e o que impede isso. No eixo X o `html` ja corta (main.css:1196), mas nao dependo disso.
   --------------------------------------------------------------------------------------------- */
.entrada-fundo {
  position: absolute;
  z-index: 0;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

/* A FORCA E POR TEMA porque o problema e outro em cada um: sobre o quase-preto do escuro a cor
   precisa de presenca para existir; a mesma presenca sobre o canvas claro vira mancha suja. E o
   mesmo criterio do `--cx-brilho-forca`, que varia por tema pela mesma razao. */
.entrada-fundo {
  --blob-op: 0.3;
  --blob-op-alta: 0.42;
  --blob-blur: 90px;
}
/* As telas de entrada abrem sempre no escuro (D-LOGIN-ESCURO), entao na pratica so o segundo bloco
   vale hoje. O primeiro fica porque o componente nao pode depender dessa decisao para nao ficar
   ilegivel: se um dia a entrada voltar a ter tema claro, ele ja tem forca propria medida para la. */
:root[data-theme="dark"] .entrada-fundo {
  --blob-op: 0.5;
  --blob-op-alta: 0.78;
}

.entrada-blob {
  position: absolute;
  width: var(--blob-tam);
  height: var(--blob-tam);
  border-radius: var(--cx-r-pill);
  /* Mancha, nao circulo: o radial morre em `transparent` antes da borda e o `blur` dissolve o
     resto. So com o `blur` ainda sobraria um disco reconhecivel. */
  background: radial-gradient(circle at 50% 50%, var(--blob-cor) 0%, transparent 70%);
  opacity: var(--blob-op);
  filter: blur(var(--blob-blur));
  /* PRIMEIRO `will-change` do projeto, e ele se paga: sao sete camadas grandes e desfocadas
     animando juntas, e sem a promocao o navegador re-rasteriza o desfoque a cada quadro. Fica
     restrito a estes sete elementos, que existem numa tela so. */
  will-change: transform, opacity;
  animation: login-deriva var(--blob-dur) var(--cx-ease) var(--blob-atraso) infinite alternate;
}

/* PARALAXE PELO `translate`, e nao pelo `transform`: as manchas ja usam `transform` na animacao de
   deriva, e escrever `transform` de novo aqui apagaria a animacao. `translate` e propriedade
   SEPARADA e COMPOE com `transform`, entao as duas coisas convivem sem uma anular a outra e sem
   precisar de um elemento embrulhador por mancha.
   So dentro de `@media (hover: hover) and (pointer: fine)`: em toque nao existe mouse, e sem a
   media as manchas ficariam esperando uma variavel que nunca chega. */
@media (hover: hover) and (pointer: fine) {
  .entrada-blob {
    translate: calc(var(--mx, 0px) * var(--blob-prof)) calc(var(--my, 0px) * var(--blob-prof));
  }
}

/* SO `transform` E `opacity`. Nenhuma das duas dispara layout ou paint — e o que permite sete
   manchas desfocadas a 60fps. Animar `top`/`left`/`width` aqui seria o caminho garantido para
   travar justamente a tela de entrada do sistema. */
@keyframes login-deriva {
  from {
    transform: translate3d(0, 0, 0) scale(1);
    opacity: var(--blob-op);
  }
  to {
    transform: translate3d(var(--blob-dx), var(--blob-dy), 0) scale(var(--blob-esc));
    opacity: var(--blob-op-alta);
  }
}

/* As sete manchas. A cor sai dos tokens de categoria que o sistema ja usa, mais a marca: nenhum
   hex novo. As duracoes sao longas e PRIMAS ENTRE SI de proposito — com tempos multiplos o
   conjunto reencontraria a mesma posicao a cada poucos ciclos e o fundo passaria a "bater", que e
   quando o olho percebe que e um laco. Os atrasos negativos comecam a animacao ja em curso, entao
   a tela nunca abre com as sete manchas alinhadas no mesmo quadro. */
.blob-1 {
  --blob-prof: 0.9;
  --blob-cor: var(--cat-entradas-base);
  --blob-tam: 46vmax;
  --blob-dx: 8vw;
  --blob-dy: 6vh;
  --blob-esc: 1.18;
  --blob-dur: 23s;
  --blob-atraso: 0s;
  top: -14vmax;
  left: -10vmax;
}
.blob-2 {
  --blob-prof: 1.15;
  --blob-cor: var(--cat-transferencias-base);
  --blob-tam: 38vmax;
  --blob-dx: -7vw;
  --blob-dy: 9vh;
  --blob-esc: 1.12;
  --blob-dur: 29s;
  --blob-atraso: -4s;
  top: -8vmax;
  right: -12vmax;
}
.blob-3 {
  --blob-prof: 0.75;
  --blob-cor: var(--cat-despesas-base);
  --blob-tam: 34vmax;
  --blob-dx: 6vw;
  --blob-dy: -8vh;
  --blob-esc: 1.22;
  --blob-dur: 31s;
  --blob-atraso: -9s;
  right: -6vmax;
  bottom: -12vmax;
}
.blob-4 {
  --blob-prof: 1.3;
  --blob-cor: var(--cat-mercadorias-base);
  --blob-tam: 30vmax;
  --blob-dx: -9vw;
  --blob-dy: -6vh;
  --blob-esc: 1.15;
  --blob-dur: 37s;
  --blob-atraso: -14s;
  bottom: -10vmax;
  left: -8vmax;
}
.blob-5 {
  --blob-prof: 0.6;
  --blob-cor: var(--cat-retiradas-base);
  --blob-tam: 28vmax;
  --blob-dx: 10vw;
  --blob-dy: 7vh;
  --blob-esc: 1.1;
  --blob-dur: 41s;
  --blob-atraso: -6s;
  top: 32%;
  left: -14vmax;
}
.blob-6 {
  --blob-prof: 1.05;
  --blob-cor: var(--cat-resultado-base);
  --blob-tam: 32vmax;
  --blob-dx: -8vw;
  --blob-dy: -9vh;
  --blob-esc: 1.2;
  --blob-dur: 43s;
  --blob-atraso: -19s;
  top: 40%;
  right: -14vmax;
}
/* A MARCA e a maior e a mais atras: e ela que da o tom roxo geral; as outras seis pontuam. */
.blob-7 {
  --blob-prof: 0.35;
  --blob-cor: var(--cx-brand);
  --blob-tam: 58vmax;
  --blob-dx: 4vw;
  --blob-dy: -5vh;
  --blob-esc: 1.08;
  --blob-dur: 47s;
  --blob-atraso: -11s;
  top: 50%;
  left: 50%;
  margin-top: -29vmax;
  margin-left: -29vmax;
}
</style>
