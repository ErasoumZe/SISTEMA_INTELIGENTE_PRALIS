<script setup lang="ts">
import {
  dataHoraOuTraco,
  duracaoDaParada,
  rotuloMotivoParada,
  type ParadaComputador
} from "~/utils/relatorio-fechamento";

// Relatorio de desligamento do computador do PDV durante o caixa: cada parada com motivo, quando comecou, quando
// voltou, quanto durou e quem registrou. So leitura do dossie.
defineProps<{ paradas: ParadaComputador[] }>();
</script>

<template>
  <section class="pc" aria-labelledby="pc-parada" data-teste="parada-computador">
    <h3 id="pc-parada" class="pc__titulo">
      Parada do computador do PDV
      <span class="pc__contagem">{{ paradas.length }}</span>
    </h3>

    <p v-if="!paradas.length" class="pc__vazio">Nenhuma parada do computador foi registrada neste caixa.</p>
    <ul v-else class="pc__lista">
      <li v-for="parada in paradas" :key="parada.id" class="pc__item" :data-aberta="!parada.retornadoEm">
        <div class="pc__motivos">
          <span v-for="motivo in parada.motivos" :key="motivo" class="pc__chip">{{ rotuloMotivoParada(motivo) }}</span>
        </div>
        <p v-if="parada.motivoOutro" class="pc__outro">Outro: {{ parada.motivoOutro }}</p>
        <dl class="pc__tempos">
          <div>
            <dt>Desligou</dt>
            <dd>{{ dataHoraOuTraco(parada.iniciadoEm) }}</dd>
          </div>
          <div>
            <dt>Voltou</dt>
            <dd>{{ parada.retornadoEm ? dataHoraOuTraco(parada.retornadoEm) : "Ainda sem retorno" }}</dd>
          </div>
          <div>
            <dt>Duração</dt>
            <dd data-teste="duracao-parada">{{ duracaoDaParada(parada.iniciadoEm, parada.retornadoEm) }}</dd>
          </div>
          <div>
            <dt>Registrou</dt>
            <dd>{{ parada.registradoPorNome || "Não informado" }}</dd>
          </div>
          <div v-if="parada.retornadoEm">
            <dt>Confirmou o retorno</dt>
            <dd>{{ parada.retornadoPorNome || "Não informado" }}</dd>
          </div>
        </dl>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.pc {
  --sec: #0ea5e9;
  display: grid;
  gap: var(--cx-sp-2);
  margin-top: var(--cx-sp-3);
  padding: var(--cx-sp-4);
  border: 1px solid var(--cx-line);
  border-left: 4px solid var(--sec);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface-raised);
  color: var(--cx-ink);
}
.pc__titulo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cx-sp-2);
  margin: 0;
  font-size: var(--cx-fs-lead);
  font-weight: 800;
}
.pc__contagem {
  padding: 0 var(--cx-sp-2);
  border-radius: 999px;
  background: color-mix(in srgb, var(--sec) 18%, transparent);
  color: var(--sec);
  font-size: var(--cx-fs-caption);
  font-weight: 800;
}
.pc__vazio {
  margin: 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
.pc__lista {
  display: grid;
  gap: var(--cx-sp-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.pc__item {
  display: grid;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-3);
  border-radius: var(--cx-r-md);
  background: var(--cx-surface-sunken);
}
.pc__item[data-aberta="true"] {
  border-left: 3px solid var(--cx-negative);
}
.pc__motivos {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-1);
}
.pc__chip {
  padding: 0 var(--cx-sp-2);
  border-radius: 999px;
  background: color-mix(in srgb, var(--sec) 18%, transparent);
  font-size: var(--cx-fs-caption);
  font-weight: 700;
  overflow-wrap: anywhere;
}
.pc__outro {
  margin: 0;
  overflow-wrap: anywhere;
}
.pc__tempos {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr));
  gap: var(--cx-sp-2) var(--cx-sp-3);
  margin: 0;
}
.pc__tempos dt {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
.pc__tempos dd {
  margin: 0;
  overflow-wrap: anywhere;
  font-weight: 700;
}
</style>
