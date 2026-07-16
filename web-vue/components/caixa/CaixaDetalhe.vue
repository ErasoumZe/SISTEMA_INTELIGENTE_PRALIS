<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { DetalheCaixaResponse, LinhaHistoricoCaixa } from "@padaria/shared";
import type { LancamentoCaixa } from "@padaria/shared";
import { dinheiro, mensagemErro } from "~/utils/domain";
import { formatarDataHora, formatarDataSomenteDia } from "~/utils/formatacao";

const props = defineProps<{ caixa: LinhaHistoricoCaixa; empresaId: string }>();

const { apiGet } = useApi();

const detalhe = ref<DetalheCaixaResponse | null>(null);
const carregando = ref(false);
const erro = ref("");

async function carregar() {
  carregando.value = true;
  erro.value = "";
  try {
    detalhe.value = await apiGet<DetalheCaixaResponse>(`/api/caixa/${props.caixa.id}/detalhe`);
  } catch (error) {
    erro.value = mensagemErro(error);
  } finally {
    carregando.value = false;
  }
}

// Venda integrada tem hora real (dataHora): mostra data e hora de verdade. Sem ela, so a data
// CONTABIL (date-only) — que nao pode passar por Date, sob pena de voltar um dia e inventar hora.
function dataDoLancamento(item: LancamentoCaixa) {
  return item.dataHora ? formatarDataHora(item.dataHora) : formatarDataSomenteDia(item.data);
}

function horarioAuditado(valor: { dataHoraAbertura: string | null; dataHoraFechamento: string | null }) {
  const abertura = valor.dataHoraAbertura ? formatarDataHora(valor.dataHoraAbertura) : "--";
  const fechamento = valor.dataHoraFechamento ? formatarDataHora(valor.dataHoraFechamento) : "--";
  return `${abertura} -> ${fechamento}`;
}

onMounted(carregar);
</script>

<template>
  <div>
    <v-progress-linear v-if="carregando" indeterminate />
    <v-alert v-else-if="erro" type="error" variant="tonal" density="compact">{{ erro }}</v-alert>

    <template v-else-if="detalhe">
      <!-- Lancamentos por categoria. Vem do proprio endpoint de detalhe (caixas_gerenciar): as
           rotas operacionais aplicam o escopo "somente caixa aberto" e trocariam o caixa pedido. -->
      <div class="text-subtitle-2 mb-2">Lancamentos deste caixa</div>
      <v-expansion-panels variant="accordion" class="mb-4">
        <v-expansion-panel v-for="grupo in detalhe.lancamentos" :key="grupo.categoria">
          <v-expansion-panel-title :disabled="!grupo.itens.length">
            <div class="d-flex align-center ga-3 flex-grow-1">
              <span>{{ grupo.titulo }}</span>
              <v-chip size="x-small" variant="tonal">{{ grupo.itens.length }}</v-chip>
              <v-spacer />
              <strong>{{ dinheiro(grupo.total) }}</strong>
            </div>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-table density="compact">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descricao</th>
                  <th class="text-end">Valor</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in grupo.itens" :key="item.id">
                  <td>{{ dataDoLancamento(item) }}</td>
                  <td>
                    {{ item.descricao || "--" }}
                    <v-chip v-if="item.sentido" size="x-small" variant="tonal" class="ml-2">
                      {{ item.sentido === "entrada" ? "Entrada" : "Saida" }}
                    </v-chip>
                  </td>
                  <td class="text-end">{{ dinheiro(item.valor) }}</td>
                </tr>
              </tbody>
            </v-table>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <!-- Auditoria de horario: quem mudou, quando, por que e quem autorizou. -->
      <div class="text-subtitle-2 mb-2">Alteracoes de horario</div>
      <p v-if="!detalhe.edicoes.length" class="text-body-2 text-medium-emphasis mb-4">
        Nenhuma alteracao de horario neste caixa.
      </p>
      <v-table v-else density="compact" class="mb-4">
        <thead>
          <tr>
            <th>Quando</th>
            <th>Quem alterou</th>
            <th>Autorizador</th>
            <th>Motivo</th>
            <th>De</th>
            <th>Para</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="edicao in detalhe.edicoes" :key="edicao.id">
            <td>{{ formatarDataHora(edicao.editadoEm) }}</td>
            <td>{{ edicao.editadoPorNome || "--" }}</td>
            <td>
              {{ edicao.autorizadorNome || "--" }}
              <v-chip v-if="edicao.porToken" size="x-small" variant="tonal" class="ml-2">por token</v-chip>
            </td>
            <td>{{ edicao.observacao || "--" }}</td>
            <td>{{ horarioAuditado(edicao.valoresAntigos) }}</td>
            <td>{{ horarioAuditado(edicao.valoresNovos) }}</td>
          </tr>
        </tbody>
      </v-table>

      <!-- Acerto de saldo: a diferenca vira despesa e debito do colaborador. -->
      <div class="text-subtitle-2 mb-2">Acerto de saldo</div>
      <p v-if="!detalhe.ajuste" class="text-body-2 text-medium-emphasis">Este caixa nao teve acerto de diferenca.</p>
      <v-alert v-else type="warning" variant="tonal" density="compact">
        Diferenca de <strong>{{ dinheiro(detalhe.ajuste.valorDiferenca) }}</strong> atribuida a
        <strong>{{ detalhe.ajuste.colaboradorNome || "colaborador do caixa" }}</strong>
        em {{ formatarDataHora(detalhe.ajuste.criadoEm) }}.
        <template v-if="detalhe.ajuste.observacao"> Motivo: {{ detalhe.ajuste.observacao }}</template>
      </v-alert>
    </template>
  </div>
</template>
