<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import AppAtalhosTelas from "~/components/app/AppAtalhosTelas.vue";
</script>

<template>
  <!-- O slot padrao do AppWorkspace ja entrega o `pageContext`; daqui saem so as tres chaves que
       os atalhos consomem, sem recalcular permissao nenhuma. -->
  <AppWorkspace v-slot="ctx" tipo-pagina="inicio">
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
      </div>
      <!-- "Selecione uma tela no menu lateral" e "Comece pelo menu a esquerda" sairam daqui: com os
           atalhos na propria tela, elas deixaram de ser dica e viraram instrucao errada. Manter as
           duas seria empilhar caminho antigo sobre caminho novo (regra-mae do 16). -->
      <AppAtalhosTelas
        :telas="ctx.telasMenu"
        :desabilitadas="ctx.telasMenuDesabilitadas"
        :motivos="ctx.motivosTelasMenuDesabilitadas"
      />
    </section>
  </AppWorkspace>
</template>
