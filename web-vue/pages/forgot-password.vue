<script setup lang="ts">
const { apiUrl } = useApi();

const email = ref("");
const loading = ref(false);
const message = ref("");
const error = ref("");

async function requestReset() {
  loading.value = true;
  message.value = "";
  error.value = "";

  // Mesmo motivo do reset-password: sem try/finally, uma falha de rede deixava o botao girando
  // para sempre. As duas telas do fluxo de recuperacao tinham o mesmo defeito.
  try {
    const response = await fetch(`${apiUrl}/api/auth/request-password-reset`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.value,
        redirectTo: `${window.location.origin}/reset-password`
      })
    });

    if (response.ok) {
      message.value = "Se o e-mail existir, enviamos um link de recuperação. Verifique sua caixa de entrada.";
    } else {
      error.value = "Não foi possível solicitar a recuperação agora.";
    }
  } catch {
    error.value = "Não foi possível falar com o servidor. Tente novamente.";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <v-main class="min-h-screen panel-bg d-flex align-center justify-center pa-4">
    <v-card width="100%" max-width="448">
      <v-card-title>
        <div class="text-h5">Recuperar acesso</div>
        <div class="text-body-2 text-muted">Solicite um link de redefinicao de senha.</div>
      </v-card-title>
      <v-card-text>
        <v-form class="d-grid ga-4" @submit.prevent="requestReset">
          <v-text-field v-model="email" label="Email" autocomplete="email" name="email" type="email" required />
          <v-alert v-if="message" type="success" variant="tonal">{{ message }}</v-alert>
          <v-alert v-if="error" type="error" variant="tonal">{{ error }}</v-alert>
          <v-btn type="submit" color="primary" :loading="loading">Enviar link</v-btn>
          <v-btn variant="text" to="/login">Voltar para login</v-btn>
        </v-form>
      </v-card-text>
    </v-card>
  </v-main>
</template>
