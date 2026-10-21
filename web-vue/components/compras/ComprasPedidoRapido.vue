<script setup lang="ts">
/**
 * Pedido rápido (R-221 decisão 2): o pedido de um fornecedor só. NÃO é um segundo caminho de compra:
 * cria uma solicitação `rapida` e abre uma rodada com UM convite; o fornecedor responde pelo link e a
 * compra sai pelo mesmo portão de qualquer rodada (preço-base, teto, adjudicação). Depois de enviar, a
 * tela mostra o convite para mandar o link pelo WhatsApp — o token só aparece agora.
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
  fornecedorId: ""
});

const estoquePorProduto = computed<Record<string, ProdutoEstoqueDto>>(() =>
  Object.fromEntries(props.produtos.map((produto) => [produto.id, produto]))
);
const reposicaoDisponivel = computed(() => itensDeReposicaoDoEstoque(props.produtos).length > 0);

function abrir() {
  form.itens = [{ produtoId: "", quantidade: "" }];
  form.observacao = "";
  form.fornecedorId = "";
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

async function marcarEnviado(conviteId: string) {
  if (!rodada.value || !conviteId) return;
  try {
    await apiPost(`/api/compras/rodadas/${rodada.value.id}/convites/${conviteId}/enviar`, {
      empresaId: props.empresaId,
      canal: "whatsapp"
    });
  } catch (causa) {
    erro.value = mensagemErro(causa);
  }
}
</script>

<template>
  <div class="pedido-rapido">
    <v-btn color="primary" variant="flat" prepend-icon="mdi-lightning-bolt" @click="abrir">Pedido rápido</v-btn>
    <v-alert v-if="erro && !dialog" type="error" variant="tonal" density="compact" closable @click:close="erro = ''">{{
      erro
    }}</v-alert>

    <ComprasSolicitacaoFormDialog
      v-model="dialog"
      titulo="Pedido rápido"
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

    <ComprasRodadaConvitesDialog
      v-model="dialogConvites"
      :rodada="rodada"
      :empresa-nome="empresaNome"
      @enviar="marcarEnviado"
    />
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
