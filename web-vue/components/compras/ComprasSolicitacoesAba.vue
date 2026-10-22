<script setup lang="ts">
/**
 * Aba de Solicitacoes de compra (Fase 2, R-221). A solicitacao e a necessidade sem fornecedor; daqui
 * ela vira rodada multi-fornecedor nos passos seguintes. Edicao so em rascunho — depois que a rodada
 * envia, a quantidade e um envelope congelado.
 *
 * Dona do proprio carregamento/estado/erro, como as demais abas da fundacao (nao compartilham dado).
 */
import type { ProdutoEstoqueDto, RodadaDto, SolicitacaoDto } from "@padaria/shared";
import type { Opcao } from "~/types/padaria";
import { COR_STATUS, ROTULO_ORIGEM, ROTULO_STATUS, itensDeReposicaoDoEstoque } from "~/utils/compras-solicitacao";
import { mensagemErro } from "~/utils/domain";
import { normalizarQuantidadeEditavel } from "~/utils/formatacao";
import type { SolicitacaoForm, SolicitacaoFormItem } from "~/components/compras/ComprasSolicitacaoFormDialog.vue";
import type { AberturaPayload } from "~/components/compras/ComprasAbrirRodadaDialog.vue";

const props = defineProps<{
  empresaId: string;
  empresaNome: string;
  produtos: ProdutoEstoqueDto[];
  fornecedores: Opcao[];
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcecao: boolean;
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

// Abertura da rodada e visualizacao dos convites (E3).
const dialogAbrir = ref(false);
const dialogConvites = ref(false);
const abrindoRodada = ref(false);
const solicitacaoAlvoId = ref<string | null>(null);
const itensAlvo = ref<Array<{ id: string }>>([]);
const rodadaAtual = ref<RodadaDto | null>(null);

// Fila de decisao do Comprador (E6).
const dialogDecisoes = ref(false);
const decisaoSolicitacao = ref<SolicitacaoDto | null>(null);

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const dataHora = (valor: string) => DATA_HORA.format(new Date(valor));

const estoquePorProduto = computed<Record<string, ProdutoEstoqueDto>>(() =>
  Object.fromEntries(props.produtos.map((produto) => [produto.id, produto]))
);
// Ha produto no minimo para oferecer o atalho de reposicao?
const reposicaoDisponivel = computed(() => itensDeReposicaoDoEstoque(props.produtos).length > 0);

let requisicao = 0;

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

function abrirDecisoes(item: SolicitacaoDto) {
  decisaoSolicitacao.value = item;
  dialogDecisoes.value = true;
}

// Depois de aprovar/encerrar, relê a lista e atualiza o status mostrado no diálogo (mesmo id: não recarrega a fila).
async function aoMudarDecisao() {
  await carregar();
  const atual = solicitacoes.value.find((linha) => linha.id === decisaoSolicitacao.value?.id);
  if (atual) decisaoSolicitacao.value = atual;
}

// Os itens que sobraram viram uma NOVA solicitacao: nao existe segunda rodada sobre a mesma necessidade.
function novaComPendentes(itens: Array<{ produtoId: string; quantidade: string }>) {
  editandoId.value = null;
  form.itens = itens.map((item) => ({
    produtoId: item.produtoId,
    quantidade: normalizarQuantidadeEditavel(item.quantidade)
  }));
  form.observacao = "Itens que sobraram da solicitação anterior.";
  dialog.value = true;
}

function preencherMinimo() {
  const sugeridos = itensDeReposicaoDoEstoque(props.produtos);
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

async function abrirRodadaDe(item: SolicitacaoDto) {
  erro.value = "";
  try {
    const detalhe = await apiGet<SolicitacaoDto>(`/api/compras/solicitacoes/${item.id}`);
    solicitacaoAlvoId.value = detalhe.id;
    itensAlvo.value = (detalhe.itens ?? []).map((linha) => ({ id: linha.id }));
    dialogAbrir.value = true;
  } catch (causa) {
    erro.value = mensagemErro(causa);
  }
}

async function confirmarAbertura(payload: AberturaPayload) {
  if (!solicitacaoAlvoId.value) return;
  abrindoRodada.value = true;
  erro.value = "";
  sucesso.value = "";
  try {
    const rodada = await apiPost<RodadaDto>("/api/compras/rodadas", {
      empresaId: props.empresaId,
      solicitacaoId: solicitacaoAlvoId.value,
      prazoRespostaHoras: payload.prazoRespostaHoras,
      tetoValor: payload.tetoValor,
      convites: payload.convites
    });
    dialogAbrir.value = false;
    rodadaAtual.value = rodada;
    dialogConvites.value = true;
    await carregar();
    sucesso.value = "Rodada aberta. Envie os convites aos fornecedores.";
  } catch (causa) {
    erro.value = mensagemErro(causa);
  } finally {
    abrindoRodada.value = false;
  }
}

async function verRodada(item: SolicitacaoDto) {
  erro.value = "";
  try {
    const rodadas = await apiGet<Array<{ id: string }>>(
      `/api/compras/rodadas?empresaId=${encodeURIComponent(props.empresaId)}&solicitacaoId=${encodeURIComponent(item.id)}`
    );
    const primeira = rodadas[0];
    if (!primeira) {
      erro.value = "Nenhuma rodada encontrada para esta solicitação.";
      return;
    }
    rodadaAtual.value = await apiGet<RodadaDto>(
      `/api/compras/rodadas/${primeira.id}?empresaId=${encodeURIComponent(props.empresaId)}`
    );
    dialogConvites.value = true;
  } catch (causa) {
    erro.value = mensagemErro(causa);
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
                <v-btn
                  v-if="podeEditar && item.status === 'rascunho'"
                  size="small"
                  variant="tonal"
                  color="primary"
                  prepend-icon="mdi-account-multiple-plus-outline"
                  @click="abrirRodadaDe(item)"
                  >Abrir rodada</v-btn
                >
                <v-btn
                  v-if="item.status === 'em_cotacao'"
                  size="small"
                  variant="text"
                  prepend-icon="mdi-send-outline"
                  @click="verRodada(item)"
                  >Ver rodada</v-btn
                >
                <v-btn
                  v-if="
                    (podeEditar || podeExcecao) &&
                    (item.status === 'em_cotacao' || item.status === 'parcialmente_comprada')
                  "
                  size="small"
                  variant="text"
                  prepend-icon="mdi-gavel"
                  @click="abrirDecisoes(item)"
                  >Decisões</v-btn
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
      :erro="dialog ? erro : ''"
      :estoque-por-produto="estoquePorProduto"
      :pode-reposicao="reposicaoDisponivel"
      @salvar="salvar"
      @adicionar="adicionar"
      @remover="remover"
      @preencher-minimo="preencherMinimo"
    />

    <ComprasAbrirRodadaDialog
      v-model="dialogAbrir"
      :empresa-id="empresaId"
      :itens="itensAlvo"
      :fornecedores="fornecedores"
      :salvando="abrindoRodada"
      @abrir="confirmarAbertura"
    />

    <ComprasRodadaConvitesDialog v-model="dialogConvites" :rodada="rodadaAtual" :empresa-id="empresaId" />

    <ComprasRodadaDecisoesDialog
      v-model="dialogDecisoes"
      :empresa-id="empresaId"
      :solicitacao-id="decisaoSolicitacao?.id ?? null"
      :solicitacao-status="decisaoSolicitacao?.status ?? null"
      :pode-excecao="podeExcecao"
      :pode-editar="podeEditar"
      :pode-criar="podeCriar"
      @mudou="aoMudarDecisao"
      @nova-solicitacao="novaComPendentes"
    />
  </div>
</template>
