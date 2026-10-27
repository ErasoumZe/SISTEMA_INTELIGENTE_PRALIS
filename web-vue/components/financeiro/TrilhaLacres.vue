<script setup lang="ts">
import { computed } from "vue";
import type { LacreRelatorio } from "@padaria/shared/transferencias";
import { ROTULO_SITUACAO_LACRE, resumirSangrias, textoSangrias } from "~/utils/transferencias-relatorio";

// A "trilha de lacres" de uma linha: Abertura · Sangria · Fechamento, sempre nessa ordem, cada marca com
// icone + palavra + estado. Numero oculto (null) aparece como "Oculto", nunca em branco.
const props = withDefaults(
  defineProps<{
    lacres: LacreRelatorio[];
    nLacreDoc: string | null;
    // Malote Cofre -> PDV: mostra as tres marcas. Nas demais linhas mostra so o que existe.
    malote: boolean;
    empilhado?: boolean;
  }>(),
  { empilhado: false }
);

type Marca = { chave: string; tipo: string; titulo: string; estado: string; icone: string; oculto: boolean };

const ICONE_ABERTURA = { disponivel: "mdi-lock-open-variant-outline", usado: "mdi-lock-check-outline" } as const;

const marcas = computed<Marca[]>(() => {
  const resultado: Marca[] = [];
  const abertura = props.lacres.find((lacre) => lacre.tipo === "abertura");
  const fechamento = props.lacres.find((lacre) => lacre.tipo === "fechamento");
  const sangrias = props.lacres.filter((lacre) => lacre.tipo === "sangria");

  if (abertura) {
    const usado = abertura.situacao === "usado";
    resultado.push({
      chave: "abertura",
      tipo: "abertura",
      titulo: `Abertura ${abertura.numero ?? ""}`.trim(),
      estado: ROTULO_SITUACAO_LACRE[abertura.situacao],
      icone: usado ? ICONE_ABERTURA.usado : ICONE_ABERTURA.disponivel,
      oculto: abertura.numero === null
    });
  }

  if (props.malote) {
    const resumo = resumirSangrias(sangrias);
    resultado.push({
      chave: "sangria",
      tipo: "sangria",
      titulo: "Sangria",
      estado: textoSangrias(resumo),
      icone: resumo.total > 0 && resumo.disponiveis === 0 ? "mdi-check-circle-outline" : "mdi-bag-personal-outline",
      oculto: false
    });
  } else if (sangrias.length) {
    // Linha de sangria/retorno: o lacre dela e a bolsa que consumiu.
    for (const [indice, lacre] of sangrias.entries()) {
      resultado.push({
        chave: `sangria-${indice}`,
        tipo: "sangria",
        titulo: `Sangria ${lacre.numero ?? ""}`.trim(),
        estado: ROTULO_SITUACAO_LACRE[lacre.situacao],
        icone: lacre.situacao === "conferida" ? "mdi-check-circle-outline" : "mdi-bag-personal-outline",
        oculto: lacre.numero === null
      });
    }
  }

  if (fechamento) {
    resultado.push({
      chave: "fechamento",
      tipo: "fechamento",
      titulo: `Fechamento ${fechamento.numero ?? ""}`.trim(),
      estado: ROTULO_SITUACAO_LACRE[fechamento.situacao],
      icone: fechamento.situacao === "usado" ? "mdi-lock-check-outline" : "mdi-lock-clock",
      oculto: fechamento.numero === null
    });
  } else if (props.malote) {
    resultado.push({
      chave: "fechamento",
      tipo: "fechamento",
      titulo: "Fechamento",
      estado: "Não informado",
      icone: "mdi-lock-outline",
      oculto: false
    });
  }

  return resultado;
});

const semNenhum = computed(() => marcas.value.length === 0);
</script>

<template>
  <ul class="trilha" :class="{ 'trilha--empilhada': empilhado }" aria-label="Lacres">
    <li v-for="marca in marcas" :key="marca.chave" class="trilha__marca" :data-tipo="marca.tipo">
      <v-icon :icon="marca.icone" size="16" aria-hidden="true" />
      <span class="trilha__texto">
        <span class="trilha__titulo">
          {{ marca.titulo }}
          <span v-if="marca.oculto" class="trilha__oculto">
            <v-icon icon="mdi-eye-off-outline" size="13" aria-hidden="true" />Oculto
          </span>
        </span>
        <span class="trilha__estado">{{ marca.estado }}</span>
      </span>
    </li>
    <li v-if="semNenhum && nLacreDoc" class="trilha__marca" data-tipo="comum">
      <v-icon icon="mdi-lock-outline" size="16" aria-hidden="true" />
      <span class="trilha__texto">
        <span class="trilha__titulo">Lacre {{ nLacreDoc }}</span>
      </span>
    </li>
    <li v-else-if="semNenhum" class="trilha__marca trilha__marca--vazia" data-tipo="nenhum">
      <v-icon icon="mdi-lock-off-outline" size="16" aria-hidden="true" />
      <span class="trilha__texto"><span class="trilha__titulo">Sem lacre</span></span>
    </li>
  </ul>
</template>

<style scoped>
.trilha {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-1) var(--cx-sp-2);
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: 0;
}
.trilha--empilhada {
  flex-direction: column;
  flex-wrap: nowrap;
}
.trilha__marca {
  display: inline-flex;
  align-items: flex-start;
  gap: var(--cx-sp-2);
  max-width: 100%;
  padding: var(--cx-sp-1) var(--cx-sp-2);
  border: 1px solid var(--cx-line);
  border-radius: var(--cx-r-sm);
  background: var(--cx-surface-sunken);
  color: var(--cx-ink);
  font-size: var(--cx-fs-caption);
  line-height: 1.25;
}
.trilha__marca :deep(.v-icon) {
  margin-top: 1px;
  color: var(--cat-transferencias-tinta);
}
.trilha__marca--vazia {
  color: var(--cx-ink-soft);
}
.trilha__texto {
  display: grid;
  min-width: 0;
}
.trilha__titulo {
  overflow-wrap: anywhere;
  font-weight: 700;
}
.trilha__estado {
  color: var(--cx-ink-soft);
}
.trilha__oculto {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: var(--cx-sp-1);
  color: var(--cx-ink-soft);
  font-weight: 600;
}
</style>
