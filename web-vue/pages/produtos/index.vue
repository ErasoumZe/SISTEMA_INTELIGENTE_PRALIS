<script setup lang="ts">
/**
 * Listagem de Produtos. Substitui a tabela de 5 colunas que vivia no `CadastroTablePage` — e que
 * recebia apenas os 10 primeiros produtos do banco.
 *
 * Busca, filtros, ordenacao e paginacao sao SERVER-SIDE. A tela nunca filtra em memoria.
 */
import type { AuthSession } from "@padaria/shared";
import type { CaixaStatus, Opcao } from "~/types/padaria";
import AppShell from "~/components/app/AppShell.vue";
import ProdutoCard from "~/components/produtos/ProdutoCard.vue";
import ProdutoFiltros from "~/components/produtos/ProdutoFiltros.vue";
import { usePermissoes } from "~/composables/usePermissoes";
import { useListagemProdutos } from "~/composables/useListagemProdutos";
import { mensagemErro } from "~/utils/domain";

const router = useRouter();
const { apiGet, carregarSessao } = useApi();

const sessao = ref<AuthSession | null>(null);
const empresas = ref<Opcao[]>([]);
const empresaId = ref("");
const caixaStatus = ref<CaixaStatus | null>(null);
const carregandoPagina = ref(true);
const trocandoEmpresa = ref(false);
const erroDeAcesso = ref("");
const mostrarFiltros = ref(false);

const permissoesUsuario = computed(() => sessao.value?.perfil?.permissoes ?? []);
const { temPermissao, telasPermitidas, telasDesabilitadasMenu, motivosTelasDesabilitadas } = usePermissoes(
  permissoesUsuario,
  () => Boolean(caixaStatus.value?.caixaAberto)
);
const podeCriar = computed(() => temPermissao("cadastro_produtos_criar"));
const podeEditar = computed(() => temPermissao("cadastro_produtos_editar"));

const lista = useListagemProdutos(empresaId);

async function trocarEmpresa(id: string) {
  trocandoEmpresa.value = true;
  empresaId.value = id;
  trocandoEmpresa.value = false;
}

onMounted(async () => {
  try {
    sessao.value = await carregarSessao();
    if (!sessao.value) {
      await router.push("/login");
      return;
    }
    if (!temPermissao("cadastro_produtos_visualizar")) {
      erroDeAcesso.value = "Sem permissão para acessar esta página.";
      return;
    }
    empresas.value = await apiGet<Opcao[]>("/api/empresas");
    empresaId.value =
      sessao.value.perfil?.empresaId ?? sessao.value.perfil?.empresaIds?.[0] ?? empresas.value[0]?.id ?? "";
    await Promise.all([lista.carregar(), lista.carregarOpcoesDeFiltro()]);
  } catch (error) {
    erroDeAcesso.value = mensagemErro(error);
  } finally {
    carregandoPagina.value = false;
  }
});
</script>

<template>
  <v-progress-linear v-if="carregandoPagina" indeterminate />

  <AppShell
    v-else-if="sessao"
    :sessao="sessao"
    :telas="telasPermitidas"
    tela-ativa="produtos"
    :empresas="empresas"
    :empresa-id="empresaId"
    :caixa-status="caixaStatus"
    :telas-desabilitadas="telasDesabilitadasMenu"
    :motivos-telas-desabilitadas="motivosTelasDesabilitadas"
    :carregando-empresa="trocandoEmpresa"
    @selecionar-empresa="trocarEmpresa"
  >
    <v-alert v-if="erroDeAcesso" type="error" variant="tonal">{{ erroDeAcesso }}</v-alert>

    <div v-else class="produtos-tela">
      <header class="produtos-tela__cabecalho">
        <div>
          <h1>Produtos</h1>
          <p>{{ lista.paginacao.total }} produto(s) nesta loja</p>
        </div>
        <v-btn v-if="podeCriar" color="primary" prepend-icon="mdi-plus" to="/produtos/novo">Novo produto</v-btn>
      </header>

      <div class="produtos-tela__barra">
        <v-text-field
          v-model="lista.busca.value"
          density="compact"
          hide-details
          clearable
          placeholder="Buscar por nome, código, EAN ou marca..."
          prepend-inner-icon="mdi-magnify"
          class="produtos-tela__busca"
        />
        <v-btn
          variant="outlined"
          prepend-icon="mdi-tune"
          :append-icon="mostrarFiltros ? 'mdi-chevron-up' : 'mdi-chevron-down'"
          :aria-expanded="mostrarFiltros"
          aria-controls="painel-de-filtros"
          @click="mostrarFiltros = !mostrarFiltros"
        >
          Filtros
          <v-chip v-if="lista.quantidadeDeFiltros.value" size="x-small" color="primary" class="ml-2">
            {{ lista.quantidadeDeFiltros.value }}
          </v-chip>
        </v-btn>
      </div>

      <v-expand-transition>
        <div v-show="mostrarFiltros" id="painel-de-filtros">
          <ProdutoFiltros
            v-model:status="lista.status.value"
            v-model:tipo="lista.tipo.value"
            v-model:grupo="lista.grupoMercadoriaId.value"
            v-model:setor="lista.setorEstoque.value"
            v-model:ordenar="lista.ordenar.value"
            :opcoes="lista.opcoesDeFiltro.value"
            :tem-filtro-ou-busca="lista.temFiltroOuBusca.value"
            @limpar="lista.limparFiltros"
          />
        </div>
      </v-expand-transition>

      <v-progress-linear v-if="lista.carregando.value" indeterminate color="primary" />

      <v-alert v-if="lista.erro.value" type="error" variant="tonal">
        <div class="d-flex flex-wrap align-center ga-3">
          <span>{{ lista.erro.value }}</span>
          <v-btn size="small" variant="flat" color="error" @click="lista.carregar()">Tentar de novo</v-btn>
        </div>
      </v-alert>

      <div v-else-if="lista.produtos.value.length" class="produtos-tela__grade">
        <ProdutoCard
          v-for="produto in lista.produtos.value"
          :key="produto.id"
          :produto="produto"
          :pode-editar="podeEditar"
        />
      </div>

      <div v-else-if="!lista.carregando.value" class="produtos-tela__vazio">
        <v-icon icon="mdi-basket-off-outline" size="44" />
        <p>
          {{
            lista.temFiltroOuBusca.value
              ? "Nenhum produto com esses filtros."
              : "Nenhum produto cadastrado nesta loja ainda."
          }}
        </p>
        <v-btn v-if="lista.temFiltroOuBusca.value" variant="tonal" @click="lista.limparFiltros">Limpar filtros</v-btn>
        <v-btn v-else-if="podeCriar" color="primary" variant="tonal" to="/produtos/novo">Cadastrar o primeiro</v-btn>
      </div>

      <div v-if="lista.paginacao.totalPages > 1" class="produtos-tela__paginacao">
        <span class="cx-num">Página {{ lista.paginacao.page }} de {{ lista.paginacao.totalPages }}</span>
        <v-pagination
          v-model="lista.paginacao.page"
          :length="lista.paginacao.totalPages"
          :total-visible="5"
          density="comfortable"
          rounded="lg"
        />
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.produtos-tela {
  display: grid;
  gap: var(--cx-sp-4);
  min-width: 0;
  max-width: 100%;
}

.produtos-tela__cabecalho {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-3);
}
.produtos-tela__cabecalho h1 {
  font-size: var(--cx-fs-h2);
  font-weight: 700;
  letter-spacing: var(--cx-tracking-tight);
  color: var(--cx-ink);
}
.produtos-tela__cabecalho p {
  margin: 0;
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}

.produtos-tela__barra {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cx-sp-3);
}
.produtos-tela__busca {
  flex: 1 1 240px;
  min-width: 0;
  max-width: 420px;
}

/* Progressao 3 -> 2 -> 1. O passo de 2 colunas existe porque 3 em tablet aperta o preco. */
.produtos-tela__grade {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--cx-sp-4);
  min-width: 0;
}
@media (max-width: 1024px) {
  .produtos-tela__grade {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 600px) {
  .produtos-tela__grade {
    grid-template-columns: minmax(0, 1fr);
  }
}

.produtos-tela__vazio {
  display: grid;
  gap: var(--cx-sp-3);
  justify-items: center;
  padding: var(--cx-sp-8) var(--cx-sp-4);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface);
  color: var(--cx-ink-soft);
  text-align: center;
}
.produtos-tela__vazio p {
  margin: 0;
}

.produtos-tela__paginacao {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-3);
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}
</style>
