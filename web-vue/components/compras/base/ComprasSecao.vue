<script setup lang="ts">
/**
 * Um bloco de tela de Compras: título curto, uma linha de apoio opcional, ações à direita, filtros logo abaixo e o
 * conteúdo. Uma borda fina e nada de sombra — o conteúdo é que tem de aparecer. `rente` tira o recuo do corpo
 * para tabelas e listas que vão de borda a borda.
 */
defineProps<{ titulo?: string; descricao?: string; rente?: boolean }>();
</script>

<template>
  <section class="secao">
    <header v-if="titulo || $slots.acoes || $slots.titulo" class="secao__topo">
      <div class="secao__titulos">
        <h2 v-if="titulo || $slots.titulo" class="secao__titulo">
          <slot name="titulo">{{ titulo }}</slot>
        </h2>
        <p v-if="descricao" class="secao__descricao">{{ descricao }}</p>
      </div>
      <div v-if="$slots.acoes" class="secao__acoes"><slot name="acoes" /></div>
    </header>
    <div v-if="$slots.filtros" class="secao__filtros"><slot name="filtros" /></div>
    <div class="secao__corpo" :class="{ 'secao__corpo--rente': rente }"><slot /></div>
    <footer v-if="$slots.rodape" class="secao__rodape"><slot name="rodape" /></footer>
  </section>
</template>

<style scoped>
.secao {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--cx-line);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface);
}

.secao__topo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-4) var(--cx-sp-5) 0;
}

.secao__titulos {
  min-width: 0;
}

.secao__titulo {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-2);
  margin: 0;
  color: var(--cx-ink);
  font-size: var(--cx-fs-lead);
  font-weight: 650;
  letter-spacing: var(--cx-tracking-tight);
}

.secao__descricao {
  margin: 2px 0 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

.secao__acoes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cx-sp-2);
}

.secao__filtros {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-4) var(--cx-sp-5) 0;
}

.secao__corpo {
  padding: var(--cx-sp-4) var(--cx-sp-5) var(--cx-sp-5);
}

.secao__corpo--rente {
  padding: var(--cx-sp-3) 0 0;
}

.secao__rodape {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-3) var(--cx-sp-5);
  border-top: 1px solid var(--cx-line-soft);
}

@media (max-width: 599px) {
  .secao__topo,
  .secao__filtros {
    padding-left: var(--cx-sp-4);
    padding-right: var(--cx-sp-4);
  }

  .secao__corpo:not(.secao__corpo--rente),
  .secao__rodape {
    padding-left: var(--cx-sp-4);
    padding-right: var(--cx-sp-4);
  }
}
</style>
