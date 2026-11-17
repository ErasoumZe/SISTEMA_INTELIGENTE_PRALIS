<script setup lang="ts">
import { ref, watch } from "vue";
import type { AuditoriaDia, CaixaAuditoria, PdvAuditoria, StatusAuditoria } from "@padaria/shared";
import { dinheiro } from "~/utils/domain";
import AuditoriaPdvFora from "./AuditoriaPdvFora.vue";
import { horaAuditoria as hora, listaFormasAuditoria as listaFormas } from "./auditoria-formato";

// Auditoria de PDVs: o dia aberto. Um cartao por PDV com os caixas (turno, quem abriu, vendas e total) e, se
// houver, as vendas que nao cairam em nenhum caixa — hora, valor, forma e produtos.
// mostrarFora: a escolha da pagina (mostrar ou ocultar as vendas sem caixa de todos os PDVs); cada PDV ainda pode
// abrir ou fechar a sua lista.
const props = defineProps<{ dia: AuditoriaDia; gerando: boolean; mostrarFora: boolean }>();
const emit = defineEmits<{ (e: "gerar"): void }>();

const chavePdv = (pdv: PdvAuditoria) => pdv.pdvId ?? pdv.pdvNome;
const foraAberta = ref<Record<string, boolean>>({});
watch(
  () => props.mostrarFora,
  () => (foraAberta.value = {})
);

const rotulos: Record<StatusAuditoria, string> = {
  ok: "Bateu",
  alerta: "Venda fora de caixa",
  andamento: "Caixa aberto",
  sem_vendas: "Sem vendas"
};
const cores: Record<StatusAuditoria, string> = {
  ok: "success",
  alerta: "error",
  andamento: "primary",
  sem_vendas: "default"
};
// Manha e Tarde sempre aparecem lado a lado; caixa sem turno (PDV de turno unico) ganha a propria coluna.
function colunasTurno(caixas: CaixaAuditoria[]) {
  const coluna = (rotulo: string, lista: CaixaAuditoria[]) => ({
    rotulo,
    caixas: lista,
    vendas: lista.reduce((soma, c) => soma + c.vendas, 0),
    total: lista.reduce((soma, c) => soma + Math.round(c.total * 100), 0) / 100
  });
  const colunas = [
    coluna(
      "Manhã",
      caixas.filter((c) => c.turno === "manha")
    ),
    coluna(
      "Tarde",
      caixas.filter((c) => c.turno === "tarde")
    )
  ];
  const semTurno = caixas.filter((c) => !c.turno);
  if (semTurno.length) colunas.push(coluna("Sem turno", semTurno));
  return colunas;
}
const dataLonga = (data: string) =>
  new Date(`${data}T12:00:00Z`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "UTC"
  });
const momento = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
</script>

<template>
  <section class="auditoria-dia" :aria-label="`Auditoria de ${dia.data}`" data-teste="auditoria-detalhe">
    <header class="auditoria-dia__topo">
      <div>
        <h3>{{ dataLonga(dia.data) }}</h3>
        <p>
          {{ dia.vendas }} vendas · {{ dinheiro(dia.total) }}
          <template v-if="dia.vendasFora">
            ·
            <strong class="texto-alerta"
              >{{ dia.vendasFora }} fora de caixa ({{ dinheiro(dia.valorFora) }})</strong
            ></template
          >
        </p>
        <small v-if="dia.gerada" class="auditoria-dia__gerada">
          Auditoria gerada{{ dia.gerada.automatica ? " automaticamente" : "" }} em {{ momento(dia.gerada.em) }}
        </small>
      </div>
      <div class="auditoria-dia__acoes">
        <v-chip :color="cores[dia.status]" variant="tonal" size="small">{{ rotulos[dia.status] }}</v-chip>
        <v-btn
          size="small"
          variant="tonal"
          color="primary"
          prepend-icon="mdi-calendar-check-outline"
          :loading="gerando"
          data-teste="gerar-auditoria"
          @click="emit('gerar')"
          >{{ dia.gerada ? "Gerar de novo" : "Gerar auditoria" }}</v-btn
        >
      </div>
    </header>

    <p v-if="!dia.pdvs.length" class="auditoria-dia__vazio">Nenhuma venda da CREARE neste dia.</p>

    <article v-for="pdv in dia.pdvs" :key="chavePdv(pdv)" class="auditoria-pdv" :class="`auditoria-pdv--${pdv.status}`">
      <header class="auditoria-pdv__topo">
        <strong>{{ pdv.pdvNome }}</strong>
        <v-chip :color="cores[pdv.status]" variant="tonal" size="x-small">{{ rotulos[pdv.status] }}</v-chip>
        <span class="auditoria-pdv__dia"
          >Dia (manhã + tarde): {{ pdv.vendas }} vendas · <strong>{{ dinheiro(pdv.total) }}</strong></span
        >
      </header>

      <div class="auditoria-pdv__turnos">
        <section v-for="coluna in colunasTurno(pdv.caixas)" :key="coluna.rotulo" class="auditoria-turno">
          <header class="auditoria-turno__topo">
            <span class="auditoria-turno__nome">{{ coluna.rotulo }}</span>
            <span v-if="coluna.caixas.length"
              >{{ coluna.vendas }} vendas · <strong>{{ dinheiro(coluna.total) }}</strong></span
            >
          </header>
          <p v-if="!coluna.caixas.length" class="auditoria-turno__vazio">Sem caixa neste turno.</p>
          <div v-for="caixa in coluna.caixas" :key="caixa.caixaId" class="auditoria-turno__caixa">
            <span>{{ caixa.operador ?? "—" }} · {{ hora(caixa.abertura) }}–{{ hora(caixa.fechamento) }}</span>
            <small v-if="caixa.formas.length">{{ listaFormas(caixa.formas) }}</small>
          </div>
        </section>
      </div>

      <AuditoriaPdvFora
        v-if="pdv.fora.length"
        :vendas="pdv.fora"
        :aberta="foraAberta[chavePdv(pdv)] ?? mostrarFora"
        @update:aberta="foraAberta[chavePdv(pdv)] = $event"
      />
    </article>
  </section>
</template>

<style scoped>
.auditoria-dia {
  display: grid;
  gap: 12px;
  padding-top: 14px;
  border-top: 1px solid var(--cx-line);
}
.auditoria-dia__acoes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.auditoria-dia__gerada {
  color: var(--cx-ink-soft);
  font-size: 0.8rem;
}
.auditoria-dia__topo {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.auditoria-dia__topo h3 {
  margin: 0;
  font-size: 1.05rem;
}
.auditoria-dia__topo h3::first-letter {
  text-transform: uppercase;
}
.auditoria-dia__topo p,
.auditoria-dia__vazio {
  margin: 2px 0 0;
  color: var(--cx-ink-soft);
  font-size: 0.88rem;
}
.texto-alerta {
  color: var(--cx-negative);
}
.auditoria-pdv {
  padding: 12px 14px;
  border: 1px solid var(--cx-line);
  border-left: 4px solid var(--cx-line);
  border-radius: 10px;
  background: var(--cx-surface);
}
.auditoria-pdv--ok {
  border-left-color: var(--cx-positive);
}
.auditoria-pdv--alerta {
  border-left-color: var(--cx-negative);
}
.auditoria-pdv--andamento {
  border-left-color: var(--cx-brand);
}
.auditoria-pdv__topo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}
.auditoria-pdv__topo span {
  color: var(--cx-ink-soft);
  font-size: 0.86rem;
}
.auditoria-pdv__topo .auditoria-pdv__dia {
  margin-left: auto;
}
.auditoria-pdv__dia strong {
  color: var(--cx-ink);
  font-variant-numeric: tabular-nums;
}
.auditoria-pdv__turnos {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 10px;
  margin-top: 10px;
}
.auditoria-turno {
  display: grid;
  align-content: start;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--cx-line);
  border-radius: 8px;
  font-size: 0.86rem;
}
.auditoria-turno__topo {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--cx-line);
}
.auditoria-turno__topo strong {
  font-variant-numeric: tabular-nums;
}
.auditoria-turno__nome {
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-size: 0.78rem;
  color: var(--cx-brand-text);
}
.auditoria-turno__caixa {
  display: grid;
  gap: 2px;
}
.auditoria-turno__caixa small,
.auditoria-turno__vazio {
  margin: 0;
  color: var(--cx-ink-soft);
}
@media (max-width: 760px) {
  .auditoria-pdv__topo .auditoria-pdv__dia {
    flex-basis: 100%;
    margin-left: 0;
  }
}
</style>
