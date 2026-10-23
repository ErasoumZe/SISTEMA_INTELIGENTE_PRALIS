<script setup lang="ts">
/**
 * Pedido urgente (R-221 decisão 2): o pedido de um fornecedor só. NÃO é um segundo caminho de compra:
 * cria uma solicitação `rapida` e abre uma rodada com UM convite; o fornecedor responde pelo link e a
 * compra sai pelo mesmo portão de qualquer rodada (preço-base, teto, adjudicação). O sistema manda o link
 * pelo WhatsApp (doc 57 §3); a tela mostra se saiu.
 */
import type { ProdutoEstoqueDto, RodadaDto } from "@padaria/shared";
import type { SolicitacaoForm } from "~/components/compras/ComprasSolicitacaoFormDialog.vue";
import type { Opcao } from "~/types/padaria";
import { itensDeReposicaoDoEstoque } from "~/utils/compras-solicitacao";
import { mensagemErro } from "~/utils/domain";

const props = defineProps<{
  empresaId: string;
  empresaNome: string;
  produtos: ProdutoEstoqueDto[];
  fornecedores: Opcao[];
}>();
const emit = defineEmits<{ criado: [] }>();

const { apiPost } = useApi();
const dialog = ref(false);
const dialogConvites = ref(false);
const salvando = ref(false);
const erro = ref("");
const rodada = ref<RodadaDto | null>(null);
const form = reactive<SolicitacaoForm>({
  itens: [{ produtoId: "", quantidade: "" }],
  observacao: "",
  fornecedorId: "",
  margem: 10
});

const estoquePorProduto = computed<Record<string, ProdutoEstoqueDto>>(() =>
  Object.fromEntries(props.produtos.map((produto) => [produto.id, produto]))
);
const reposicaoDisponivel = computed(() => itensDeReposicaoDoEstoque(props.produtos).length > 0);

/** Abre o pedido rapido; com `itens`, ja vem preenchido (ex.: o que sobrou de uma cotacao sem vencedor). */
function abrir(itens: Array<{ produtoId: string; quantidade: string }> = []) {
  form.itens = itens.length ? itens.map((item) => ({ ...item })) : [{ produtoId: "", quantidade: "" }];
  form.observacao = "";
  form.fornecedorId = "";
  form.margem = 10;
  erro.value = "";
  dialog.value = true;
}

function preencherMinimo() {
  const sugeridos = itensDeReposicaoDoEstoque(props.produtos);
  if (!sugeridos.length) return;
  // Mescla sem duplicar produto nem apagar o que o comprador ja digitou.
  const porProduto = new Map(form.itens.filter((item) => item.produtoId).map((item) => [item.produtoId, item]));
  for (const sugerido of sugeridos)
    if (!porProduto.has(sugerido.produtoId)) porProduto.set(sugerido.produtoId, sugerido);
  form.itens = [...porProduto.values()];
}

async function enviar() {
  salvando.value = true;
  erro.value = "";
  try {
    rodada.value = await apiPost<RodadaDto>("/api/compras/pedido-rapido", {
      empresaId: props.empresaId,
      fornecedorId: form.fornecedorId,
      observacao: form.observacao || null,
      margemVariacaoPercentual: form.margem ?? 10,
      itens: form.itens
        .filter((item) => item.produtoId && Number(item.quantidade) > 0)
        .map((item) => ({ produtoId: item.produtoId, quantidade: Number(item.quantidade) }))
    });
    dialog.value = false;
    dialogConvites.value = true;
    emit("criado");
  } catch (causa) {
    erro.value = mensagemErro(causa);
  } finally {
    salvando.value = false;
  }
}

defineExpose({ abrir });
</script>

<template>
  <div class="pedido-rapido">
    <v-btn color="primary" variant="flat" prepend-icon="mdi-lightning-bolt" @click="abrir()">Pedido urgente</v-btn>
    <v-alert v-if="erro && !dialog" type="error" variant="tonal" density="compact" closable @click:close="erro = ''">{{
      erro
    }}</v-alert>

    <ComprasSolicitacaoFormDialog
      v-model="dialog"
      titulo="Pedido urgente"
      :empresa-id="empresaId"
      :form="form"
      :salvando="salvando"
      :erro="dialog ? erro : ''"
      :estoque-por-produto="estoquePorProduto"
      :pode-reposicao="reposicaoDisponivel"
      :fornecedores="fornecedores"
      @salvar="enviar"
      @adicionar="form.itens.push({ produtoId: '', quantidade: '' })"
      @remover="(indice: number) => form.itens.splice(indice, 1)"
      @preencher-minimo="preencherMinimo"
    />

    <ComprasRodadaConvitesDialog v-model="dialogConvites" :rodada="rodada" :empresa-id="empresaId" />
  </div>
</template>

<style scoped>
.pedido-rapido {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--cx-sp-3);
}
</style>
