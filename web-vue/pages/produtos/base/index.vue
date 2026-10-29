<script setup lang="ts">
/**
 * Catalogo mestre BASE = "Importar da base" da loja (paralelo `importar.vue`). A copia vai para a
 * empresa ATIVA do seletor do shell; cada linha diz se o produto ja esta nela ("Novo"/"Importado").
 */
import type { AuthSession } from "@padaria/shared";
import AppShell from "~/components/app/AppShell.vue";
import CatalogoBaseDetalhe from "~/components/produtos/CatalogoBaseDetalhe.vue";
import CatalogoBaseTabela from "~/components/produtos/CatalogoBaseTabela.vue";
import { useEmpresaAtivaDosProdutos } from "~/composables/useEmpresaAtivaDosProdutos";
import { useImportacaoDaBase, type ProdutoBase } from "~/composables/useImportacaoDaBase";
import type { CaixaStatus, Opcao } from "~/types/padaria";
import { mensagemErro } from "~/utils/domain";

const router = useRouter();
const { apiGet, carregarSessao } = useApi();
const sessao = ref<AuthSession | null>(null);
const empresas = ref<Opcao[]>([]);
const caixaStatus = ref<CaixaStatus | null>(null);
const itens = ref<ProdutoBase[]>([]);
const selecionado = ref<ProdutoBase | null>(null);
const busca = ref("");
const status = ref<"ativo" | "inativo" | "todos">("ativo");
const page = ref(1);
const pageSize = 30;
const total = ref(0);
const carregando = ref(true);
const erro = ref("");
const buscaAplicada = ref("");
let temporizadorBusca: ReturnType<typeof setTimeout> | undefined;
/** Oficial: so o administrador cria e altera produto na BASE; a loja importa a copia. */
const ehAdmin = computed(() => sessao.value?.perfil?.role === "usuario_admin");
const { telasPermitidas, telasDesabilitadasMenu, motivosTelasDesabilitadas, temPermissao } = usePermissoes(
  computed(() => sessao.value?.perfil?.permissoes ?? []),
  () => Boolean(caixaStatus.value?.caixaAberto)
);
const podeImportar = computed(() => temPermissao("cadastro_produtos_criar"));

const empresaAtiva = useEmpresaAtivaDosProdutos();
const nomeDaLoja = computed(
  () => empresas.value.find((empresa) => empresa.id === empresaAtiva.empresaId.value)?.nome ?? "a loja ativa"
);

async function carregar() {
  carregando.value = true;
  erro.value = "";
  try {
    const query = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize) });
    if (buscaAplicada.value.trim()) query.set("busca", buscaAplicada.value.trim());
    if (status.value !== "todos") query.set("status", status.value);
    // A loja de destino faz cada linha dizer se ja foi importada ali.
    if (empresaAtiva.empresaId.value) query.set("empresaId", empresaAtiva.empresaId.value);
    const resultado = await apiGet<{ itens: ProdutoBase[]; total: number }>(`/api/produtos/catalogo-base?${query}`);
    itens.value = resultado.itens;
    total.value = resultado.total;
  } catch (falha) {
    erro.value = mensagemErro(falha);
  } finally {
    carregando.value = false;
  }
}

const importacao = useImportacaoDaBase({ empresaId: empresaAtiva.empresaId, itens, recarregar: carregar });
const ocupado = computed(() => importacao.copiandoLote.value || Boolean(importacao.copiandoId.value));

watch(busca, (valor) => {
  if (temporizadorBusca) clearTimeout(temporizadorBusca);
  temporizadorBusca = setTimeout(() => (buscaAplicada.value = valor), 300);
});
// Busca e pagina NAO limpam a selecao (paralelo); trocar a situacao limpa: nao se importa o que saiu.
watch(status, () => importacao.limparSelecao());
watch([buscaAplicada, status], () => {
  page.value = 1;
  void carregar();
});
watch([page, empresaAtiva.empresaId], () => void carregar());
onBeforeUnmount(() => {
  if (temporizadorBusca) clearTimeout(temporizadorBusca);
});

onMounted(async () => {
  try {
    sessao.value = await carregarSessao();
    if (!sessao.value) return await router.push("/login");
    if (!sessao.value.perfil?.permissoes?.includes("cadastro_produtos_visualizar")) {
      erro.value = "Sem permissão para consultar o catálogo mestre BASE.";
      return;
    }
    empresas.value = sessao.value.empresas?.length ? sessao.value.empresas : await apiGet<Opcao[]>("/api/empresas");
    empresaAtiva.iniciar(sessao.value, empresas.value);
    await carregar();
  } catch (falha) {
    erro.value = mensagemErro(falha);
  } finally {
    carregando.value = false;
  }
});
</script>

<template>
  <AppShell
    v-if="sessao"
    :sessao="sessao"
    :telas="telasPermitidas"
    tela-ativa="produtos_importar"
    :empresas="empresas"
    :empresa-id="empresaAtiva.empresaId.value"
    :caixa-status="caixaStatus"
    :telas-desabilitadas="telasDesabilitadasMenu"
    :motivos-telas-desabilitadas="motivosTelasDesabilitadas"
    :carregando-empresa="false"
    @selecionar-empresa="empresaAtiva.trocar"
  >
    <main class="catalogo-base">
      <header class="catalogo-base__header">
        <div>
          <h1>{{ ehAdmin ? "Catálogo mestre BASE" : "Importar da base" }}</h1>
          <p>{{ total.toLocaleString("pt-BR") }} produto(s) · cadastro separado das lojas</p>
        </div>
        <div class="catalogo-base__acoes">
          <v-chip v-if="podeImportar" color="primary" label prepend-icon="mdi-storefront-outline">
            Destino: {{ nomeDaLoja }}
          </v-chip>
          <v-btn variant="outlined" prepend-icon="mdi-arrow-left" to="/produtos">Voltar aos produtos</v-btn>
          <v-btn v-if="ehAdmin" color="primary" prepend-icon="mdi-plus" to="/produtos/novo">Novo produto</v-btn>
        </div>
      </header>

      <v-alert type="info" variant="tonal">
        A BASE é o cadastro geral: só o administrador cria e altera produtos aqui. Cada loja importa a cópia e completa
        estoque, preço, fiscal e promoção. O que o administrador mudar na BASE desce para as lojas que ainda seguem cada
        campo.
      </v-alert>
      <v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>
      <v-alert v-if="importacao.aviso.value" type="info" variant="tonal">{{ importacao.aviso.value }}</v-alert>
      <v-alert v-if="importacao.lote.value" type="info" variant="tonal">
        Lote concluído: {{ importacao.lote.value.importados }} importado(s), {{ importacao.lote.value.jaImportados }} já
        existente(s), {{ importacao.lote.value.ignorados }} ignorado(s),
        {{ importacao.lote.value.bloqueados }} bloqueado(s), {{ importacao.lote.value.naoEncontrados }} não
        encontrado(s) e {{ importacao.lote.value.erros }} com falha.
        <ul class="catalogo-base__falhas">
          <template v-for="item in importacao.lote.value.itens" :key="item.produtoBaseId">
            <li v-if="item.estado === 'bloqueado' || item.estado === 'erro'">
              {{ item.nome }}: {{ item.motivo ?? item.estado }}
            </li>
          </template>
        </ul>
      </v-alert>

      <div class="catalogo-base__filtros">
        <v-text-field
          v-model="busca"
          label="Buscar por nome, código interno ou EAN"
          prepend-inner-icon="mdi-magnify"
          clearable
          hide-details
        />
        <v-select
          v-model="status"
          :items="[
            { title: 'Só ativos', value: 'ativo' },
            { title: 'Só inativos', value: 'inativo' },
            { title: 'Todos', value: 'todos' }
          ]"
          label="Situação"
          hide-details
        />
      </div>

      <div v-if="podeImportar && importacao.idsSelecionados.value.length" class="catalogo-base__lote">
        <span>{{ importacao.idsSelecionados.value.length }} selecionado(s), em qualquer página</span>
        <div class="catalogo-base__acoes">
          <v-btn variant="text" :disabled="ocupado" @click="importacao.limparSelecao">Limpar seleção</v-btn>
          <v-btn
            color="primary"
            variant="tonal"
            :disabled="ocupado"
            :loading="importacao.copiandoLote.value"
            @click="importacao.copiarSelecionados(nomeDaLoja)"
          >
            Copiar selecionados para {{ nomeDaLoja }}
          </v-btn>
        </div>
      </div>

      <v-progress-linear v-if="carregando" indeterminate />
      <v-alert v-else-if="!itens.length" type="info" variant="tonal">
        Nenhum produto BASE corresponde a esta busca e situação.
      </v-alert>
      <CatalogoBaseTabela
        v-else
        :itens="itens"
        :selecionados="importacao.selecionados.value"
        :pagina-toda="importacao.paginaToda.value"
        :pagina-em-parte="importacao.paginaEmParte.value"
        :pode-importar="podeImportar"
        :eh-admin="ehAdmin"
        :ocupado="ocupado"
        :copiando-id="importacao.copiandoId.value"
        @selecionar="importacao.selecionar"
        @selecionar-pagina="importacao.selecionarPagina"
        @ver="selecionado = $event"
        @copiar="importacao.copiarUm($event, nomeDaLoja)"
      />
      <v-pagination v-if="total > pageSize" v-model="page" :length="Math.ceil(total / pageSize)" :total-visible="5" />

      <CatalogoBaseDetalhe :produto="selecionado" @fechar="selecionado = null" />
    </main>
  </AppShell>
</template>

<style scoped>
.catalogo-base {
  display: grid;
  gap: 18px;
  max-width: 1440px;
  min-width: 0;
  margin: 0 auto;
  padding: 24px;
}
.catalogo-base__header,
.catalogo-base__filtros,
.catalogo-base__lote {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.catalogo-base__header h1 {
  margin: 0;
}
.catalogo-base__header p {
  margin: 4px 0 0;
  color: rgb(var(--v-theme-on-surface-variant));
}
.catalogo-base__filtros > :first-child {
  flex: 1 1 320px;
}
.catalogo-base__filtros > :last-child {
  flex: 0 1 220px;
}
.catalogo-base__acoes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.catalogo-base__falhas {
  margin-top: 8px;
}
@media (max-width: 600px) {
  .catalogo-base {
    padding: 16px;
  }
  .catalogo-base__header,
  .catalogo-base__filtros {
    align-items: stretch;
    flex-direction: column;
  }
  .catalogo-base__filtros > * {
    width: 100%;
  }
}
</style>
