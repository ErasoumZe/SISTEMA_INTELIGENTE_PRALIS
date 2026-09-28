<script setup lang="ts">
// Sinal efemero: nasce apenas depois do login valido e desaparece ao fim da transicao.
// Como mora acima de NuxtPage, sobrevive a troca de /login para o painel.
const introAposLogin = useState("padaria.intro-apos-login", () => false);
</script>

<template>
  <v-app>
    <main :inert="introAposLogin || undefined">
      <NuxtPage />
    </main>
    <LoginIntroCicluz v-if="introAposLogin" @concluida="introAposLogin = false" />
  </v-app>
</template>
