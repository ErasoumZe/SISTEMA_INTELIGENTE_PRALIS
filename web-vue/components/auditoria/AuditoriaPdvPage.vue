<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import type { AgendaAuditoria, AuditoriaDia, ConsultaAuditoria } from "@padaria/shared";
import AuditoriaPdvAgenda from "~/components/auditoria/AuditoriaPdvAgenda.vue";
import AuditoriaPdvDia from "~/components/auditoria/AuditoriaPdvDia.vue";
import AuditoriaPdvFiltros, { type FiltrosAuditoria } from "~/components/auditoria/AuditoriaPdvFiltros.vue";
import { dinheiro, mensagemErro } from "~/utils/domain";

// Auditoria de PDVs (Marco, 13-14/11/2026): filtros (periodo, PDV, turno, hora, forma, situacao) e a lista dos
// dias com cada PDV contra a CREARE. Em cada dia da para gerar a auditoria; o automatico gera sozinho.
const props = defineProps<{ empresaId: string }>();
const { apiGet, apiPost, apiPut } = useApi();

const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const seisDiasAtras = new Date(Date.parse(`${hoje}T12:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10);
const filtros = ref<FiltrosAuditoria>({
  inicio: seisDiasAtras,
  fim: hoje,
  pdvId: null,
  turno: null,
  horaInicio: "",
  horaFim: "",
  forma: null,
  status: null
});
const consulta = ref<ConsultaAuditoria>({
  resumo: { vendas: 0, total: 0, vendasFora: 0, valorFora: 0 },
  dias: [],
  pdvs: []
});
const agenda = ref<AgendaAuditoria>({ ativa: false, horario: "23:30" });
const dialogoAgenda = ref(false);
const carregando = ref(false);
const gerandoData = ref<string | null>(null);
const salvandoAgenda = ref(false);
const erro = ref("");
const aviso = ref("");

const query = (extra: Record<string, string | null>) => {
  const params = new URLSearchParams({ empresaId: props.empresaId });
  for (const [chave, valor] of Object.entries(extra)) if (valor) params.set(chave, valor);
  return `?${params.toString()}`;
};

let pedido = 0;
async function carregar() {
  if (!props.empresaId || !filtros.value.inicio || !filtros.value.fim) return;
  const atual = ++pedido;
  carregando.value = true;
  erro.value = "";
  try {
    const resposta = await apiGet<ConsultaAuditoria>(`/api/auditoria-pdv/consulta${query(filtros.value)}`);
    if (atual === pedido) consulta.value = resposta;
  } catch (falha) {
    if (atual === pedido) erro.value = mensagemErro(falha);
  } finally {
    if (atual === pedido) carregando.value = false;
  }
}

async function gerar(data: string) {
  gerandoData.value = data;
  erro.value = "";
  aviso.value = "";
  try {
    const dia = await apiPost<AuditoriaDia>("/api/auditoria-pdv/gerar", { empresaId: props.empresaId, data });
    const quando = `${data.slice(8, 10)}/${data.slice(5, 7)}`;
    aviso.value = dia.vendasFora
      ? `Auditoria de ${quando} gerada: ${dia.vendasFora} venda(s) fora de caixa. A Tesouraria foi avisada.`
      : `Auditoria de ${quando} gerada: todas as vendas caíram em caixa.`;
    await carregar();
  } catch (falha) {
    erro.value = mensagemErro(falha);
  } finally {
    gerandoData.value = null;
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

watch([filtros, () => props.empresaId], () => void carregar(), { deep: true });
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
      <v-btn variant="tonal" prepend-icon="mdi-clock-outline" @click="dialogoAgenda = true">
        {{ agenda.ativa ? `Automático ${agenda.horario}` : "Automático desligado" }}
      </v-btn>
    </header>

    <AuditoriaPdvFiltros v-model="filtros" :pdvs="consulta.pdvs" :hoje="hoje" />

    <v-alert v-if="erro" type="error" variant="tonal" closable @click:close="erro = ''">{{ erro }}</v-alert>
    <v-alert v-if="aviso" type="success" variant="tonal" closable @click:close="aviso = ''">{{ aviso }}</v-alert>

    <div class="auditoria__resumo" aria-live="polite" data-teste="auditoria-resumo">
      <span
        ><strong>{{ consulta.resumo.vendas }}</strong> vendas</span
      >
      <span
        ><strong>{{ dinheiro(consulta.resumo.total) }}</strong> na CREARE</span
      >
      <span :class="{ 'texto-alerta': consulta.resumo.vendasFora }"
        ><strong>{{ consulta.resumo.vendasFora }}</strong> fora de caixa ({{
          dinheiro(consulta.resumo.valorFora)
        }})</span
      >
      <span
        ><strong>{{ consulta.dias.length }}</strong> dia(s)</span
      >
    </div>
    <v-progress-linear v-if="carregando" indeterminate color="primary" />

    <p v-if="!carregando && !consulta.dias.length" class="auditoria__vazio">
      Nada encontrado com esses filtros. Mude o período ou limpe os filtros.
    </p>
    <AuditoriaPdvDia
      v-for="dia in consulta.dias"
      :key="dia.data"
      :dia="dia"
      :gerando="gerandoData === dia.data"
      @gerar="gerar(dia.data)"
    />

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
.auditoria__resumo {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 20px;
  color: var(--cx-ink-soft);
  font-size: 0.9rem;
}
.auditoria__resumo strong {
  color: var(--cx-ink);
  font-variant-numeric: tabular-nums;
}
.auditoria__resumo .texto-alerta,
.auditoria__resumo .texto-alerta strong {
  color: var(--cx-negative);
}
.auditoria__vazio {
  margin: 0;
  color: var(--cx-ink-soft);
}
@media (max-width: 760px) {
  .auditoria__topo :deep(.v-btn) {
    width: 100%;
  }
}
</style>
