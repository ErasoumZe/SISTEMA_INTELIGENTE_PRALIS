<script setup lang="ts">
import { computed } from "vue";
import { podeAcessarRelatorioFechamento, type AuthSession } from "@padaria/shared";
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import RelatorioFechamentoTesourariaPage from "~/components/financeiro/RelatorioFechamentoTesourariaPage.vue";

const sessao = useState<AuthSession | null>("padaria.workspace.sessao", () => null);
const podeVerRelatorio = computed(() =>
  Boolean(sessao.value?.perfil && podeAcessarRelatorioFechamento(sessao.value.perfil))
);
</script>

<template>
  <AppWorkspace tela-inicial="relatorio_fechamento" tipo-pagina="relatorio_fechamento" v-slot="ctx">
    <template v-if="podeVerRelatorio">
      <AppCabecalhoTela :titulo="ctx.telaAtual?.titulo ?? 'Relatório de fechamento'" />
      <RelatorioFechamentoTesourariaPage
        :empresa-id="ctx.empresaId"
        :pdvs="ctx.opcoesEmpresa.pdvs"
        :turnos="ctx.opcoesEmpresa.turnos"
        :pode-conferir="ctx.podeConferirFechamento"
        :pode-conferir-transferencia="ctx.podeConferirTransferencia"
      />
    </template>
    <v-alert v-else type="error" variant="tonal" class="ma-4">
      Acesso exclusivo da Tesouraria e Direção Geral. Caixa, Gerência e demais perfis não podem consultar nem decidir
      este fechamento.
    </v-alert>
  </AppWorkspace>
</template>
