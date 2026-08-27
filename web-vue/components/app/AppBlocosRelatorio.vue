<script setup lang="ts">
/* anchor: linear.app/DESIGN.md — hairline, hierarquia por peso, nenhum numero gritando.
   diverge: rotulo em Noto Sans e escala --cx-fs-* do 67.

   Faixa de relatorios do painel (69 §4, Etapa 2). Componente PROPRIO: o AppWorkspace esta com
   ~2.100 linhas contra o limite de ~400 do 16 R5.

   A REGRA de quem ve cada bloco vive em `utils/blocos-relatorio.ts` e e testada la. Aqui e so
   desenho — e a decisao de como mostrar AUSENCIA de dado.

   NADA FICTICIO: `valor === null` significa "o painel ainda nao le esse dado" e sai como travessao,
   nunca como zero. Numero inventado num sistema de caixa e pior que espaco vazio, porque alguem
   age em cima dele. Zero de verdade sai como 0.

   Sao quatro blocos de mesmo peso, e isso e proposital: sao quatro relatorios PARES, nao um
   protagonista com tres coadjuvantes. Por isso o valor e discreto e nao ha numero gigante — a
   faixa de quatro numerones e o que a skill product-ui-design marca como "cara de IA". */
import type { Permissao } from "@padaria/shared";
import type { DadosBlocos } from "~/utils/blocos-relatorio";
import { montarBlocosRelatorio } from "~/utils/blocos-relatorio";

const props = defineProps<{
  temPermissao: (permissao: Permissao) => boolean;
  dados?: DadosBlocos;
}>();

const blocos = computed(() => montarBlocosRelatorio(props.temPermissao, props.dados ?? {}));
</script>

<template>
  <!-- Sem nenhum dos quatro liberado, a faixa inteira nao existe — nem o titulo dela. -->
  <section v-if="blocos.length" class="relatorios-faixa" aria-labelledby="relatorios-faixa-titulo">
    <h2 id="relatorios-faixa-titulo" class="relatorios-faixa-titulo">Relatórios</h2>
    <div class="relatorios-grade">
      <article v-for="bloco in blocos" :key="bloco.id" class="relatorio-bloco">
        <span class="relatorio-bloco-rotulo">{{ bloco.rotulo }}</span>
        <span class="relatorio-bloco-valor" :class="{ vazio: bloco.valor === null }">
          {{ bloco.valor === null ? "—" : bloco.valor }}
        </span>
      </article>
    </div>
  </section>
</template>
