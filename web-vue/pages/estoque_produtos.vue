<script setup lang="ts">
import type { AuthSession, ProdutoEstoqueDto } from "@padaria/shared";
import type { CaixaStatus, Opcao } from "~/types/padaria";
import AppShell from "~/components/app/AppShell.vue";
import ComprasSecao from "~/components/compras/base/ComprasSecao.vue";
import ComprasTela from "~/components/compras/base/ComprasTela.vue";
import EstoqueExtratoDialog from "~/components/compras/EstoqueExtratoDialog.vue";
import EstoqueIndicadores from "~/components/compras/EstoqueIndicadores.vue";
import EstoqueLista from "~/components/compras/EstoqueLista.vue";
import { usePermissoes } from "~/composables/usePermissoes";
import type { FiltroSituacaoEstoque } from "~/utils/compras-visual";
import { mensagemErro } from "~/utils/domain";

const router = useRouter();
const { apiGet, carregarSessao } = useApi();
const sessao = ref<AuthSession | null>(null);
const empresas = ref<Opcao[]>([]);
const empresaId = ref("");
const caixaStatus = ref<CaixaStatus | null>(null);
const carregando = ref(true);
const empresaCarregando = ref(false);
const erro = ref("");
const produtos = ref<ProdutoEstoqueDto[]>([]);
const dialogExtrato = ref(false);
const produtoExtrato = ref<ProdutoEstoqueDto | null>(null);
const catalogoFiltros = ref<ProdutoEstoqueDto[]>([]);
const busca = ref("");
const filtros = reactive({ grupoMercadoriaId: "", areaEstoque: "", localVenda: "", localEstoque: "", curvaAbc: "" });

const permissoesUsuario = computed(() => sessao.value?.perfil?.permissoes ?? []);
const { temPermissao, telasPermitidas, telasDesabilitadasMenu, motivosTelasDesabilitadas } = usePermissoes(
  permissoesUsuario,
  () => Boolean(caixaStatus.value?.caixaAberto)
);
const grupos = computed(() => {
  const porId = new Map<string, string>();
  for (const produto of catalogoFiltros.value) {
    if (produto.grupoMercadoriaId && produto.grupo) porId.set(produto.grupoMercadoriaId, produto.grupo);
  }
  return [...porId].map(([id, nome]) => ({ id, nome }));
});
const areas = computed(() => valoresUnicos(catalogoFiltros.value.map((produto) => produto.areaEstoque)));
const locaisVenda = computed(() => valoresUnicos(catalogoFiltros.value.flatMap((produto) => produto.localVenda)));
const locaisEstoque = computed(() => valoresUnicos(catalogoFiltros.value.map((produto) => produto.localEstoque)));
// A busca vale para a faixa de numeros e para a lista; o filtro de situacao (tocar na faixa) so para a lista.
const situacao = ref<FiltroSituacaoEstoque>(null);
// Constante: um array escrito no template nasce de novo a cada render e o menu do select fecha sozinho.
const CURVAS_ABC = ["A", "B", "C"];
const produtosBuscados = computed(() => {
  const termo = (busca.value ?? "").trim().toLocaleLowerCase("pt-BR");
  if (!termo) return produtos.value;
  return produtos.value.filter((produto) =>
    `${produto.descricao} ${produto.grupo ?? ""}`.toLocaleLowerCase("pt-BR").includes(termo)
  );
});
const produtosExibidos = computed(() => {
  if (situacao.value === "minimo")
    return produtosBuscados.value.filter(
      (produto) => produto.estoqueMin !== null && Number(produto.quantidadeEstoque) <= Number(produto.estoqueMin)
    );
  if (situacao.value === "sem_faixa")
    return produtosBuscados.value.filter((produto) => produto.estoqueMin === null || produto.estoqueMax === null);
  return produtosBuscados.value;
});
const temFiltro = computed(
  () => Boolean(busca.value) || Boolean(situacao.value) || Object.values(filtros).some(Boolean)
);

function valoresUnicos(valores: Array<string | null>) {
  return [...new Set(valores.filter((valor): valor is string => Boolean(valor)))].sort((a, b) => a.localeCompare(b));
}
function queryEstoque(comFiltros: boolean) {
  const query = new URLSearchParams({ empresaId: empresaId.value });
  if (comFiltros) {
    for (const [chave, valor] of Object.entries(filtros)) if (valor) query.set(chave, valor);
  }
  return query.toString();
}
async function carregarEstoque() {
  if (!empresaId.value) return;
  empresaCarregando.value = true;
  try {
    produtos.value = await apiGet<ProdutoEstoqueDto[]>(`/api/compras/estoque?${queryEstoque(true)}`);
  } catch (causa) {
    erro.value = mensagemErro(causa);
  } finally {
    empresaCarregando.value = false;
  }
}
async function carregarEmpresa() {
  if (!empresaId.value) return;
  empresaCarregando.value = true;
  try {
    catalogoFiltros.value = await apiGet<ProdutoEstoqueDto[]>(`/api/compras/estoque?${queryEstoque(false)}`);
    produtos.value = catalogoFiltros.value;
  } catch (causa) {
    erro.value = mensagemErro(causa);
  } finally {
    empresaCarregando.value = false;
  }
}
function limparFiltros() {
  Object.assign(filtros, { grupoMercadoriaId: "", areaEstoque: "", localVenda: "", localEstoque: "", curvaAbc: "" });
  busca.value = "";
  situacao.value = null;
  void carregarEstoque();
}
async function trocarEmpresa(id: string) {
  empresaId.value = id;
  Object.assign(filtros, { grupoMercadoriaId: "", areaEstoque: "", localVenda: "", localEstoque: "", curvaAbc: "" });
  busca.value = "";
  await carregarEmpresa();
}
function abrirExtrato(produto: ProdutoEstoqueDto | null = null) {
  produtoExtrato.value = produto;
  dialogExtrato.value = true;
}

onMounted(async () => {
  try {
    sessao.value = await carregarSessao();
    if (!sessao.value) return void (await router.push("/login"));
    if (!temPermissao("estoque_produtos_visualizar")) return void (erro.value = "Sem permissão para acessar estoque.");
    empresas.value = sessao.value.empresas?.length ? sessao.value.empresas : await apiGet<Opcao[]>("/api/empresas");
    empresaId.value =
      sessao.value.perfil?.empresaId ?? sessao.value.perfil?.empresaIds?.[0] ?? empresas.value[0]?.id ?? "";
    await carregarEmpresa();
  } catch (causa) {
    erro.value = mensagemErro(causa);
  } finally {
    carregando.value = false;
  }
});
</script>

<template>
  <v-progress-linear v-if="carregando" indeterminate />
  <AppShell
    v-else-if="sessao"
    :sessao="sessao"
    :telas="telasPermitidas"
    tela-ativa="estoque_produtos"
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
        titulo="Estoque"
        subtitulo="Saldo por produto. Só o recebimento conferido altera o saldo; produto no mínimo pede revisão do comprador."
      >
        <template #acoes>
          <v-btn variant="tonal" prepend-icon="mdi-history" @click="abrirExtrato()">Extrato completo</v-btn>
        </template>
      </AppCabecalhoTela>
      <v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>
      <EstoqueIndicadores v-model:filtro="situacao" :produtos="produtosBuscados" />

      <ComprasSecao rente data-secao="posicao-estoque">
        <template #titulo>
          Posição de estoque <span class="conta">{{ produtosExibidos.length }}</span>
        </template>
        <template v-if="temFiltro" #acoes>
          <v-btn size="small" variant="text" prepend-icon="mdi-filter-remove-outline" @click="limparFiltros"
            >Limpar filtros</v-btn
          >
        </template>
        <template #filtros>
          <div class="grade">
            <v-text-field
              v-model="busca"
              placeholder="Buscar produto ou grupo"
              prepend-inner-icon="mdi-magnify"
              clearable
              density="compact"
              hide-details
              aria-label="Buscar produto ou grupo"
              class="filtro filtro--busca"
            />
            <v-select
              v-model="filtros.grupoMercadoriaId"
              :items="grupos"
              item-title="nome"
              item-value="id"
              label="Grupo"
              clearable
              density="compact"
              hide-details
              class="filtro"
              @update:model-value="carregarEstoque"
            />
            <v-select
              v-model="filtros.areaEstoque"
              :items="areas"
              label="Área"
              clearable
              density="compact"
              hide-details
              class="filtro"
              @update:model-value="carregarEstoque"
            />
            <v-select
              v-model="filtros.localVenda"
              :items="locaisVenda"
              label="Local de venda"
              clearable
              density="compact"
              hide-details
              class="filtro"
              @update:model-value="carregarEstoque"
            />
            <v-select
              v-model="filtros.localEstoque"
              :items="locaisEstoque"
              label="Local de estoque"
              clearable
              density="compact"
              hide-details
              class="filtro"
              @update:model-value="carregarEstoque"
            />
            <v-select
              v-model="filtros.curvaAbc"
              :items="CURVAS_ABC"
              label="Curva ABC"
              clearable
              density="compact"
              hide-details
              class="filtro"
              @update:model-value="carregarEstoque"
            />
          </div>
        </template>
        <v-progress-linear :active="empresaCarregando" indeterminate height="2" />
        <EstoqueLista :produtos="produtosExibidos" @extrato="abrirExtrato" />
      </ComprasSecao>
    </ComprasTela>
    <EstoqueExtratoDialog
      v-model="dialogExtrato"
      :empresa-id="empresaId"
      :produtos="catalogoFiltros"
      :produto-inicial="produtoExtrato"
    />
  </AppShell>
</template>

<style scoped>
.conta {
  min-width: 22px;
  padding: 0 7px;
  border-radius: var(--cx-r-pill);
  background: var(--cx-surface-sunken);
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
  line-height: 20px;
  text-align: center;
}

/* Grade com largura minima igual para todos: o select do Vuetify estreito demais abre o menu sem itens. */
.grade {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: var(--cx-sp-3);
  width: 100%;
}

.filtro--busca {
  grid-column: span 2;
}

@media (max-width: 599px) {
  .filtro--busca {
    grid-column: 1 / -1;
  }
}
</style>
