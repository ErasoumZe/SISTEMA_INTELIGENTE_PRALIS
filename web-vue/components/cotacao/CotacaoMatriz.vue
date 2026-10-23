<script setup lang="ts">
/**
 * Cotação por fornecedor (doc 58 §4): uma linha por produto em cotação, com as bolinhas; cada coluna conta
 * quantos fornecedores estão naquela situação ("Enviado" = para quantos foi). Tocar no produto ou num número
 * abre a cotação do produto.
 */
import { COLUNAS_COTACAO, ROTULO_COLUNA_COTACAO, celulasZeradas, type ProdutoEmCotacaoDto } from "@padaria/shared";
import BolinhasLegenda from "~/components/compras/BolinhasLegenda.vue";
import ProdutoBolinhas from "~/components/compras/ProdutoBolinhas.vue";
import { COR_SITUACAO } from "~/utils/cotacao-produto";

const props = defineProps<{ produtos: ProdutoEmCotacaoDto[]; carregando: boolean }>();
const emit = defineEmits<{ abrir: [produto: ProdutoEmCotacaoDto] }>();

const busca = ref("");
const linhas = computed(() => {
  const termo = busca.value.trim().toLocaleLowerCase("pt-BR");
  return termo
    ? props.produtos.filter((produto) => produto.descricao.toLocaleLowerCase("pt-BR").includes(termo))
    : props.produtos;
});
const totais = computed(() => {
  const soma = celulasZeradas();
  for (const linha of linhas.value) for (const coluna of COLUNAS_COTACAO) soma[coluna] += linha.celulas[coluna];
  return soma;
});
</script>

<template>
  <v-card class="matriz" data-secao="matriz-cotacao">
    <v-card-title class="matriz__topo">
      <div>
        <h2 class="matriz__titulo">Produtos em cotação</h2>
        <p class="matriz__subtitulo">Cada número é a quantidade de fornecedores naquela situação.</p>
        <BolinhasLegenda class="mt-1" />
      </div>
      <v-text-field
        v-model="busca"
        label="Produto"
        placeholder="Buscar"
        prepend-inner-icon="mdi-magnify"
        clearable
        density="compact"
        hide-details
        class="matriz__filtro"
        data-campo="filtro-produto"
      />
    </v-card-title>
    <v-progress-linear v-if="carregando" indeterminate />
    <div v-if="!linhas.length && !carregando" class="matriz__vazio">
      <v-icon icon="mdi-inbox-outline" size="32" />
      <p>Nenhum produto em cotação. A Solicitação de compra e o Pedido urgente abrem as cotações.</p>
    </div>
    <div v-else class="matriz__rolagem">
      <table class="matriz__tabela">
        <thead>
          <tr>
            <th scope="col" class="matriz__produto">Produto</th>
            <th v-for="coluna in COLUNAS_COTACAO" :key="coluna" scope="col">{{ ROTULO_COLUNA_COTACAO[coluna] }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="linha in linhas" :key="linha.produtoId" :data-produto="linha.descricao">
            <th scope="row" class="matriz__produto">
              <button type="button" class="matriz__nome" @click="emit('abrir', linha)">
                <ProdutoBolinhas
                  :mais-vende="linha.maisVende"
                  :mais-compra="linha.maisCompra"
                  :mais-lucro="linha.maisLucro"
                />
                <span>{{ linha.descricao }}</span>
              </button>
            </th>
            <td v-for="coluna in COLUNAS_COTACAO" :key="coluna">
              <v-btn
                v-if="linha.celulas[coluna]"
                size="small"
                variant="tonal"
                :color="COR_SITUACAO[coluna]"
                class="matriz__numero"
                :aria-label="`${linha.descricao}: ${linha.celulas[coluna]} fornecedor(es) em ${ROTULO_COLUNA_COTACAO[coluna]}`"
                :data-celula="coluna"
                @click="emit('abrir', linha)"
                >{{ linha.celulas[coluna] }}</v-btn
              >
              <span v-else class="matriz__zero" aria-hidden="true">·</span>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" class="matriz__produto">Total</th>
            <td v-for="coluna in COLUNAS_COTACAO" :key="coluna" class="matriz__total">{{ totais[coluna] }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </v-card>
</template>

<style scoped>
.matriz {
  overflow: hidden;
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-xl);
  background: var(--cx-surface-raised);
}

.matriz__topo {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-5) var(--cx-sp-6);
  white-space: normal;
}

.matriz__titulo {
  color: var(--cx-ink);
  font-size: var(--cx-fs-title);
  font-weight: 650;
}

.matriz__subtitulo {
  margin: var(--cx-sp-1) 0 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

.matriz__filtro {
  flex: 0 1 280px;
  min-width: 200px;
}

/* A tabela rola dentro do cartão no celular; a página nunca rola na horizontal. */
.matriz__rolagem {
  overflow-x: auto;
  border-top: 1px solid var(--cx-line-soft);
}

.matriz__tabela {
  width: 100%;
  min-width: 680px;
  border-collapse: collapse;
}

.matriz__tabela th,
.matriz__tabela td {
  padding: var(--cx-sp-2) var(--cx-sp-3);
  border-bottom: 1px solid var(--cx-line-soft);
  text-align: center;
}

.matriz__tabela thead th {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-micro);
  font-weight: 700;
  letter-spacing: var(--cx-tracking-wide);
  text-transform: uppercase;
}

.matriz__produto {
  position: sticky;
  left: 0;
  z-index: 1;
  min-width: 200px;
  background: var(--cx-surface-raised);
  text-align: left !important;
  font-weight: 600;
}

.matriz__nome {
  display: inline-flex;
  align-items: center;
  gap: var(--cx-sp-2);
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.matriz__nome:hover span,
.matriz__nome:focus-visible span {
  text-decoration: underline;
}

.matriz__numero {
  min-width: 44px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.matriz__zero {
  color: var(--cx-line);
}

.matriz__total {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.matriz__vazio {
  display: grid;
  justify-items: center;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-8) var(--cx-sp-6);
  color: var(--cx-ink-soft);
  text-align: center;
}
</style>
