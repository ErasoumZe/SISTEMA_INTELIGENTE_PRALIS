<script setup lang="ts">
import {
  dominioDoCampoQuestor,
  turnoQuestorPayloadSchema,
  funcaoQuestorPayloadSchema,
  type FuncaoQuestorDto,
  type TurnoQuestorDto
} from "@padaria/shared";
import QuestorApiStatus from "~/components/questor/QuestorApiStatus.vue";

const props = defineProps<{ modo: "funcoes" | "turnos" }>();
const { apiGet, apiPut } = useApi();
const funcoes = ref<FuncaoQuestorDto[]>([]);
const turnos = ref<TurnoQuestorDto[]>([]);
const carregando = ref(false);
const salvando = ref<string | null>(null);
const erro = ref<unknown>(null);
const editando = ref<string | null>(null);
const funcoesForm = reactive<Record<string, { cargo: string | null; nocivo: string | null }>>({});
const turnosForm = reactive<
  Record<string, { escala: string | null; jornada: number | null; parcial: number | null; regime: number | null }>
>({});

const opcoesNocivo = dominioDoCampoQuestor("B", "AGENTENOCIVO");
const opcoesJornada = dominioDoCampoQuestor("B", "TIPOJORNADA").map(Number);
const opcoesParcial = dominioDoCampoQuestor("B", "TEMPOPARCIAL").map(Number);
const opcoesRegime = dominioDoCampoQuestor("B", "REGIMEJOR").map(Number);

function mensagemDoErro(falha: unknown) {
  erro.value = falha;
}

async function carregar() {
  carregando.value = true;
  erro.value = null;
  try {
    if (props.modo === "funcoes") {
      funcoes.value = await apiGet<FuncaoQuestorDto[]>("/api/conplus/questor/funcoes");
      for (const item of funcoes.value)
        funcoesForm[item.id] = { cargo: item.questorCodigoCargo, nocivo: item.questorAgenteNocivo };
    } else {
      turnos.value = await apiGet<TurnoQuestorDto[]>("/api/conplus/questor/turnos");
      for (const item of turnos.value)
        turnosForm[item.id] = {
          escala: item.questorCodigoEscala,
          jornada: item.questorTipoJornada,
          parcial: item.questorTempoParcial,
          regime: item.questorRegimeJornada
        };
    }
  } catch (falha) {
    mensagemDoErro(falha);
  } finally {
    carregando.value = false;
  }
}

async function salvarFuncao(item: FuncaoQuestorDto) {
  const form = funcoesForm[item.id]!;
  const resultado = funcaoQuestorPayloadSchema.safeParse({
    questorCodigoCargo: form.cargo,
    questorAgenteNocivo: form.nocivo
  });
  if (!resultado.success) {
    erro.value = new Error(resultado.error.issues[0]?.message ?? "Parâmetros inválidos.");
    return;
  }
  salvando.value = item.id;
  erro.value = null;
  try {
    await apiPut(`/api/conplus/questor/funcoes/${item.id}`, { ...resultado.data, atualizadoEmLido: item.atualizadoEm });
    editando.value = null;
    await carregar();
  } catch (falha) {
    mensagemDoErro(falha);
  } finally {
    salvando.value = null;
  }
}

async function salvarTurno(item: TurnoQuestorDto) {
  const form = turnosForm[item.id]!;
  const resultado = turnoQuestorPayloadSchema.safeParse({
    questorCodigoEscala: form.escala,
    questorTipoJornada: form.jornada,
    questorTempoParcial: form.parcial,
    questorRegimeJornada: form.regime
  });
  if (!resultado.success) {
    erro.value = new Error(resultado.error.issues[0]?.message ?? "Parâmetros inválidos.");
    return;
  }
  salvando.value = item.id;
  erro.value = null;
  try {
    await apiPut(`/api/conplus/questor/turnos/${item.id}`, { ...resultado.data, atualizadoEmLido: item.atualizadoEm });
    editando.value = null;
    await carregar();
  } catch (falha) {
    mensagemDoErro(falha);
  } finally {
    salvando.value = null;
  }
}

watch(
  () => props.modo,
  () => void carregar(),
  { immediate: true }
);
</script>

<template>
  <section class="questor-card" :aria-labelledby="`questor-${modo}-titulo`">
    <div class="questor-card__cabecalho">
      <div>
        <p class="questor-card__eyebrow">E3 · parâmetros operacionais</p>
        <h2 :id="`questor-${modo}-titulo`">Campos Questor — {{ modo === "funcoes" ? "Funções" : "Turnos" }}</h2>
        <p>Os códigos são opcionais até que a Conplus forneça o catálogo oficial.</p>
      </div>
      <v-btn variant="tonal" prepend-icon="mdi-refresh" :loading="carregando" @click="carregar">Atualizar</v-btn>
    </div>
    <QuestorApiStatus v-if="erro" :erro="erro" class="mb-4" />
    <v-progress-linear v-if="carregando" indeterminate color="primary" />
    <div v-if="modo === 'funcoes'" class="responsive-table-shell">
      <v-table density="comfortable"
        ><thead>
          <tr>
            <th>Função</th>
            <th>Código de cargo</th>
            <th>Agente nocivo</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in funcoes" :key="item.id">
            <td>{{ item.nome }}</td>
            <td>
              <v-text-field
                v-model="funcoesForm[item.id]!.cargo"
                :disabled="editando !== item.id"
                density="compact"
                hide-details
              />
            </td>
            <td>
              <v-select
                v-model="funcoesForm[item.id]!.nocivo"
                :items="opcoesNocivo"
                :disabled="editando !== item.id"
                density="compact"
                hide-details
                clearable
              />
            </td>
            <td class="text-end">
              <v-btn v-if="editando !== item.id" variant="text" size="small" @click="editando = item.id">Editar</v-btn
              ><template v-else
                ><v-btn variant="text" size="small" :disabled="salvando === item.id" @click="editando = null"
                  >Cancelar</v-btn
                ><v-btn
                  color="primary"
                  variant="text"
                  size="small"
                  :loading="salvando === item.id"
                  @click="salvarFuncao(item)"
                  >Salvar</v-btn
                ></template
              >
            </td>
          </tr>
          <tr v-if="!funcoes.length && !carregando">
            <td colspan="4">Nenhuma função carregada.</td>
          </tr>
        </tbody></v-table
      >
    </div>
    <div v-else class="responsive-table-shell">
      <v-table density="comfortable"
        ><thead>
          <tr>
            <th>Turno</th>
            <th>Código de escala</th>
            <th>Tipo de jornada</th>
            <th>Tempo parcial</th>
            <th>Regime</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in turnos" :key="item.id">
            <td>{{ item.nome }}</td>
            <td>
              <v-text-field
                v-model="turnosForm[item.id]!.escala"
                :disabled="editando !== item.id"
                density="compact"
                hide-details
              />
            </td>
            <td>
              <v-select
                v-model="turnosForm[item.id]!.jornada"
                :items="opcoesJornada"
                :disabled="editando !== item.id"
                density="compact"
                hide-details
                clearable
              />
            </td>
            <td>
              <v-select
                v-model="turnosForm[item.id]!.parcial"
                :items="opcoesParcial"
                :disabled="editando !== item.id"
                density="compact"
                hide-details
                clearable
              />
            </td>
            <td>
              <v-select
                v-model="turnosForm[item.id]!.regime"
                :items="opcoesRegime"
                :disabled="editando !== item.id"
                density="compact"
                hide-details
                clearable
              />
            </td>
            <td class="text-end">
              <v-btn v-if="editando !== item.id" variant="text" size="small" @click="editando = item.id">Editar</v-btn
              ><template v-else
                ><v-btn variant="text" size="small" @click="editando = null">Cancelar</v-btn
                ><v-btn
                  color="primary"
                  variant="text"
                  size="small"
                  :loading="salvando === item.id"
                  @click="salvarTurno(item)"
                  >Salvar</v-btn
                ></template
              >
            </td>
          </tr>
          <tr v-if="!turnos.length && !carregando">
            <td colspan="6">Nenhum turno carregado.</td>
          </tr>
        </tbody></v-table
      >
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
@media (max-width: 700px) {
  .questor-card__cabecalho {
    flex-direction: column;
  }
}
</style>
