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
  if (minutos < 1) return "";
  return `${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, "0")}`;
});
const fechadoPor = computed(() => nome(props.resumo?.fechadoPorNome));
// O operador escreve (ou dita) a observacao ao fechar; ela fica em `fechamentos_caixa.observacao`.
const observacao = computed(() => nome(props.resumo?.observacao) || nome(props.caixa.observacao));
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
        <h3 id="qf-titulo" class="qf__titulo">{{ texto(caixa.pdvNome) }} · {{ texto(caixa.turnoNome) }}</h3>
      </div>
      <p v-if="duracao" class="qf__duracao">Turno de {{ duracao }}</p>
    </header>

    <div class="qf__grade">
      <section class="qf__bloco" aria-labelledby="qf-fechou">
        <h4 id="qf-fechou">Quem fechou</h4>
        <dl>
          <div>
            <dt>Operador</dt>
            <dd data-teste="qf-operador">{{ responsavel || "Não informado" }}</dd>
          </div>
          <div>
            <dt>Supervisor</dt>
            <dd>{{ nome(resumo?.supervisorResponsavelNomeFechamento) || "Não informado" }}</dd>
          </div>
          <div>
            <dt>Fechado em</dt>
            <dd>{{ fechadoEm ? dataHora(fechadoEm) : "Caixa ainda não fechado" }}</dd>
          </div>
          <div v-if="fechadoPor && fechadoPor !== responsavel">
            <dt>Registrado por</dt>
            <dd>{{ fechadoPor }}</dd>
          </div>
        </dl>
      </section>

      <section class="qf__bloco" aria-labelledby="qf-abriu">
        <h4 id="qf-abriu">Quem abriu</h4>
        <dl>
          <div>
            <dt>Operador</dt>
            <dd>{{ abertura || "Não informado" }}</dd>
          </div>
          <div>
            <dt>Aberto em</dt>
            <dd>{{ caixa.dataHoraAbertura ? dataHora(caixa.dataHoraAbertura) : "Não informado" }}</dd>
          </div>
          <div v-if="nome(caixa.usuarioCaixaNome)">
            <dt>Conta do posto</dt>
            <dd>{{ nome(caixa.usuarioCaixaNome) }}</dd>
          </div>
        </dl>
      </section>
    </div>

    <section class="qf__obs" aria-labelledby="qf-obs" data-teste="observacao-fechamento">
      <h4 id="qf-obs">Observação do fechamento</h4>
      <p v-if="observacao">{{ observacao }}</p>
      <p v-else class="qf__obs-vazia">O operador não registrou observação.</p>
    </section>
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
  grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr));
  gap: var(--cx-sp-3);
}
.qf__bloco {
  padding: var(--cx-sp-3);
  border-radius: var(--cx-r-md);
  background: var(--cx-surface-sunken);
}
.qf__obs {
  padding: var(--cx-sp-3);
  border-left: 3px solid var(--cx-brand);
  border-radius: var(--cx-r-md);
  background: var(--cx-surface-sunken);
}
.qf__obs h4 {
  margin: 0 0 var(--cx-sp-1);
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.qf__obs p {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-line;
}
.qf__obs-vazia {
  color: var(--cx-ink-soft);
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
