<script setup lang="ts">
import {
  formatarDecimalQuestor,
  ROTAS_EXPORTACAO_QUESTOR,
  ROTAS_QUESTOR,
  questorEventosVariaveisLancamentoSchema,
  type ContratoColaboradorQuestorDto,
  type QuestorEstadoExportacaoDto,
  type QuestorEventoVariavelDto,
  type QuestorLancamentoVariavelDto
} from "@padaria/shared";
import QuestorEventosArquivo from "~/components/conplus/QuestorEventosArquivo.vue";
import QuestorEventosCatalogo from "~/components/conplus/QuestorEventosCatalogo.vue";
import { ErroApiCliente } from "~/composables/useApi";

defineProps<{ estado: QuestorEstadoExportacaoDto | null }>();
const emit = defineEmits<{ gerado: [] }>();
const cancelando = ref<QuestorLancamentoVariavelDto | null>(null);
const motivoCancelamento = ref("");

const { apiGet, apiPost, apiDelete } = useApi();
const eventos = ref<QuestorEventoVariavelDto[]>([]);
const colaboradores = ref<ContratoColaboradorQuestorDto[]>([]);
const mes = ref(new Date().toISOString().slice(0, 7));
const competencia = computed(() => `${mes.value}-01`);
const lancamentos = ref<QuestorLancamentoVariavelDto[]>([]);
const selecionados = ref<string[]>([]);
const novo = reactive({ vinculoId: "", eventoId: "", unidade: "", valor: "" });
const ocupado = ref("");
const erro = ref("");

const eventosAtivos = computed(() => eventos.value.filter((evento) => evento.ativo));
const unidadesDoEvento = computed(() => eventos.value.find((evento) => evento.id === novo.eventoId)?.unidades ?? []);
const opcoesColaborador = computed(() =>
  colaboradores.value
    .filter((item) => item.status === "ativo")
    .map((item) => ({ title: `${item.colaboradorNome} (${item.matricula})`, value: item.vinculoId }))
);
const opcoesEvento = computed(() =>
  eventosAtivos.value.map((evento) => ({ title: `${evento.codigo} — ${evento.descricao}`, value: evento.id }))
);

function falhou(falha: unknown, padrao: string) {
  erro.value = falha instanceof ErroApiCliente ? falha.message : padrao;
}

async function carregarLancamentos() {
  try {
    lancamentos.value = await apiGet<QuestorLancamentoVariavelDto[]>(
      `${ROTAS_EXPORTACAO_QUESTOR.lancamentos}?competencia=${competencia.value}`
    );
    selecionados.value = lancamentos.value.filter((item) => !item.exportado).map((item) => item.id);
  } catch (falha) {
    falhou(falha, "Lançamentos indisponíveis.");
  }
}

async function lancar() {
  const dados = questorEventosVariaveisLancamentoSchema.safeParse({
    ...novo,
    competencia: competencia.value,
    valor: novo.valor.replace(",", ".")
  });
  if (!dados.success) {
    erro.value = dados.error.issues[0]?.message ?? "Lançamento inválido.";
    return;
  }
  ocupado.value = "lancar";
  erro.value = "";
  try {
    await apiPost(ROTAS_EXPORTACAO_QUESTOR.lancamentos, dados.data);
    novo.valor = "";
    await carregarLancamentos();
  } catch (falha) {
    falhou(falha, "Não foi possível lançar.");
  } finally {
    ocupado.value = "";
  }
}

async function remover(item: QuestorLancamentoVariavelDto) {
  erro.value = "";
  try {
    await apiDelete(ROTAS_EXPORTACAO_QUESTOR.lancamento.replace(":id", item.id));
    await carregarLancamentos();
  } catch (falha) {
    falhou(falha, "Não foi possível remover.");
  }
}

async function confirmarCancelamento() {
  if (!cancelando.value) return;
  erro.value = "";
  try {
    await apiPost(ROTAS_EXPORTACAO_QUESTOR.lancamentoCancelar.replace(":id", cancelando.value.id), {
      motivo: motivoCancelamento.value
    });
    cancelando.value = null;
    motivoCancelamento.value = "";
    await carregarLancamentos();
  } catch (falha) {
    falhou(falha, "Não foi possível cancelar.");
  }
}

watch(mes, () => void carregarLancamentos());
async function aposGerar() {
  await carregarLancamentos();
  emit("gerado");
}
watch(unidadesDoEvento, (unidades) => (novo.unidade = unidades.length === 1 ? unidades[0]! : ""));
onMounted(async () => {
  await carregarLancamentos();
  try {
    colaboradores.value = await apiGet<ContratoColaboradorQuestorDto[]>(ROTAS_QUESTOR.contratosColaboradores);
  } catch (falha) {
    falhou(falha, "Lista de colaboradores indisponível.");
  }
});
</script>

<template>
  <v-card variant="outlined">
    <v-card-title>Eventos variáveis</v-card-title>
    <v-card-text class="eventos">
      <v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>
      <QuestorEventosCatalogo v-model="eventos" />

      <v-divider />
      <div class="eventos__form">
        <v-text-field v-model="mes" type="month" label="Competência" density="compact" hide-details />
        <v-autocomplete
          v-model="novo.vinculoId"
          :items="opcoesColaborador"
          label="Colaborador"
          density="compact"
          hide-details
        />
        <v-select v-model="novo.eventoId" :items="opcoesEvento" label="Evento" density="compact" hide-details />
        <v-select v-model="novo.unidade" :items="unidadesDoEvento" label="Letra" density="compact" hide-details />
        <v-text-field v-model="novo.valor" label="Valor" inputmode="decimal" density="compact" hide-details />
        <v-btn color="primary" variant="tonal" :loading="ocupado === 'lancar'" @click="lancar">Lançar</v-btn>
      </div>
      <p class="muted">
        Valor com até 2 casas. H e R (horas, dias) vão na coluna de referência; V (valor em reais) na de valor. Horas na
        convenção da empresa no Questor: com hora centesimal 1,50 = 1h30; sem, 1,30 = 1h30.
      </p>

      <div class="responsive-table-shell">
        <v-table density="compact">
          <thead>
            <tr>
              <th />
              <th>Colaborador</th>
              <th>Contrato Questor</th>
              <th>Evento</th>
              <th>Valor</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in lancamentos" :key="item.id">
              <td>
                <v-checkbox-btn
                  v-model="selecionados"
                  :value="item.id"
                  :aria-label="`Selecionar ${item.colaboradorNome}`"
                />
              </td>
              <td>{{ item.colaboradorNome }}</td>
              <td>{{ item.questorCodigoContrato ?? "sem código" }}</td>
              <td>{{ item.eventoCodigo }} {{ item.unidade }}</td>
              <td>{{ formatarDecimalQuestor(item.valor) ?? item.valor }}</td>
              <td class="text-end">
                <v-chip v-if="item.exportado" size="x-small" color="success" variant="tonal"
                  >Exportado (oficial)</v-chip
                >
                <v-btn
                  v-else-if="item.emArquivoTecnico"
                  size="x-small"
                  color="warning"
                  variant="tonal"
                  :aria-label="`Cancelar lançamento de ${item.colaboradorNome}`"
                  @click="cancelando = item"
                  >Em técnico · cancelar</v-btn
                >
                <v-btn
                  v-else
                  icon="mdi-delete-outline"
                  variant="text"
                  size="small"
                  :aria-label="`Remover lançamento de ${item.colaboradorNome}`"
                  @click="remover(item)"
                />
              </td>
            </tr>
            <tr v-if="!lancamentos.length">
              <td colspan="6" class="text-center muted">Nenhum lançamento nesta competência.</td>
            </tr>
          </tbody>
        </v-table>
      </div>

      <QuestorEventosArquivo
        :competencia="competencia"
        :lancamento-ids="selecionados"
        :estado="estado"
        @gerado="aposGerar"
      />
      <v-dialog :model-value="!!cancelando" max-width="480" @update:model-value="cancelando = null">
        <v-card v-if="cancelando">
          <v-card-title>Cancelar lançamento</v-card-title>
          <v-card-text>
            <p>
              {{ cancelando.colaboradorNome }} · evento {{ cancelando.eventoCodigo }}. Já saiu em arquivo técnico: fica
              no histórico como cancelado e deixa de entrar nos arquivos. Depois, o evento pode ser lançado de novo.
            </p>
            <v-text-field v-model="motivoCancelamento" label="Motivo (mínimo 5 caracteres)" maxlength="500" />
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn variant="text" @click="cancelando = null">Voltar</v-btn>
            <v-btn color="warning" :disabled="motivoCancelamento.trim().length < 5" @click="confirmarCancelamento"
              >Cancelar lançamento</v-btn
            >
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.eventos {
  display: grid;
  gap: 12px;
  min-width: 0;
}
.eventos > * {
  min-width: 0;
}
.eventos__form {
  display: grid;
  grid-template-columns: 150px minmax(0, 1.4fr) minmax(0, 1.2fr) 90px 110px auto;
  gap: 8px;
  align-items: center;
}
.muted {
  color: rgba(var(--v-theme-on-surface), 0.68);
  margin: 0;
}
@media (max-width: 1100px) {
  .eventos__form {
    grid-template-columns: 1fr 1fr 1fr;
  }
}
@media (max-width: 600px) {
  .eventos__form {
    grid-template-columns: 1fr;
  }
}
</style>
