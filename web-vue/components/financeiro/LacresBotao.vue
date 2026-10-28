<script setup lang="ts">
import { computed } from "vue";
import type { LacreRelatorio } from "@padaria/shared/transferencias";
import { ROTULO_SITUACAO_LACRE } from "~/utils/transferencias-relatorio";

// Coluna "Lacres" do relatorio: so um botao. Os numeros ficam num popup pequeno, agrupados por tipo
// (Abertura, Fechamento, Sangria) com o estado de cada um. Numero oculto (null) aparece como "Oculto".
const props = defineProps<{
  lacres: LacreRelatorio[];
  nLacreDoc: string | null;
  // Malote Cofre -> PDV: mostra os tres grupos mesmo quando algum nao foi informado.
  malote: boolean;
  idTitulo: string;
}>();

type Item = { numero: string | null; estado: string };
type Grupo = { chave: string; titulo: string; itens: Item[]; vazio: string };

const NOME: Record<LacreRelatorio["tipo"], string> = {
  abertura: "Abertura",
  fechamento: "Fechamento",
  sangria: "Sangria"
};

const grupos = computed<Grupo[]>(() => {
  const resultado: Grupo[] = [];
  for (const tipo of ["abertura", "fechamento", "sangria"] as const) {
    const itens = props.lacres
      .filter((lacre) => lacre.tipo === tipo)
      .map((lacre) => ({ numero: lacre.numero, estado: ROTULO_SITUACAO_LACRE[lacre.situacao] }));
    if (!itens.length && !props.malote) continue;
    resultado.push({
      chave: tipo,
      titulo: NOME[tipo],
      itens,
      vazio: tipo === "sangria" ? "Sem bolsas" : "Não informado"
    });
  }
  return resultado;
});

const total = computed(() => props.lacres.length || (props.nLacreDoc ? 1 : 0));
</script>

<template>
  <v-menu location="bottom start" :close-on-content-click="false" max-width="340">
    <template #activator="{ props: ativador }">
      <v-btn
        v-if="total"
        v-bind="ativador"
        size="small"
        variant="outlined"
        prepend-icon="mdi-lock-outline"
        class="lacres-botao"
        data-teste="botao-lacres"
        :aria-label="`Ver lacres (${total})`"
        >Lacres<span class="lacres-botao__qtd cx-num">{{ total }}</span></v-btn
      >
      <span v-else class="lacres-botao__vazio">Sem lacre</span>
    </template>

    <div class="lacres-popup" role="dialog" aria-label="Lacres da transferência" data-teste="popup-lacres">
      <template v-if="lacres.length">
        <section v-for="grupo in grupos" :key="grupo.chave" class="lacres-popup__grupo">
          <h4>{{ grupo.titulo }}</h4>
          <ul v-if="grupo.itens.length">
            <li v-for="(item, indice) in grupo.itens" :key="`${grupo.chave}-${indice}`">
              <strong v-if="item.numero !== null" class="cx-num">{{ item.numero }}</strong>
              <span v-else class="lacres-popup__oculto"
                ><v-icon icon="mdi-eye-off-outline" size="14" aria-hidden="true" />Oculto</span
              >
              <span class="lacres-popup__estado">{{ item.estado }}</span>
            </li>
          </ul>
          <p v-else class="lacres-popup__estado">{{ grupo.vazio }}</p>
        </section>
      </template>
      <section v-else class="lacres-popup__grupo">
        <h4>Lacre</h4>
        <ul>
          <li>
            <strong class="cx-num">{{ nLacreDoc }}</strong>
          </li>
        </ul>
      </section>
    </div>
  </v-menu>
</template>

<style scoped>
.lacres-botao {
  min-height: 44px;
  text-transform: none;
  letter-spacing: 0;
  font-weight: 700;
}
.lacres-botao__qtd {
  margin-left: var(--cx-sp-2);
  padding: 0 6px;
  border-radius: var(--cx-r-sm);
  background: var(--cx-surface-sunken);
  font-size: var(--cx-fs-caption);
}
.lacres-botao__vazio {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 var(--cx-sp-3);
  border: 1px dashed var(--cx-line);
  border-radius: var(--cx-r-md);
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
.lacres-popup {
  display: grid;
  gap: var(--cx-sp-3);
  min-width: 240px;
  padding: var(--cx-sp-3) var(--cx-sp-4);
  border: 1px solid var(--cx-line);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface-raised);
  color: var(--cx-ink);
}
.lacres-popup__grupo h4 {
  margin: 0 0 var(--cx-sp-1);
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-micro);
  font-weight: 800;
  letter-spacing: var(--cx-tracking-wide);
  text-transform: uppercase;
}
.lacres-popup__grupo ul {
  display: grid;
  gap: var(--cx-sp-1);
  margin: 0;
  padding: 0;
  list-style: none;
}
.lacres-popup__grupo li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--cx-sp-1) var(--cx-sp-3);
  font-size: var(--cx-fs-body);
}
.lacres-popup__grupo p {
  margin: 0;
  font-size: var(--cx-fs-caption);
}
.lacres-popup__estado {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
.lacres-popup__oculto {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--cx-ink-soft);
  font-weight: 600;
}
</style>
