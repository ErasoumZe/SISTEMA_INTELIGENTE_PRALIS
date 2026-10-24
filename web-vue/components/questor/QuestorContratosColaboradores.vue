<script setup lang="ts">
import {
  contratoColaboradorQuestorPayloadSchema,
  ERROS_QUESTOR,
  ROTAS_QUESTOR,
  type ContratoColaboradorQuestorDto
} from "@padaria/shared";
import QuestorApiStatus from "~/components/questor/QuestorApiStatus.vue";
import { ErroApiCliente } from "~/composables/useApi";

/**
 * Código do contrato de cada colaborador no Questor (CODIGOFUNCCONTR). É a coluna 1 do CSV de
 * eventos variáveis: sem ele, o lançamento do colaborador não tem como ir para o Questor.
 */
const { apiGet, apiPut } = useApi();
const linhas = ref<ContratoColaboradorQuestorDto[]>([]);
const rascunhos = reactive<Record<string, string>>({});
const busca = ref("");
const somentePendentes = ref(false);
const carregando = ref(false);
const salvandoId = ref<string | null>(null);
const erro = ref<unknown>(null);
const mensagem = ref("");

const duplicado = computed(
  () => erro.value instanceof ErroApiCliente && erro.value.codigo === ERROS_QUESTOR.contratoColaboradorDuplicado
);
const pendentes = computed(() => linhas.value.filter((linha) => !linha.questorCodigoContrato).length);
const visiveis = computed(() => {
  const termo = busca.value.trim().toLocaleLowerCase("pt-BR");
  return linhas.value.filter(
    (linha) =>
      (!somentePendentes.value || !linha.questorCodigoContrato) &&
      (!termo ||
        linha.colaboradorNome.toLocaleLowerCase("pt-BR").includes(termo) ||
        linha.matricula.toLocaleLowerCase("pt-BR").includes(termo))
  );
});

function preencherRascunhos() {
  for (const linha of linhas.value) rascunhos[linha.vinculoId] = linha.questorCodigoContrato ?? "";
}

async function carregar() {
  carregando.value = true;
  erro.value = null;
  try {
    linhas.value = await apiGet<ContratoColaboradorQuestorDto[]>(ROTAS_QUESTOR.contratosColaboradores);
    preencherRascunhos();
  } catch (falha) {
    erro.value = falha;
  } finally {
    carregando.value = false;
  }
}

const alterado = (linha: ContratoColaboradorQuestorDto) =>
  (rascunhos[linha.vinculoId] ?? "").trim() !== (linha.questorCodigoContrato ?? "");

async function salvar(linha: ContratoColaboradorQuestorDto) {
  const texto = (rascunhos[linha.vinculoId] ?? "").trim();
  const resultado = contratoColaboradorQuestorPayloadSchema.safeParse({ questorCodigoContrato: texto || null });
  if (!resultado.success) {
    erro.value = new Error(resultado.error.issues[0]?.message ?? "Código de contrato inválido.");
    return;
  }
  salvandoId.value = linha.vinculoId;
  erro.value = null;
  mensagem.value = "";
  try {
    const salvo = await apiPut<ContratoColaboradorQuestorDto>(
      ROTAS_QUESTOR.contratoColaborador.replace(":id", linha.vinculoId),
      { ...resultado.data, atualizadoEmLido: linha.atualizadoEm }
    );
    linhas.value = linhas.value.map((item) => (item.vinculoId === salvo.vinculoId ? salvo : item));
    rascunhos[salvo.vinculoId] = salvo.questorCodigoContrato ?? "";
    mensagem.value = `Contrato de ${salvo.colaboradorNome} salvo.`;
  } catch (falha) {
    erro.value = falha;
  } finally {
    salvandoId.value = null;
  }
}

const dataBr = (iso: string) => iso.split("-").reverse().join("/");

onMounted(() => void carregar());
</script>

<template>
  <section class="questor-card" aria-labelledby="questor-contratos-titulo">
    <div class="questor-card__cabecalho">
      <div>
        <p class="questor-card__eyebrow">Eventos variáveis · contrato do empregado</p>
        <h2 id="questor-contratos-titulo">Contratos no Questor</h2>
        <p>
          Informe o código que o Questor deu a cada contrato. Sem ele, os lançamentos do colaborador não entram no
          arquivo de eventos.
        </p>
      </div>
      <v-chip :color="pendentes ? 'warning' : 'success'" variant="tonal">
        {{ pendentes ? `${pendentes} sem código` : "Todos com código" }}
      </v-chip>
    </div>
    <v-alert v-if="duplicado" type="warning" variant="tonal" role="alert">
      Este código já está em outro colaborador desta empresa. Confira o código no Questor.
    </v-alert>
    <QuestorApiStatus v-else-if="erro" :erro="erro" />
    <v-alert v-if="mensagem" type="success" variant="tonal" density="compact">{{ mensagem }}</v-alert>
    <div class="questor-contratos__filtros">
      <v-text-field
        v-model="busca"
        label="Buscar por nome ou matrícula"
        prepend-inner-icon="mdi-magnify"
        hide-details
        clearable
      />
      <v-switch v-model="somentePendentes" label="Só sem código" hide-details color="primary" />
    </div>
    <v-progress-linear v-if="carregando" indeterminate color="primary" />
    <div class="responsive-table-shell">
      <v-table density="comfortable">
        <thead>
          <tr>
            <th>Colaborador</th>
            <th>Matrícula</th>
            <th>Função</th>
            <th>Admissão</th>
            <th>Código no Questor</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="linha in visiveis" :key="linha.vinculoId">
            <td>
              {{ linha.colaboradorNome }}
              <v-chip v-if="linha.status === 'desligado'" size="x-small" class="ml-1">Desligado</v-chip>
            </td>
            <td>{{ linha.matricula }}</td>
            <td>{{ linha.funcaoNome }}</td>
            <td>{{ dataBr(linha.admitidoEm) }}</td>
            <td>
              <div class="questor-contratos__codigo">
                <v-text-field
                  v-model="rascunhos[linha.vinculoId]"
                  :aria-label="`Código do contrato de ${linha.colaboradorNome}`"
                  inputmode="numeric"
                  maxlength="7"
                  density="compact"
                  hide-details
                  @keyup.enter="alterado(linha) && salvar(linha)"
                />
                <v-btn
                  color="primary"
                  variant="tonal"
                  size="small"
                  :disabled="!alterado(linha)"
                  :loading="salvandoId === linha.vinculoId"
                  @click="salvar(linha)"
                  >Salvar</v-btn
                >
              </div>
            </td>
          </tr>
          <tr v-if="!visiveis.length && !carregando">
            <td colspan="5" class="text-center">
              {{ linhas.length ? "Nenhum colaborador neste filtro." : "Nenhum colaborador efetivado." }}
            </td>
          </tr>
        </tbody>
      </v-table>
    </div>
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
/* O resumo ("N sem código") não encolhe: com o texto ao lado, ele ficava cortado em 768px. */
.questor-card__cabecalho > .v-chip {
  flex-shrink: 0;
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
.questor-contratos__filtros {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--cx-sp-4);
  align-items: center;
}
.questor-contratos__codigo {
  display: flex;
  gap: var(--cx-sp-2);
  align-items: center;
  min-width: 190px;
}
@media (max-width: 600px) {
  .questor-card__cabecalho {
    flex-direction: column;
  }
  .questor-contratos__filtros {
    grid-template-columns: 1fr;
  }
}
</style>
