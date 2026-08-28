<script setup lang="ts">
/* anchor: card de numero do Mobills (Temp/mobills.txt §06) — disco chapado com icone branco,
   rotulo em cima, valor embaixo, razao valor/rotulo ~1,4x, rotulo da secao FORA do card.
   diverge: a cor do disco vem das seis categorias que o sistema ja tem, nao de paleta nova; e a
   tipografia e a escala --cx-fs-* do 67.

   A DASHBOARD DEIXA DE SER O MENU. Antes esta pagina listava TODAS as telas permitidas, agrupadas
   por secao — 32 blocos, com sanfona. Era o menu duas vezes, e a D-HOME decidiu em 26/08 que nao
   deveria ser assim. Quatro faixas, e a ultima com CINCO atalhos.

   NADA AQUI E DADO REAL: tudo vem de `utils/dashboard-demo.ts`, num arquivo so, por decisao de
   Marco em 27/08. Nenhum numero cravado neste template.

   AS DUAS REGRAS DE PERMISSAO VIVEM EM `utils/dashboard.ts` e sao testadas la. Aqui e so desenho.
   Elas nao sao detalhe: sem elas, a dashboard mostra "Entradas", "Saldo" e "Vendas" para qualquer
   um que faca login — e vira vazamento de dado financeiro no dia em que o demo for trocado pela
   chamada real. */
import type { Permissao } from "@padaria/shared";
import type { ItemMenu } from "~/types/padaria";
import type { MetricaDemo } from "~/utils/dashboard-demo";
import { FAIXA_DIA, FAIXA_IR_PARA, FAIXA_PRECISA, FAIXA_RELATORIOS } from "~/utils/dashboard-demo";
import { atalhosDoPainel, metricasPermitidas } from "~/utils/dashboard";
import { dinheiro, rotaTela } from "~/utils/domain";
import { CATEGORIA_POR_TELA } from "~/utils/cores-categoria";

const props = defineProps<{
  /** A MESMA lista que o menu recebe. Nenhuma permissao e recalculada aqui. */
  telas: ItemMenu[];
  temPermissao: (permissao: Permissao) => boolean;
  desabilitadas?: string[];
  motivos?: Record<string, string>;
}>();

const faixas = computed(() => [
  { id: "dia", titulo: "O dia", metricas: metricasPermitidas(FAIXA_DIA, props.temPermissao) },
  { id: "precisa", titulo: "Precisa de você", metricas: metricasPermitidas(FAIXA_PRECISA, props.temPermissao) },
  { id: "relatorios", titulo: "Relatórios", metricas: metricasPermitidas(FAIXA_RELATORIOS, props.temPermissao) }
]);

const atalhos = computed(() =>
  atalhosDoPainel(FAIXA_IR_PARA, props.telas, props.desabilitadas ?? [], props.motivos ?? {})
);

/* A cor entra como custom property apontando para o TOKEN, nunca para o hex do modulo — licao do
   VIS-E2a: com hex, o disco ficava com a cor do tema claro tambem no escuro.

   E a variante `faixa`, nao a `base`: `faixa` e a unica das seis escolhida POR MEDICAO para receber
   branco por cima. A `base` reprova — entradas da 2,94:1 com branco, abaixo ate dos 3:1 que o
   67 §11 pede para objeto grafico. O `cores-categoria.ts` ja registra essa medicao. */
function estiloDisco(categoria: MetricaDemo["categoria"]) {
  return { "--disco-cor": `var(--cat-${categoria}-faixa)` };
}

function estiloAtalho(id: string) {
  const categoria = CATEGORIA_POR_TELA[id];
  return categoria ? { "--disco-cor": `var(--cat-${categoria}-faixa)` } : undefined;
}

/** Travessao para `null`: o painel ainda nao le esse dado. Zero inventado e pior que vazio. */
function escrever(metrica: MetricaDemo) {
  if (metrica.valor === null) return "—";
  return metrica.formato === "dinheiro" ? dinheiro(metrica.valor) : String(metrica.valor);
}
</script>

<template>
  <div class="painel-faixas">
    <!-- Faixa sem nenhum card permitido nao existe — nem o titulo dela. -->
    <template v-for="faixa in faixas" :key="faixa.id">
      <section v-if="faixa.metricas.length" class="faixa" :aria-labelledby="`faixa-${faixa.id}`">
        <h2 :id="`faixa-${faixa.id}`" class="faixa-titulo">{{ faixa.titulo }}</h2>
        <div class="faixa-grade">
          <article v-for="m in faixa.metricas" :key="m.id" class="metrica-card" :style="estiloDisco(m.categoria)">
            <span class="metrica-disco"><v-icon :icon="m.icone" size="24" /></span>
            <span class="metrica-rotulo">{{ m.rotulo }}</span>
            <span class="metrica-valor cx-num" :class="{ vazio: m.valor === null }">{{ escrever(m) }}</span>
            <NuxtLink class="metrica-mais" :to="rotaTela(m.telaId)">Ver mais</NuxtLink>
          </article>
        </div>
      </section>
    </template>

    <section v-if="atalhos.length" class="faixa" aria-labelledby="faixa-ir">
      <h2 id="faixa-ir" class="faixa-titulo">Ir para</h2>
      <nav class="atalhos-linha" aria-label="Atalhos do painel">
        <template v-for="tela in atalhos" :key="tela.id">
          <!-- Desabilitada CONTINUA visivel, com o mesmo motivo do menu. O painel nao pode ensinar
               uma coisa e o menu outra — e uma pilula clicavel para uma tela que o menu mostra
               cinza e pior do que nao mostrar nada. -->
          <v-tooltip v-if="tela.desabilitada" :text="tela.motivo" location="bottom">
            <template #activator="{ props: propsTooltip }">
              <span
                v-bind="propsTooltip"
                class="atalho-pilula disabled"
                tabindex="0"
                role="link"
                aria-disabled="true"
                :aria-label="`${tela.titulo} — ${tela.motivo}`"
                :style="estiloAtalho(tela.id)"
              >
                <span class="atalho-disco"><v-icon :icon="tela.icone" size="18" /></span>
                <span class="atalho-texto">{{ tela.titulo }}</span>
              </span>
            </template>
          </v-tooltip>
          <NuxtLink v-else class="atalho-pilula" :style="estiloAtalho(tela.id)" :to="rotaTela(tela.id)">
            <span class="atalho-disco"><v-icon :icon="tela.icone" size="18" /></span>
            <span class="atalho-texto">{{ tela.titulo }}</span>
          </NuxtLink>
        </template>
      </nav>
    </section>
  </div>
</template>
