<script setup lang="ts">
import AppShell from "~/components/app/AppShell.vue";
import PedidoDetalheDialog from "~/components/pedidos/PedidoDetalheDialog.vue";
import PedidoRecebimentoDialog from "~/components/pedidos/PedidoRecebimentoDialog.vue";
import PedidosFinalizadosLista from "~/components/pedidos/PedidosFinalizadosLista.vue";
import { usePedidosFinalizados } from "~/composables/usePedidosFinalizados";
import { itemPorTela } from "~/utils/domain";

/**
 * Pedidos finalizados (doc 58 §5, Rodrigo 23/10/2026): o que foi comprado na cotação — a caminho e recebido. O
 * recebimento físico acontece aqui e é a única entrada de estoque (R-213).
 */
const {
  sessao,
  empresas,
  empresaId,
  caixaStatus,
  carregando,
  empresaCarregando,
  erro,
  snackbar,
  pedidos,
  detalhe,
  dialogDetalhe,
  dialogRecebimento,
  transicionando,
  recebendo,
  telasPermitidas,
  telasDesabilitadasMenu,
  motivosTelasDesabilitadas,
  podeEditar,
  podeReceber,
  trocarEmpresa,
  verPedido,
  abrirRecebimento,
  mudarSituacao,
  confirmarRecebimento
} = usePedidosFinalizados();
</script>

<template>
  <v-progress-linear v-if="carregando" indeterminate />
  <AppShell
    v-else-if="sessao"
    :sessao="sessao"
    :telas="telasPermitidas"
    tela-ativa="pedidos_finalizados"
    :empresas="empresas"
    :empresa-id="empresaId"
    :caixa-status="caixaStatus"
    :telas-desabilitadas="telasDesabilitadasMenu"
    :motivos-telas-desabilitadas="motivosTelasDesabilitadas"
    :carregando-empresa="empresaCarregando"
    @selecionar-empresa="trocarEmpresa"
  >
    <div class="d-grid ga-5">
      <AppCabecalhoTela
        :titulo="itemPorTela.pedidos_finalizados?.titulo ?? ''"
        subtitulo="O que já foi comprado: a caminho e recebido. O recebimento é feito aqui."
      />
      <v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>
      <PedidosFinalizadosLista :pedidos="pedidos" :carregando="empresaCarregando" @abrir="verPedido" />
    </div>

    <PedidoRecebimentoDialog
      v-model="dialogRecebimento"
      :pedido="detalhe"
      :salvando="recebendo"
      @confirmar="confirmarRecebimento"
    />
    <PedidoDetalheDialog
      v-model="dialogDetalhe"
      :pedido="detalhe"
      :pode-editar="podeEditar"
      :pode-receber="podeReceber"
      :transicionando="transicionando"
      @situacao="mudarSituacao"
      @receber="abrirRecebimento"
    />
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3500">{{ snackbar.text }}</v-snackbar>
  </AppShell>
</template>
