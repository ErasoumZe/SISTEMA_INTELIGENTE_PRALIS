<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import AppCabecalhoTela from "~/components/app/AppCabecalhoTela.vue";
import AppAtalhosTelas from "~/components/app/AppAtalhosTelas.vue";
</script>

<template>
  <!-- O slot padrao do AppWorkspace ja entrega o `pageContext`; daqui saem so as tres chaves que
       os atalhos consomem, sem recalcular permissao nenhuma. -->
  <AppWorkspace v-slot="ctx" tipo-pagina="inicio">
    <section class="inicio-painel">
      <!-- O cartao de hero (logo grande + "Bem-vindo ao Painel" numa caixa com luz de fundo) SAIU.
           Tres motivos, nesta ordem:
           1. a logo ja vive na sidebar — era a marca duas vezes na mesma tela, e o item 2 do DoD
              proibe segundo caminho para o mesmo ato;
           2. com os blocos preenchendo a tela o cartao virou ocupacao de espaco sem funcao: em
              390px ele empurrava o conteudo real para baixo da dobra;
           3. depois do VIS-10 as 27 telas abrem com o MESMO cabecalho. A home tinha um formato
              proprio, e um lugar destoando e o que faz o conjunto parecer inacabado.
           O TEXTO nao foi inventado nem trocado: "Bem-vindo ao Painel" e o mesmo `<h1>` que estava
           no hero, agora no cabecalho comum.
           Consequencia assumida: o conserto do VIS-13 (logo certa por tema) morre junto com o
           elemento que ele consertava. Estava certo enquanto o hero existiu. -->
      <AppCabecalhoTela titulo="Bem-vindo ao Painel" />

      <AppAtalhosTelas
        :telas="ctx.telasMenu"
        :desabilitadas="ctx.telasMenuDesabilitadas"
        :motivos="ctx.motivosTelasMenuDesabilitadas"
      />
    </section>
  </AppWorkspace>
</template>
