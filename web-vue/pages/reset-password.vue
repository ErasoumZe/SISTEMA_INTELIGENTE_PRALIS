<script setup lang="ts">
const route = useRoute();
const { apiUrl } = useApi();

const password = ref("");
const loading = ref(false);
const message = ref("");
const error = ref("");
const token = computed(() => String(route.query.token ?? ""));

async function resetPassword() {
  loading.value = true;
  message.value = "";
  error.value = "";

  const response = await fetch(`${apiUrl}/api/auth/reset-password`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newPassword: password.value, token: token.value })
  });

  if (response.ok) {
    message.value = "Senha alterada. Voce ja pode entrar.";
    password.value = "";
  } else {
    error.value = "Token invalido ou expirado.";
  }

  loading.value = false;
}
</script>

<template>
  <v-main class="min-h-screen panel-bg d-flex align-center justify-center pa-4">
    <v-card width="100%" max-width="448">
      <v-card-title>
        <div class="text-h5">Nova senha</div>
        <div class="text-body-2 text-muted">Defina uma nova senha para sua conta.</div>
      </v-card-title>
      <v-card-text>
        <v-form class="d-grid ga-4" @submit.prevent="resetPassword">
          <v-text-field
            v-model="password"
            label="Nova senha"
            autocomplete="new-password"
            name="password"
            type="password"
            minlength="8"
            required
          />
          <v-alert v-if="!token" type="error" variant="tonal">Token ausente.</v-alert>
          <v-alert v-if="message" type="success" variant="tonal">{{ message }}</v-alert>
          <v-btn v-if="message" variant="text" to="/login">Entrar</v-btn>
          <v-alert v-if="error" type="error" variant="tonal">{{ error }}</v-alert>
          <v-btn type="submit" color="primary" :loading="loading" :disabled="!token">Salvar senha</v-btn>
        </v-form>
      </v-card-text>
    </v-card>
  </v-main>
</template>
