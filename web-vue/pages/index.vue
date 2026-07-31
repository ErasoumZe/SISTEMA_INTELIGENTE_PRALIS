<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
</script>

<template>
  <AppWorkspace tipo-pagina="inicio">
    <section class="inicio-vazio">
      <div class="inicio-hero">
        <img
          src="/cicluz/logo-cicluz.png"
          alt="Cicluz Gestão Profissional"
          class="inicio-hero-logo"
          width="300"
          height="98"
        />
        <h1>Bem-vindo ao Painel</h1>
        <p>Selecione uma tela no menu lateral para começar a operar.</p>
        <span class="inicio-hero-hint">
          <v-icon icon="mdi-gesture-tap" size="16" />
          Comece pelo menu à esquerda
        </span>
      </div>
    </section>
  </AppWorkspace>
</template>
