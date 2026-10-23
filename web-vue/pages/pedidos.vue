<script setup lang="ts">
import type { ColunaPainel, LinhaPainel, RodadaDto, StatusSolicitacao } from "@padaria/shared";
import { temPermissao } from "@padaria/shared";
import AppShell from "~/components/app/AppShell.vue";
import ComprasPedidoRapido from "~/components/compras/ComprasPedidoRapido.vue";
import ComprasRodadaConvitesDialog from "~/components/compras/ComprasRodadaConvitesDialog.vue";
import ComprasRodadaDecisoesDialog from "~/components/compras/ComprasRodadaDecisoesDialog.vue";
import PedidoDetalheDialog from "~/components/pedidos/PedidoDetalheDialog.vue";
import PedidoRecebimentoDialog from "~/components/pedidos/PedidoRecebimentoDialog.vue";
import PedidosCelulaDialog from "~/components/pedidos/PedidosCelulaDialog.vue";
import PedidosMatriz from "~/components/pedidos/PedidosMatriz.vue";
import { usePedidos } from "~/composables/usePedidos";
import { itemPorTela, mensagemErro } from "~/utils/domain";

/**
 * Pedidos (doc 57 §4, José 22/10/2026): limpa. Em cima o Pedido rápido; embaixo a matriz fornecedor x
 * situação (A fazer, Enviado, Cotado, Retornado, Comprado, Recebido parcialmente, Recebido). Catálogo,
 * histórico e preço-base moram no módulo "Cadastro de compras". O recebimento físico é a única entrada de
 * estoque (R-213).
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
  painel,
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
  carregarDados,
  notificar,
  verPedido,
  confirmarPedido,
  abrirRecebimento,
  mudarSituacao,
  confirmarRecebimento
} = usePedidos();
const { apiGet } = useApi();

const permissoesUsuario = computed(() => sessao.value?.perfil?.permissoes ?? []);
// R-221 decisao 10: aprovar compra fora do envelope pre-autorizado tem permissao propria.
const podeExcecao = computed(() => temPermissao(permissoesUsuario.value, "compras_excecao_aprovar"));
// O pedido rapido cria a solicitacao (pedidos_criar) E abre a rodada (pedidos_editar).
const podePedidoRapido = computed(() => podeCriar.value && podeEditar.value);
const empresaNome = computed(() => empresas.value.find((empresa) => empresa.id === empresaId.value)?.nome ?? "");
const produtos = computed(() => Object.values(estoquePorProduto.value));

const pedidoRapido = ref<InstanceType<typeof ComprasPedidoRapido> | null>(null);
const dialogCelula = ref(false);
const celula = ref<{ linha: LinhaPainel; coluna: ColunaPainel } | null>(null);
const rodada = ref<RodadaDto | null>(null);
// A fila de decisao: cotacao aberta (contrapropor, encerrar agora) ou fechada com item sem vencedor.
const decisao = ref<{ solicitacaoId: string; status: StatusSolicitacao } | null>(null);

function abrirCelula(linha: LinhaPainel, coluna: ColunaPainel) {
  celula.value = { linha, coluna };
  dialogCelula.value = true;
}
async function verRodada(rodadaId: string) {
  try {
    rodada.value = await apiGet<RodadaDto>(
      `/api/compras/rodadas/${rodadaId}?empresaId=${encodeURIComponent(empresaId.value)}`
    );
  } catch (causa) {
    notificar(mensagemErro(causa), "error");
  }
}
async function aposConvite(nome: string) {
  notificar(`Enviado para ${nome}. Ele recebe a cotação pelo WhatsApp.`);
  await carregarDados();
}
function novoPedidoRapido(itens: Array<{ produtoId: string; quantidade: string }>) {
  decisao.value = null;
  dialogCelula.value = false;
  pedidoRapido.value?.abrir(itens);
}
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
    <div class="d-grid ga-5">
      <AppCabecalhoTela
        :titulo="itemPorTela.pedidos?.titulo ?? ''"
        subtitulo="Cada fornecedor e em que pé está cada compra, da cotação ao recebimento."
      />
      <v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>
      <ComprasPedidoRapido
        v-if="podePedidoRapido"
        ref="pedidoRapido"
        :empresa-id="empresaId"
        :empresa-nome="empresaNome"
        :produtos="produtos"
        :fornecedores="fornecedores"
        @criado="carregarDados"
      />
      <PedidosMatriz :pedidos="pedidos" :painel="painel" :carregando="empresaCarregando" @abrir="abrirCelula" />
    </div>

    <PedidosCelulaDialog
      v-model="dialogCelula"
      :linha="celula?.linha ?? null"
      :coluna="celula?.coluna ?? null"
      :pedidos="pedidos"
      :painel="painel"
      :fornecedores="fornecedores"
      :empresa-id="empresaId"
      :pode-editar="podeEditar"
      @pedido="verPedido"
      @rodada="verRodada"
      @decidir="(solicitacaoId: string, status: StatusSolicitacao) => (decisao = { solicitacaoId, status })"
      @convidado="aposConvite"
    />
    <ComprasRodadaConvitesDialog
      :model-value="rodada !== null"
      :rodada="rodada"
      :empresa-id="empresaId"
      @update:model-value="(valor: boolean) => !valor && (rodada = null)"
      @reenviado="rodada && verRodada(rodada.id)"
    />
    <ComprasRodadaDecisoesDialog
      :model-value="decisao !== null"
      :empresa-id="empresaId"
      :solicitacao-id="decisao?.solicitacaoId ?? null"
      :solicitacao-status="decisao?.status ?? null"
      :pode-excecao="podeExcecao"
      :pode-editar="podeEditar"
      :pode-criar="podePedidoRapido"
      @update:model-value="(valor: boolean) => !valor && (decisao = null)"
      @mudou="carregarDados"
      @nova-solicitacao="novoPedidoRapido"
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
      @situacao="mudarSituacao"
      @confirmar="confirmarPedido"
      @receber="abrirRecebimento"
    />
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3500">{{ snackbar.text }}</v-snackbar>
  </AppShell>
</template>
