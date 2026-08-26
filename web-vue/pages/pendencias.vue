<script setup lang="ts">
// UMA central de pendencias. As de CAIXA (notificacoes do turno) e as FINANCEIRAS (roteamento da
// venda integrada) sao domínios diferentes da mesma pergunta — "o que ficou pendente?" — entao
// convivem na mesma tela, em secoes. Criar uma segunda central seria o segundo caminho que o
// AGENTS.md §4.1 proibe.
import { ref } from "vue";
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import NotificacoesPendentesPage from "~/components/caixa/NotificacoesPendentesPage.vue";
import PendenciasRoteamentoPainel from "~/components/financeiro/PendenciasRoteamentoPainel.vue";
import RoteamentoFinanceiroDialog from "~/components/financeiro/RoteamentoFinanceiroDialog.vue";

// A forma escolhida a partir da lista "falta configurar": o Admin resolve a pendencia sem sair da
// tela, pelo MESMO dialogo do cadastro de formas. Um formulario de roteamento, dois pontos de
// entrada — nao dois formularios.
const formaSelecionada = ref<{ id: string; nome: string } | null>(null);
const painel = ref<InstanceType<typeof PendenciasRoteamentoPainel> | null>(null);
</script>

<template>
  <AppWorkspace tela-inicial="fechamento" tipo-pagina="fechamento" v-slot="ctx">
    <div class="central-pendencias">
      <NotificacoesPendentesPage :notificacoes="ctx.notificacoes" @verificar="ctx.verificarNotificacao" />

      <section class="secao-financeira" aria-labelledby="titulo-pendencias-financeiras">
        <h2 id="titulo-pendencias-financeiras" class="text-h6 mb-1">Roteamento financeiro</h2>
        <p class="text-body-2 text-medium-emphasis mb-4">
          Vendas integradas cujo dinheiro ainda não tem destino definido.
        </p>
        <PendenciasRoteamentoPainel
          ref="painel"
          :empresa-id="ctx.empresaIdAtiva"
          @configurar="formaSelecionada = $event"
        />
      </section>
    </div>

    <RoteamentoFinanceiroDialog
      :aberto="Boolean(formaSelecionada)"
      :empresa-id="ctx.empresaIdAtiva"
      :forma="formaSelecionada"
      :contas="ctx.contasDaEmpresa"
      :pode-configurar="ctx.podeConfigurarRoteamento"
      @fechar="formaSelecionada = null"
      @salvo="painel?.carregar()"
    />
  </AppWorkspace>
</template>

<style scoped>
.central-pendencias {
  display: flex;
  flex-direction: column;
  gap: 32px;
  max-width: 100%;
  /* 390px: nenhuma secao empurra a pagina para os lados; quem rola e a tabela, dentro do bloco. */
  overflow-x: hidden;
}

.secao-financeira {
  max-width: 100%;
}
</style>
