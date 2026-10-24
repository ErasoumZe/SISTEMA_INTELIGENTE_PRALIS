<script setup lang="ts">
import {
  ERROS_EXPORTACAO_QUESTOR,
  ROTAS_EXPORTACAO_QUESTOR,
  type JsonValue,
  type QuestorEstadoExportacaoDto,
  type QuestorExportacaoPreviaDto
} from "@padaria/shared";
import QuestorConfirmacaoTecnico from "~/components/conplus/QuestorConfirmacaoTecnico.vue";
import { ErroApiCliente } from "~/composables/useApi";
import { useArquivoQuestor } from "~/composables/useArquivoQuestor";

const props = defineProps<{ estado: QuestorEstadoExportacaoDto | null }>();
const emit = defineEmits<{ gerado: [] }>();
const confirmarTecnico = ref(false);

type Processo = { id: string; nomeCompleto: string | null };

const { apiGetPaginado, apiPost } = useApi();
const { baixar } = useArquivoQuestor();
const processos = ref<Processo[]>([]);
const selecionados = ref<string[]>([]);
const previa = ref<QuestorExportacaoPreviaDto | null>(null);
const carregando = ref(false);
const baixando = ref<"" | "tecnico" | "oficial">("");
const erro = ref("");
const aviso = ref("");
const motivo = ref("");
const pedirMotivo = ref(false);

const nomePorId = computed(() => new Map(processos.value.map((processo) => [processo.id, processo.nomeCompleto])));
const todosProntos = computed(
  () => !!previa.value?.registros.length && previa.value.registros.every((registro) => registro.situacao === "pronto")
);

async function carregarProcessos() {
  carregando.value = true;
  erro.value = "";
  try {
    const resultado = await apiGetPaginado<Processo>("/api/admissoes/processos?ficha=aprovada&page=1&pageSize=50");
    processos.value = resultado.itens;
  } catch (falha) {
    erro.value = falha instanceof ErroApiCliente ? falha.message : "Não foi possível carregar as admissões aprovadas.";
  } finally {
    carregando.value = false;
  }
}

async function prepararPrevia() {
  if (!selecionados.value.length) return;
  carregando.value = true;
  erro.value = "";
  aviso.value = "";
  try {
    previa.value = await apiPost<QuestorExportacaoPreviaDto>(ROTAS_EXPORTACAO_QUESTOR.admissoesPrevia, {
      processoIds: selecionados.value
    });
  } catch (falha) {
    erro.value = falha instanceof ErroApiCliente ? falha.message : "Não foi possível preparar a prévia.";
  } finally {
    carregando.value = false;
  }
}

async function gerar(tipo: "tecnico" | "oficial") {
  baixando.value = tipo;
  erro.value = "";
  aviso.value = "";
  try {
    const rota =
      tipo === "tecnico" ? ROTAS_EXPORTACAO_QUESTOR.admissoesTecnico : ROTAS_EXPORTACAO_QUESTOR.admissoesDownload;
    const corpo: Record<string, JsonValue> = { processoIds: [...selecionados.value] };
    // O servidor exige a confirmação do técnico; o motivo só vale para o oficial.
    if (tipo === "tecnico") corpo["confirmacaoArquivoTecnico"] = true;
    else if (pedirMotivo.value && motivo.value) corpo["motivoRegeracao"] = motivo.value;
    const arquivo = await baixar(rota, corpo);
    aviso.value = arquivo.reutilizado
      ? `${arquivo.nomeArquivo}: mesmo conteúdo de uma exportação anterior (reaproveitada).`
      : `${arquivo.nomeArquivo} gerado e registrado no histórico.`;
    pedirMotivo.value = false;
    motivo.value = "";
    emit("gerado");
  } catch (falha) {
    if (falha instanceof ErroApiCliente && falha.codigo === ERROS_EXPORTACAO_QUESTOR.jaExportado)
      pedirMotivo.value = true;
    erro.value = falha instanceof ErroApiCliente ? falha.message : "Não foi possível gerar o arquivo.";
  } finally {
    baixando.value = "";
  }
}

watch(selecionados, () => {
  previa.value = null;
  pedirMotivo.value = false;
});
onMounted(() => void carregarProcessos());
</script>

<template>
  <v-card variant="outlined">
    <v-card-title class="d-flex align-center justify-space-between flex-wrap ga-2">
      TXT de admissão (A/B/C/D)
      <v-btn variant="text" size="small" prepend-icon="mdi-refresh" :loading="carregando" @click="carregarProcessos"
        >Atualizar</v-btn
      >
    </v-card-title>
    <v-card-text class="d-grid ga-3">
      <v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>
      <v-alert v-if="aviso" type="success" variant="tonal">{{ aviso }}</v-alert>
      <div v-if="processos.length" class="lista">
        <v-checkbox
          v-for="processo in processos"
          :key="processo.id"
          v-model="selecionados"
          :value="processo.id"
          :label="processo.nomeCompleto || 'Processo sem nome'"
          hide-details
          density="compact"
        />
      </div>
      <p v-else-if="!carregando" class="muted">Nenhuma ficha aprovada disponível.</p>
      <div class="acoes">
        <v-btn color="primary" :disabled="!selecionados.length" :loading="carregando" @click="prepararPrevia"
          >Conferir prévia</v-btn
        >
        <v-btn
          color="warning"
          variant="outlined"
          prepend-icon="mdi-file-alert-outline"
          :disabled="!selecionados.length || props.estado?.tecnicoDisponivel === false"
          :loading="baixando === 'tecnico'"
          @click="confirmarTecnico = true"
          >Técnico — não importar</v-btn
        >
        <v-btn
          :color="props.estado?.oficialLiberado ? 'primary' : 'default'"
          variant="tonal"
          :prepend-icon="props.estado?.oficialLiberado ? 'mdi-file-check-outline' : 'mdi-lock-outline'"
          :disabled="!previa?.exportacaoDisponivel || !todosProntos"
          :loading="baixando === 'oficial'"
          @click="gerar('oficial')"
          >{{ props.estado?.oficialLiberado ? "Gerar TXT oficial" : "TXT oficial bloqueado (homologação)" }}</v-btn
        >
      </div>
      <QuestorConfirmacaoTecnico v-model="confirmarTecnico" @confirmar="gerar('tecnico')" />
      <p class="muted">
        O TXT técnico sai com o nome "NAO-IMPORTAR" e os campos ainda sem resposta da Conplus em branco: serve para
        conferência e amostra. O oficial só é liberado após a homologação da Conplus e com todos os campos prontos.
      </p>
      <v-text-field
        v-if="pedirMotivo"
        v-model="motivo"
        label="Motivo para gerar de novo (a admissão já saiu em arquivo oficial)"
        counter="500"
        maxlength="500"
      />
      <div v-if="previa" class="resultado">
        <v-alert v-if="previa.bloqueio" type="info" variant="tonal" density="compact"
          >Exportação oficial bloqueada até a homologação da Conplus.</v-alert
        >
        <div v-for="registro in previa.registros" :key="registro.processoId" class="resultado__item">
          <div class="resultado__quem">
            <strong>{{ nomePorId.get(registro.processoId) ?? registro.processoId }}</strong>
            <v-chip size="x-small" :color="registro.situacao === 'pronto' ? 'success' : 'warning'" variant="tonal">{{
              registro.situacao === "pronto"
                ? "Pronto"
                : `${registro.pendencias.length + registro.diagnosticos.length} pendência(s)`
            }}</v-chip>
            <small class="muted">{{ registro.quantidadeLinhas }} linha(s)</small>
          </div>
          <details v-if="registro.pendencias.length || registro.diagnosticos.length">
            <summary>Ver pendências</summary>
            <ul>
              <li v-for="item in [...registro.pendencias, ...registro.diagnosticos]" :key="item">{{ item }}</li>
            </ul>
          </details>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.d-grid {
  display: grid;
  min-width: 0;
}
/* Itens de grid não encolhem abaixo do conteúdo sem isto: nome longo alargava o card no celular. */
.d-grid > *,
.lista > * {
  min-width: 0;
}
.lista :deep(.v-label) {
  white-space: normal;
  overflow-wrap: anywhere;
}
.lista {
  display: grid;
  /* min(…, 100%): no celular a coluna mínima não pode passar da largura do card. */
  grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr));
  gap: 0 16px;
}
.acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}
.acoes :deep(.v-btn) {
  max-width: 100%;
  height: auto;
  min-height: 36px;
}
.acoes :deep(.v-btn__content) {
  white-space: normal;
  text-align: left;
}
.resultado__item {
  display: grid;
  gap: 4px;
  padding: 10px 0;
  border-top: 1px solid rgba(var(--v-border-color), 0.2);
}
.resultado__quem {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.resultado details {
  font-size: 0.85rem;
  overflow-wrap: anywhere;
}
.muted {
  color: rgba(var(--v-theme-on-surface), 0.68);
  margin: 0;
}
</style>
