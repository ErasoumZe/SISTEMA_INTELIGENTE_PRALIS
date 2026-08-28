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
  <v-main class="login-page tela-entrada d-flex align-center justify-center pa-4">
    <AppFundoEntrada />

    <div class="login-card cartao-entrada">
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
.login-card {
  box-sizing: border-box;
  width: 100%;
  max-width: min(420px, calc(100vw - 32px)); /* nunca ultrapassa a viewport */
  min-width: 0;
  border-radius: var(--cx-r-xl);
  padding: var(--cx-sp-8) var(--cx-sp-7) var(--cx-sp-6);
  box-shadow: var(--cx-e-3);
  animation: login-in var(--cx-dur-3) var(--cx-ease-out) both;
}
@media (max-width: 390px) {
  .login-card {
    padding: var(--cx-sp-6) var(--cx-sp-5) var(--cx-sp-5);
    border-radius: var(--cx-r-lg);
  }
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
