<script setup lang="ts">
import ComprasSecao from "~/components/compras/base/ComprasSecao.vue";
import BolinhasLegenda from "~/components/compras/BolinhasLegenda.vue";
import ProdutoBolinhas from "~/components/compras/ProdutoBolinhas.vue";
import type { GrupoAgendamentoDto, ProdutoAgendamentoDto } from "@padaria/shared";

// A lista de produtos do agendamento (doc 56 §2.1): filtros por grupo/subgrupo, área, local de estoque e
// local de venda; marca o que entra no pedido; bolinhas verde (mais vende), amarela (mais compramos) e
// azul (mais lucro) — top 20% dos últimos 3 meses.
const props = defineProps<{ produtos: ProdutoAgendamentoDto[]; grupos: GrupoAgendamentoDto[] }>();
// Doc 58 §2: aqui só se escolhe o produto; a quantidade é posta na Solicitação de compra, na data.
const selecionados = defineModel<string[]>({ required: true });
const marcado = computed(() => new Set(selecionados.value));

const filtro = reactive({ grupo: "", subgrupo: "", area: "", localEstoque: "", localVenda: "", busca: "" });
const somenteMarcados = ref(false);

const gruposPai = computed(() => props.grupos.filter((grupo) => !grupo.grupoPaiId));
const subgrupos = computed(() => props.grupos.filter((grupo) => grupo.grupoPaiId && grupo.grupoPaiId === filtro.grupo));
watch(
  () => filtro.grupo,
  () => (filtro.subgrupo = "")
);

const distintos = (seletor: (produto: ProdutoAgendamentoDto) => Array<string | null>) =>
  computed(() =>
    [...new Set(props.produtos.flatMap(seletor).filter((valor): valor is string => Boolean(valor)))].sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    )
  );
const areas = distintos((produto) => [produto.areaEstoque]);
const locaisEstoque = distintos((produto) => [produto.localEstoque]);
const locaisVenda = distintos((produto) => produto.localVenda);

/** Grupos que contam para o filtro: o subgrupo escolhido, ou o grupo e todos os subgrupos dele. */
const gruposDoFiltro = computed(() => {
  if (filtro.subgrupo) return new Set([filtro.subgrupo]);
  if (!filtro.grupo) return null;
  return new Set([filtro.grupo, ...subgrupos.value.map((grupo) => grupo.id)]);
});

const visiveis = computed(() => {
  const termo = filtro.busca.trim().toLocaleLowerCase("pt-BR");
  return props.produtos.filter(
    (produto) =>
      (!somenteMarcados.value || marcado.value.has(produto.id)) &&
      (!gruposDoFiltro.value || (produto.grupoMercadoriaId && gruposDoFiltro.value.has(produto.grupoMercadoriaId))) &&
      (!filtro.area || produto.areaEstoque === filtro.area) &&
      (!filtro.localEstoque || produto.localEstoque === filtro.localEstoque) &&
      (!filtro.localVenda || produto.localVenda.includes(filtro.localVenda)) &&
      (!termo || produto.descricao.toLocaleLowerCase("pt-BR").includes(termo))
  );
});
// A tela mostra até 300 linhas: com 1.300 produtos e filtros vazios, a tabela inteira travaria o celular.
const LIMITE = 300;
const exibidos = computed(() => visiveis.value.slice(0, LIMITE));
const totalMarcados = computed(() => selecionados.value.length);

function alternar(produto: ProdutoAgendamentoDto) {
  selecionados.value = marcado.value.has(produto.id)
    ? selecionados.value.filter((id) => id !== produto.id)
    : [...selecionados.value, produto.id];
}
function marcarVisiveis() {
  const novos = exibidos.value.map((produto) => produto.id).filter((id) => !marcado.value.has(id));
  selecionados.value = [...selecionados.value, ...novos];
}
const numero = (valor: string | null) =>
  valor === null ? "—" : Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
</script>

<template>
  <ComprasSecao rente data-secao="produtos-agendamento">
    <template #titulo>
      Produtos do agendamento
      <span class="conta" :class="{ 'conta--ativa': totalMarcados }">{{ totalMarcados }} marcado(s)</span>
    </template>
    <template #acoes>
      <v-switch v-model="somenteMarcados" label="Só os marcados" color="primary" density="compact" hide-details />
    </template>
    <template #filtros>
      <v-text-field
        v-model="filtro.busca"
        placeholder="Buscar produto"
        prepend-inner-icon="mdi-magnify"
        clearable
        density="compact"
        hide-details
        aria-label="Buscar produto"
        class="filtro filtro--busca"
      />
      <v-select
        v-model="filtro.grupo"
        :items="gruposPai"
        item-title="nome"
        item-value="id"
        label="Grupo"
        clearable
        density="compact"
        hide-details
        class="filtro"
      />
      <v-select
        v-model="filtro.subgrupo"
        :items="subgrupos"
        item-title="nome"
        item-value="id"
        label="Subgrupo"
        clearable
        density="compact"
        hide-details
        :disabled="!subgrupos.length"
        class="filtro"
      />
      <v-select
        v-model="filtro.area"
        :items="areas"
        label="Área / setor da loja"
        clearable
        density="compact"
        hide-details
        class="filtro"
      />
      <v-select
        v-model="filtro.localEstoque"
        :items="locaisEstoque"
        label="Local de estoque"
        clearable
        density="compact"
        hide-details
        class="filtro"
      />
      <v-select
        v-model="filtro.localVenda"
        :items="locaisVenda"
        label="Local de venda"
        clearable
        density="compact"
        hide-details
        class="filtro"
      />
    </template>

    <div class="barra" data-secao="legenda">
      <BolinhasLegenda />
      <v-btn
        size="small"
        variant="text"
        prepend-icon="mdi-checkbox-multiple-marked-outline"
        :disabled="!exibidos.length"
        @click="marcarVisiveis"
        >Marcar os listados</v-btn
      >
    </div>
    <div class="tabela">
      <table>
        <thead>
          <tr>
            <th class="coluna-marca"><span class="sr-only">Marcar</span></th>
            <th>Produto</th>
            <th class="numero">Saldo</th>
            <th class="numero">Mín · Máx</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="produto in exibidos"
            :key="produto.id"
            :data-produto="produto.id"
            :class="{ 'linha--marcada': marcado.has(produto.id) }"
            @click="alternar(produto)"
          >
            <td @click.stop>
              <v-checkbox-btn
                :model-value="marcado.has(produto.id)"
                :aria-label="`Marcar ${produto.descricao}`"
                color="primary"
                @update:model-value="alternar(produto)"
              />
            </td>
            <td>
              <span class="produto">
                {{ produto.descricao }}
                <ProdutoBolinhas
                  :mais-vende="produto.maisVende"
                  :mais-compra="produto.maisCompra"
                  :mais-lucro="produto.maisLucro"
                />
              </span>
            </td>
            <td class="numero">{{ numero(produto.quantidadeEstoque) }} {{ produto.unidade ?? "" }}</td>
            <td class="numero">{{ numero(produto.estoqueMin) }} · {{ numero(produto.estoqueMax) }}</td>
          </tr>
          <tr v-if="!exibidos.length">
            <td colspan="4" class="vazio">Nenhum produto com estes filtros.</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="visiveis.length > LIMITE" class="limite">
      Mostrando {{ LIMITE }} de {{ visiveis.length }}. Use os filtros para achar os demais.
    </p>
  </ComprasSecao>
</template>

<style scoped>
.conta {
  padding: 0 8px;
  border-radius: var(--cx-r-pill);
  background: var(--cx-surface-sunken);
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
  font-weight: 600;
  line-height: 20px;
}

.conta--ativa {
  background: var(--cx-brand-wash);
  color: var(--cx-brand-text);
}

.filtro {
  flex: 1 1 160px;
  min-width: 150px;
}

.filtro--busca {
  flex: 2 1 220px;
}

.barra {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-2);
  padding: 0 var(--cx-sp-5) var(--cx-sp-2);
}

.tabela {
  max-height: 520px;
  overflow: auto;
}

.tabela table {
  width: 100%;
  border-collapse: collapse;
}

.tabela th,
.tabela td {
  padding: var(--cx-sp-1) var(--cx-sp-3);
  border-top: 1px solid var(--cx-line-soft);
  text-align: left;
}

.tabela th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding-top: var(--cx-sp-2);
  padding-bottom: var(--cx-sp-2);
  border-top: 0;
  background: var(--cx-surface);
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
  font-weight: 600;
}

.tabela th:first-child,
.tabela td:first-child {
  padding-left: var(--cx-sp-4);
}

.tabela tbody tr {
  cursor: pointer;
  transition: background-color var(--cx-dur-1) var(--cx-ease);
}

.tabela tbody tr:hover {
  background: var(--cx-hover);
}

.linha--marcada {
  background: color-mix(in srgb, var(--cx-brand) 5%, var(--cx-surface));
}

.produto {
  display: inline-flex;
  align-items: center;
  gap: var(--cx-sp-2);
  color: var(--cx-ink);
  font-weight: 600;
}

.numero {
  text-align: right !important;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  padding-right: var(--cx-sp-5) !important;
}

.coluna-marca {
  width: 52px;
}

.vazio {
  padding: var(--cx-sp-6) !important;
  color: var(--cx-ink-soft);
  text-align: center !important;
}

.limite {
  margin: 0;
  padding: var(--cx-sp-2) var(--cx-sp-5) var(--cx-sp-3);
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
