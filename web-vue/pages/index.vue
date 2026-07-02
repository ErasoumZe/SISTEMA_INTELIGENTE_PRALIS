<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
</script>

<template>
  <AppWorkspace tipo-pagina="inicio">
    <section class="inicio-vazio">
      <div class="inicio-hero">
        <img :src="'/pralis/logo-pralis.svg'" alt="Padaria Pralis" class="inicio-hero-logo" />
        <h1>Bem-vindo ao Painel</h1>
        <p>Selecione uma tela no menu lateral para comecar a operar.</p>
        <span class="inicio-hero-hint">
          <v-icon icon="mdi-gesture-tap" size="16" />
          Comece pelo menu a esquerda
        </span>
      </div>
    </section>
  </AppWorkspace>
</template>
