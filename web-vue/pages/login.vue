<script setup lang="ts">
const router = useRouter();
const { apiUrl } = useApi();

const email = ref("diretor@email.com");
const password = ref("123456");
const loading = ref(false);
const error = ref("");

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
    await router.push("/");
  } else {
    error.value = "Email ou senha invalidos.";
  }

  loading.value = false;
}
</script>

<template>
  <v-main class="min-h-screen panel-bg d-flex align-center justify-center pa-4">
    <v-card width="100%" max-width="448">
      <v-card-title>
        <div class="text-h5">Entrar</div>
        <div class="text-body-2 text-muted">Acesse o painel financeiro da padaria.</div>
      </v-card-title>
      <v-card-text>
        <v-form class="d-grid ga-4" @submit.prevent="login">
          <v-text-field v-model="email" label="Email" autocomplete="email" name="email" type="email" required />
          <v-text-field
            v-model="password"
            label="Senha"
            autocomplete="current-password"
            name="password"
            type="password"
            required
          />
          <v-alert v-if="error" type="error" variant="tonal">{{ error }}</v-alert>
          <v-btn type="submit" color="primary" :loading="loading">Entrar</v-btn>
          <v-btn variant="text" to="/forgot-password">Esqueci minha senha</v-btn>
        </v-form>
      </v-card-text>
    </v-card>
  </v-main>
</template>
