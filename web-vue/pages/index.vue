<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import AppCabecalhoTela from "~/components/app/AppCabecalhoTela.vue";
import AppDashboard from "~/components/app/AppDashboard.vue";
</script>

<template>
  <!-- A DASHBOARD DEIXOU DE ESPELHAR O MENU (28/08/2026). Antes esta pagina renderizava o
       `AppAtalhosTelas`, que listava TODAS as telas permitidas agrupadas por secao — 32 blocos,
       com sanfona — mais o `AppBlocosRelatorio`. Era o menu duas vezes na mesma tela, o que a
       D-HOME decidiu em 26/08 que nao deveria acontecer.

       Os dois componentes SAIRAM, nao ficaram ao lado do novo: caminho antigo que sobrevive junto
       do novo e o que o 16 chama de segundo caminho para o mesmo ato.

       As quatro chaves que descem sao as MESMAS que o AppShell recebe — telas, permissao,
       desabilitadas e motivos. A dashboard nao recalcula nada: se ela filtrasse por conta propria,
       nasceria uma segunda fonte de verdade sobre quem ve o que. -->
  <AppWorkspace v-slot="ctx" tipo-pagina="inicio">
    <section class="inicio-painel">
      <AppCabecalhoTela titulo="Bem-vindo ao Painel" />
      <AppDashboard
        :telas="ctx.telasMenu"
        :tem-permissao="ctx.temPermissao"
        :desabilitadas="ctx.telasMenuDesabilitadas"
        :motivos="ctx.motivosTelasMenuDesabilitadas"
      />
    </section>
  </AppWorkspace>
</template>
