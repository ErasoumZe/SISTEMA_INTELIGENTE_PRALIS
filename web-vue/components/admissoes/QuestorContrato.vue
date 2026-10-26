<script setup lang="ts">
import { contratoQuestorPayloadSchema, dominioDoCampoQuestor, type ContratoQuestorDto } from "@padaria/shared";
import QuestorApiStatus from "~/components/questor/QuestorApiStatus.vue";

const props = defineProps<{ processoId: string; podeEditar: boolean }>();
const { apiGet, apiPut } = useApi();
const dados = ref<ContratoQuestorDto | null>(null);
const carregando = ref(false);
const salvando = ref(false);
const erro = ref<unknown>(null);
const mensagem = ref("");
type ContratoForm = {
  questorTipoSalario: number | null;
  salarioCentavos: number | null;
  descricaoSalario: string | null;
  diasExperiencia: number | null;
  diasProrrogacao: number | null;
  questorTipoContrato: string | null;
  questorSindicato: string | null;
  questorTipoAdmissao: number | null;
  pcdCotista: boolean | null;
  utilizaCtpsDigital: boolean | null;
  possuiAlvara: boolean | null;
  jaExpostoAgenteNocivo: boolean | null;
};
const formulario = reactive<ContratoForm>({
  questorTipoSalario: null,
  salarioCentavos: null,
  descricaoSalario: null,
  diasExperiencia: null,
  diasProrrogacao: null,
  questorTipoContrato: null,
  questorSindicato: null,
  questorTipoAdmissao: null,
  pcdCotista: null,
  utilizaCtpsDigital: null,
  possuiAlvara: null,
  jaExpostoAgenteNocivo: null
});
const opcoesSalario = dominioDoCampoQuestor("A", "TIPOSALARIO").map(Number);
const opcoesAdmissao = dominioDoCampoQuestor("B", "TIPOADM").map(Number);

function copiar(valor: ContratoQuestorDto) {
  dados.value = valor;
  formulario.questorTipoSalario = valor.questorTipoSalario;
  formulario.salarioCentavos = valor.salarioCentavos;
  formulario.descricaoSalario = valor.descricaoSalario;
  formulario.diasExperiencia = valor.diasExperiencia;
  formulario.diasProrrogacao = valor.diasProrrogacao;
  formulario.questorTipoContrato = valor.questorTipoContrato;
  formulario.questorSindicato = valor.questorSindicato;
  formulario.questorTipoAdmissao = valor.questorTipoAdmissao;
  formulario.pcdCotista = valor.pcdCotista;
  formulario.utilizaCtpsDigital = valor.utilizaCtpsDigital;
  formulario.possuiAlvara = valor.possuiAlvara;
  formulario.jaExpostoAgenteNocivo = valor.jaExpostoAgenteNocivo;
}
async function carregar() {
  carregando.value = true;
  erro.value = null;
  try {
    copiar(await apiGet<ContratoQuestorDto>(`/api/admissoes/processos/${props.processoId}/questor/contrato`));
  } catch (falha) {
    erro.value = falha;
  } finally {
    carregando.value = false;
  }
}
async function salvar() {
  if (!dados.value || salvando.value) return;
  const payload = { ...formulario, versao: dados.value.versao };
  const resultado = contratoQuestorPayloadSchema.safeParse(payload);
  if (!resultado.success) {
    erro.value = new Error(resultado.error.issues[0]?.message ?? "Contrato inválido.");
    return;
  }
  salvando.value = true;
  erro.value = null;
  mensagem.value = "";
  try {
    copiar(
      await apiPut<ContratoQuestorDto>(`/api/admissoes/processos/${props.processoId}/questor/contrato`, resultado.data)
    );
    mensagem.value = "Contrato Questor salvo.";
  } catch (falha) {
    erro.value = falha;
    if (falha instanceof Error && "status" in falha && (falha as { status?: number }).status === 409) await carregar();
  } finally {
    salvando.value = false;
  }
}
onMounted(() => void carregar());
</script>

<template>
  <section class="questor-card" aria-labelledby="questor-contrato-titulo">
    <div class="questor-card__cabecalho">
      <div>
        <p class="questor-card__eyebrow">E4 · dados internos</p>
        <h2 id="questor-contrato-titulo">Contrato Questor</h2>
        <p>Bloco restrito ao DP. Nenhum dado é preenchido automaticamente.</p>
      </div>
      <v-btn v-if="podeEditar" color="primary" :loading="salvando" :disabled="!dados || carregando" @click="salvar"
        >Salvar</v-btn
      >
    </div>
    <v-progress-linear v-if="carregando" indeterminate color="primary" /><QuestorApiStatus
      v-if="erro"
      :erro="erro"
      class="mb-4"
    /><v-alert v-if="mensagem" type="success" variant="tonal" density="compact">{{ mensagem }}</v-alert>
    <v-row v-if="dados" dense
      ><v-col cols="12" md="4"
        ><v-select
          v-model="formulario.questorTipoSalario"
          :items="opcoesSalario"
          label="Tipo de salário"
          clearable
          :disabled="!podeEditar" /></v-col
      ><v-col cols="12" md="4"
        ><v-text-field
          v-model.number="formulario.salarioCentavos"
          type="number"
          label="Salário (centavos)"
          :disabled="!podeEditar" /></v-col
      ><v-col cols="12" md="4"
        ><v-text-field
          v-model="formulario.descricaoSalario"
          label="Descrição do salário"
          :disabled="!podeEditar" /></v-col
      ><v-col cols="12" md="3"
        ><v-text-field
          v-model.number="formulario.diasExperiencia"
          type="number"
          label="Dias de experiência"
          :disabled="!podeEditar" /></v-col
      ><v-col cols="12" md="3"
        ><v-text-field
          v-model.number="formulario.diasProrrogacao"
          type="number"
          label="Dias de prorrogação"
          :disabled="!podeEditar" /></v-col
      ><v-col cols="12" md="3"
        ><v-text-field
          v-model="formulario.questorTipoContrato"
          label="Código do tipo de contrato"
          :disabled="!podeEditar" /></v-col
      ><v-col cols="12" md="3"
        ><v-text-field
          v-model="formulario.questorSindicato"
          label="Código do sindicato"
          :disabled="!podeEditar" /></v-col
      ><v-col cols="12" md="4"
        ><v-select
          v-model="formulario.questorTipoAdmissao"
          :items="opcoesAdmissao"
          label="Tipo de admissão"
          clearable
          :disabled="!podeEditar" /></v-col
      ><v-col
        v-for="campo in [
          { chave: 'pcdCotista', titulo: 'PCD cotista' },
          { chave: 'utilizaCtpsDigital', titulo: 'Utiliza CTPS Digital' },
          { chave: 'possuiAlvara', titulo: 'Possui alvará' },
          { chave: 'jaExpostoAgenteNocivo', titulo: 'Já exposto a agente nocivo' }
        ]"
        :key="campo.chave"
        cols="12"
        md="2"
        ><v-switch
          v-model="formulario[campo.chave]"
          :label="campo.titulo"
          color="primary"
          :disabled="!podeEditar" /></v-col
    ></v-row>
    <p v-else-if="!carregando && !erro" class="questor-card__vazio">Contrato Questor indisponível.</p>
  </section>
</template>

<style scoped>
.questor-card {
  display: grid;
  gap: var(--cx-sp-4);
  padding: var(--cx-sp-5);
  border: 1px solid var(--cx-border);
  border-radius: var(--cx-radius-lg);
  background: var(--cx-surface);
}
.questor-card__cabecalho {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cx-sp-4);
}
.questor-card__eyebrow {
  margin: 0 0 var(--cx-sp-1);
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.questor-card__cabecalho h2 {
  margin: 0;
}
.questor-card__cabecalho p {
  margin: var(--cx-sp-2) 0 0;
  color: var(--cx-ink-soft);
}
@media (max-width: 600px) {
  .questor-card__cabecalho {
    flex-direction: column;
  }
}
</style>
