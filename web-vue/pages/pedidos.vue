<script setup lang="ts">
import AppShell from "~/components/app/AppShell.vue";
import PedidoDetalheDialog from "~/components/pedidos/PedidoDetalheDialog.vue";
import PedidoRecebimentoDialog from "~/components/pedidos/PedidoRecebimentoDialog.vue";
import PedidosFila from "~/components/pedidos/PedidosFila.vue";
import ComprasFundacaoPainel from "~/components/compras/ComprasFundacaoPainel.vue";
import ComprasPedidoRapido from "~/components/compras/ComprasPedidoRapido.vue";
import { temPermissao } from "@padaria/shared";
import { usePedidos } from "~/composables/usePedidos";
import { itemPorTela } from "~/utils/domain";

/**
 * Compras depois do E8 (R-221): a necessidade vira solicitacao, a solicitacao vira rodada de cotacao,
 * e o pedido NASCE da rodada (compra automatica ou excecao do comprador). Esta tela mostra a esteira
 * (fundacao: catalogo, preco-base e solicitacoes), o atalho do pedido rapido e a fila de pedidos, onde
 * se confere o recebimento fisico — a unica entrada de estoque (R-213).
 */
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
  dialogRecebimento,
  transicionando,
  recebendo,
  estoquePorProduto,
  telasPermitidas,
  telasDesabilitadasMenu,
  motivosTelasDesabilitadas,
  podeCriar,
  podeEditar,
  podeReceber,
  trocarEmpresa,
  verPedido,
  abrirRecebimento,
  mudarSituacao,
  confirmarRecebimento
} = usePedidos();

const permissoesUsuario = computed(() => sessao.value?.perfil?.permissoes ?? []);
const podeCatalogo = computed(() => temPermissao(permissoesUsuario.value, "compras_catalogo_gerir"));
const podePrecoBase = computed(() => temPermissao(permissoesUsuario.value, "compras_preco_base_importar"));
// R-221 decisao 10: solicitacao reusa as permissoes de pedido.
const podeSolicitacoes = computed(() => temPermissao(permissoesUsuario.value, "pedidos_visualizar"));
// R-221 decisao 10: aprovar compra fora do envelope pre-autorizado tem permissao propria.
const podeExcecao = computed(() => temPermissao(permissoesUsuario.value, "compras_excecao_aprovar"));
// O pedido rapido cria a solicitacao (pedidos_criar) E abre a rodada (pedidos_editar).
const podePedidoRapido = computed(() => podeCriar.value && podeEditar.value);
const empresaNome = computed(() => empresas.value.find((empresa) => empresa.id === empresaId.value)?.nome ?? "");
const produtosFundacao = computed(() => Object.values(estoquePorProduto.value));
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
    <div class="pedidos-page d-grid ga-5">
      <AppCabecalhoTela
        :titulo="itemPorTela.pedidos?.titulo ?? ''"
        subtitulo="Necessidade, rodada de cotação, compra e recebimento físico."
      />
      <v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>
      <ComprasPedidoRapido
        v-if="podePedidoRapido"
        :empresa-id="empresaId"
        :empresa-nome="empresaNome"
        :produtos="produtosFundacao"
        :fornecedores="fornecedores"
      />
      <ComprasFundacaoPainel
        v-if="podeCatalogo || podePrecoBase || podeSolicitacoes"
        :empresa-id="empresaId"
        :empresa-nome="empresaNome"
        :fornecedores="fornecedores"
        :produtos="produtosFundacao"
        :pode-catalogo="podeCatalogo"
        :pode-preco-base="podePrecoBase"
        :pode-solicitacoes="podeSolicitacoes"
        :pode-criar-solicitacao="podeCriar"
        :pode-editar-solicitacao="podeEditar"
        :pode-excecao-solicitacao="podeExcecao"
      />
      <PedidosFila :pedidos="pedidos" @abrir="verPedido" />
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
