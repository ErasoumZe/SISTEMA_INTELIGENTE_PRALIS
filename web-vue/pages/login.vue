<script setup lang="ts">
const router = useRouter();
const { apiUrl } = useApi();

// A ENTRADA ABRE SEMPRE NO ESCURO (Marco, 28/08/2026). O fundo animado nao ficou bom no claro, e
// manter duas versoes do mesmo desenho e divida; a entrada passa a ter um tema so, e a escolha de
// claro/escuro continua existindo DENTRO do sistema.
//
// Isto SUBSTITUI a leitura de `escuro` que existia aqui. O historico vale a pena guardar porque
// custou um item: o VIS-13 fechou dizendo "o login nao tem tema, a logo clara esta certa", e estava
// errado — a tela nao tinha CONTROLE de tema, mas herdava tema pelo logout, que e navegacao
// client-side e nao recarrega o documento. Com o tema agora FORCADO, a logo deixa de depender de
// estado e passa a ser sempre a branca, que e a correta sobre fundo escuro.
//
// O `useTemaEntrada` nao grava preferencia nenhuma — le, forca, e devolve o que estava. O porque
// esta no proprio arquivo.
useTemaEntrada();

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
const fundoEl = ref<HTMLElement | null>(null);
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
  const el = fundoEl.value;
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

const email = ref("");
const password = ref("");
const loading = ref(false);
const error = ref("");
const mostrarSenha = ref(false);

async function login() {
  loading.value = true;
  error.value = "";

  const response = await fetch(`${apiUrl}/api/auth/sign-in/email`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.value, password: password.value, rememberMe: true })
  });

  if (response.ok) {
    // Segunda barreira, independente do logout: quem entra AGORA nunca herda estado de quem estava
    // antes. Cobre tambem a saida por expiracao de sessao ou por navegacao direta para /login.
    limparEstadoWorkspace(useNuxtApp().payload.state);
    await router.push("/");
  } else {
    error.value = "E-mail ou senha inválidos.";
  }

  loading.value = false;
}
</script>

<template>
  <v-main class="login-page d-flex align-center justify-center pa-4">
    <!-- O FUNDO. Sete manchas: uma por categoria do sistema, mais a marca. A paleta nao foi
         escolhida para esta tela — ela E a paleta que o sistema ja usa para classificar dinheiro.
         `aria-hidden` e `pointer-events: none` porque isto nao e conteudo nem alvo: quem usa
         leitor de tela nao ouve nada a mais, e o clique atravessa como se nao existisse. -->
    <div ref="fundoEl" class="login-fundo" aria-hidden="true">
      <span v-for="i in 7" :key="i" class="login-blob" :class="'blob-' + i" />
    </div>

    <div class="login-card">
      <div class="login-brand">
        <img
          src="/cicluz/logo-cicluz-branca.png"
          alt="Cicluz Gestão Profissional"
          class="login-logo"
          width="300"
          height="98"
        />
      </div>

      <div class="login-head">
        <h1 class="login-title">Sistema Inteligente</h1>
        <!-- Era "Acesso de donos e gerentes". Pela R-121 o operador de caixa virou usuario
             de primeira classe deste login, entao o subtitulo excluia quem mais entra aqui. -->
        <p class="login-sub">Acesso ao sistema</p>
      </div>

      <v-form class="login-form" @submit.prevent="login">
        <v-text-field
          v-model="email"
          label="E-mail"
          placeholder="voce@cicluz.com.br"
          autocomplete="email"
          name="email"
          type="email"
          variant="outlined"
          density="comfortable"
          prepend-inner-icon="mdi-email-outline"
          hide-details="auto"
          required
        />
        <v-text-field
          v-model="password"
          label="Senha"
          autocomplete="current-password"
          name="password"
          :type="mostrarSenha ? 'text' : 'password'"
          variant="outlined"
          density="comfortable"
          prepend-inner-icon="mdi-lock-outline"
          :append-inner-icon="mostrarSenha ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
          hide-details="auto"
          required
          @click:append-inner="mostrarSenha = !mostrarSenha"
        />

        <v-alert v-if="error" type="error" variant="tonal" density="compact" class="login-alert">
          {{ error }}
        </v-alert>

        <v-btn
          type="submit"
          class="login-submit"
          variant="flat"
          size="large"
          block
          :loading="loading"
          append-icon="mdi-arrow-right"
        >
          Entrar
        </v-btn>

        <NuxtLink to="/forgot-password" class="login-link">Esqueci minha senha</NuxtLink>
      </v-form>

      <p class="login-slogan">clareza em cada ciclo do seu negócio</p>
    </div>
  </v-main>
</template>

<style scoped>
/* Login e a UNICA tela que carrega antes de existir empresa: nenhum tema em runtime,
   tudo aqui e a camada de tokens crua (--cx-*, definida em assets/main.css). */

/* AS DUAS LUZES CONTINUAM como base. O comentario que estava aqui dizia "profundidade sem aurora:
   nada compete com o cartao", e essa decisao foi REVERTIDA por Marco em 28/08/2026, que pediu
   "gradient das cores da Cicluz atras mexendo". Registro a nota antiga em vez de apaga-la: ela nao
   estava errada, foi substituida por um pedido. O que sobrou dela como regra viva e o TETO — o
   fundo se move, mas nao compete com o cartao, e por isso a forca das manchas e medida.

   `position: relative` + `isolation: isolate` sao O QUE FAZ O FUNDO EXISTIR, e nao enfeite. Medido
   antes de escrever: entre o `html` e o `.login-card` NENHUM elemento cria contexto de empilhamento
   (`.v-application` e `.v-main` sao `static`; o `.v-application__wrap` e `relative` com
   `z-index: auto`, que nao cria). Sem isolar, um decorativo de `z-index` negativo sobe ate a raiz e
   e pintado ABAIXO do proprio fundo da `.login-page` — some por completo. */
.login-page {
  position: relative;
  isolation: isolate;
  min-height: 100dvh;
  background:
    radial-gradient(130% 85% at 50% -15%, color-mix(in srgb, var(--cx-brand) 6%, transparent) 0%, transparent 60%),
    radial-gradient(
      90% 60% at 50% 115%,
      color-mix(in srgb, var(--cx-brand-strong) 4%, transparent) 0%,
      transparent 60%
    ),
    var(--cx-canvas);
}

/* Elevacao em camadas (contato + ambiente) e SEM borda: a separacao vem da sombra,
   nao de uma linha cinza em volta. */
/* O VIDRO DO CARTAO — EXCECAO REGISTRADA AO 67 §10 (D-LOGIN-VIDRO, 28/08/2026)

   O 67 §10 diz, com todas as letras, "nunca em card de conteudo e nunca atras de texto de leitura".
   Esta e a unica excecao aberta, ela e do Marco, e ela vale SO para as tres telas de entrada.

   O QUE JUSTIFICA A EXCECAO, e nao e "ficou bonito": a regra existe porque vidro atras de texto de
   leitura poe o contraste a merce de um fundo que o sistema nao controla — conteudo rolando,
   tabela, imagem. Aqui o fundo e conhecido, e nosso, e nao rola: sao sete manchas que eu mesmo
   posicionei e cuja cor e forca eu escolho. O risco que a regra previne nao existe nesta tela.

   A OPACIDADE FOI MEDIDA, nao escolhida, e a medicao varreu 24 INSTANTES da animacao ao longo de
   120s: as manchas se movem, entao o fundo atras do cartao muda durante o ciclo e medir um quadro
   so nao vale nada. Vale o PIOR instante. Medido, texto sobre o vidro:

                      claro          escuro
       70%          5,11:1          7,00:1
       78%   <--    5,30:1          7,15:1
       86%          5,50:1          7,25:1

   Ficou 78%: Marco pediu "um glass mais leve", e 78% deixa passar mais fundo que 86% continuando
   0,8 acima do minimo de 4,5:1 no tema claro, que e o lado apertado. 70% tambem passa e fica
   registrado como o piso conhecido, caso ele queira ainda mais vidro.

   A ORDEM DA CORRECAO E DO MARCO: se reprovar, SOBE a opacidade do vidro. Nunca clareia o texto —
   clarear conserta o numero e estraga a hierarquia da tela. */
.login-page {
  --login-vidro: 78%;
}
.login-card {
  /* Acima do fundo. Sem isto o cartao e irmao das manchas na mesma camada, e a ordem passa a ser a
     do documento — fragil, e quebraria no dia em que alguem reordenasse o template. */
  position: relative;
  z-index: 1;
  backdrop-filter: var(--cx-chrome-blur);
  -webkit-backdrop-filter: var(--cx-chrome-blur);
  box-sizing: border-box;
  width: 100%;
  max-width: min(420px, calc(100vw - 32px)); /* nunca ultrapassa a viewport */
  min-width: 0;
  background: color-mix(in srgb, var(--cx-surface) var(--login-vidro), transparent);
  border-radius: var(--cx-r-xl);
  padding: var(--cx-sp-8) var(--cx-sp-7) var(--cx-sp-6);
  box-shadow: var(--cx-e-3);
  animation: login-in var(--cx-dur-3) var(--cx-ease-out) both;
}
/* Fallback solido obrigatorio, como em todo uso de vidro neste projeto: sem suporte a
   `backdrop-filter` o cartao NAO pode ficar semitransparente, porque ai as manchas apareceriam
   cruas e nitidas atras do texto — exatamente o que o 67 §10 previne. */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .login-card {
    background: var(--cx-surface);
  }
}

@media (max-width: 390px) {
  .login-card {
    padding: var(--cx-sp-6) var(--cx-sp-5) var(--cx-sp-5);
    border-radius: var(--cx-r-lg);
  }
}

/* ---------------------------------------------------------------------------------------------
   O FUNDO ANIMADO (28/08/2026)

   RECORTA, e isso e obrigatorio e nao estetico: o `html` tem `overflow-y: scroll` e o `body`
   computa `overflow-y: auto`, entao mancha que estoure para baixo NAO e cortada — ela aumenta a
   altura do documento e cria rolagem vertical numa tela que hoje nao rola. O `overflow: hidden`
   daqui e o que impede isso. No eixo X o `html` ja corta (main.css:1196), mas nao dependo disso.
   --------------------------------------------------------------------------------------------- */
.login-fundo {
  position: absolute;
  z-index: 0;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

/* A FORCA E POR TEMA porque o problema e outro em cada um: sobre o quase-preto do escuro a cor
   precisa de presenca para existir; a mesma presenca sobre o canvas claro vira mancha suja. E o
   mesmo criterio do `--cx-brilho-forca`, que varia por tema pela mesma razao. */
.login-page {
  --blob-op: 0.3;
  --blob-op-alta: 0.42;
  --blob-blur: 90px;
}
:root[data-theme="dark"] .login-page {
  --blob-op: 0.5;
  --blob-op-alta: 0.78;
}

.login-blob {
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
  .login-blob {
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

/* Entrada escalonada: os blocos internos sobem em sequencia curta atras do cartao.
   Cada movimento individual fica dentro de --cx-dur-3; o que escalona e o atraso. */
.login-brand,
.login-head,
.login-form,
.login-slogan {
  animation: login-in var(--cx-dur-3) var(--cx-ease-out) both;
}
.login-brand {
  animation-delay: 60ms;
}
.login-head {
  animation-delay: 110ms;
}
.login-form {
  animation-delay: 160ms;
}
.login-slogan {
  animation-delay: 220ms;
}

.login-brand {
  display: flex;
  justify-content: center;
  margin-bottom: var(--cx-sp-5);
}
.login-logo {
  width: clamp(150px, 52%, 190px);
  height: auto;
  object-fit: contain;
}

.login-head {
  text-align: center;
  margin-bottom: var(--cx-sp-6);
}
.login-title {
  margin: 0;
  font-size: var(--cx-fs-h2);
  font-weight: 700;
  letter-spacing: var(--cx-tracking-tight);
  color: var(--cx-ink);
}
.login-sub {
  margin: var(--cx-sp-1) 0 0;
  font-size: var(--cx-fs-body);
  font-weight: 500;
  color: var(--cx-ink-soft);
}

.login-form {
  display: grid;
  gap: var(--cx-sp-4);
}
.login-alert {
  margin: -2px 0;
}

/* Roxo da marca (--cx-brand), o mesmo do "+ NOVO" do app. O laranja #c0521d que estava aqui era
   residuo da Padaria Pralis (R-098). De quebra o contraste com branco sobe de ~4,8:1 para ~7,8:1. */
.login-submit {
  margin-top: var(--cx-sp-1);
  background: var(--cx-brand) !important;
  color: var(--cx-brand-on) !important;
  font-weight: 700;
  letter-spacing: 0.01em;
  text-transform: none;
  border-radius: var(--cx-r-md);
  box-shadow: 0 10px 22px color-mix(in srgb, var(--cx-brand) 30%, transparent) !important;
  transition:
    transform var(--cx-dur-1) var(--cx-ease),
    box-shadow var(--cx-dur-2) var(--cx-ease),
    background var(--cx-dur-1) var(--cx-ease);
}
.login-submit:hover {
  background: var(--cx-brand-strong) !important;
  transform: translateY(-1px);
  box-shadow: 0 14px 28px color-mix(in srgb, var(--cx-brand) 36%, transparent) !important;
}
/* Afunda no clique: o botao responde ao dedo antes de a rede responder. */
.login-submit:active {
  transform: translateY(1px);
  box-shadow: 0 4px 10px color-mix(in srgb, var(--cx-brand) 28%, transparent) !important;
}

.login-link {
  justify-self: center;
  margin-top: 2px;
  padding: var(--cx-sp-1) var(--cx-sp-2);
  border-radius: var(--cx-r-sm);
  font-size: var(--cx-fs-caption);
  font-weight: 600;
  color: var(--cx-ink-soft);
  text-decoration: none;
  transition:
    color var(--cx-dur-1) var(--cx-ease),
    background var(--cx-dur-1) var(--cx-ease);
}
.login-link:hover {
  /* `--cx-brand-text` e nao `--cx-brand-strong`: o 67 §3 classifica o `-strong` como "hover do
     PREENCHIMENTO" e o `-text` como "marca como tinta ou grafico fino". O `-strong` nao tem
     contraparte no escuro — medido, #35128c sobre #191f26 da 1,24:1. O `-text` tem (main.css:182)
     e o proprio comentario de la declara 6,9:1. */
  color: var(--cx-brand-text);
  background: var(--cx-hover);
}

.login-slogan {
  margin: var(--cx-sp-6) 0 var(--cx-sp-1);
  text-align: center;
  font-style: italic;
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}

/* Foco no roxo da marca (fixo: nao depende do tema por empresa, que aqui ainda nem carregou).
   Alem da borda, o campo focado ganha o anel — o mesmo do resto do sistema. */
/* `--cx-focus` e nao `--cx-brand`: a borda do campo focado e GRAFICO FINO, e o 67 §3 e explicito —
   "Nunca use --cx-brand como texto ou grafico fino sobre superficie escura: medido, #6515dd sobre
   #191f26 da 2,1:1 e reprova o minimo de 3:1. Para isso existem --cx-brand-text e --cx-focus."
   O `--cx-focus` e redefinido no escuro (main.css:183) e existe exatamente para isto. */
.login-card :deep(.v-field--focused .v-field__outline) {
  color: var(--cx-focus);
}
.login-card :deep(.v-field--focused .v-label) {
  color: var(--cx-brand-text);
}
.login-card :deep(.v-field--focused) {
  box-shadow: 0 0 0 3px var(--cx-brand-ring);
}

@keyframes login-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .login-card,
  .login-brand,
  .login-head,
  .login-form,
  .login-slogan {
    animation: none;
  }
  .login-submit:hover,
  .login-submit:active {
    transform: none;
  }
  /* O FUNDO CONGELA, NAO SOME — foi o pedido, e a diferenca importa: esconder tiraria a identidade
     da tela justamente de quem pediu menos movimento, o que e punir pelo ajuste. Com
     `animation: none` as manchas ficam nas posicoes declaradas em CSS, que sao o inicio do
     percurso, e a composicao continua inteira.
     Precisa estar AQUI e ser explicito: o reset global de `main.css:2233` zera
     `animation-duration` e poe `iteration-count: 1`, o que numa animacao `infinite alternate`
     congelaria no quadro FINAL, nao no inicial — as manchas parariam deslocadas e ampliadas. */
  .login-blob {
    animation: none;
    /* Sem seguir o mouse tambem. O ouvinte ja nem e registrado no script; este `translate: none` e
       o cinto de seguranca para o caso de a preferencia mudar com a tela aberta, quando a media
       query reavalia mas o `onMounted` nao roda de novo. */
    translate: none;
  }
}
</style>
