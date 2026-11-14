<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type { AgendaAuditoria, AuditoriaDia, AuditoriaDiaResumo } from "@padaria/shared";
import AuditoriaPdvAgenda from "~/components/auditoria/AuditoriaPdvAgenda.vue";
import AuditoriaPdvCalendario from "~/components/auditoria/AuditoriaPdvCalendario.vue";
import AuditoriaPdvDia from "~/components/auditoria/AuditoriaPdvDia.vue";
import { mensagemErro } from "~/utils/domain";

// Auditoria de PDVs (Marco, 13/11/2026): calendario por dia, semana ou mes. Escolhe um dia, ve como cada PDV
// fechou contra a CREARE e gera (ou deixa o sistema gerar sozinho) a auditoria do dia.
const props = defineProps<{ empresaId: string }>();
const { apiGet, apiPost, apiPut } = useApi();

type Modo = "dia" | "semana" | "mes";
const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const modo = ref<Modo>("mes");
const selecionado = ref(hoje);
const dias = ref<AuditoriaDiaResumo[]>([]);
const detalhe = ref<AuditoriaDia | null>(null);
const agenda = ref<AgendaAuditoria>({ ativa: false, horario: "23:30" });
const dialogoAgenda = ref(false);
const carregando = ref(false);
const gerando = ref(false);
const salvandoAgenda = ref(false);
const erro = ref("");
const aviso = ref("");

const deslocar = (data: string, dias: number) => {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const periodo = computed(() => {
  if (modo.value === "dia") return { inicio: selecionado.value, fim: selecionado.value };
  if (modo.value === "semana") {
    const inicio = deslocar(selecionado.value, -new Date(`${selecionado.value}T12:00:00Z`).getUTCDay());
    return { inicio, fim: deslocar(inicio, 6) };
  }
  const inicio = `${selecionado.value.slice(0, 7)}-01`;
  const fim = new Date(Date.UTC(Number(inicio.slice(0, 4)), Number(inicio.slice(5, 7)), 0)).toISOString().slice(0, 10);
  return { inicio, fim };
});
const titulo = computed(() => {
  const d = new Date(`${selecionado.value}T12:00:00Z`);
  if (modo.value === "mes") return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  if (modo.value === "dia")
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
  const { inicio, fim } = periodo.value;
  return `${inicio.slice(8, 10)}/${inicio.slice(5, 7)} a ${fim.slice(8, 10)}/${fim.slice(5, 7)}`;
});
const resumoSelecionado = computed(() => dias.value.find((dia) => dia.data === selecionado.value) ?? null);

function navegar(passo: number) {
  if (modo.value === "dia") selecionado.value = deslocar(selecionado.value, passo);
  else if (modo.value === "semana") selecionado.value = deslocar(selecionado.value, 7 * passo);
  else {
    const d = new Date(`${selecionado.value.slice(0, 7)}-01T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + passo);
    selecionado.value = d.toISOString().slice(0, 10);
  }
}

const query = (extra: Record<string, string>) =>
  "?" + new URLSearchParams({ empresaId: props.empresaId, ...extra }).toString();

async function carregar() {
  if (!props.empresaId) return;
  carregando.value = true;
  erro.value = "";
  try {
    const [lista, dia] = await Promise.all([
      apiGet<AuditoriaDiaResumo[]>(`/api/auditoria-pdv/calendario${query(periodo.value)}`),
      apiGet<AuditoriaDia>(`/api/auditoria-pdv/dia${query({ data: selecionado.value })}`)
    ]);
    dias.value = lista;
    detalhe.value = dia;
  } catch (falha) {
    erro.value = mensagemErro(falha);
  } finally {
    carregando.value = false;
  }
}

async function gerar() {
  gerando.value = true;
  erro.value = "";
  aviso.value = "";
  try {
    const dia = await apiPost<AuditoriaDia>("/api/auditoria-pdv/gerar", {
      empresaId: props.empresaId,
      data: selecionado.value
    });
    aviso.value = dia.vendasFora
      ? `Auditoria gerada: ${dia.vendasFora} venda(s) fora de caixa. A Tesouraria foi avisada.`
      : "Auditoria gerada: todas as vendas caíram em caixa.";
    await carregar();
  } catch (falha) {
    erro.value = mensagemErro(falha);
  } finally {
    gerando.value = false;
  }
}

async function salvarAgenda(nova: AgendaAuditoria) {
  salvandoAgenda.value = true;
  try {
    agenda.value = await apiPut<AgendaAuditoria>("/api/auditoria-pdv/agenda", { empresaId: props.empresaId, ...nova });
    dialogoAgenda.value = false;
  } catch (falha) {
    erro.value = mensagemErro(falha);
  } finally {
    salvandoAgenda.value = false;
  }
}

watch([modo, selecionado, () => props.empresaId], () => void carregar());
onMounted(async () => {
  await carregar();
  if (props.empresaId)
    agenda.value = await apiGet<AgendaAuditoria>(`/api/auditoria-pdv/agenda${query({})}`).catch(() => agenda.value);
});
</script>

<template>
  <section class="auditoria" aria-labelledby="auditoria-titulo">
    <header class="auditoria__topo">
      <div>
        <span class="auditoria__marca">Vendas da CREARE × caixas</span>
        <h2 id="auditoria-titulo">Auditoria de PDVs</h2>
      </div>
      <div class="auditoria__acoes">
        <v-btn variant="tonal" prepend-icon="mdi-clock-outline" @click="dialogoAgenda = true">
          {{ agenda.ativa ? `Automático ${agenda.horario}` : "Automático desligado" }}
        </v-btn>
        <v-btn
          color="primary"
          prepend-icon="mdi-calendar-check-outline"
          :loading="gerando"
          data-teste="gerar-auditoria"
          @click="gerar"
        >
          Gerar auditoria do dia
        </v-btn>
      </div>
    </header>

    <div class="auditoria__barra">
      <v-btn-toggle v-model="modo" mandatory density="comfortable" color="primary" variant="outlined" divided>
        <v-btn value="dia">Dia</v-btn>
        <v-btn value="semana">Semana</v-btn>
        <v-btn value="mes">Mês</v-btn>
      </v-btn-toggle>
      <div class="auditoria__navegar">
        <v-btn icon="mdi-chevron-left" variant="text" aria-label="Anterior" @click="navegar(-1)" />
        <strong>{{ titulo }}</strong>
        <v-btn icon="mdi-chevron-right" variant="text" aria-label="Próximo" @click="navegar(1)" />
        <v-btn variant="text" size="small" @click="selecionado = hoje">Hoje</v-btn>
      </div>
    </div>

    <v-alert v-if="erro" type="error" variant="tonal" closable @click:close="erro = ''">{{ erro }}</v-alert>
    <v-alert v-if="aviso" type="success" variant="tonal" closable @click:close="aviso = ''">{{ aviso }}</v-alert>
    <v-progress-linear v-if="carregando" indeterminate color="primary" />

    <AuditoriaPdvCalendario
      v-if="modo !== 'dia'"
      :dias="dias"
      :modo="modo"
      :referencia="selecionado"
      :selecionado="selecionado"
      @selecionar="selecionado = $event"
    />

    <p v-if="resumoSelecionado?.gerada" class="auditoria__gerada">
      Auditoria gerada {{ resumoSelecionado.gerada.automatica ? "automaticamente" : "" }} em
      {{ new Date(resumoSelecionado.gerada.em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) }}.
    </p>
    <AuditoriaPdvDia v-if="detalhe" :dia="detalhe" />

    <AuditoriaPdvAgenda v-model="dialogoAgenda" :agenda="agenda" :salvando="salvandoAgenda" @salvar="salvarAgenda" />
  </section>
</template>

<style scoped>
.auditoria {
  display: grid;
  gap: 16px;
  max-width: 1160px;
  margin: 0 auto;
  padding-bottom: 24px;
}
.auditoria__topo {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}
.auditoria__marca {
  color: var(--cx-brand-text);
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}
.auditoria__topo h2 {
  margin: 2px 0 0;
}
.auditoria__acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.auditoria__barra {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.auditoria__navegar {
  display: flex;
  align-items: center;
  gap: 4px;
}
.auditoria__navegar strong {
  min-width: 150px;
  text-align: center;
}
.auditoria__navegar strong::first-letter {
  text-transform: uppercase;
}
.auditoria__gerada {
  margin: 0;
  color: var(--cx-ink-soft);
  font-size: 0.84rem;
}
@media (max-width: 760px) {
  .auditoria__acoes,
  .auditoria__acoes :deep(.v-btn) {
    width: 100%;
  }
  .auditoria__barra {
    flex-direction: column;
    align-items: stretch;
  }
  .auditoria__navegar {
    justify-content: space-between;
  }
}
</style>
