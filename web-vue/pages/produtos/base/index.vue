<script setup lang="ts">
import type { AuthSession } from "@padaria/shared";
import AppShell from "~/components/app/AppShell.vue";
import CatalogoBaseDetalhe from "~/components/produtos/CatalogoBaseDetalhe.vue";
import type { CaixaStatus, Opcao } from "~/types/padaria";
import { mensagemErro } from "~/utils/domain";

type ProdutoBase = {
  id: string;
  idOrigem: string;
  codigoInterno: string | null;
  codigoBarras: string | null;
  nome: string;
  status: "ativo" | "inativo";
  grupoIdOrigem: string | null;
  dadosOficiais: Record<string, unknown>;
  atualizadoEm: string;
};
type ResultadoCopiaLote = {
  total: number;
  importados: number;
  jaImportados: number;
  ignorados: number;
  bloqueados: number;
  naoEncontrados: number;
  erros: number;
  itens: Array<{ produtoBaseId: string; nome: string; estado: string; motivo?: string }>;
};

const router = useRouter();
const { apiGet, apiPost, carregarSessao } = useApi();
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
const aviso = ref("");
const copiandoId = ref<string | null>(null);
const copiandoLote = ref(false);
const idsSelecionados = ref<string[]>([]);
const lote = ref<ResultadoCopiaLote | null>(null);
const buscaAplicada = ref("");
let temporizadorBusca: ReturnType<typeof setTimeout> | undefined;
/** Oficial: so o administrador cria e altera produto na BASE; a loja importa a copia. */
const ehAdmin = computed(() => sessao.value?.perfil?.role === "usuario_admin");
const { telasPermitidas, telasDesabilitadasMenu, motivosTelasDesabilitadas } = usePermissoes(
  computed(() => sessao.value?.perfil?.permissoes ?? []),
  () => Boolean(caixaStatus.value?.caixaAberto)
);

async function carregar() {
  carregando.value = true;
  erro.value = "";
  try {
    const query = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize) });
    if (buscaAplicada.value.trim()) query.set("busca", buscaAplicada.value.trim());
    if (status.value !== "todos") query.set("status", status.value);
    const resultado = await apiGet<{ itens: ProdutoBase[]; total: number }>(`/api/produtos/catalogo-base?${query}`);
    itens.value = resultado.itens;
    total.value = resultado.total;
  } catch (falha) {
    erro.value = mensagemErro(falha);
  } finally {
    carregando.value = false;
  }
}

function grupoProduto(produto: ProdutoBase) {
  const grupo = produto.dadosOficiais["grupo"];
  return typeof grupo === "string" && grupo.trim() ? grupo : produto.grupoIdOrigem || "—";
}

async function copiarParaLoja(produto: ProdutoBase) {
  const empresaId = sessao.value?.perfil?.empresaId;
  if (!empresaId || !sessao.value?.perfil?.permissoes?.includes("cadastro_produtos_criar")) return;
  if (!window.confirm(`Copiar “${produto.nome}” para a loja ativa? O saldo de estoque será iniciado em zero.`)) return;
  lote.value = null;
  copiandoId.value = produto.id;
  aviso.value = "";
  try {
    const resultado = await apiPost<{ estado: string; motivo?: string; mensagem?: string }>(
      `/api/produtos/catalogo-base/${produto.id}/importar`,
      { empresaId }
    );
    aviso.value =
      resultado.estado === "importado"
        ? "Produto copiado para a loja. O saldo começou em zero."
        : (resultado.motivo ?? resultado.mensagem ?? "O produto não foi copiado.");
  } catch (falha) {
    aviso.value = mensagemErro(falha);
  } finally {
    copiandoId.value = null;
  }
}

function selecionarProduto(produtoBaseId: string, selecionado: boolean | null) {
  idsSelecionados.value = selecionado
    ? [...new Set([...idsSelecionados.value, produtoBaseId])]
    : idsSelecionados.value.filter((id) => id !== produtoBaseId);
}

function selecionarPagina(selecionado: boolean | null) {
  idsSelecionados.value = selecionado ? itens.value.map((produto) => produto.id) : [];
}

async function copiarSelecionadosParaLoja() {
  const empresaId = sessao.value?.perfil?.empresaId;
  if (!empresaId || !idsSelecionados.value.length || copiandoLote.value) return;
  const nomes = new Map(itens.value.map((produto) => [produto.id, produto.nome]));
  if (
    !window.confirm(
      `Copiar ${idsSelecionados.value.length} produto(s) selecionado(s) para a loja ativa? O saldo será iniciado em zero.`
    )
  )
    return;
  copiandoLote.value = true;
  aviso.value = "";
  lote.value = null;
  try {
    const resultado = await apiPost<
      Omit<ResultadoCopiaLote, "itens"> & {
        itens: Array<{ produtoBaseId: string; estado: string; motivo?: string }>;
      }
    >("/api/produtos/catalogo-base/importar", {
      empresaId,
      produtoBaseIds: idsSelecionados.value
    });
    lote.value = {
      ...resultado,
      itens: resultado.itens.map((item) => ({ ...item, nome: nomes.get(item.produtoBaseId) ?? item.produtoBaseId }))
    };
    idsSelecionados.value = [];
    await carregar();
  } catch (falha) {
    aviso.value = mensagemErro(falha);
  } finally {
    copiandoLote.value = false;
  }
}

watch(busca, (valor) => {
  if (temporizadorBusca) clearTimeout(temporizadorBusca);
  temporizadorBusca = setTimeout(() => (buscaAplicada.value = valor), 300);
});
watch([buscaAplicada, status], () => {
  page.value = 1;
  idsSelecionados.value = [];
  void carregar();
});
watch(page, () => {
  idsSelecionados.value = [];
  void carregar();
});
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
    empresas.value = sessao.value.empresas ?? [];
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
    tela-ativa="produtos"
    :empresas="empresas"
    :empresa-id="sessao.perfil?.empresaId ?? ''"
    :caixa-status="caixaStatus"
    :telas-desabilitadas="telasDesabilitadasMenu"
    :motivos-telas-desabilitadas="motivosTelasDesabilitadas"
    :carregando-empresa="false"
  >
    <main class="catalogo-base">
      <header class="catalogo-base__header">
        <div>
          <h1>Catálogo mestre BASE</h1>
          <p>{{ total.toLocaleString("pt-BR") }} produto(s) · cadastro separado das lojas</p>
        </div>
        <div class="catalogo-base__acoes">
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
      <v-alert v-if="aviso" type="info" variant="tonal">{{ aviso }}</v-alert>
      <v-alert v-if="lote" type="info" variant="tonal">
        Lote concluído: {{ lote.importados }} importado(s), {{ lote.jaImportados }} já existente(s),
        {{ lote.ignorados }} ignorado(s), {{ lote.bloqueados }} bloqueado(s), {{ lote.naoEncontrados }} não
        encontrado(s) e {{ lote.erros }} com falha.
        <ul
          v-if="lote.itens.some((item) => item.estado === 'bloqueado' || item.estado === 'erro')"
          class="catalogo-base__falhas"
        >
          <li
            v-for="item in lote.itens.filter(
              (resultado) => resultado.estado === 'bloqueado' || resultado.estado === 'erro'
            )"
            :key="item.produtoBaseId"
          >
            {{ item.nome }}: {{ item.motivo ?? item.estado }}
          </li>
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

      <v-progress-linear v-if="carregando" indeterminate />
      <v-alert v-else-if="!itens.length" type="info" variant="tonal">
        Nenhum produto BASE corresponde a esta busca e situação.
      </v-alert>
      <div
        v-if="!carregando && itens.length && sessao.perfil?.permissoes?.includes('cadastro_produtos_criar')"
        class="catalogo-base__lote"
      >
        <span>{{ idsSelecionados.length }} selecionado(s) nesta página</span>
        <v-btn
          color="primary"
          variant="tonal"
          :disabled="!idsSelecionados.length || copiandoLote || Boolean(copiandoId)"
          :loading="copiandoLote"
          @click="copiarSelecionadosParaLoja"
        >
          Copiar selecionados para loja
        </v-btn>
      </div>
      <v-table v-if="!carregando && itens.length" class="catalogo-base__tabela">
        <thead>
          <tr>
            <th v-if="sessao.perfil?.permissoes?.includes('cadastro_produtos_criar')">
              <v-checkbox-btn
                :model-value="itens.length > 0 && idsSelecionados.length === itens.length"
                :indeterminate="idsSelecionados.length > 0 && idsSelecionados.length < itens.length"
                aria-label="Selecionar todos os produtos desta página"
                @update:model-value="selecionarPagina"
              />
            </th>
            <th>Nome oficial</th>
            <th>Código interno</th>
            <th>EAN</th>
            <th>Grupo oficial</th>
            <th>Situação</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="produto in itens" :key="produto.id" class="catalogo-base__linha">
            <td v-if="sessao.perfil?.permissoes?.includes('cadastro_produtos_criar')">
              <v-checkbox-btn
                :model-value="idsSelecionados.includes(produto.id)"
                :disabled="copiandoLote || Boolean(copiandoId)"
                :aria-label="`Selecionar ${produto.nome}`"
                @update:model-value="selecionarProduto(produto.id, $event)"
              />
            </td>
            <td>{{ produto.nome }}</td>
            <td class="cx-num">{{ produto.codigoInterno || "—" }}</td>
            <td class="cx-num">{{ produto.codigoBarras || "—" }}</td>
            <td>{{ grupoProduto(produto) }}</td>
            <td>
              <v-chip size="small" :color="produto.status === 'ativo' ? 'success' : 'default'">{{
                produto.status
              }}</v-chip>
            </td>
            <td class="catalogo-base__acoes">
              <v-btn size="small" variant="text" @click="selecionado = produto">Ver cadastro</v-btn>
              <v-btn v-if="ehAdmin" size="small" variant="text" :to="`/produtos/base/${produto.id}`">Editar</v-btn>
              <v-btn
                v-if="sessao.perfil?.permissoes?.includes('cadastro_produtos_criar')"
                size="small"
                color="primary"
                variant="tonal"
                :loading="copiandoId === produto.id"
                :disabled="Boolean(copiandoId)"
                @click="copiarParaLoja(produto)"
              >
                Copiar para loja
              </v-btn>
            </td>
          </tr>
        </tbody>
      </v-table>
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
.catalogo-base__filtros {
  display: flex;
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
.catalogo-base__tabela {
  overflow-x: auto;
}
.catalogo-base__linha {
  cursor: pointer;
}
.catalogo-base__acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.catalogo-base__lote {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
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
