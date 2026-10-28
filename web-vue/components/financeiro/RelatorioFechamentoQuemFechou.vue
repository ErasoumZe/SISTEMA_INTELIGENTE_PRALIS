<script setup lang="ts">
import { computed } from "vue";

type Registro = Record<string, unknown>;

// Cabecalho do popup do fechamento: quem abriu, quem fechou, quando e em qual posto. So le o que o
// dossie ja devolve (nada recalcula); substitui o bloco "Identificacao" que ficava no fim da folha.
const props = defineProps<{
  caixa: Registro;
  resumo: Registro | null;
  texto: (valor: unknown) => string;
  dataHora: (valor: unknown) => string;
}>();

function nome(valor: unknown) {
  return typeof valor === "string" && valor.trim() ? valor.trim() : "";
}

const fechadoEm = computed(() => props.resumo?.fechadoEm ?? props.resumo?.dataHoraFechamento ?? props.caixa.fechadoEm);
const responsavel = computed(
  () => nome(props.resumo?.caixaResponsavelNomeFechamento) || nome(props.caixa.usuarioCaixaNome)
);
const duracao = computed(() => {
  const inicio = Date.parse(String(props.caixa.dataHoraAbertura ?? ""));
  const fim = Date.parse(String(fechadoEm.value ?? ""));
  if (Number.isNaN(inicio) || Number.isNaN(fim) || fim < inicio) return "";
  const minutos = Math.round((fim - inicio) / 60_000);
  return `${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, "0")}`;
});
const fechadoPor = computed(() => nome(props.resumo?.fechadoPorNome));
const abertura = computed(() => {
  const operador = nome(props.caixa.caixaResponsavelNomeAbertura);
  const supervisor = nome(props.caixa.supervisorResponsavelNomeAbertura);
  if (!operador) return "";
  return supervisor ? `${operador} · supervisor ${supervisor}` : operador;
});
</script>

<template>
  <section class="qf" aria-labelledby="qf-titulo" data-teste="quem-fechou">
    <header class="qf__topo">
      <div>
        <div class="text-overline">FECHAMENTO</div>
        <h3 id="qf-titulo" class="qf__titulo">{{ texto(caixa.pdvNome) }} · {{ texto(caixa.turnoNome) }}</h3>
      </div>
      <p v-if="duracao" class="qf__duracao">Turno de {{ duracao }}</p>
    </header>

    <div class="qf__grade">
      <section class="qf__bloco" aria-label="Fechamento">
        <h4>Quem fechou</h4>
        <dl>
          <div>
            <dt>Operador</dt>
            <dd data-teste="qf-operador">{{ responsavel || "—" }}</dd>
          </div>
          <div>
            <dt>Supervisor</dt>
            <dd>{{ nome(resumo?.supervisorResponsavelNomeFechamento) || "—" }}</dd>
          </div>
          <div>
            <dt>Fechado em</dt>
            <dd>{{ fechadoEm ? dataHora(fechadoEm) : "—" }}</dd>
          </div>
          <div v-if="fechadoPor && fechadoPor !== responsavel">
            <dt>Registrado por</dt>
            <dd>{{ fechadoPor }}</dd>
          </div>
        </dl>
      </section>

      <section class="qf__bloco" aria-label="Abertura">
        <h4>Abertura</h4>
        <dl>
          <div>
            <dt>Operador</dt>
            <dd>{{ abertura || "—" }}</dd>
          </div>
          <div>
            <dt>Aberto em</dt>
            <dd>{{ caixa.dataHoraAbertura ? dataHora(caixa.dataHoraAbertura) : "—" }}</dd>
          </div>
          <div v-if="nome(caixa.usuarioCaixaNome)">
            <dt>Conta do posto</dt>
            <dd>{{ nome(caixa.usuarioCaixaNome) }}</dd>
          </div>
        </dl>
      </section>
    </div>
  </section>
</template>

<style scoped>
.qf {
  display: grid;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-4);
  border: 1px solid var(--cx-line);
  border-left: 4px solid var(--cx-brand);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface-raised);
  color: var(--cx-ink);
}
.qf__topo {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--cx-sp-2);
}
.qf__titulo {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: var(--cx-fs-lead);
  font-weight: 800;
}
.qf__duracao {
  margin: 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
.qf__grade {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--cx-sp-3);
}
.qf__bloco {
  padding: var(--cx-sp-3);
  border-radius: var(--cx-r-md);
  background: var(--cx-surface-sunken);
}
.qf__bloco h4 {
  margin: 0 0 var(--cx-sp-2);
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.qf__bloco dl {
  display: grid;
  gap: var(--cx-sp-2);
  margin: 0;
}
.qf__bloco dl > div {
  display: grid;
  grid-template-columns: minmax(96px, 0.8fr) minmax(0, 1.4fr);
  align-items: baseline;
  gap: var(--cx-sp-2);
}
.qf__bloco dt {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
.qf__bloco dd {
  margin: 0;
  overflow-wrap: anywhere;
  font-weight: 700;
}
@media (width <= 480px) {
  .qf__bloco dl > div {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }
}
</style>
