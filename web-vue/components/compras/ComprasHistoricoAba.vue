<script setup lang="ts">
import type { Opcao } from "~/types/padaria";
import { useHistoricoCompras } from "~/composables/useHistoricoCompras";

// R-222 (PROJECT_BRAIN/55): quem vende cada produto e quanto se pagou nos ultimos meses. O historico vem
// da planilha de discriminacao (analise -> pareamento -> aplicar) e, depois, do recebimento. Esta aba
// NAO altera preco-base: so mostra e alimenta o catalogo fornecedor-produto.
const props = defineProps<{ empresaId: string; fornecedores: Opcao[]; podeCriarFornecedor: boolean }>();
const emit = defineEmits<{ alterado: [] }>();

const { meses, busca, resumo, importacoes, carregando, enviando, erro, sucesso, carregar, enviarPlanilha } =
  useHistoricoCompras(toRef(props, "empresaId"));

const arquivoInput = ref<HTMLInputElement | null>(null);
const importacaoAberta = ref<string | null>(null);
const dialogImportacao = ref(false);

const JANELAS = [
  { value: 3, title: "Últimos 3 meses" },
  { value: 6, title: "Últimos 6 meses" },
  { value: 12, title: "Últimos 12 meses" }
];
const ROTULO_STATUS = { analisada: "Em análise", aplicada: "Aplicada", cancelada: "Cancelada" } as const;
const COR_STATUS = { analisada: "warning", aplicada: "success", cancelada: "default" } as const;

// Custo tem ate 4 casas (numeric(14,4)): arredondar para 2 esconderia R$ 4,308 como R$ 4,31.
const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 4 });
const DATA = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" });
const QUANTIDADE = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const moeda = (valor: string) => MOEDA.format(Number(valor));
const dia = (valor: string) => (valor ? DATA.format(new Date(`${valor}T00:00:00Z`)) : "—");

function aoAlterar() {
  carregar();
  emit("alterado");
}

function abrir(id: string) {
  importacaoAberta.value = id;
  dialogImportacao.value = true;
}

async function aoEscolherArquivo(evento: Event) {
  const arquivo = (evento.target as HTMLInputElement).files?.[0];
  if (!arquivo) return;
  const id = await enviarPlanilha(arquivo);
  if (arquivoInput.value) arquivoInput.value.value = "";
  // A analise abre sozinha: e nela que o operador resolve o que ficou pendente antes de aplicar.
  if (id) abrir(id);
}
</script>

<template>
  <div>
    <v-alert v-if="erro" type="error" variant="tonal" closable class="mb-3" @click:close="erro = ''">{{
      erro
    }}</v-alert>
    <v-alert v-if="sucesso" type="success" variant="tonal" closable class="mb-3" @click:close="sucesso = ''">{{
      sucesso
    }}</v-alert>
    <v-progress-linear v-if="carregando" indeterminate class="mb-3" />

    <div class="historico__barra">
      <v-select
        v-model="meses"
        :items="JANELAS"
        label="Período"
        density="comfortable"
        hide-details
        class="historico__periodo"
      />
      <v-text-field
        v-model="busca"
        label="Buscar produto ou fornecedor"
        prepend-inner-icon="mdi-magnify"
        density="comfortable"
        clearable
        hide-details
        class="historico__busca"
      />
      <v-btn
        prepend-icon="mdi-file-delimited-outline"
        color="primary"
        :loading="enviando"
        @click="arquivoInput?.click()"
        >Importar planilha</v-btn
      >
      <input ref="arquivoInput" class="d-none" type="file" accept=".xlsx,.csv" @change="aoEscolherArquivo" />
    </div>
    <p class="text-caption text-medium-emphasis mb-3">
      Planilha de discriminação com as colunas PRODUTOS, FORNECEDOR (ou REFERÊNCIA), QUANT, VALOR CUSTO UN e DATA REF.
      Envie só a aba de compras, em .xlsx ou .csv (até 50 MB). Nada entra no histórico antes de você conferir e aplicar.
    </p>

    <div class="responsive-table-shell">
      <v-table density="comfortable">
        <thead>
          <tr>
            <th>Produto</th>
            <th>Fornecedor</th>
            <th>Última compra</th>
            <th class="text-right">Último custo</th>
            <th class="text-right">Menor</th>
            <th class="text-right">Maior</th>
            <th class="text-right">Compras</th>
            <th class="text-right">Quantidade</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="linha in resumo?.linhas ?? []" :key="`${linha.fornecedorId}-${linha.produtoId}`">
            <td>{{ linha.produtoDescricao }}</td>
            <td>{{ linha.fornecedorNome }}</td>
            <td>{{ dia(linha.ultimaCompraEm) }}</td>
            <td class="text-right font-weight-medium">{{ moeda(linha.ultimoCusto) }}</td>
            <td class="text-right">{{ moeda(linha.menorCusto) }}</td>
            <td class="text-right">{{ moeda(linha.maiorCusto) }}</td>
            <td class="text-right">{{ linha.compras }}</td>
            <td class="text-right">{{ QUANTIDADE.format(Number(linha.quantidadeTotal)) }}</td>
          </tr>
          <!-- `!erro`: a lista e limpa quando a carga falha, e "sem compras" nao pode aparecer ao lado do erro. -->
          <tr v-if="!carregando && !erro && !(resumo?.linhas.length ?? 0)">
            <td colspan="8" class="text-center text-medium-emphasis py-6">
              Nenhuma compra no período. Importe a planilha de discriminação para começar.
            </td>
          </tr>
        </tbody>
      </v-table>
    </div>
    <p v-if="resumo && resumo.total > resumo.linhas.length" class="text-caption text-medium-emphasis mt-2">
      Mostrando {{ resumo.linhas.length }} de {{ resumo.total }} pares fornecedor–produto, das compras mais recentes
      para as mais antigas. Use a busca para achar os demais.
    </p>

    <h3 class="text-subtitle-1 mt-6 mb-2">Importações</h3>
    <div class="responsive-table-shell">
      <v-table density="comfortable">
        <thead>
          <tr>
            <th>Arquivo</th>
            <th>Período</th>
            <th>Status</th>
            <th class="text-right">Pareadas</th>
            <th class="text-right">Pendentes</th>
            <th class="text-right">Aplicadas</th>
            <th class="text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in importacoes" :key="item.id">
            <td>{{ item.nomeArquivo }}</td>
            <td>{{ item.periodoInicio ? `${dia(item.periodoInicio)} a ${dia(item.periodoFim ?? "")}` : "—" }}</td>
            <td>
              <v-chip size="small" label :color="COR_STATUS[item.status]">{{ ROTULO_STATUS[item.status] }}</v-chip>
            </td>
            <td class="text-right">{{ item.totalPareadas }}/{{ item.totalLinhas }}</td>
            <td class="text-right">{{ item.totalPendentes }}</td>
            <td class="text-right">{{ item.totalAplicadas }}</td>
            <td class="text-right">
              <v-btn size="small" variant="tonal" @click="abrir(item.id)">Abrir</v-btn>
            </td>
          </tr>
          <tr v-if="!carregando && !erro && !importacoes.length">
            <td colspan="7" class="text-center text-medium-emphasis py-6">Nenhuma planilha importada.</td>
          </tr>
        </tbody>
      </v-table>
    </div>

    <ComprasHistoricoImportacaoDialog
      v-model="dialogImportacao"
      :empresa-id="empresaId"
      :importacao-id="importacaoAberta"
      :fornecedores="fornecedores"
      :pode-criar-fornecedor="podeCriarFornecedor"
      @alterado="aoAlterar"
    />
  </div>
</template>

<style scoped>
.historico__barra {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin: 12px 0 4px;
}
.historico__periodo {
  flex: 0 1 200px;
  min-width: 0;
}
.historico__busca {
  flex: 1 1 240px;
  min-width: 0;
}
</style>
