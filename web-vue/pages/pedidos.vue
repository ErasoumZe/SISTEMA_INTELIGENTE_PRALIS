<script setup lang="ts">
import type { ProdutoEmCotacaoDto } from "@padaria/shared";
import AppShell from "~/components/app/AppShell.vue";
import ComprasTela from "~/components/compras/base/ComprasTela.vue";
import ComprasPedidoRapido from "~/components/compras/ComprasPedidoRapido.vue";
import CotacaoAcoesDialog from "~/components/cotacao/CotacaoAcoesDialog.vue";
import CotacaoMatriz from "~/components/cotacao/CotacaoMatriz.vue";
import CotacaoProdutoDialog from "~/components/cotacao/CotacaoProdutoDialog.vue";
import { useCotacaoPorFornecedor } from "~/composables/useCotacaoPorFornecedor";
import { itemPorTela } from "~/utils/domain";

/**
 * Cotação por fornecedor (doc 58 §4, Rodrigo 23/10/2026): em cima o Pedido urgente; embaixo os produtos em
 * cotação e onde cada fornecedor está (Enviado, Cotado, Retornado, Com aumento, Comprado). O que foi comprado
 * segue para Pedidos a receber, onde também se recebe. Catálogo, histórico e preço-base moram no "Cadastro de
 * compras".
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
  painel,
  fornecedores,
  estoquePorProduto,
  telasPermitidas,
  telasDesabilitadasMenu,
  motivosTelasDesabilitadas,
  podeCriar,
  podeEditar,
  podeExcecao,
  trocarEmpresa,
  carregarDados,
  recarregarPainel
} = useCotacaoPorFornecedor();

// O Pedido urgente cria a solicitação (pedidos_criar) E abre a cotação (pedidos_editar).
const podePedidoUrgente = computed(() => podeCriar.value && podeEditar.value);
const empresaNome = computed(() => empresas.value.find((empresa) => empresa.id === empresaId.value)?.nome ?? "");
const produtos = computed(() => Object.values(estoquePorProduto.value));

const pedidoUrgente = ref<InstanceType<typeof ComprasPedidoRapido> | null>(null);
const produtoAberto = ref<string | null>(null);
const rodadaAberta = ref<string | null>(null);
const bolinhas = computed(() => {
  const produto = painel.value.produtos.find((linha) => linha.produtoId === produtoAberto.value);
  return produto
    ? { maisVende: produto.maisVende, maisCompra: produto.maisCompra, maisLucro: produto.maisLucro }
    : null;
});

function abrirProduto(produto: ProdutoEmCotacaoDto) {
  produtoAberto.value = produto.produtoId;
}
function verOfertas(produtoId: string) {
  rodadaAberta.value = null;
  produtoAberto.value = produtoId;
}
function verAcoes(rodadaId: string) {
  produtoAberto.value = null;
  rodadaAberta.value = rodadaId;
}
function novoPedidoUrgente(itens: Array<{ produtoId: string; quantidade: string }>) {
  rodadaAberta.value = null;
  pedidoUrgente.value?.abrir(itens);
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
    <ComprasTela>
      <AppCabecalhoTela
        :titulo="itemPorTela.pedidos?.titulo ?? ''"
        subtitulo="Cada produto em cotação e quantos fornecedores estão em cada situação."
      >
        <template v-if="podePedidoUrgente" #acoes>
          <ComprasPedidoRapido
            ref="pedidoUrgente"
            :empresa-id="empresaId"
            :empresa-nome="empresaNome"
            :produtos="produtos"
            :fornecedores="fornecedores"
            @criado="carregarDados"
          />
        </template>
      </AppCabecalhoTela>
      <v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>
      <CotacaoMatriz :produtos="painel.produtos" :carregando="empresaCarregando" @abrir="abrirProduto" />

      <CotacaoProdutoDialog
        :model-value="produtoAberto !== null"
        :empresa-id="empresaId"
        :produto-id="produtoAberto"
        :bolinhas="bolinhas"
        :pode-editar="podeEditar"
        :pode-excecao="podeExcecao"
        @update:model-value="(valor: boolean) => !valor && (produtoAberto = null)"
        @mudou="recarregarPainel"
        @acoes="verAcoes"
      />
      <CotacaoAcoesDialog
        :model-value="rodadaAberta !== null"
        :empresa-id="empresaId"
        :rodada-id="rodadaAberta"
        :pode-editar="podeEditar"
        :pode-criar="podePedidoUrgente"
        @update:model-value="(valor: boolean) => !valor && (rodadaAberta = null)"
        @mudou="recarregarPainel"
        @produto="verOfertas"
        @nova-solicitacao="novoPedidoUrgente"
      />
    </ComprasTela>
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3500">{{ snackbar.text }}</v-snackbar>
  </AppShell>
</template>
