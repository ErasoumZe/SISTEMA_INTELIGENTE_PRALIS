<script setup lang="ts">
const router = useRouter();
const { apiUrl } = useApi();

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
    <div class="login-card">
      <div class="login-brand">
        <img
          src="/cicluz/logo-cicluz.png"
          alt="Cicluz Gestão Profissional"
          class="login-logo"
          width="300"
          height="98"
        />
      </div>

      <div class="login-head">
        <h1 class="login-title">Sistema Inteligente</h1>
        <p class="login-sub">Acesso de donos e gerentes</p>
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

      <p class="login-slogan">é provar e ser feliz</p>
    </div>
  </v-main>
</template>

<style scoped>
.login-page {
  min-height: 100dvh;
  background:
    radial-gradient(120% 80% at 50% -10%, rgba(192, 82, 29, 0.1) 0%, transparent 55%), var(--marca-fundo, #f6f6f8);
}

.login-card {
  box-sizing: border-box;
  width: 100%;
  max-width: min(420px, calc(100vw - 32px)); /* nunca ultrapassa a viewport */
  min-width: 0;
  background: var(--marca-superficie, #fff);
  border: 1px solid var(--marca-linha, #e8e8ec);
  border-radius: 24px;
  padding: 34px 32px 26px;
  box-shadow: 0 24px 60px rgba(94, 55, 49, 0.1);
  animation: login-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
}
@media (max-width: 390px) {
  .login-card {
    padding: 26px 18px 20px;
    border-radius: 20px;
  }
}

.login-brand {
  display: flex;
  justify-content: center;
  margin-bottom: 18px;
}
.login-logo {
  width: clamp(150px, 52%, 190px);
  height: auto;
  object-fit: contain;
}

.login-head {
  text-align: center;
  margin-bottom: 22px;
}
.login-title {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.3px;
  color: var(--marca-tinta, #2b2b2f);
}
.login-sub {
  margin: 4px 0 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--marca-tinta-suave, #6b6b73);
}

.login-form {
  display: grid;
  gap: 16px;
}
.login-alert {
  margin: -2px 0;
}

.login-submit {
  margin-top: 4px;
  background: #c0521d !important; /* laranja profundo: branco AA ~4.8:1 */
  color: #fff !important;
  font-weight: 800;
  letter-spacing: 0.2px;
  text-transform: none;
  border-radius: 12px;
  box-shadow: 0 10px 22px rgba(192, 82, 29, 0.3) !important;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease,
    background 0.15s ease;
}
.login-submit:hover {
  background: #a8461a !important;
  transform: translateY(-1px);
}

.login-link {
  justify-self: center;
  margin-top: 2px;
  font-size: 13px;
  font-weight: 700;
  color: var(--marca-tinta-suave, #6b6b73);
  text-decoration: none;
}
.login-link:hover {
  color: var(--marca-acento-forte, #35128c);
}

.login-slogan {
  margin: 22px 0 4px;
  text-align: center;
  font-style: italic;
  font-size: 12.5px;
  color: var(--marca-tinta-suave, #6b6b73);
}

/* Foco laranja nos campos (sem depender do tema por empresa) */
.login-card :deep(.v-field--focused .v-field__outline) {
  color: #c0521d;
}
.login-card :deep(.v-field--focused .v-label) {
  color: #9f4216;
}

@keyframes login-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .login-card {
    animation: none;
  }
  .login-submit:hover {
    transform: none;
  }
}
</style>
