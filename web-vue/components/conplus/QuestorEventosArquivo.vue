<script setup lang="ts">
import {
  ERROS_EXPORTACAO_QUESTOR,
  ROTAS_EXPORTACAO_QUESTOR,
  questorEventosVariaveisPreviaSchema,
  type JsonValue,
  type QuestorEstadoExportacaoDto,
  type QuestorEventosVariaveisPreviaDto
} from "@padaria/shared";
import QuestorConfirmacaoTecnico from "~/components/conplus/QuestorConfirmacaoTecnico.vue";
import { ErroApiCliente } from "~/composables/useApi";
import { useArquivoQuestor } from "~/composables/useArquivoQuestor";

/**
 * Arquivo de eventos variáveis no layout oficial (EventoVariavel.nli): o DP informa o código do período
 * de cálculo e a sequência inicial — os dois vêm do Questor —, confere a prévia e baixa o arquivo técnico
 * (para conferência, NÃO importar) ou o oficial (só depois da homologação).
 */
const props = defineProps<{
  competencia: string;
  lancamentoIds: readonly string[];
  estado: QuestorEstadoExportacaoDto | null;
}>();
const confirmarTecnico = ref(false);
const emit = defineEmits<{ gerado: [] }>();

const { apiPost } = useApi();
const { baixar } = useArquivoQuestor();
const codigoPeriodoCalculo = ref("");
// Sem valor padrão: o manual pede um número que ainda não exista no Questor para o contrato e o período,
// e só o DP sabe o que já foi lançado lá.
const sequenciaInicial = ref<number | null>(null);
const previa = ref<QuestorEventosVariaveisPreviaDto | null>(null);
const motivo = ref("");
const pedirMotivo = ref(false);
const ocupado = ref("");
const erro = ref("");
const aviso = ref("");

function pedido() {
  if (!sequenciaInicial.value) {
    erro.value = "Informe a sequência inicial (número que ainda não existe no Questor para o contrato no período).";
    return null;
  }
  const dados = questorEventosVariaveisPreviaSchema.safeParse({
    competencia: props.competencia,
    codigoPeriodoCalculo: codigoPeriodoCalculo.value,
    sequenciaInicial: Number(sequenciaInicial.value),
    lancamentoIds: [...props.lancamentoIds]
  });
  if (!dados.success) {
    erro.value = dados.error.issues[0]?.message ?? "Informe o período de cálculo e a sequência inicial.";
    return null;
  }
  return dados.data;
}

async function executar(acao: "previa" | "tecnico" | "oficial") {
  const corpo = pedido();
  if (!corpo) return;
  ocupado.value = acao;
  erro.value = "";
  aviso.value = "";
  try {
    if (acao === "previa") {
      previa.value = await apiPost<QuestorEventosVariaveisPreviaDto>(ROTAS_EXPORTACAO_QUESTOR.eventosPrevia, corpo);
      return;
    }
    const rota =
      acao === "tecnico" ? ROTAS_EXPORTACAO_QUESTOR.eventosTecnico : ROTAS_EXPORTACAO_QUESTOR.eventosDownload;
    const envio: Record<string, JsonValue> = {
      competencia: corpo.competencia,
      codigoPeriodoCalculo: corpo.codigoPeriodoCalculo,
      sequenciaInicial: corpo.sequenciaInicial,
      lancamentoIds: [...corpo.lancamentoIds]
    };
    if (acao === "tecnico") envio["confirmacaoArquivoTecnico"] = true;
    if (acao === "oficial" && pedirMotivo.value && motivo.value) envio["motivoRegeracao"] = motivo.value;
    const arquivo = await baixar(rota, envio);
    aviso.value = arquivo.reutilizado
      ? `${arquivo.nomeArquivo}: o mesmo arquivo já tinha sido gerado (reaproveitado do histórico).`
      : `${arquivo.nomeArquivo} gerado e registrado no histórico.`;
    if (acao === "oficial") {
      pedirMotivo.value = false;
      motivo.value = "";
    }
    emit("gerado");
  } catch (falha) {
    if (falha instanceof ErroApiCliente && falha.codigo === ERROS_EXPORTACAO_QUESTOR.jaExportado)
      pedirMotivo.value = true;
    erro.value = falha instanceof ErroApiCliente ? falha.message : "Não foi possível concluir.";
  } finally {
    ocupado.value = "";
  }
}

watch(
  () => [props.competencia, props.lancamentoIds.join(","), codigoPeriodoCalculo.value, sequenciaInicial.value],
  () => (previa.value = null)
);
</script>

<template>
  <div class="arquivo">
    <div class="arquivo__parametros">
      <v-text-field
        v-model="codigoPeriodoCalculo"
        label="Período de cálculo no Questor"
        hint="Código da rotina do Questor (ex.: 2505 = 05/2025). Não é deduzido do mês."
        persistent-hint
        inputmode="numeric"
        density="compact"
      />
      <v-text-field
        v-model.number="sequenciaInicial"
        type="number"
        min="1"
        label="Sequência inicial"
        hint="Número que ainda não existe no Questor para o contrato no período (no exemplo da Conplus, 99)."
        persistent-hint
        density="compact"
      />
    </div>
    <v-alert v-if="erro" type="error" variant="tonal" density="compact">{{ erro }}</v-alert>
    <v-alert v-if="aviso" type="success" variant="tonal" density="compact">{{ aviso }}</v-alert>
    <div class="arquivo__acoes">
      <v-btn :disabled="!lancamentoIds.length" :loading="ocupado === 'previa'" @click="executar('previa')"
        >Conferir arquivo</v-btn
      >
      <v-btn
        color="warning"
        variant="outlined"
        prepend-icon="mdi-file-alert-outline"
        :disabled="!previa?.valido || props.estado?.tecnicoDisponivel === false"
        :loading="ocupado === 'tecnico'"
        @click="confirmarTecnico = true"
        >Técnico — não importar</v-btn
      >
      <v-btn
        :color="props.estado?.oficialLiberado ? 'primary' : 'default'"
        :prepend-icon="props.estado?.oficialLiberado ? 'mdi-file-check-outline' : 'mdi-lock-outline'"
        :disabled="!previa?.valido || !previa.exportacaoDisponivel"
        :loading="ocupado === 'oficial'"
        @click="executar('oficial')"
        >{{ props.estado?.oficialLiberado ? "Gerar arquivo oficial" : "Oficial bloqueado (homologação)" }}</v-btn
      >
    </div>
    <QuestorConfirmacaoTecnico v-model="confirmarTecnico" @confirmar="executar('tecnico')" />
    <p class="muted">
      O arquivo técnico sai com o nome "TECNICO-NAO-IMPORTAR": serve para conferir com a Conplus e não reserva
      sequências. O oficial só é liberado depois da homologação.
    </p>
    <v-text-field
      v-if="pedirMotivo"
      v-model="motivo"
      label="Motivo para gerar de novo (o Questor lança de novo o que for importado de novo)"
      maxlength="500"
      counter="500"
    />
    <div v-if="previa" class="arquivo__previa">
      <v-alert v-if="previa.bloqueio" type="info" variant="tonal" density="compact">
        Arquivo oficial bloqueado até a homologação da Conplus. Abaixo, o arquivo que seria gerado.
      </v-alert>
      <v-alert v-if="previa.jaExportados" type="warning" variant="tonal" density="compact">
        {{ previa.jaExportados }} lançamento(s) desta seleção já saíram em arquivo oficial.
      </v-alert>
      <ul v-if="previa.pendencias.length || previa.diagnosticos.length">
        <li v-for="item in [...previa.pendencias, ...previa.diagnosticos]" :key="item">{{ item }}</li>
      </ul>
      <template v-if="previa.conteudo">
        <small class="muted"
          >{{ previa.linhas.length }} linha(s) · {{ previa.quantidadeContratos }} contrato(s) · uma linha por evento, 13
          colunas (E;empresa;período;sequência;contrato;evento;referência;valor;…)</small
        >
        <pre class="arquivo__conteudo">{{ previa.conteudo }}</pre>
      </template>
    </div>
  </div>
</template>

<style scoped>
.arquivo {
  display: grid;
  gap: 10px;
  min-width: 0;
}
.arquivo__parametros {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.arquivo__acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}
/* Rótulos longos ("Oficial bloqueado (homologação)") quebram linha em vez de alargar o card no celular. */
.arquivo__acoes :deep(.v-btn) {
  max-width: 100%;
  height: auto;
  min-height: 36px;
}
.arquivo__acoes :deep(.v-btn__content) {
  white-space: normal;
  text-align: left;
}
.arquivo__previa {
  display: grid;
  gap: 8px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.arquivo__conteudo {
  margin: 0;
  min-width: 0;
  max-width: 100%;
  padding: 12px;
  overflow-x: auto;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.05);
  font-size: 0.8rem;
}
.muted {
  color: rgba(var(--v-theme-on-surface), 0.68);
  margin: 0;
}
@media (max-width: 600px) {
  .arquivo__parametros {
    grid-template-columns: 1fr;
  }
}
</style>
