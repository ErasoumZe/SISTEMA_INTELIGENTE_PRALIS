<script setup lang="ts">
import {
  CAMPOS_PADRAO_EMPRESA_QUESTOR,
  dominioDoCampoQuestor,
  referenciasDaConfiguracaoQuestor,
  type ConfiguracaoQuestorDto,
  type ConfiguracaoQuestorPayload
} from "@padaria/shared";
import QuestorApiStatus from "~/components/questor/QuestorApiStatus.vue";

const { apiGet, apiPut } = useApi();
const dados = ref<ConfiguracaoQuestorDto | null>(null);
const carregando = ref(false);
const salvando = ref(false);
const erro = ref<unknown>(null);
const mensagem = ref("");
const formulario = reactive<ConfiguracaoQuestorPayload>({
  versao: 0,
  codigoEstabelecimento: null,
  classificacaoOrganograma: null,
  utilizaHoraCentesimal: null,
  codigoEmpresaQuestor: null,
  razaoSocialQuestor: null,
  padroes: {}
});

const campos = CAMPOS_PADRAO_EMPRESA_QUESTOR.map((item) => ({
  ...item,
  opcoes: (() => {
    try {
      return dominioDoCampoQuestor(item.registro, item.campo);
    } catch {
      return [];
    }
  })()
}));

function copiarDados(valor: ConfiguracaoQuestorDto) {
  dados.value = valor;
  formulario.versao = valor.versao;
  formulario.codigoEstabelecimento = valor.codigoEstabelecimento;
  formulario.classificacaoOrganograma = valor.classificacaoOrganograma;
  formulario.utilizaHoraCentesimal = valor.utilizaHoraCentesimal;
  formulario.codigoEmpresaQuestor = valor.codigoEmpresaQuestor;
  formulario.razaoSocialQuestor = valor.razaoSocialQuestor;
  formulario.padroes = { ...valor.padroes };
}

async function carregar() {
  carregando.value = true;
  erro.value = null;
  try {
    copiarDados(await apiGet<ConfiguracaoQuestorDto>("/api/conplus/questor/configuracao"));
  } catch (falha) {
    erro.value = falha;
  } finally {
    carregando.value = false;
  }
}

async function salvar() {
  if (salvando.value) return;
  salvando.value = true;
  erro.value = null;
  mensagem.value = "";
  try {
    const salvo = await apiPut<ConfiguracaoQuestorDto>("/api/conplus/questor/configuracao", {
      versao: formulario.versao,
      codigoEstabelecimento: formulario.codigoEstabelecimento,
      classificacaoOrganograma: formulario.classificacaoOrganograma,
      utilizaHoraCentesimal: formulario.utilizaHoraCentesimal,
      codigoEmpresaQuestor: formulario.codigoEmpresaQuestor || null,
      razaoSocialQuestor: formulario.razaoSocialQuestor?.trim() || null,
      padroes: { ...formulario.padroes }
    });
    copiarDados(salvo);
    mensagem.value = "Configuração Questor salva.";
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
  <section class="questor-card" aria-labelledby="questor-config-titulo">
    <div class="questor-card__cabecalho">
      <div>
        <p class="questor-card__eyebrow">E2 · configuração por empresa</p>
        <h2 id="questor-config-titulo">Parâmetros da empresa</h2>
        <p>Use somente códigos fornecidos e validados pela Conplus. Nenhum valor é inventado pela tela.</p>
      </div>
      <v-btn color="primary" :loading="salvando" :disabled="!dados || carregando" @click="salvar">Salvar</v-btn>
    </div>
    <v-progress-linear v-if="carregando" indeterminate color="primary" />
    <QuestorApiStatus v-if="erro" :erro="erro" class="mb-4" />
    <v-alert v-if="mensagem" type="success" variant="tonal" density="compact" class="mb-4">{{ mensagem }}</v-alert>
    <v-form v-if="dados" @submit.prevent="salvar">
      <v-row dense>
        <v-col cols="12" md="4"
          ><v-text-field
            v-model.number="formulario.codigoEstabelecimento"
            type="number"
            min="0"
            label="Código do estabelecimento"
        /></v-col>
        <v-col cols="12" md="4"
          ><v-text-field v-model="formulario.classificacaoOrganograma" label="Classificação do organograma"
        /></v-col>
        <v-col cols="12" md="4"
          ><v-text-field
            v-model.number="formulario.codigoEmpresaQuestor"
            type="number"
            min="1"
            label="Código da empresa no Questor"
            hint="Eventos variáveis, coluna 2 (ex.: 510). Não é o CNPJ."
            persistent-hint
        /></v-col>
        <v-col cols="12" md="8"
          ><v-text-field
            v-model="formulario.razaoSocialQuestor"
            label="Razão social no Questor"
            hint="Exatamente como nos arquivos da Conplus (ex.: COMERCIAL TUDONUPAO LTDA). Libera a importação do catálogo desta empresa."
            persistent-hint
            maxlength="200"
        /></v-col>
        <v-col cols="12" md="4"
          ><v-switch v-model="formulario.utilizaHoraCentesimal" label="Utiliza hora centesimal" color="primary"
        /></v-col>
        <v-col v-for="campo in campos" :key="campo.campo" cols="12" md="6">
          <v-select
            v-if="campo.opcoes.length"
            v-model="formulario.padroes[campo.campo]"
            :items="campo.opcoes"
            :label="`Padrão ${campo.campo}`"
            clearable
          />
          <v-text-field v-else v-model="formulario.padroes[campo.campo]" :label="`Padrão ${campo.campo}`" clearable />
        </v-col>
      </v-row>
    </v-form>
    <p v-else-if="!carregando && !erro" class="questor-card__vazio">A configuração ainda não foi carregada.</p>
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
.questor-card__vazio {
  color: var(--cx-ink-soft);
}
@media (max-width: 600px) {
  .questor-card__cabecalho {
    flex-direction: column;
  }
}
</style>
