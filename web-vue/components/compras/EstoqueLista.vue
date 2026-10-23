<script setup lang="ts">
/**
 * A posição de estoque: um produto por linha, com onde ele fica, o saldo, a faixa mínimo / máximo e a situação.
 * Tabela no computador; no celular, cada produto vira um bloco com as mesmas informações.
 */
import type { ProdutoEstoqueDto } from "@padaria/shared";
import ComprasSituacao from "~/components/compras/base/ComprasSituacao.vue";
import ComprasVazio from "~/components/compras/base/ComprasVazio.vue";
import type { TomSituacao } from "~/utils/compras-visual";
import { formatarQuantidade } from "~/utils/formatacao";

defineProps<{ produtos: ProdutoEstoqueDto[] }>();
const emit = defineEmits<{ extrato: [produto: ProdutoEstoqueDto] }>();

function numero(valor: string | null) {
  return Number(valor ?? 0);
}
function situacao(produto: ProdutoEstoqueDto): { texto: string; tom: TomSituacao } {
  if (produto.estoqueMin !== null && numero(produto.quantidadeEstoque) <= numero(produto.estoqueMin))
    return { texto: "No mínimo", tom: "atencao" };
  if (produto.estoqueMax !== null && numero(produto.quantidadeEstoque) >= numero(produto.estoqueMax))
    return { texto: "No máximo", tom: "info" };
  if (produto.estoqueMin === null || produto.estoqueMax === null) return { texto: "Sem faixa", tom: "neutro" };
  return { texto: "Regular", tom: "positivo" };
}
const faixa = (produto: ProdutoEstoqueDto) =>
  `${produto.estoqueMin === null ? "—" : formatarQuantidade(produto.estoqueMin)} / ${
    produto.estoqueMax === null ? "—" : formatarQuantidade(produto.estoqueMax)
  }`;
const local = (produto: ProdutoEstoqueDto) =>
  [produto.localEstoque ?? "Sem local", produto.localVenda.join(", ") || "Sem local de venda"].join(" · ");
</script>

<template>
  <ComprasVazio v-if="!produtos.length" icone="mdi-package-variant" titulo="Nenhum produto com estes filtros." />
  <template v-else>
    <div class="tabela d-none d-md-block">
      <table>
        <thead>
          <tr>
            <th>Produto</th>
            <th>Onde fica</th>
            <th class="numero">Saldo</th>
            <th class="numero">Mín. / máx.</th>
            <th>Situação</th>
            <th class="acao"><span class="sr-only">Extrato</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="produto in produtos" :key="produto.id">
            <td>
              <span class="produto">{{ produto.descricao }}</span>
              <span class="sub"
                >{{ produto.grupo ?? "Sem grupo"
                }}<template v-if="produto.curvaAbc"> · curva {{ produto.curvaAbc }}</template></span
              >
            </td>
            <td>
              <span>{{ produto.areaEstoque ?? "Sem área" }}</span>
              <span class="sub">{{ local(produto) }}</span>
            </td>
            <td class="numero saldo">
              {{ formatarQuantidade(produto.quantidadeEstoque) }} {{ produto.unidade ?? "" }}
            </td>
            <td class="numero">{{ faixa(produto) }}</td>
            <td><ComprasSituacao :rotulo="situacao(produto).texto" :tom="situacao(produto).tom" /></td>
            <td class="acao">
              <v-btn size="small" variant="text" prepend-icon="mdi-history" @click="emit('extrato', produto)"
                >Extrato</v-btn
              >
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <ul class="cartoes d-md-none">
      <li v-for="produto in produtos" :key="produto.id" class="cartao">
        <div class="cartao__topo">
          <span class="produto">{{ produto.descricao }}</span>
          <ComprasSituacao :rotulo="situacao(produto).texto" :tom="situacao(produto).tom" />
        </div>
        <div class="cartao__linha">
          <span>Saldo</span
          ><strong>{{ formatarQuantidade(produto.quantidadeEstoque) }} {{ produto.unidade ?? "" }}</strong>
        </div>
        <div class="cartao__linha">
          <span>Mínimo / máximo</span><span>{{ faixa(produto) }}</span>
        </div>
        <span class="sub">{{ produto.areaEstoque ?? "Sem área" }} · {{ local(produto) }}</span>
        <v-btn size="small" variant="tonal" prepend-icon="mdi-history" @click="emit('extrato', produto)"
          >Ver extrato</v-btn
        >
      </li>
    </ul>
  </template>
</template>

<style scoped>
.tabela {
  overflow-x: auto;
}

.tabela table {
  width: 100%;
  border-collapse: collapse;
}

.tabela th,
.tabela td {
  padding: var(--cx-sp-3);
  border-top: 1px solid var(--cx-line-soft);
  text-align: left;
  vertical-align: middle;
}

.tabela th {
  padding-top: var(--cx-sp-2);
  padding-bottom: var(--cx-sp-2);
  border-top: 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
  font-weight: 600;
  white-space: nowrap;
}

.tabela th:first-child,
.tabela td:first-child {
  padding-left: var(--cx-sp-5);
}

.tabela td span {
  display: block;
}

.produto {
  color: var(--cx-ink);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.sub {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

.numero {
  text-align: right !important;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.saldo {
  color: var(--cx-ink);
  font-weight: 700;
}

.acao {
  width: 1%;
  padding-right: var(--cx-sp-4) !important;
  text-align: right !important;
}

.cartoes {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.cartao {
  display: grid;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-3) var(--cx-sp-4);
  border-top: 1px solid var(--cx-line-soft);
}

.cartao__topo,
.cartao__linha {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-2);
}

.cartao__linha {
  font-size: var(--cx-fs-body);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
