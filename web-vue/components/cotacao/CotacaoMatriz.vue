<script setup lang="ts">
/**
 * Cotação por fornecedor (doc 58 §4): uma linha por produto em cotação, com as bolinhas; cada coluna conta quantos
 * fornecedores estão naquela situação ("Enviado" = para quantos foi). "Com aumento" é o que pede decisão, por isso
 * é a única coluna que se destaca, e o filtro "Para decidir" mostra só esses produtos. A linha inteira abre a
 * cotação do produto.
 */
import { COLUNAS_COTACAO, ROTULO_COLUNA_COTACAO, type ProdutoEmCotacaoDto } from "@padaria/shared";
import ComprasSecao from "~/components/compras/base/ComprasSecao.vue";
import ComprasVazio from "~/components/compras/base/ComprasVazio.vue";
import BolinhasLegenda from "~/components/compras/BolinhasLegenda.vue";
import ProdutoBolinhas from "~/components/compras/ProdutoBolinhas.vue";

const props = defineProps<{ produtos: ProdutoEmCotacaoDto[]; carregando: boolean }>();
const emit = defineEmits<{ abrir: [produto: ProdutoEmCotacaoDto] }>();

const busca = ref("");
const soDecidir = ref(false);
const paraDecidir = computed(() => props.produtos.filter((produto) => produto.celulas.com_aumento > 0).length);
const linhas = computed(() => {
  const termo = (busca.value ?? "").trim().toLocaleLowerCase("pt-BR");
  return props.produtos.filter(
    (produto) =>
      (!soDecidir.value || produto.celulas.com_aumento > 0) &&
      (!termo || produto.descricao.toLocaleLowerCase("pt-BR").includes(termo))
  );
});
</script>

<template>
  <ComprasSecao titulo="Produtos em cotação" rente data-secao="matriz-cotacao">
    <template #acoes><BolinhasLegenda /></template>
    <template #filtros>
      <v-text-field
        v-model="busca"
        placeholder="Buscar produto"
        prepend-inner-icon="mdi-magnify"
        clearable
        density="compact"
        hide-details
        aria-label="Buscar produto"
        class="matriz__busca"
        data-campo="filtro-produto"
      />
      <v-chip-group v-model="soDecidir" :mandatory="false" selected-class="matriz__filtro--ativo">
        <v-chip :value="true" variant="outlined" filter data-filtro="para-decidir">
          Para decidir <span class="matriz__filtro-conta">{{ paraDecidir }}</span>
        </v-chip>
      </v-chip-group>
    </template>

    <v-progress-linear v-if="carregando" indeterminate height="2" />
    <ComprasVazio
      v-if="!linhas.length && !carregando"
      icone="mdi-clipboard-text-search-outline"
      :titulo="produtos.length ? 'Nenhum produto com este filtro.' : 'Nenhum produto em cotação.'"
      :texto="produtos.length ? undefined : 'A Solicitação de compra e o Pedido urgente abrem as cotações.'"
    />
    <div v-else class="matriz__rolagem">
      <table class="matriz">
        <thead>
          <tr>
            <th scope="col" class="matriz__produto">Produto</th>
            <th v-for="coluna in COLUNAS_COTACAO" :key="coluna" scope="col">{{ ROTULO_COLUNA_COTACAO[coluna] }}</th>
            <th scope="col" class="matriz__seta"><span class="sr-only">Abrir</span></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="linha in linhas"
            :key="linha.produtoId"
            :data-produto="linha.descricao"
            class="matriz__linha"
            :class="{ 'matriz__linha--decidir': linha.celulas.com_aumento > 0 }"
            @click="emit('abrir', linha)"
          >
            <th scope="row" class="matriz__produto">
              <button type="button" class="matriz__nome" @click.stop="emit('abrir', linha)">
                <span>{{ linha.descricao }}</span>
                <ProdutoBolinhas
                  :mais-vende="linha.maisVende"
                  :mais-compra="linha.maisCompra"
                  :mais-lucro="linha.maisLucro"
                />
              </button>
            </th>
            <td v-for="coluna in COLUNAS_COTACAO" :key="coluna">
              <span
                v-if="linha.celulas[coluna]"
                class="matriz__numero"
                :class="`matriz__numero--${coluna}`"
                :aria-label="`${linha.descricao}: ${linha.celulas[coluna]} fornecedor(es) em ${ROTULO_COLUNA_COTACAO[coluna]}`"
                :data-celula="coluna"
                >{{ linha.celulas[coluna] }}</span
              >
              <span v-else class="matriz__zero" aria-hidden="true">–</span>
            </td>
            <td class="matriz__seta"><v-icon icon="mdi-chevron-right" size="18" /></td>
          </tr>
        </tbody>
      </table>
    </div>
  </ComprasSecao>
</template>

<style scoped>
.matriz__busca {
  flex: 1 1 260px;
  max-width: 360px;
}

.matriz__filtro-conta {
  margin-left: 6px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.matriz__filtro--ativo {
  border-color: var(--cx-attention) !important;
  color: var(--cx-attention) !important;
}

/* A tabela rola dentro do bloco no celular; a página nunca rola na horizontal. */
.matriz__rolagem {
  overflow-x: auto;
}

.matriz {
  width: 100%;
  min-width: 680px;
  border-collapse: collapse;
}

.matriz th,
.matriz td {
  padding: var(--cx-sp-3) var(--cx-sp-3);
  border-top: 1px solid var(--cx-line-soft);
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.matriz thead th {
  padding-top: var(--cx-sp-2);
  padding-bottom: var(--cx-sp-2);
  border-top: 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
  font-weight: 600;
  white-space: nowrap;
}

.matriz__produto {
  position: sticky;
  left: 0;
  z-index: 1;
  min-width: 240px;
  padding-left: var(--cx-sp-5) !important;
  background: var(--cx-surface);
  text-align: left !important;
}

.matriz__linha {
  cursor: pointer;
  transition: background-color var(--cx-dur-1) var(--cx-ease);
}

.matriz__linha:hover,
.matriz__linha:hover .matriz__produto {
  background: var(--cx-hover);
}

.matriz__linha:hover .matriz__produto {
  background: color-mix(in srgb, var(--cx-ink) 3%, var(--cx-surface));
}

.matriz__nome {
  display: inline-flex;
  align-items: center;
  gap: var(--cx-sp-2);
  padding: 0;
  border: 0;
  background: none;
  color: var(--cx-ink);
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.matriz__nome:focus-visible {
  outline: 2px solid var(--cx-focus);
  outline-offset: 3px;
  border-radius: 4px;
}

.matriz__numero {
  display: inline-block;
  min-width: 28px;
  color: var(--cx-ink);
  font-weight: 600;
}

.matriz__numero--com_aumento {
  padding: 1px 8px;
  border-radius: var(--cx-r-pill);
  background: color-mix(in srgb, var(--cx-attention) 14%, var(--cx-surface));
  color: var(--cx-attention);
  font-weight: 700;
}

.matriz__numero--comprado {
  color: var(--cx-positive);
  font-weight: 700;
}

.matriz__zero {
  color: var(--cx-line);
}

.matriz__seta {
  width: 40px;
  padding-right: var(--cx-sp-4) !important;
  color: var(--cx-ink-soft);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

@media (max-width: 599px) {
  .matriz__produto {
    min-width: 170px;
    padding-left: var(--cx-sp-4) !important;
  }
}
</style>
