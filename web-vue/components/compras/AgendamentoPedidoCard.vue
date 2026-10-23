<script setup lang="ts">
import {
  PRAZO_RESPOSTA_ATALHOS,
  type AgendamentoDto,
  type AgendamentoPayload,
  type GrupoAgendamentoDto,
  type MargemVariacao,
  type RegraRecorrencia,
  type ResponsavelPedidoDto,
  type TerminoRecorrencia
} from "@padaria/shared";
import MargemVariacaoCampo from "~/components/compras/MargemVariacaoCampo.vue";
import RecorrenciaCampo from "~/components/compras/RecorrenciaCampo.vue";

// O card "Agendamento de pedido" (doc 56 §2.2, doc 58 §1/§8): grupo e subgrupo, o responsável por executar o
// pedido, quando começa, a repetição, o tempo de resposta, a variação aceita e o horário de recebimento da loja.
// Os produtos vêm marcados da lista de baixo.
const props = defineProps<{
  empresaId: string;
  grupos: GrupoAgendamentoDto[];
  produtosMarcados: string[];
  editando: AgendamentoDto | null;
  salvando: boolean;
  responsaveis: ResponsavelPedidoDto[];
}>();
const emit = defineEmits<{ salvar: [payload: AgendamentoPayload, aPartirDe: string | undefined]; cancelar: [] }>();

// Datas no dia de Sao Paulo, como o servidor calcula a agenda.
const DIA_LOCAL = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
const diaLocal = (instante: Date) => DIA_LOCAL.format(instante);
const hoje = () => diaLocal(new Date());
const amanha = () => diaLocal(new Date(Date.now() + 86_400_000));

const form = reactive({
  grupo: "",
  subgrupo: "",
  inicioData: amanha(),
  inicioHora: "08:00",
  prazo: 24 as number,
  margem: 10 as MargemVariacao,
  responsavelId: null as string | null,
  recebimentoInicio: "",
  recebimentoFim: "",
  aPartirDe: ""
});
const regra = ref<RegraRecorrencia>({ tipo: "padrao", frequencia: "semanal", intervalo: 1 });
const termino = ref<TerminoRecorrencia>({ tipo: "nunca" });
const erro = ref("");

const gruposPai = computed(() => props.grupos.filter((grupo) => !grupo.grupoPaiId));
const subgrupos = computed(() => props.grupos.filter((grupo) => grupo.grupoPaiId && grupo.grupoPaiId === form.grupo));
const totalMarcados = computed(() => props.produtosMarcados.length);
const PRAZOS = PRAZO_RESPOSTA_ATALHOS.map((horas) => ({
  value: horas,
  title: horas < 24 ? `${horas} horas` : `${horas / 24} dia(s)`
}));

function limpar() {
  Object.assign(form, {
    grupo: "",
    subgrupo: "",
    inicioData: amanha(),
    inicioHora: "08:00",
    prazo: 24,
    margem: 10,
    responsavelId: null,
    recebimentoInicio: "",
    recebimentoFim: "",
    aPartirDe: ""
  });
  regra.value = { tipo: "padrao", frequencia: "semanal", intervalo: 1 };
  termino.value = { tipo: "nunca" };
  erro.value = "";
}

watch(
  () => props.editando,
  (agenda) => {
    if (!agenda) return limpar();
    const grupo = props.grupos.find((item) => item.id === agenda.grupoMercadoriaId);
    Object.assign(form, {
      grupo: grupo?.grupoPaiId ?? agenda.grupoMercadoriaId,
      subgrupo: grupo?.grupoPaiId ? agenda.grupoMercadoriaId : "",
      inicioData: agenda.inicioData,
      inicioHora: agenda.inicioHora,
      prazo: agenda.prazoRespostaHoras,
      margem: agenda.margemVariacaoPercentual as MargemVariacao,
      responsavelId: agenda.responsavelId,
      recebimentoInicio: agenda.recebimentoInicio ?? "",
      recebimentoFim: agenda.recebimentoFim ?? "",
      aPartirDe: agenda.proximas[0] ? diaLocal(new Date(agenda.proximas[0].dataAtual)) : hoje()
    });
    regra.value = agenda.regra;
    termino.value = agenda.termino;
  },
  { immediate: true }
);
watch(
  () => form.grupo,
  (novo, antigo) => {
    if (antigo !== undefined && novo !== antigo && !subgrupos.value.some((item) => item.id === form.subgrupo))
      form.subgrupo = "";
  }
);

function salvar() {
  erro.value = "";
  const grupoMercadoriaId = form.subgrupo || form.grupo;
  if (!grupoMercadoriaId) return void (erro.value = "Escolha o grupo do pedido.");
  if (!totalMarcados.value) return void (erro.value = "Marque ao menos um produto na lista abaixo.");
  if (!form.inicioData || !form.inicioHora) return void (erro.value = "Informe a data e a hora do primeiro pedido.");
  if (!form.responsavelId) return void (erro.value = "Escolha o responsável por executar o pedido.");
  if (Boolean(form.recebimentoInicio) !== Boolean(form.recebimentoFim))
    return void (erro.value = "Informe o início e o fim do horário de recebimento.");
  if (form.recebimentoInicio && form.recebimentoFim <= form.recebimentoInicio)
    return void (erro.value = "O fim do recebimento vem depois do início.");
  const prazo = Number(form.prazo);
  if (!Number.isInteger(prazo) || prazo < 1 || prazo > 720)
    return void (erro.value = "O tempo de resposta vai de 1 a 720 horas.");
  emit(
    "salvar",
    {
      empresaId: props.empresaId,
      grupoMercadoriaId,
      inicioData: form.inicioData,
      inicioHora: form.inicioHora,
      regra: regra.value,
      termino: termino.value,
      prazoRespostaHoras: prazo,
      margemVariacaoPercentual: form.margem,
      responsavelId: form.responsavelId,
      recebimentoInicio: form.recebimentoInicio || null,
      recebimentoFim: form.recebimentoFim || null,
      produtos: props.produtosMarcados.map((produtoId) => ({ produtoId }))
    },
    props.editando ? form.aPartirDe || undefined : undefined
  );
}

defineExpose({ limpar });
</script>

<template>
  <v-card variant="outlined" data-secao="card-agendamento">
    <v-card-title class="d-flex align-center ga-2 text-wrap">
      <v-icon icon="mdi-calendar-sync-outline" color="primary" />
      {{ editando ? "Editar agendamento de pedido" : "Agendamento de pedido" }}
    </v-card-title>
    <v-card-subtitle class="text-wrap">
      Na data, o responsável recebe o aviso, confere as quantidades na Solicitação de compra e envia; cada fornecedor
      recebe só os seus produtos pelo WhatsApp.
    </v-card-subtitle>
    <v-card-text class="d-grid ga-4">
      <v-alert v-if="erro" type="error" variant="tonal" density="compact">{{ erro }}</v-alert>
      <div class="campos">
        <v-select
          v-model="form.grupo"
          :items="gruposPai"
          item-title="nome"
          item-value="id"
          label="Grupo *"
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
        <v-text-field
          v-model="form.inicioData"
          type="date"
          label="Primeiro pedido em *"
          :min="hoje()"
          hide-details="auto"
        />
        <v-text-field v-model="form.inicioHora" type="time" label="Hora *" hide-details="auto" />
        <v-select
          v-model="form.responsavelId"
          :items="responsaveis"
          item-title="nome"
          item-value="usuarioId"
          label="Responsável por executar *"
          hint="Recebe o aviso na data, confere e envia."
          persistent-hint
          data-campo="responsavel"
        />
      </div>
      <div class="campos">
        <RecorrenciaCampo v-model:regra="regra" v-model:termino="termino" :inicio-data="form.inicioData" />
        <div class="d-grid ga-3">
          <v-text-field
            v-model.number="form.prazo"
            type="number"
            min="1"
            max="720"
            label="Tempo de resposta da cotação (horas)"
            hint="É o prazo que o fornecedor vê para responder."
            persistent-hint
          />
          <div class="d-flex flex-wrap ga-2" role="group" aria-label="Atalhos do tempo de resposta">
            <v-chip
              v-for="atalho in PRAZOS"
              :key="atalho.value"
              size="small"
              :color="Number(form.prazo) === atalho.value ? 'primary' : undefined"
              :variant="Number(form.prazo) === atalho.value ? 'flat' : 'outlined'"
              @click="form.prazo = atalho.value"
              >{{ atalho.title }}</v-chip
            >
          </div>
          <MargemVariacaoCampo v-model="form.margem" />
          <div class="d-grid ga-1" data-campo="horario-recebimento">
            <span class="text-body-2">Horário de recebimento da loja</span>
            <div class="recebimento">
              <v-text-field v-model="form.recebimentoInicio" type="time" label="Das" density="compact" hide-details />
              <v-text-field v-model="form.recebimentoFim" type="time" label="Até" density="compact" hide-details />
            </div>
            <span class="text-caption text-medium-emphasis">O fornecedor vê na cotação.</span>
          </div>
          <v-text-field
            v-if="editando"
            v-model="form.aPartirDe"
            type="date"
            label="Mudanças valem a partir de"
            hint="As datas anteriores ficam como estão (como “esta e as futuras” no iPhone)."
            persistent-hint
          />
          <v-chip label color="primary" variant="tonal" class="align-self-start" data-campo="produtos-marcados"
            >{{ totalMarcados }} produto(s) marcado(s) na lista</v-chip
          >
        </div>
      </div>
    </v-card-text>
    <v-card-actions class="px-4 pb-4">
      <v-spacer />
      <v-btn variant="text" @click="emit('cancelar')">Cancelar</v-btn>
      <v-btn color="primary" prepend-icon="mdi-content-save" :loading="salvando" @click="salvar">Salvar</v-btn>
    </v-card-actions>
  </v-card>
</template>

<style scoped>
.recebimento {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.campos {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  align-items: start;
}
</style>
