<script setup lang="ts">
import BolinhasLegenda from "~/components/compras/BolinhasLegenda.vue";
import ProdutoBolinhas from "~/components/compras/ProdutoBolinhas.vue";
import type { GrupoAgendamentoDto, ProdutoAgendamentoDto } from "@padaria/shared";

// A lista de produtos do agendamento (doc 56 §2.1): filtros por grupo/subgrupo, área, local de estoque e
// local de venda; marca o que entra no pedido; bolinhas verde (mais vende), amarela (mais compramos) e
// azul (mais lucro) — top 20% dos últimos 3 meses.
const props = defineProps<{ produtos: ProdutoAgendamentoDto[]; grupos: GrupoAgendamentoDto[] }>();
/** produtoId -> quantidade padrão ("" = sugestão do estoque na data). */
const selecionados = defineModel<Record<string, string>>({ required: true });

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
      (!somenteMarcados.value || produto.id in selecionados.value) &&
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
const totalMarcados = computed(() => Object.keys(selecionados.value).length);

function alternar(produto: ProdutoAgendamentoDto) {
  const copia = { ...selecionados.value };
  if (produto.id in copia) delete copia[produto.id];
  else copia[produto.id] = "";
  selecionados.value = copia;
}
function marcarVisiveis() {
  const copia = { ...selecionados.value };
  for (const produto of exibidos.value) if (!(produto.id in copia)) copia[produto.id] = "";
  selecionados.value = copia;
}
function definirQuantidade(produtoId: string, valor: string) {
  selecionados.value = { ...selecionados.value, [produtoId]: valor };
}
const numero = (valor: string | null) =>
  valor === null ? "—" : Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
</script>

<template>
  <v-card variant="outlined">
    <v-card-title class="d-flex align-center ga-2 flex-wrap">
      <v-icon icon="mdi-format-list-checks" color="primary" />
      <span>Produtos</span>
      <v-chip size="small" label color="primary" variant="tonal">{{ totalMarcados }} marcado(s)</v-chip>
    </v-card-title>
    <v-card-text class="d-grid ga-3">
      <div class="filtros">
        <v-select
          v-model="filtro.grupo"
          :items="gruposPai"
          item-title="nome"
          item-value="id"
          label="Grupo"
          clearable
          hide-details
        />
        <v-select
          v-model="filtro.subgrupo"
          :items="subgrupos"
          item-title="nome"
          item-value="id"
          label="Subgrupo"
          clearable
          hide-details
          :disabled="!subgrupos.length"
        />
        <v-select v-model="filtro.area" :items="areas" label="Área / setor da loja" clearable hide-details />
        <v-select
          v-model="filtro.localEstoque"
          :items="locaisEstoque"
          label="Local de estoque"
          clearable
          hide-details
        />
        <v-select v-model="filtro.localVenda" :items="locaisVenda" label="Local de venda" clearable hide-details />
        <v-text-field
          v-model="filtro.busca"
          label="Buscar produto"
          prepend-inner-icon="mdi-magnify"
          clearable
          hide-details
        />
      </div>

      <div class="d-flex align-center flex-wrap ga-4 text-body-2" data-secao="legenda">
        <BolinhasLegenda />
        <v-spacer />
        <v-switch v-model="somenteMarcados" label="Só os marcados" color="primary" density="compact" hide-details />
        <v-btn size="small" variant="text" :disabled="!exibidos.length" @click="marcarVisiveis"
          >Marcar os listados</v-btn
        >
      </div>

      <div class="responsive-table-shell">
        <v-table density="compact">
          <thead>
            <tr>
              <th class="coluna-marca"><span class="sr-only">Marcar</span></th>
              <th>Produto</th>
              <th>Legenda</th>
              <th class="text-right">Saldo</th>
              <th class="text-right">Mín · Máx</th>
              <th>Quantidade padrão</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="produto in exibidos" :key="produto.id" :data-produto="produto.id">
              <td>
                <v-checkbox-btn
                  :model-value="produto.id in selecionados"
                  :aria-label="`Marcar ${produto.descricao}`"
                  @update:model-value="alternar(produto)"
                />
              </td>
              <td>{{ produto.descricao }}</td>
              <td>
                <ProdutoBolinhas
                  :mais-vende="produto.maisVende"
                  :mais-compra="produto.maisCompra"
                  :mais-lucro="produto.maisLucro"
                />
              </td>
              <td class="text-right">{{ numero(produto.quantidadeEstoque) }} {{ produto.unidade ?? "" }}</td>
              <td class="text-right">{{ numero(produto.estoqueMin) }} · {{ numero(produto.estoqueMax) }}</td>
              <td>
                <v-text-field
                  v-if="produto.id in selecionados"
                  :model-value="selecionados[produto.id]"
                  type="number"
                  min="0"
                  density="compact"
                  hide-details
                  placeholder="Sugestão do estoque"
                  :aria-label="`Quantidade padrão de ${produto.descricao}`"
                  class="campo-quantidade"
                  @update:model-value="(valor: string) => definirQuantidade(produto.id, valor)"
                />
              </td>
            </tr>
            <tr v-if="!exibidos.length">
              <td colspan="6" class="text-center text-medium-emphasis py-6">Nenhum produto com estes filtros.</td>
            </tr>
          </tbody>
        </v-table>
      </div>
      <p v-if="visiveis.length > LIMITE" class="text-caption text-medium-emphasis mb-0">
        Mostrando {{ LIMITE }} de {{ visiveis.length }}. Use os filtros para achar os demais.
      </p>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.filtros {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}
.coluna-marca {
  width: 48px;
}
.campo-quantidade {
  max-width: 160px;
  min-width: 110px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
