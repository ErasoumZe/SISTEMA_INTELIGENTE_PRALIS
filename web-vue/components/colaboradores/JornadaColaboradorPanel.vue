<script setup lang="ts">
import { mensagemErro } from "~/utils/domain";

const props = defineProps<{ colaboradorId: string; empresaId: string; podeEditar: boolean }>();

type Dia = "SEGUNDA" | "TERCA" | "QUARTA" | "QUINTA" | "SEXTA" | "SABADO" | "DOMINGO";
type Cargo = { id: string; cargoNome: string | null; ativo: boolean; dataInicio: string };
type Jornada = {
  id: string;
  diaDaSemana: Dia;
  horaEntrada: string | null;
  cargaHorariaDiariaEmMinutos: number;
  intervaloMinutos: number;
  colaboradorCargoId: string | null;
  dataInicio: string;
  ativo: boolean;
  cargoNome: string | null;
};
type Linha = {
  diaDaSemana: Dia;
  ativo: boolean;
  horaEntrada: string;
  cargaHorariaDiariaEmMinutos: number;
  intervaloMinutos: number;
  colaboradorCargoId: string;
};

const dias: Array<{ valor: Dia; rotulo: string }> = [
  { valor: "SEGUNDA", rotulo: "Segunda-feira" },
  { valor: "TERCA", rotulo: "Terça-feira" },
  { valor: "QUARTA", rotulo: "Quarta-feira" },
  { valor: "QUINTA", rotulo: "Quinta-feira" },
  { valor: "SEXTA", rotulo: "Sexta-feira" },
  { valor: "SABADO", rotulo: "Sábado" },
  { valor: "DOMINGO", rotulo: "Domingo" }
];

const { apiGetPaginado, apiPost } = useApi();
const carregando = ref(true);
const salvando = ref(false);
const erro = ref("");
const salvo = ref("");
const cargos = ref<Cargo[]>([]);
const jornadas = ref<Jornada[]>([]);
const dataInicio = ref(new Date().toISOString().slice(0, 10));
const linhas = ref<Linha[]>(
  dias.map(({ valor }) => ({
    diaDaSemana: valor,
    ativo: false,
    horaEntrada: "08:00",
    cargaHorariaDiariaEmMinutos: 480,
    intervaloMinutos: 60,
    colaboradorCargoId: ""
  }))
);

const cargoPadrao = computed(() => cargos.value.find((cargo) => cargo.ativo)?.id ?? "");
const diasAtivos = computed(() => linhas.value.filter((linha) => linha.ativo));

function rotuloDia(dia: Dia) {
  return dias.find((item) => item.valor === dia)?.rotulo ?? dia;
}

function formatarData(valor: string) {
  const data = new Date(`${valor.slice(0, 10)}T00:00:00`);
  return Number.isNaN(data.getTime()) ? valor : data.toLocaleDateString("pt-BR");
}

function hidratarFormulario() {
  const primeira = jornadas.value.find((jornada) => jornada.ativo);
  if (primeira) dataInicio.value = primeira.dataInicio.slice(0, 10);
  for (const linha of linhas.value) {
    const jornada = jornadas.value.find((item) => item.diaDaSemana === linha.diaDaSemana && item.ativo);
    if (!jornada) continue;
    linha.ativo = jornada.cargaHorariaDiariaEmMinutos > 0;
    linha.horaEntrada = jornada.horaEntrada?.slice(0, 5) ?? "08:00";
    linha.cargaHorariaDiariaEmMinutos = jornada.cargaHorariaDiariaEmMinutos;
    linha.intervaloMinutos = jornada.intervaloMinutos;
    linha.colaboradorCargoId = jornada.colaboradorCargoId ?? cargoPadrao.value;
  }
  for (const linha of linhas.value) {
    if (!linha.colaboradorCargoId) linha.colaboradorCargoId = cargoPadrao.value;
  }
}

async function carregar() {
  carregando.value = true;
  erro.value = "";
  try {
    const [cargosPagina, jornadasPagina] = await Promise.all([
      apiGetPaginado<Cargo>(`/api/colaboradores/${props.colaboradorId}/cargos?page=1&pageSize=100`),
      apiGetPaginado<Jornada>(`/api/colaboradores/${props.colaboradorId}/jornadas?page=1&pageSize=100`)
    ]);
    cargos.value = cargosPagina.itens;
    jornadas.value = jornadasPagina.itens;
    hidratarFormulario();
  } catch (error) {
    erro.value = mensagemErro(error);
  } finally {
    carregando.value = false;
  }
}

async function salvar() {
  if (!props.podeEditar || salvando.value) return;
  erro.value = "";
  salvo.value = "";
  if (!dataInicio.value) {
    erro.value = "Informe a data de início da jornada.";
    return;
  }
  if (!diasAtivos.value.length) {
    erro.value = "Ative pelo menos um dia da semana.";
    return;
  }
  const semCargo = diasAtivos.value.find((linha) => !linha.colaboradorCargoId);
  if (semCargo) {
    erro.value = `Selecione o cargo de ${rotuloDia(semCargo.diaDaSemana).toLowerCase()}.`;
    return;
  }
  salvando.value = true;
  try {
    await apiPost(`/api/colaboradores/${props.colaboradorId}/jornadas`, {
      empresaId: props.empresaId,
      dataInicio: dataInicio.value,
      dias: linhas.value.map((linha) => ({
        diaDaSemana: linha.diaDaSemana,
        faixas: [
          {
            horaEntrada: linha.ativo ? linha.horaEntrada : "",
            cargaHorariaDiariaEmMinutos: linha.ativo ? Number(linha.cargaHorariaDiariaEmMinutos) : 0,
            intervaloMinutos: linha.ativo ? Number(linha.intervaloMinutos) : 0,
            colaboradorCargoId: linha.ativo ? linha.colaboradorCargoId : null
          }
        ]
      }))
    });
    salvo.value = "Jornada salva. Ela já pode ser usada como base para o controle de ponto.";
    await carregar();
  } catch (error) {
    erro.value = mensagemErro(error);
  } finally {
    salvando.value = false;
  }
}

onMounted(carregar);
</script>

<template>
  <section class="jornada" aria-label="Jornada e controle de ponto">
    <header class="jornada__cabecalho">
      <div>
        <p class="jornada__contexto">Cadastro operacional</p>
        <h2>Jornada e ponto</h2>
        <p>Cadastre a jornada semanal do colaborador. O registro das batidas de ponto será a próxima etapa.</p>
      </div>
      <v-chip v-if="jornadas.some((jornada) => jornada.ativo)" color="success" variant="flat" size="small">
        Jornada cadastrada
      </v-chip>
    </header>

    <v-alert v-if="erro" type="error" variant="tonal" class="mb-4">{{ erro }}</v-alert>
    <v-alert v-if="salvo" type="success" variant="tonal" class="mb-4">{{ salvo }}</v-alert>
    <v-progress-linear v-if="carregando" indeterminate color="primary" class="mb-4" />

    <v-card v-if="!carregando" variant="outlined" class="jornada__card">
      <v-card-text>
        <v-alert v-if="!cargos.some((cargo) => cargo.ativo)" type="warning" variant="tonal" class="mb-4">
          Este colaborador ainda não possui cargo ativo. Cadastre o cargo antes de salvar a jornada.
        </v-alert>
        <div class="jornada__topo">
          <v-text-field
            v-model="dataInicio"
            type="date"
            label="Jornada válida a partir de"
            :disabled="!props.podeEditar"
          />
          <span class="jornada__ajuda">A alteração substitui os horários ativos dos dias informados.</span>
        </div>

        <div class="jornada__dias">
          <div v-for="linha in linhas" :key="linha.diaDaSemana" class="jornada__linha">
            <v-checkbox
              v-model="linha.ativo"
              :label="rotuloDia(linha.diaDaSemana)"
              hide-details
              :disabled="!props.podeEditar"
            />
            <v-text-field
              v-model="linha.horaEntrada"
              type="time"
              label="Entrada"
              hide-details
              :disabled="!linha.ativo || !props.podeEditar"
            />
            <v-text-field
              v-model.number="linha.cargaHorariaDiariaEmMinutos"
              type="number"
              min="0"
              step="30"
              label="Carga (min.)"
              hide-details
              :disabled="!linha.ativo || !props.podeEditar"
            />
            <v-text-field
              v-model.number="linha.intervaloMinutos"
              type="number"
              min="0"
              step="5"
              label="Intervalo (min.)"
              hide-details
              :disabled="!linha.ativo || !props.podeEditar"
            />
            <v-select
              v-model="linha.colaboradorCargoId"
              :items="cargos.filter((cargo) => cargo.ativo)"
              item-title="cargoNome"
              item-value="id"
              label="Cargo"
              hide-details
              :disabled="!linha.ativo || !props.podeEditar"
            />
          </div>
        </div>
      </v-card-text>
      <v-card-actions v-if="props.podeEditar" class="jornada__acoes">
        <v-spacer />
        <v-btn color="primary" variant="flat" prepend-icon="mdi-content-save" :loading="salvando" @click="salvar">
          Salvar jornada
        </v-btn>
      </v-card-actions>
    </v-card>

    <v-card v-if="!carregando && jornadas.length" variant="outlined" class="jornada__card jornada__historico">
      <v-card-title>Horários registrados</v-card-title>
      <v-list density="compact">
        <v-list-item v-for="jornada in jornadas" :key="jornada.id">
          <template #prepend
            ><v-icon :color="jornada.ativo ? 'success' : 'disabled'" icon="mdi-clock-outline"
          /></template>
          <v-list-item-title>
            {{ rotuloDia(jornada.diaDaSemana) }} ·
            {{
              jornada.cargaHorariaDiariaEmMinutos
                ? `${jornada.horaEntrada?.slice(0, 5)} · ${jornada.cargaHorariaDiariaEmMinutos} min`
                : "Folga"
            }}
          </v-list-item-title>
          <v-list-item-subtitle
            >Válido desde {{ formatarData(jornada.dataInicio) }} ·
            {{ jornada.cargoNome ?? "Cargo não informado" }}</v-list-item-subtitle
          >
        </v-list-item>
      </v-list>
    </v-card>
  </section>
</template>

<style scoped>
.jornada {
  display: grid;
  gap: 14px;
}
.jornada__cabecalho {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.jornada__contexto {
  color: #b7a3ff;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.jornada__cabecalho h2 {
  font-size: 1.1rem;
  margin: 0 0 4px;
}
.jornada__cabecalho p:last-child,
.jornada__ajuda {
  color: rgba(var(--v-theme-on-surface), 0.66);
  font-size: 0.85rem;
  margin: 0;
}
.jornada__card {
  background: #1b2128;
  border-color: #303943;
  border-radius: 12px;
  box-shadow: none;
}
.jornada__topo {
  display: grid;
  grid-template-columns: minmax(220px, 280px) 1fr;
  gap: 14px;
  align-items: center;
  margin-bottom: 16px;
}
.jornada__dias {
  display: grid;
  gap: 10px;
}
.jornada__linha {
  display: grid;
  grid-template-columns: 1.2fr repeat(3, minmax(120px, 1fr)) minmax(180px, 1.3fr);
  gap: 10px;
  align-items: center;
  padding: 10px;
  border: 1px solid #303943;
  border-radius: 8px;
}
.jornada__linha :deep(.v-checkbox) {
  margin-top: -8px;
}
.jornada__acoes {
  border-top: 1px solid #303943;
  padding: 14px 16px;
}
.jornada__historico :deep(.v-card-title) {
  border-bottom: 1px solid #303943;
  font-size: 0.95rem;
}
@media (max-width: 900px) {
  .jornada__linha {
    grid-template-columns: 1fr 1fr;
  }
  .jornada__linha :deep(.v-checkbox) {
    grid-column: 1 / -1;
  }
}
@media (max-width: 560px) {
  .jornada__topo {
    grid-template-columns: 1fr;
  }
  .jornada__linha {
    grid-template-columns: 1fr;
  }
  .jornada__acoes .v-btn {
    width: 100%;
  }
}
</style>
