<script setup lang="ts">
import type { AuthSession, ProdutoEstoqueDto } from "@padaria/shared";
import type { CaixaStatus, Opcao } from "~/types/padaria";
import AppShell from "~/components/app/AppShell.vue";
import EstoqueExtratoDialog from "~/components/compras/EstoqueExtratoDialog.vue";
import EstoqueIndicadores from "~/components/compras/EstoqueIndicadores.vue";
import EstoqueLista from "~/components/compras/EstoqueLista.vue";
import { usePermissoes } from "~/composables/usePermissoes";
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
const produtosExibidos = computed(() => {
  const termo = busca.value.trim().toLocaleLowerCase("pt-BR");
  if (!termo) return produtos.value;
  return produtos.value.filter((produto) =>
    `${produto.descricao} ${produto.grupo ?? ""}`.toLocaleLowerCase("pt-BR").includes(termo)
  );
});

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
    <div class="d-grid ga-4">
      <AppCabecalhoTela
        titulo="Estoque"
        subtitulo="Saldo disponível por produto. Somente recebimento físico conferido altera este saldo."
      />
      <v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>
      <v-alert type="info" variant="tonal" density="comfortable" icon="mdi-shield-check-outline"
        >Esta é uma leitura operacional: produto no mínimo pede revisão; a sugestão de pedido continua sob decisão do
        comprador.</v-alert
      >
      <EstoqueIndicadores :produtos="produtosExibidos" />
      <v-card variant="outlined"
        ><v-card-text
          ><v-row dense>
            <v-col cols="12" md="4"
              ><v-text-field
                v-model="busca"
                prepend-inner-icon="mdi-magnify"
                label="Buscar produto ou grupo"
                clearable
                hide-details
            /></v-col>
            <v-col cols="12" sm="6" md="2"
              ><v-select
                v-model="filtros.grupoMercadoriaId"
                :items="grupos"
                item-title="nome"
                item-value="id"
                label="Grupo"
                clearable
                hide-details
                @update:model-value="carregarEstoque"
            /></v-col>
            <v-col cols="12" sm="6" md="2"
              ><v-select
                v-model="filtros.areaEstoque"
                :items="areas"
                label="Área"
                clearable
                hide-details
                @update:model-value="carregarEstoque"
            /></v-col>
            <v-col cols="12" sm="6" md="2"
              ><v-select
                v-model="filtros.localVenda"
                :items="locaisVenda"
                label="Local de venda"
                clearable
                hide-details
                @update:model-value="carregarEstoque"
            /></v-col>
            <v-col cols="12" sm="6" md="2"
              ><v-select
                v-model="filtros.localEstoque"
                :items="locaisEstoque"
                label="Local de estoque"
                clearable
                hide-details
                @update:model-value="carregarEstoque"
            /></v-col>
            <v-col cols="9" sm="6" md="2"
              ><v-select
                v-model="filtros.curvaAbc"
                :items="['A', 'B', 'C']"
                label="Curva ABC"
                clearable
                hide-details
                @update:model-value="carregarEstoque"
            /></v-col>
            <v-col cols="3" sm="6" md="2" class="d-flex align-center justify-end"
              ><v-btn prepend-icon="mdi-filter-remove" variant="text" @click="limparFiltros">Limpar</v-btn></v-col
            >
          </v-row></v-card-text
        ></v-card
      >
      <v-card
        ><v-card-title class="d-flex flex-wrap align-center justify-space-between ga-2"
          ><span>Posição de estoque</span
          ><v-btn size="small" variant="tonal" prepend-icon="mdi-history" @click="abrirExtrato()"
            >Extrato completo</v-btn
          ><span class="text-body-2 text-medium-emphasis"
            >{{ produtosExibidos.length }} produto(s) exibido(s)</span
          ></v-card-title
        ><v-card-text><EstoqueLista :produtos="produtosExibidos" @extrato="abrirExtrato" /></v-card-text
      ></v-card>
    </div>
    <EstoqueExtratoDialog
      v-model="dialogExtrato"
      :empresa-id="empresaId"
      :produtos="catalogoFiltros"
      :produto-inicial="produtoExtrato"
    />
  </AppShell>
</template>
