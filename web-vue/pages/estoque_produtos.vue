<script setup lang="ts">
import type { AuthSession, ProdutoEstoqueDto } from "@padaria/shared";
import type { CaixaStatus, Opcao } from "~/types/padaria";
import AppShell from "~/components/app/AppShell.vue";
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
const catalogoFiltros = ref<ProdutoEstoqueDto[]>([]);
const filtros = reactive({ grupoMercadoriaId: "", areaEstoque: "", localVenda: "", localEstoque: "", curvaAbc: "" });

const permissoesUsuario = computed(() => sessao.value?.perfil?.permissoes ?? []);
const { temPermissao, telasPermitidas, telasDesabilitadasMenu, motivosTelasDesabilitadas } = usePermissoes(
  permissoesUsuario,
  () => Boolean(caixaStatus.value?.caixaAberto)
);

const grupos = computed(() => {
  const porId = new Map<string, string>();
  for (const produto of catalogoFiltros.value) if (produto.grupoMercadoriaId && produto.grupo) porId.set(produto.grupoMercadoriaId, produto.grupo);
  return [...porId].map(([id, nome]) => ({ id, nome }));
});
const areas = computed(() => valoresUnicos(catalogoFiltros.value.map((produto) => produto.areaEstoque)));
const locaisVenda = computed(() => valoresUnicos(catalogoFiltros.value.flatMap((produto) => produto.localVenda)));
const locaisEstoque = computed(() => valoresUnicos(catalogoFiltros.value.map((produto) => produto.localEstoque)));

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
  carregarEstoque();
}
async function trocarEmpresa(id: string) {
  empresaId.value = id;
  limparFiltros();
  await carregarEmpresa();
}

onMounted(async () => {
  try {
    sessao.value = await carregarSessao();
    if (!sessao.value) return void (await router.push("/login"));
    if (!temPermissao("estoque_produtos_visualizar")) return void (erro.value = "Sem permissão para acessar estoque.");
    empresas.value = await apiGet<Opcao[]>("/api/empresas");
    empresaId.value = sessao.value.perfil?.empresaId ?? sessao.value.perfil?.empresaIds?.[0] ?? empresas.value[0]?.id ?? "";
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
      <AppCabecalhoTela titulo="Estoque" subtitulo="Saldo disponível por produto. Somente recebimento físico altera este saldo." />
      <v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>
      <v-card>
        <v-card-text>
          <v-row dense>
            <v-col cols="12" sm="6" md="3"><v-select v-model="filtros.grupoMercadoriaId" :items="grupos" item-title="nome" item-value="id" label="Grupo" clearable @update:model-value="carregarEstoque" /></v-col>
            <v-col cols="12" sm="6" md="3"><v-select v-model="filtros.areaEstoque" :items="areas" label="Área" clearable @update:model-value="carregarEstoque" /></v-col>
            <v-col cols="12" sm="6" md="2"><v-select v-model="filtros.localVenda" :items="locaisVenda" label="Local de venda" clearable @update:model-value="carregarEstoque" /></v-col>
            <v-col cols="12" sm="6" md="2"><v-select v-model="filtros.localEstoque" :items="locaisEstoque" label="Local de estoque" clearable @update:model-value="carregarEstoque" /></v-col>
            <v-col cols="9" sm="6" md="1"><v-select v-model="filtros.curvaAbc" :items="['A', 'B', 'C']" label="ABC" clearable @update:model-value="carregarEstoque" /></v-col>
            <v-col cols="3" sm="6" md="1" class="d-flex align-center justify-end"><v-btn icon="mdi-filter-remove" variant="text" aria-label="Limpar filtros" @click="limparFiltros" /></v-col>
          </v-row>
        </v-card-text>
      </v-card>
      <v-card>
        <v-card-title class="text-subtitle-1">{{ produtos.length }} produto(s)</v-card-title>
        <v-card-text>
          <div class="responsive-table-shell"><v-table density="comfortable"><thead><tr><th>Produto</th><th>Grupo</th><th>Área</th><th>Venda</th><th>Local</th><th>ABC</th><th class="text-right">Disponível</th><th class="text-right">Mín./Máx.</th></tr></thead><tbody>
            <tr v-if="!produtos.length"><td colspan="8" class="text-center text-medium-emphasis">Nenhum produto encontrado.</td></tr>
            <tr v-for="produto in produtos" :key="produto.id"><td>{{ produto.descricao }}</td><td>{{ produto.grupo ?? '—' }}</td><td>{{ produto.areaEstoque ?? '—' }}</td><td>{{ produto.localVenda.join(', ') || '—' }}</td><td>{{ produto.localEstoque ?? '—' }}</td><td><v-chip v-if="produto.curvaAbc" size="x-small">{{ produto.curvaAbc }}</v-chip><span v-else>—</span></td><td class="text-right">{{ produto.quantidadeEstoque }}</td><td class="text-right">{{ produto.estoqueMin ?? '—' }} / {{ produto.estoqueMax ?? '—' }}</td></tr>
          </tbody></v-table></div>
        </v-card-text>
      </v-card>
    </div>
  </AppShell>
</template>
