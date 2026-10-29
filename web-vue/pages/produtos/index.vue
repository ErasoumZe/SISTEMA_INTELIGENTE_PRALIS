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
import ProdutosCabecalho from "~/components/produtos/ProdutosCabecalho.vue";
import ProdutoFiltros from "~/components/produtos/ProdutoFiltros.vue";
import ProdutoInativarLote from "~/components/produtos/ProdutoInativarLote.vue";
import ProdutoListaLinha from "~/components/produtos/ProdutoListaLinha.vue";
import ProdutoFotoAmpliada from "~/components/produtos/ProdutoFotoAmpliada.vue";
import ProdutosListaVazia from "~/components/produtos/ProdutosListaVazia.vue";
import { usePermissoes } from "~/composables/usePermissoes";
import { useEmpresaAtivaDosProdutos } from "~/composables/useEmpresaAtivaDosProdutos";
import { useListagemProdutos } from "~/composables/useListagemProdutos";
import { useStatusDeProdutos } from "~/composables/useStatusDeProdutos";
import { mensagemErro } from "~/utils/domain";

const router = useRouter();
const { apiGet, carregarSessao } = useApi();

const sessao = ref<AuthSession | null>(null);
const empresas = ref<Opcao[]>([]);
// Empresa ATIVA do seletor do shell, a mesma do "Importar da base".
const empresaAtiva = useEmpresaAtivaDosProdutos();
const empresaId = empresaAtiva.empresaId;
const caixaStatus = ref<CaixaStatus | null>(null);
const carregandoPagina = ref(true);
const erroDeAcesso = ref("");
const fotoAmpliada = ref<{ endereco: string; nome: string } | null>(null);
const mostrarFiltros = ref(false);
const modoVisualizacao = ref<"cards" | "lista">("cards");
const CHAVE_MODO_VISUALIZACAO = "pralis:produtos:modo";

onMounted(() => {
  try {
    const salvo = localStorage.getItem(CHAVE_MODO_VISUALIZACAO);
    if (salvo === "card" || salvo === "lista") modoVisualizacao.value = salvo === "card" ? "cards" : salvo;
  } catch {
    // A preferência é local; sem acesso ao armazenamento, a tela segue no padrão de cards.
  }
});

watch(modoVisualizacao, (modo) => {
  try {
    localStorage.setItem(CHAVE_MODO_VISUALIZACAO, modo === "cards" ? "card" : modo);
  } catch {
    // O bloqueio de localStorage não impede a navegação entre os modos.
  }
});

const permissoesUsuario = computed(() => sessao.value?.perfil?.permissoes ?? []);
const { temPermissao, telasPermitidas, telasDesabilitadasMenu, motivosTelasDesabilitadas } = usePermissoes(
  permissoesUsuario,
  () => Boolean(caixaStatus.value?.caixaAberto)
);
const podeCriar = computed(() => temPermissao("cadastro_produtos_criar"));
const podeEditar = computed(() => temPermissao("cadastro_produtos_editar"));

const lista = useListagemProdutos(empresaId);
const ehAdmin = computed(() => sessao.value?.perfil?.role === "usuario_admin");
const statusDeProdutos = useStatusDeProdutos(empresaId, () => lista.carregar());
const loteInativar = ref<InstanceType<typeof ProdutoInativarLote> | null>(null);
async function confirmarLote(confirmacao: string) {
  if (await statusDeProdutos.inativarSelecionados(confirmacao)) loteInativar.value?.fechar();
}
const soAtivos = computed({
  get: () => lista.status.value === "ativo",
  set: (marcado: boolean) => {
    lista.status.value = marcado ? "ativo" : null;
  }
});

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
    empresas.value = sessao.value.empresas?.length ? sessao.value.empresas : await apiGet<Opcao[]>("/api/empresas");
    empresaAtiva.iniciar(sessao.value, empresas.value);
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
    :carregando-empresa="false"
    @selecionar-empresa="empresaAtiva.trocar"
  >
    <v-alert v-if="erroDeAcesso" type="error" variant="tonal">{{ erroDeAcesso }}</v-alert>

    <div v-else class="produtos-tela">
      <ProdutosCabecalho :total="lista.paginacao.total" :eh-admin="ehAdmin" :pode-criar="podeCriar" />

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
        <v-checkbox
          v-model="soAtivos"
          label="Só ativos"
          density="compact"
          hide-details
          class="produtos-tela__so-ativos"
        />
        <v-checkbox
          v-model="lista.somenteVendidos.value"
          label="Só os que já vendi"
          density="compact"
          hide-details
          class="produtos-tela__so-vendidos"
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
        <div class="produtos-tela__visualizacao" role="group" aria-label="Modo de visualização">
          <v-btn
            icon="mdi-view-grid-outline"
            size="small"
            variant="outlined"
            aria-label="Ver em cards"
            :aria-pressed="modoVisualizacao === 'cards'"
            :color="modoVisualizacao === 'cards' ? 'primary' : undefined"
            @click="modoVisualizacao = 'cards'"
          />
          <v-btn
            icon="mdi-view-list-outline"
            size="small"
            variant="outlined"
            aria-label="Ver em lista"
            :aria-pressed="modoVisualizacao === 'lista'"
            :color="modoVisualizacao === 'lista' ? 'primary' : undefined"
            @click="modoVisualizacao = 'lista'"
          />
        </div>
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

      <v-alert
        v-if="statusDeProdutos.mensagem.value"
        :type="statusDeProdutos.mensagem.value.tipo"
        variant="tonal"
        closable
        @click:close="statusDeProdutos.mensagem.value = null"
      >
        {{ statusDeProdutos.mensagem.value.texto }}
      </v-alert>

      <ProdutoInativarLote
        v-if="ehAdmin"
        ref="loteInativar"
        :quantidade="statusDeProdutos.selecionados.value.length"
        :frase="statusDeProdutos.fraseDoLote.value"
        :processando="statusDeProdutos.inativandoLote.value"
        @confirmar="confirmarLote"
        @limpar="statusDeProdutos.selecionados.value = []"
        @selecionar-pagina="statusDeProdutos.selecionarPagina(lista.produtos.value.map((produto) => produto.id))"
      />

      <v-progress-linear v-if="lista.carregando.value" indeterminate color="primary" />

      <v-alert v-if="lista.erro.value" type="error" variant="tonal">
        <div class="d-flex flex-wrap align-center ga-3">
          <span>{{ lista.erro.value }}</span>
          <v-btn size="small" variant="flat" color="error" @click="lista.carregar()">Tentar de novo</v-btn>
        </div>
      </v-alert>

      <div v-else-if="lista.produtos.value.length && modoVisualizacao === 'cards'" class="produtos-tela__grade">
        <ProdutoCard
          v-for="produto in lista.produtos.value"
          :key="produto.id"
          :produto="produto"
          :preco="lista.precoDe(produto)"
          :pode-editar="podeEditar"
          :alterando-status="statusDeProdutos.emAlteracao.value.has(produto.id)"
          :selecionavel="ehAdmin"
          :selecionado="statusDeProdutos.selecionados.value.includes(produto.id)"
          @alternar-status="statusDeProdutos.alternar(produto)"
          @selecionar="statusDeProdutos.alternarSelecao(produto.id)"
          @ampliar-foto="fotoAmpliada = $event"
        />
      </div>

      <div v-else-if="lista.produtos.value.length" class="produtos-tela__lista" role="list" aria-label="Produtos">
        <ProdutoListaLinha
          v-for="produto in lista.produtos.value"
          :key="produto.id"
          :produto="produto"
          :preco="lista.precoDe(produto)"
          :pode-editar="podeEditar"
          :alterando-status="statusDeProdutos.emAlteracao.value.has(produto.id)"
          :selecionavel="ehAdmin"
          :selecionado="statusDeProdutos.selecionados.value.includes(produto.id)"
          @alternar-status="statusDeProdutos.alternar(produto)"
          @selecionar="statusDeProdutos.alternarSelecao(produto.id)"
        />
      </div>

      <ProdutosListaVazia
        v-else-if="!lista.carregando.value"
        :tem-filtro="lista.temFiltroOuBusca.value"
        :eh-admin="ehAdmin"
        :pode-importar="podeCriar"
        @limpar="lista.limparFiltros"
      />
      <ProdutoFotoAmpliada :foto="fotoAmpliada" @fechar="fotoAmpliada = null" />

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
.produtos-tela__visualizacao {
  display: flex;
  gap: var(--cx-sp-1);
  margin-left: auto;
}
.produtos-tela__lista {
  display: grid;
  gap: var(--cx-sp-2);
  min-width: 0;
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
  .produtos-tela__visualizacao {
    margin-left: 0;
  }
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
