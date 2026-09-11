<script setup lang="ts">
// `computed` explicito: o auto-import do Nuxt nao existe no harness de teste de componente.
import { computed } from "vue";
import type { EntregaCofrePendente } from "~/types/padaria";
import { dinheiro } from "~/utils/domain";
import { formatarDataHora } from "~/utils/formatacao";

// G1/R-171 · o que ja saiu do caixa e ainda nao foi conferido no cofre.
//
// Nao e um erro, e por isso nao e vermelho: o malote esta a caminho. E tambem nao e um aviso que
// se possa ignorar — enquanto estiver aqui, o caixa nao fecha. O bloco existe para o operador ver
// a trava ANTES de tentar fechar, com o lacre na mao para cobrar a conferencia.
//
// A leitura e de manifesto de transporte: um trilho vertical liga as entregas em transito, cada
// uma com valor, tipo, lacre e hora — os quatro dados que identificam um envelope no mundo fisico.
const props = defineProps<{ entregas: EntregaCofrePendente[] }>();

const total = computed(() => props.entregas.reduce((soma, entrega) => soma + entrega.valor, 0));
// R-183 · quantas ja foram contadas pelo cofre e esperam so o encerramento. Muda o texto do bloco:
// "confira no cofre" e instrucao errada para quem ja conferiu.
const jaContadas = computed(() => props.entregas.filter((entrega) => entrega.valorContado !== null).length);
const rotulo = (_tipo: EntregaCofrePendente["tipo"]) => "Retorno";
</script>

<template>
  <section
    v-if="entregas.length"
    class="transito"
    role="group"
    aria-labelledby="transito-titulo"
    data-teste="entregas-aguardando-conferencia"
  >
    <header class="transito-cabecalho">
      <h3 id="transito-titulo" class="transito-titulo">Aguardando conferência no cofre</h3>
      <p class="transito-explica">
        <strong class="cx-num">{{ dinheiro(total) }}</strong> saíram deste caixa e ainda não foram encerrados no cofre.
        <template v-if="jaContadas">
          O cofre já contou {{ jaContadas === 1 ? "uma delas" : `${jaContadas} delas` }} e ainda não encerrou a
          divergência — é isso que falta para este caixa fechar.
        </template>
        <template v-else>
          O fechamento fica travado até o cofre conferir cada entrega — assim, se faltar dinheiro, a diferença tem onde
          cair.
        </template>
      </p>
    </header>

    <ul class="transito-lista">
      <li
        v-for="(entrega, indice) in entregas"
        :key="entrega.id"
        class="transito-item"
        :style="{ '--atraso': `${Math.min(indice, 6) * 45}ms` }"
        data-teste="entrega-pendente"
      >
        <span class="transito-marca" aria-hidden="true" />
        <span class="transito-valor cx-num">{{ dinheiro(entrega.valor) }}</span>
        <span class="transito-tipo">{{ rotulo(entrega.tipo) }}</span>
        <span v-if="entrega.lacre" class="transito-lacre">
          <span class="transito-lacre-rotulo">lacre</span>{{ entrega.lacre }}
        </span>
        <span v-else class="transito-sem-lacre">sem lacre</span>
        <!-- R-183 · quando o cofre JA CONTOU, o numero e a informacao mais util da linha: e ele que
             diz o tamanho da diferenca e a quem cobrar. Sem contagem, a linha segue como antes. -->
        <span v-if="entrega.valorContado !== null" class="transito-contado">
          <span class="transito-contado-rotulo">cofre contou</span>{{ dinheiro(entrega.valorContado) }}
        </span>
        <span class="transito-hora">{{ formatarDataHora(entrega.criadoEm) }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.transito {
  border: 1px solid var(--cx-line);
  border-left: 3px solid var(--cx-attention);
  border-radius: var(--cx-r-md);
  background: var(--cx-surface-sunken);
  padding: var(--cx-sp-5);
  margin: var(--cx-sp-5) 0;
}

.transito-titulo {
  font-size: var(--cx-fs-lead);
  font-weight: 600;
  letter-spacing: var(--cx-tracking-tight);
  color: var(--cx-ink);
  margin: 0;
}

.transito-explica {
  font-size: var(--cx-fs-body);
  color: var(--cx-ink-soft);
  margin: var(--cx-sp-2) 0 0;
  max-width: 62ch;
}

.transito-explica strong {
  color: var(--cx-attention);
}

.transito-lista {
  list-style: none;
  margin: var(--cx-sp-5) 0 0;
  padding: 0;
}

/* O trilho: a linha que liga as entregas e o elemento-assinatura do bloco — ela diz "isto esta a
   caminho" sem precisar de icone nem de texto. Desenhada na propria <li> para nao exigir wrapper. */
.transito-item {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--cx-sp-2) var(--cx-sp-4);
  padding: var(--cx-sp-3) 0 var(--cx-sp-3) var(--cx-sp-6);
  border-top: 1px solid var(--cx-line-soft);
  animation: transito-entra var(--cx-dur-3) var(--cx-ease-out) both;
  animation-delay: var(--atraso, 0ms);
}

.transito-item:first-child {
  border-top: 0;
}

.transito-item::before {
  content: "";
  position: absolute;
  left: 5px;
  top: 0;
  bottom: 0;
  border-left: 1px dashed color-mix(in srgb, var(--cx-attention) 45%, transparent);
}

.transito-item:first-child::before {
  top: 50%;
}

.transito-item:last-child::before {
  bottom: 50%;
}

.transito-marca {
  position: absolute;
  left: 0;
  top: calc(50% - 5px);
  width: 11px;
  height: 11px;
  border-radius: var(--cx-r-pill);
  background: var(--cx-surface);
  border: 2px solid var(--cx-attention);
}

.transito-valor {
  font-size: var(--cx-fs-title);
  font-weight: 600;
  color: var(--cx-ink);
  letter-spacing: var(--cx-tracking-tight);
}

.transito-tipo {
  font-size: var(--cx-fs-micro);
  text-transform: uppercase;
  letter-spacing: var(--cx-tracking-wide);
  color: var(--cx-ink-soft);
}

.transito-lacre {
  /* Lacre e codigo do mundo fisico: pode vir longo e sem espaco. Sem isto, um lacre comprido
     empurra a linha e a pagina ganha rolagem horizontal no celular. */
  overflow-wrap: anywhere;
  font-family: ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace;
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink);
  background: color-mix(in srgb, var(--cx-attention) 12%, transparent);
  border-radius: var(--cx-r-sm);
  padding: 2px var(--cx-sp-2);
}

.transito-lacre-rotulo {
  color: var(--cx-ink-soft);
  margin-right: var(--cx-sp-1);
}

.transito-contado {
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink);
  font-weight: 600;
}

.transito-contado-rotulo {
  color: var(--cx-ink-soft);
  font-weight: 400;
  margin-right: var(--cx-sp-1);
}

.transito-sem-lacre,
.transito-hora {
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}

.transito-hora {
  margin-left: auto;
}

@keyframes transito-entra {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}

/* A entrada e informativa, nunca condicao para ler: sem movimento, o bloco ja esta pronto. */
@media (prefers-reduced-motion: reduce) {
  .transito-item {
    animation: none;
  }
}

/* No celular a hora deixa de disputar a linha com o lacre e desce sozinha. */
@media (max-width: 599px) {
  .transito-hora {
    margin-left: 0;
    flex-basis: 100%;
  }
}
</style>
