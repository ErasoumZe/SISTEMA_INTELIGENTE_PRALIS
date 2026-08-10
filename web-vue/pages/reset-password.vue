<script setup lang="ts">
import { MENSAGEM_SENHA_CURTA, SENHA_MINIMA_CARACTERES, senhaAtendeMinimo } from "~/utils/senha-politica";

const route = useRoute();
const { apiUrl } = useApi();

const password = ref("");
const loading = ref(false);
const message = ref("");
const error = ref("");

const token = computed(() => String(route.query.token ?? ""));
// A API redireciona para ca com `?error=INVALID_TOKEN` quando o link expirou ou ja foi usado
// (better-auth, GET /api/auth/reset-password/:token). Sem ler isso, a tela dizia "Token ausente",
// que e falso: o token existia, so nao vale mais — e o usuario ficava sem saber que bastava pedir
// outro link.
const erroDoLink = computed(() => String(route.query.error ?? ""));
const linkInvalido = computed(() => Boolean(erroDoLink.value) || !token.value);

const avisoDoLink = computed(() => {
  if (!linkInvalido.value) return "";
  if (erroDoLink.value) return "Este link expirou ou já foi usado. Solicite um novo link de recuperação.";
  return "Link sem token. Abra a página pelo link que enviamos por e-mail.";
});

const senhaCurta = computed(() => Boolean(password.value) && !senhaAtendeMinimo(password.value));

async function resetPassword() {
  // Barra a senha curta ANTES da rede: o servidor de producao exige 10 e devolveria erro, mas o
  // usuario nao tem como adivinhar isso depois de o formulario ter aceitado o que ele digitou.
  if (!senhaAtendeMinimo(password.value)) {
    error.value = MENSAGEM_SENHA_CURTA;
    message.value = "";
    return;
  }

  loading.value = true;
  message.value = "";
  error.value = "";

  // try/finally: sem ele, uma falha de rede (API fora, DNS, timeout) fazia o `fetch` lancar e
  // `loading` nunca voltava a false — o botao ficava girando para sempre e o usuario nao tinha
  // como tentar de novo sem recarregar a pagina.
  try {
    const response = await fetch(`${apiUrl}/api/auth/reset-password`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: password.value, token: token.value })
    });

    if (response.ok) {
      message.value = "Senha alterada. Você já pode entrar.";
      password.value = "";
    } else {
      // A politica de senha do servidor e mais exigente que a do formulario (o minimo muda por
      // ambiente), entao senha curta chegava aqui e era exibida como "token invalido" — mensagem
      // errada, que mandava o usuario pedir outro link sem necessidade. Usa-se o codigo que a API
      // ja devolve, sem inventar campo.
      const codigo = await response
        .json()
        .then((corpo: { code?: string }) => corpo?.code ?? "")
        .catch(() => "");
      error.value =
        codigo === "PASSWORD_TOO_SHORT"
          ? "Senha muito curta para a política de segurança. Escolha uma senha mais longa."
          : "Este link expirou ou já foi usado. Solicite um novo link de recuperação.";
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
            :minlength="SENHA_MINIMA_CARACTERES"
            :error="senhaCurta"
            :messages="MENSAGEM_SENHA_CURTA"
            required
          />
          <v-alert v-if="avisoDoLink" type="error" variant="tonal">{{ avisoDoLink }}</v-alert>
          <v-btn v-if="erroDoLink" variant="text" to="/forgot-password">Pedir novo link</v-btn>
          <v-alert v-if="message" type="success" variant="tonal">{{ message }}</v-alert>
          <v-btn v-if="message" variant="text" to="/login">Entrar</v-btn>
          <v-alert v-if="error" type="error" variant="tonal">{{ error }}</v-alert>
          <v-btn type="submit" color="primary" :loading="loading" :disabled="linkInvalido">Salvar senha</v-btn>
        </v-form>
      </v-card-text>
    </v-card>
  </v-main>
</template>
