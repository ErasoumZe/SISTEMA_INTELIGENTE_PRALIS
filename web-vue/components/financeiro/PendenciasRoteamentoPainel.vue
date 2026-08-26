<script setup lang="ts">
// R-168/R-173 (#152) — o que ficou sem destino financeiro.
//
// Duas metades, cada uma atras da SUA permissao, e a distincao importa na tela:
//   `null`        = "voce nao ve isto"  -> a secao nem aparece;
//   lista vazia   = "nao ha nada"       -> aparece como estado VAZIO, que e uma boa noticia.
// Tratar os dois como a mesma coisa esconderia de um Admin que ha 300 vendas paradas.
import { computed, onMounted, ref, watch } from "vue";
import { useApi } from "~/composables/useApi";

type FormaSemRoteamento = { id: string; nome: string };
type VendaPendente = {
  vendaId: string;
  identificadorExterno: string | null;
  dataReferencia: string;
  pdv: string | null;
  formaPagamento: string | null;
  valor: number;
};
type Pendencias = {
  formasSemRoteamento: FormaSemRoteamento[] | null;
  vendasPendentes: {
    totalPagamentos: number;
    totalVendas: number;
    valorTotal: number;
    listaTruncada: boolean;
    itens: VendaPendente[];
  } | null;
};

const props = defineProps<{ empresaId: string }>();
const emit = defineEmits<{ (event: "configurar", forma: FormaSemRoteamento): void }>();

const { apiGet } = useApi();

const carregando = ref(false);
const semPermissao = ref(false);
const erro = ref("");
const dados = ref<Pendencias | null>(null);

async function carregar() {
  if (!props.empresaId) return;
  carregando.value = true;
  erro.value = "";
  semPermissao.value = false;
  try {
    dados.value = await apiGet<Pendencias>(`/api/roteamento/pendencias?empresaId=${props.empresaId}`);
  } catch (falha) {
    const mensagem = falha instanceof Error ? falha.message : "";
    // SEM PERMISSAO e um estado proprio, e nao um erro: nao ha "tentar de novo" que resolva.
    if (/permiss/iu.test(mensagem)) semPermissao.value = true;
    else erro.value = "Nao foi possivel carregar as pendencias financeiras.";
    dados.value = null;
  } finally {
    carregando.value = false;
  }
}

onMounted(carregar);
watch(() => props.empresaId, carregar);
defineExpose({ carregar });

const dinheiro = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const formas = computed(() => dados.value?.formasSemRoteamento ?? null);
const vendas = computed(() => dados.value?.vendasPendentes ?? null);
const nadaPendente = computed(
  () => (formas.value?.length ?? 0) === 0 && (vendas.value?.totalPagamentos ?? 0) === 0 && !semPermissao.value
);
</script>

<template>
  <section class="pendencias" aria-label="Pendências de roteamento financeiro">
    <!-- CARREGANDO -->
    <div v-if="carregando" class="py-8 text-center">
      <v-progress-circular indeterminate color="primary" aria-label="Carregando pendências financeiras" />
    </div>

    <!-- SEM PERMISSAO -->
    <v-alert v-else-if="semPermissao" type="info" variant="tonal" density="comfortable">
      Você não tem permissão para ver as pendências de roteamento financeiro.
    </v-alert>

    <!-- ERRO com nova tentativa -->
    <v-alert v-else-if="erro" type="error" variant="tonal" density="comfortable">
      {{ erro }}
      <template #append>
        <v-btn size="small" variant="text" @click="carregar">Tentar de novo</v-btn>
      </template>
    </v-alert>

    <template v-else>
      <!-- VAZIO: boa noticia, e merece ser dita com todas as letras. -->
      <v-alert v-if="nadaPendente" type="success" variant="tonal" density="comfortable">
        Nenhuma pendência de roteamento. Toda venda integrada tem destino financeiro definido.
      </v-alert>

      <!-- BLOQUEADO: ha forma sem configuracao, entao ha venda que nao vira saldo. -->
      <div v-if="formas && formas.length" class="bloco">
        <h3 class="text-subtitle-1 font-weight-medium mb-1">Formas sem roteamento configurado</h3>
        <p class="text-body-2 text-medium-emphasis mb-3">
          Enquanto estiverem aqui, toda venda paga por elas fica pendente e <strong>não entra em saldo</strong>.
        </p>
        <ul class="lista">
          <li v-for="forma in formas" :key="forma.id" class="linha">
            <span class="nome">{{ forma.nome }}</span>
            <v-btn size="small" variant="tonal" color="primary" @click="emit('configurar', forma)">Configurar</v-btn>
          </li>
        </ul>
      </div>

      <div v-if="vendas && vendas.totalPagamentos > 0" class="bloco">
        <h3 class="text-subtitle-1 font-weight-medium mb-1">Vendas com pagamento pendente</h3>
        <p class="text-body-2 text-medium-emphasis mb-3">
          {{ vendas.totalVendas }} venda(s), {{ vendas.totalPagamentos }} pagamento(s),
          <strong>{{ dinheiro.format(vendas.valorTotal) }}</strong> fora de conta.
        </p>
        <div class="tabela-rolagem">
          <v-table density="compact">
            <thead>
              <tr>
                <th scope="col">Data</th>
                <th scope="col">PDV</th>
                <th scope="col">Forma</th>
                <th scope="col" class="text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in vendas.itens" :key="`${item.vendaId}-${item.formaPagamento}-${item.valor}`">
                <td>{{ item.dataReferencia }}</td>
                <td>{{ item.pdv ?? "—" }}</td>
                <td>{{ item.formaPagamento ?? "—" }}</td>
                <td class="text-right">{{ dinheiro.format(item.valor) }}</td>
              </tr>
            </tbody>
          </v-table>
        </div>
        <!-- Contador truncado em silencio e pior do que nao ter contador. -->
        <p v-if="vendas.listaTruncada" class="text-caption text-medium-emphasis mt-2">
          Mostrando as {{ vendas.itens.length }} mais recentes de {{ vendas.totalPagamentos }}.
        </p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.pendencias {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 100%;
}

.bloco {
  max-width: 100%;
}

.lista {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.linha {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgb(var(--v-theme-surface-variant), 0.35);
}

.nome {
  font-weight: 500;
  overflow-wrap: anywhere;
}

/* 390px: a tabela rola dentro do proprio bloco; a PAGINA nunca rola para os lados. */
.tabela-rolagem {
  overflow-x: auto;
  max-width: 100%;
}
</style>
