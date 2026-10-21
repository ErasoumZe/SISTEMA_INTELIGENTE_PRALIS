<script setup lang="ts">
/**
 * Aba de Solicitacoes de compra (Fase 2, R-221). A solicitacao e a necessidade sem fornecedor; daqui
 * ela vira rodada multi-fornecedor nos passos seguintes. Edicao so em rascunho — depois que a rodada
 * envia, a quantidade e um envelope congelado.
 *
 * Dona do proprio carregamento/estado/erro, como as demais abas da fundacao (nao compartilham dado).
 */
import type { ProdutoEstoqueDto, SolicitacaoDto, StatusSolicitacao } from "@padaria/shared";
import { gerarItensReposicao } from "@padaria/shared";
import { mensagemErro } from "~/utils/domain";
import { normalizarQuantidadeEditavel } from "~/utils/formatacao";
import type { SolicitacaoForm, SolicitacaoFormItem } from "~/components/compras/ComprasSolicitacaoFormDialog.vue";

const props = defineProps<{
  empresaId: string;
  produtos: ProdutoEstoqueDto[];
  podeCriar: boolean;
  podeEditar: boolean;
}>();

const { apiGet, apiPost, apiPut } = useApi();
const solicitacoes = ref<SolicitacaoDto[]>([]);
const carregando = ref(false);
const salvando = ref(false);
const erro = ref("");
const sucesso = ref("");
const dialog = ref(false);
const editandoId = ref<string | null>(null);
const form = reactive<SolicitacaoForm>({ itens: [{ produtoId: "", quantidade: "" }], observacao: "" });

const ROTULO_STATUS: Record<StatusSolicitacao, string> = {
  rascunho: "Rascunho",
  em_cotacao: "Em cotação",
  parcialmente_comprada: "Parcialmente comprada",
  comprada: "Comprada",
  encerrada: "Encerrada",
  cancelada: "Cancelada"
};
const COR_STATUS: Record<StatusSolicitacao, string | undefined> = {
  rascunho: undefined,
  em_cotacao: "info",
  parcialmente_comprada: "warning",
  comprada: "success",
  encerrada: undefined,
  cancelada: "error"
};
const ROTULO_ORIGEM: Record<string, string> = { manual: "Manual", sugestao: "Sugestão", rapida: "Rápida" };
const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const dataHora = (valor: string) => DATA_HORA.format(new Date(valor));

const estoquePorProduto = computed<Record<string, ProdutoEstoqueDto>>(() =>
  Object.fromEntries(props.produtos.map((produto) => [produto.id, produto]))
);
// Ha produto no minimo para oferecer o atalho de reposicao?
const reposicaoDisponivel = computed(() => itensDeReposicao().length > 0);

let requisicao = 0;

function itensDeReposicao(): SolicitacaoFormItem[] {
  const sugeridos = gerarItensReposicao(
    props.produtos.map((produto) => ({
      id: produto.id,
      descricao: produto.descricao,
      quantidadeEstoque: Number(produto.quantidadeEstoque),
      estoqueMin: produto.estoqueMin === null ? null : Number(produto.estoqueMin),
      estoqueMax: produto.estoqueMax === null ? null : Number(produto.estoqueMax)
    }))
  );
  return sugeridos.map((item) => ({
    produtoId: item.produtoId,
    quantidade: normalizarQuantidadeEditavel(item.quantidadeSugerida)
  }));
}

async function carregar() {
  if (!props.empresaId) return;
  const token = (requisicao += 1);
  carregando.value = true;
  erro.value = "";
  sucesso.value = "";
  solicitacoes.value = [];
  try {
    const lista = await apiGet<SolicitacaoDto[]>(
      `/api/compras/solicitacoes?empresaId=${encodeURIComponent(props.empresaId)}`
    );
    if (token !== requisicao) return;
    solicitacoes.value = lista;
  } catch (causa) {
    if (token !== requisicao) return;
    erro.value = mensagemErro(causa);
  } finally {
    if (token === requisicao) carregando.value = false;
  }
}

function abrirNovo() {
  editandoId.value = null;
  form.itens = [{ produtoId: "", quantidade: "" }];
  form.observacao = "";
  dialog.value = true;
}

async function abrirEditar(item: SolicitacaoDto) {
  erro.value = "";
  try {
    const detalhe = await apiGet<SolicitacaoDto>(`/api/compras/solicitacoes/${item.id}`);
    editandoId.value = detalhe.id;
    form.itens = (detalhe.itens ?? []).map((linha) => ({
      produtoId: linha.produtoId,
      quantidade: normalizarQuantidadeEditavel(linha.quantidade)
    }));
    if (!form.itens.length) form.itens = [{ produtoId: "", quantidade: "" }];
    form.observacao = detalhe.observacao ?? "";
    dialog.value = true;
  } catch (causa) {
    erro.value = mensagemErro(causa);
  }
}

function preencherMinimo() {
  const sugeridos = itensDeReposicao();
  if (!sugeridos.length) return;
  // Mescla com o que ja esta no form: nao duplica produto e nao apaga o que o comprador digitou.
  const porProduto = new Map(form.itens.filter((item) => item.produtoId).map((item) => [item.produtoId, item]));
  for (const sugerido of sugeridos)
    if (!porProduto.has(sugerido.produtoId)) porProduto.set(sugerido.produtoId, sugerido);
  form.itens = [...porProduto.values()];
}

function adicionar() {
  form.itens.push({ produtoId: "", quantidade: "" });
}

function remover(indice: number) {
  form.itens.splice(indice, 1);
  if (!form.itens.length) form.itens.push({ produtoId: "", quantidade: "" });
}

async function salvar() {
  salvando.value = true;
  erro.value = "";
  sucesso.value = "";
  const itens = form.itens
    .filter((item) => item.produtoId && Number(item.quantidade) > 0)
    .map((item) => ({ produtoId: item.produtoId, quantidade: Number(item.quantidade) }));
  try {
    if (editandoId.value) {
      await apiPut(`/api/compras/solicitacoes/${editandoId.value}`, {
        empresaId: props.empresaId,
        observacao: form.observacao || null,
        itens
      });
    } else {
      await apiPost("/api/compras/solicitacoes", {
        empresaId: props.empresaId,
        origem: "manual",
        observacao: form.observacao || null,
        itens
      });
    }
    dialog.value = false;
    await carregar();
    sucesso.value = editandoId.value ? "Solicitação atualizada." : "Solicitação criada.";
  } catch (causa) {
    erro.value = mensagemErro(causa);
  } finally {
    salvando.value = false;
  }
}

watch(() => props.empresaId, carregar, { immediate: true });
</script>

<template>
  <div>
    <v-alert v-if="erro" type="error" variant="tonal" closable class="mb-3" @click:close="erro = ''">{{
      erro
    }}</v-alert>
    <v-alert v-if="sucesso" type="success" variant="tonal" closable class="mb-3" @click:close="sucesso = ''">{{
      sucesso
    }}</v-alert>
    <v-progress-linear v-if="carregando" indeterminate class="mb-3" />

    <div class="d-flex align-center justify-space-between ga-3 flex-wrap my-3">
      <div class="text-body-2 text-medium-emphasis">Necessidade de compra sem fornecedor. Vira rodada de cotação.</div>
      <v-btn v-if="podeCriar" prepend-icon="mdi-playlist-plus" color="primary" @click="abrirNovo"
        >Nova solicitação</v-btn
      >
    </div>

    <div class="responsive-table-shell">
      <v-table density="comfortable">
        <thead>
          <tr>
            <th>Criada em</th>
            <th>Status</th>
            <th>Origem</th>
            <th>Itens</th>
            <th>Observação</th>
            <th class="text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in solicitacoes" :key="item.id">
            <td>{{ dataHora(item.criadoEm) }}</td>
            <td>
              <v-chip size="small" variant="tonal" :color="COR_STATUS[item.status]" label>{{
                ROTULO_STATUS[item.status]
              }}</v-chip>
            </td>
            <td>{{ ROTULO_ORIGEM[item.origem] ?? item.origem }}</td>
            <td>{{ item.totalItens }}</td>
            <td class="text-truncate" style="max-width: 280px">{{ item.observacao ?? "—" }}</td>
            <td class="text-right">
              <div class="d-flex justify-end ga-2 flex-wrap">
                <v-btn
                  v-if="podeEditar && item.status === 'rascunho'"
                  size="small"
                  variant="text"
                  prepend-icon="mdi-pencil"
                  @click="abrirEditar(item)"
                  >Editar</v-btn
                >
              </div>
            </td>
          </tr>
          <tr v-if="!carregando && !erro && !solicitacoes.length">
            <td colspan="6" class="text-center text-medium-emphasis py-6">Nenhuma solicitação ainda.</td>
          </tr>
        </tbody>
      </v-table>
    </div>

    <ComprasSolicitacaoFormDialog
      v-model="dialog"
      :titulo="editandoId ? 'Editar solicitação' : 'Nova solicitação'"
      :empresa-id="empresaId"
      :form="form"
      :salvando="salvando"
      :estoque-por-produto="estoquePorProduto"
      :pode-reposicao="reposicaoDisponivel"
      @salvar="salvar"
      @adicionar="adicionar"
      @remover="remover"
      @preencher-minimo="preencherMinimo"
    />
  </div>
</template>
