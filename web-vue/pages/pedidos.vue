<script setup lang="ts">
import AppShell from "~/components/app/AppShell.vue";
import PedidoDetalheDialog from "~/components/pedidos/PedidoDetalheDialog.vue";
import PedidoFormDialog from "~/components/pedidos/PedidoFormDialog.vue";
import PedidoRecebimentoDialog from "~/components/pedidos/PedidoRecebimentoDialog.vue";
import PedidosFila from "~/components/pedidos/PedidosFila.vue";
import { usePedidos } from "~/composables/usePedidos";
import { itemPorTela } from "~/utils/domain";

const {
  sessao,
  empresas,
  fornecedores,
  empresaId,
  caixaStatus,
  carregando,
  empresaCarregando,
  erro,
  snackbar,
  pedidos,
  detalhe,
  dialogDetalhe,
  dialogForm,
  dialogRecebimento,
  pedidoEditandoId,
  salvando,
  gerando,
  transicionando,
  recebendo,
  sugestaoFornecedorId,
  estoquePorProduto,
  form,
  telasPermitidas,
  telasDesabilitadasMenu,
  motivosTelasDesabilitadas,
  podeCriar,
  podeEditar,
  podeReceber,
  trocarEmpresa,
  abrirNovo,
  adicionarItem,
  removerItem,
  salvarPedido,
  gerarSugestao,
  verPedido,
  editarPedido,
  abrirRecebimento,
  mudarSituacao,
  enviarWhatsapp,
  confirmarRecebimento
} = usePedidos();
</script>

<template>
  <v-progress-linear v-if="carregando" indeterminate />
  <AppShell
    v-else-if="sessao"
    :sessao="sessao"
    :telas="telasPermitidas"
    tela-ativa="pedidos"
    :empresas="empresas"
    :empresa-id="empresaId"
    :caixa-status="caixaStatus"
    :telas-desabilitadas="telasDesabilitadasMenu"
    :motivos-telas-desabilitadas="motivosTelasDesabilitadas"
    :carregando-empresa="empresaCarregando"
    @selecionar-empresa="trocarEmpresa"
  >
    <div class="d-grid ga-4">
      <AppCabecalhoTela
        :titulo="itemPorTela.pedidos?.titulo ?? ''"
        subtitulo="Fluxo único: sugestão, pedido, fornecedor, negociação e recebimento físico."
      />
      <v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>
      <div v-if="podeCriar" class="pedidos-acoes">
        <v-card class="pedidos-acao" variant="outlined">
          <v-card-text class="pedidos-acao__corpo">
            <div class="pedidos-acao__cabecalho">
              <v-avatar color="primary" variant="tonal" size="36"><v-icon icon="mdi-auto-fix" /></v-avatar>
              <div>
                <h3 class="text-subtitle-1 font-weight-medium">Sugestão de reposição</h3>
                <p class="text-caption text-medium-emphasis mb-0">
                  Produto no mínimo é sugerido até o máximo. Você revisa antes de enviar.
                </p>
              </div>
            </div>
            <div class="pedidos-acao__controles">
              <v-select
                v-model="sugestaoFornecedorId"
                :items="fornecedores"
                item-title="nome"
                item-value="id"
                label="Fornecedor"
                density="comfortable"
                hide-details
              />
              <v-btn color="primary" variant="flat" :loading="gerando" @click="gerarSugestao">Gerar sugestão</v-btn>
            </div>
          </v-card-text>
        </v-card>

        <v-card class="pedidos-acao" variant="outlined">
          <v-card-text class="pedidos-acao__corpo">
            <div class="pedidos-acao__cabecalho">
              <v-avatar color="primary" variant="tonal" size="36"><v-icon icon="mdi-playlist-plus" /></v-avatar>
              <div>
                <h3 class="text-subtitle-1 font-weight-medium">Pedido manual</h3>
                <p class="text-caption text-medium-emphasis mb-0">
                  Você escolhe fornecedor, produtos e quantidades, com saldo e teto à vista.
                </p>
              </div>
            </div>
            <div class="pedidos-acao__controles">
              <v-btn color="primary" variant="flat" prepend-icon="mdi-plus" @click="abrirNovo"
                >Novo pedido manual</v-btn
              >
            </div>
          </v-card-text>
        </v-card>
      </div>
      <PedidosFila :pedidos="pedidos" @abrir="verPedido" />
    </div>
    <PedidoFormDialog
      v-model="dialogForm"
      :titulo="pedidoEditandoId ? 'Ajustar pedido manual' : 'Novo pedido manual'"
      :empresa-id="empresaId"
      :fornecedores="fornecedores"
      :form="form"
      :salvando="salvando"
      :estoque-por-produto="estoquePorProduto"
      @salvar="salvarPedido"
      @adicionar="adicionarItem"
      @remover="removerItem"
    />
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
      @editar="editarPedido"
      @enviar-whatsapp="enviarWhatsapp"
      @situacao="mudarSituacao"
      @receber="abrirRecebimento"
    />
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3500">{{ snackbar.text }}</v-snackbar>
  </AppShell>
</template>

<style scoped>
.pedidos-acoes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cx-sp-4, 16px);
}

.pedidos-acao {
  border-radius: var(--cx-r-lg, 16px);
}

.pedidos-acao__corpo {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-4, 16px);
  height: 100%;
}

.pedidos-acao__cabecalho {
  display: flex;
  align-items: flex-start;
  gap: var(--cx-sp-3, 12px);
}

.pedidos-acao__controles {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-3, 12px);
  margin-top: auto;
}

.pedidos-acao__controles :deep(.v-input) {
  flex: 1 1 auto;
  min-width: 0;
}

@media (max-width: 959px) {
  .pedidos-acoes {
    grid-template-columns: minmax(0, 1fr);
  }

  .pedidos-acao__controles {
    flex-wrap: wrap;
  }

  .pedidos-acao__controles :deep(.v-btn) {
    width: 100%;
  }
}
</style>
