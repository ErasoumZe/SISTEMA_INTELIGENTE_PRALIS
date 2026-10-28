<script setup lang="ts">
/**
 * Agendamento de conferência de estoque (doc 57 §1): o recorte (grupo/subgrupo, ranking, área e locais),
 * quem conta, quando começa e a repetição — a mesma do agendamento de pedido. Na data, quem conta recebe o
 * aviso no sino e a lista de produtos com o saldo do sistema.
 */
import {
  ROTULO_RANKING_CONFERENCIA,
  rankingsConferencia,
  type ConferenciaAgendaDto,
  type ConferenciaAgendaPayload,
  type OpcoesConferenciaDto,
  type RankingConferencia,
  type RegraRecorrencia,
  type TerminoRecorrencia
} from "@padaria/shared";
import ComprasSecao from "~/components/compras/base/ComprasSecao.vue";
import RecorrenciaCampo from "~/components/compras/RecorrenciaCampo.vue";

const props = defineProps<{
  empresaId: string;
  opcoes: OpcoesConferenciaDto;
  editando: ConferenciaAgendaDto | null;
  salvando: boolean;
}>();
const emit = defineEmits<{ salvar: [payload: ConferenciaAgendaPayload]; cancelar: [] }>();

const DIA_LOCAL = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
const hoje = () => DIA_LOCAL.format(new Date());
const amanha = () => DIA_LOCAL.format(new Date(Date.now() + 86_400_000));

// Vazio e null: com "" o Vuetify trata o campo como preenchido e mostra o "x" de limpar.
const form = reactive({
  grupo: null as string | null,
  subgrupo: null as string | null,
  ranking: null as RankingConferencia | null,
  areaEstoque: null as string | null,
  localEstoque: null as string | null,
  localVenda: null as string | null,
  responsavelId: null as string | null,
  inicioData: amanha(),
  inicioHora: "07:00",
  observacao: ""
});
const regra = ref<RegraRecorrencia>({ tipo: "padrao", frequencia: "semanal", intervalo: 1 });
const termino = ref<TerminoRecorrencia>({ tipo: "nunca" });
const erro = ref("");

const gruposPai = computed(() => props.opcoes.grupos.filter((grupo) => !grupo.grupoPaiId));
const subgrupos = computed(() =>
  props.opcoes.grupos.filter((grupo) => grupo.grupoPaiId && grupo.grupoPaiId === form.grupo)
);

function limpar() {
  Object.assign(form, {
    grupo: null,
    subgrupo: null,
    ranking: null,
    areaEstoque: null,
    localEstoque: null,
    localVenda: null,
    responsavelId: null,
    inicioData: amanha(),
    inicioHora: "07:00",
    observacao: ""
  });
  regra.value = { tipo: "padrao", frequencia: "semanal", intervalo: 1 };
  termino.value = { tipo: "nunca" };
  erro.value = "";
}

watch(
  () => props.editando,
  (agenda) => {
    if (!agenda) return limpar();
    const grupo = props.opcoes.grupos.find((item) => item.id === agenda.grupoMercadoriaId);
    Object.assign(form, {
      grupo: grupo?.grupoPaiId ?? agenda.grupoMercadoriaId,
      subgrupo: grupo?.grupoPaiId ? agenda.grupoMercadoriaId : null,
      ranking: agenda.ranking,
      areaEstoque: agenda.areaEstoque,
      localEstoque: agenda.localEstoque,
      localVenda: agenda.localVenda,
      responsavelId: agenda.responsavelId,
      inicioData: agenda.inicioData,
      inicioHora: agenda.inicioHora,
      observacao: agenda.observacao ?? ""
    });
    regra.value = agenda.regra;
    termino.value = agenda.termino;
  },
  { immediate: true }
);
watch(
  () => form.grupo,
  () => {
    if (!subgrupos.value.some((item) => item.id === form.subgrupo)) form.subgrupo = null;
  }
);

function alternarRanking(ranking: RankingConferencia) {
  form.ranking = form.ranking === ranking ? null : ranking;
}

function salvar() {
  erro.value = "";
  if (!form.responsavelId) return void (erro.value = "Escolha quem vai contar.");
  if (!form.inicioData || !form.inicioHora)
    return void (erro.value = "Informe a data e a hora da primeira conferência.");
  emit("salvar", {
    empresaId: props.empresaId,
    responsavelId: form.responsavelId,
    grupoMercadoriaId: form.subgrupo || form.grupo || null,
    ranking: form.ranking,
    areaEstoque: form.areaEstoque || null,
    localEstoque: form.localEstoque || null,
    localVenda: form.localVenda || null,
    inicioData: form.inicioData,
    inicioHora: form.inicioHora,
    regra: regra.value,
    termino: termino.value,
    observacao: form.observacao || null
  });
}

defineExpose({ limpar });
</script>

<template>
  <ComprasSecao
    :titulo="editando ? 'Editar agendamento de conferência' : 'Agendar conferência de estoque'"
    descricao="Na data, quem conta recebe o aviso no sino e a lista de produtos com o saldo do sistema."
    data-secao="agenda-conferencia"
  >
    <template #acoes>
      <v-btn icon="mdi-close" variant="text" size="small" aria-label="Fechar o formulário" @click="emit('cancelar')" />
    </template>

    <v-alert v-if="erro" type="error" variant="tonal" density="compact" class="mb-2">{{ erro }}</v-alert>
    <div class="form">
      <div class="form__linha">
        <div class="form__rotulo">
          <strong>O que contar</strong>
          <span>Sem filtro, a conferência cobre todo o estoque.</span>
        </div>
        <div class="form__campos">
          <v-select
            v-model="form.grupo"
            :items="gruposPai"
            item-title="nome"
            item-value="id"
            label="Grupo"
            clearable
            hide-details="auto"
          />
          <v-select
            v-model="form.subgrupo"
            :items="subgrupos"
            item-title="nome"
            item-value="id"
            label="Subgrupo"
            clearable
            :disabled="!subgrupos.length"
            hide-details="auto"
          />
          <v-select v-model="form.areaEstoque" :items="opcoes.areas" label="Área" clearable hide-details="auto" />
          <v-select
            v-model="form.localEstoque"
            :items="opcoes.locaisEstoque"
            label="Setor / local de estoque"
            clearable
            hide-details="auto"
          />
          <v-select
            v-model="form.localVenda"
            :items="opcoes.locaisVenda"
            label="Local de venda"
            clearable
            hide-details="auto"
          />
          <div class="form__largo form__grupo">
            <span class="form__legenda">Só os produtos que mais…</span>
            <div class="form__atalhos" role="group" aria-label="Recorte por ranking">
              <v-chip
                v-for="ranking in rankingsConferencia"
                :key="ranking"
                size="small"
                :color="form.ranking === ranking ? 'primary' : undefined"
                :variant="form.ranking === ranking ? 'flat' : 'outlined'"
                :aria-pressed="form.ranking === ranking"
                @click="alternarRanking(ranking)"
                >{{ ROTULO_RANKING_CONFERENCIA[ranking] }}</v-chip
              >
            </div>
            <span class="form__ajuda">Top 20% dos últimos 3 meses. Nenhum marcado = todos.</span>
          </div>
        </div>
      </div>

      <div class="form__linha">
        <div class="form__rotulo">
          <strong>Quem conta</strong>
          <span>Só aparece quem pode ver conferências.</span>
        </div>
        <div class="form__campos">
          <v-select
            v-model="form.responsavelId"
            :items="opcoes.responsaveis"
            item-title="nome"
            item-value="usuarioId"
            label="Quem conta *"
            hide-details="auto"
          />
        </div>
      </div>

      <div class="form__linha">
        <div class="form__rotulo">
          <strong>Quando</strong>
          <span>A primeira conferência e a repetição.</span>
        </div>
        <div class="form__campos">
          <v-text-field
            v-model="form.inicioData"
            type="date"
            label="Primeira conferência em *"
            :min="hoje()"
            hide-details="auto"
          />
          <v-text-field v-model="form.inicioHora" type="time" label="Hora *" hide-details="auto" />
          <div class="form__largo">
            <RecorrenciaCampo v-model:regra="regra" v-model:termino="termino" :inicio-data="form.inicioData" />
          </div>
        </div>
      </div>

      <div class="form__linha">
        <div class="form__rotulo">
          <strong>Orientação</strong>
          <span>Aparece para quem conta (opcional).</span>
        </div>
        <div class="form__campos">
          <v-textarea
            v-model="form.observacao"
            label="Orientação para quem conta"
            rows="2"
            auto-grow
            counter="1000"
            class="form__largo"
          />
        </div>
      </div>
    </div>

    <template #rodape>
      <v-spacer />
      <v-btn variant="text" @click="emit('cancelar')">Cancelar</v-btn>
      <v-btn color="primary" variant="flat" :loading="salvando" @click="salvar">Salvar</v-btn>
    </template>
  </ComprasSecao>
</template>

<style scoped>
.form {
  display: grid;
}

.form__linha {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  gap: var(--cx-sp-5);
  padding: var(--cx-sp-4) 0;
  border-top: 1px solid var(--cx-line-soft);
}

.form__linha:first-child {
  border-top: 0;
  padding-top: var(--cx-sp-2);
}

.form__rotulo {
  display: grid;
  align-content: start;
  gap: 2px;
}

.form__rotulo strong {
  color: var(--cx-ink);
}

.form__rotulo span,
.form__ajuda {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

.form__legenda {
  color: var(--cx-ink);
  font-size: var(--cx-fs-body);
}

.form__campos {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cx-sp-3) var(--cx-sp-4);
  align-items: start;
  max-width: 720px;
}

.form__largo {
  grid-column: 1 / -1;
}

.form__grupo {
  display: grid;
  gap: var(--cx-sp-2);
}

.form__atalhos {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-2);
}

@media (max-width: 767px) {
  .form__linha {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--cx-sp-3);
  }

  .form__campos {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
