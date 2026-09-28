<script setup lang="ts">
// Sinal efemero: nasce apenas depois do login valido e desaparece ao fim da transicao.
// Como mora acima de NuxtPage, sobrevive a troca de /login para o painel.
const introAposLogin = useState("padaria.intro-apos-login", () => false);
const introPendente = useState("padaria.intro-pendente", () => false);
const introDashboardPronto = useState("padaria.intro-dashboard-pronto", () => false);

// O AppWorkspace e a unica superficie que sabe se o shell realmente terminou de carregar. A rota
// por si so nao basta: antes havia um spinner claro entre /login e o painel.
watch([introPendente, introDashboardPronto], ([pendente, dashboardPronto]) => {
  if (!pendente || !dashboardPronto) return;
  introPendente.value = false;
  introDashboardPronto.value = false;
  introAposLogin.value = true;
});
</script>

<template>
  <v-app :class="{ 'entrada-pos-login': introPendente || introAposLogin }">
    <main :inert="introAposLogin || undefined">
      <NuxtPage />
    </main>
    <LoginIntroCicluz v-if="introAposLogin" @concluida="introAposLogin = false" />
  </v-app>
</template>

<style>
/* Protege o intervalo entre troca de rota, coleta de sessao e abertura do vidro. */
.entrada-pos-login,
.entrada-pos-login .v-application__wrap,
.entrada-pos-login .panel-bg {
  background: #080c14 !important;
}
</style>
