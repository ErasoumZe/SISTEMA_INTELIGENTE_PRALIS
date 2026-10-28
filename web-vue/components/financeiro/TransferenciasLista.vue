<script setup lang="ts">
import { ref } from "vue";
import type { OperacaoResumo } from "~/types/padaria";
import TransferenciasRelatorioLinha from "./TransferenciasRelatorioLinha.vue";

// Relatorio de Transferencias: cabecalho de colunas + uma linha por transferencia + paginacao. Cada linha
// e `TransferenciasRelatorioLinha`; aqui so ficam o estado de quais linhas estao abertas, o vazio e a
// paginacao. Props e eventos sao os mesmos da lista anterior: o cockpit nao muda.
defineProps<{
  operacoes: OperacaoResumo[];
  totalOperacoes: number;
  pagina: number;
  totalPaginas: number;
  podeEditar?: boolean;
  podeCancelarPlanejamento?: boolean;
  salvando?: boolean;
}>();

const emit = defineEmits<{
  (event: "editar", operacao: OperacaoResumo): void;
  (event: "cancelar-planejamento", operacao: OperacaoResumo): void;
  (event: "update:pagina", pagina: number): void;
}>();

const abertas = ref<Set<string>>(new Set());

function alternar(id: string) {
  const proximas = new Set(abertas.value);
  if (proximas.has(id)) proximas.delete(id);
  else proximas.add(id);
  abertas.value = proximas;
}
</script>

<template>
  <section class="lista-transferencias" role="table" aria-label="Transferências">
    <div role="rowgroup" class="lista-transferencias__topo">
      <div class="lista-transferencias__cabecalho" role="row">
        <span role="columnheader">Lançamento</span>
        <span role="columnheader">Movimento / rota</span>
        <span role="columnheader">Valor total</span>
        <span role="columnheader">Lacres</span>
        <span role="columnheader">Situação</span>
        <span role="columnheader"><span class="lista-transferencias__so-leitor">Ações</span></span>
      </div>
    </div>

    <TransferenciasRelatorioLinha
      v-for="op in operacoes"
      :key="op.id"
      :operacao="op"
      :aberta="abertas.has(op.id)"
      :pode-editar="podeEditar"
      :pode-cancelar-planejamento="podeCancelarPlanejamento"
      :salvando="salvando"
      @editar="emit('editar', $event)"
      @cancelar-planejamento="emit('cancelar-planejamento', $event)"
      @alternar="alternar"
    />

    <div v-if="!operacoes.length" class="lista-transferencias__vazio" role="row">
      <v-icon icon="mdi-swap-horizontal-variant" size="34" aria-hidden="true" />
      <strong>Nenhuma transferência encontrada</strong>
      <span>Altere os filtros ou registre uma transferência pelo botão + Novo.</span>
    </div>

    <footer v-if="totalOperacoes > 10" class="lista-transferencias__paginacao">
      <span>Página {{ pagina }} de {{ totalPaginas }}</span>
      <v-btn
        size="small"
        variant="text"
        :disabled="pagina === 1"
        @click="emit('update:pagina', Math.max(1, pagina - 1))"
        >Anterior</v-btn
      >
      <v-btn
        size="small"
        variant="text"
        :disabled="pagina === totalPaginas"
        @click="emit('update:pagina', Math.min(totalPaginas, pagina + 1))"
        >Próxima</v-btn
      >
    </footer>
  </section>
</template>

<style scoped>
/* UMA grade para o cabecalho e para TODAS as linhas: as colunas ficam no mesmo x de cima a baixo. Larguras fixas
   (menos Movimento) para que nenhuma linha empurre a outra. */
.lista-transferencias {
  --trl-colunas: 116px minmax(180px, 1.5fr) 208px 124px 176px 92px;
  container: lista / inline-size;
  display: grid;
  background: var(--cx-surface-raised);
  color: var(--cx-ink);
}
.lista-transferencias__cabecalho {
  display: grid;
  grid-template-columns: var(--trl-colunas);
  gap: var(--cx-sp-3);
  align-items: center;
  padding: var(--cx-sp-3) var(--cx-sp-4) var(--cx-sp-3) calc(var(--cx-sp-4) + 3px);
  border-bottom: 1px solid var(--cx-line);
  background: var(--cx-surface-sunken);
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-micro);
  font-weight: 800;
  letter-spacing: var(--cx-tracking-wide);
  text-transform: uppercase;
}
.lista-transferencias__cabecalho > :nth-child(3) {
  text-align: right;
}
.lista-transferencias__so-leitor {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.lista-transferencias__vazio {
  display: grid;
  justify-items: center;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-8) var(--cx-sp-4);
  color: var(--cx-ink-soft);
  text-align: center;
}
.lista-transferencias__vazio strong {
  color: var(--cx-ink);
}
.lista-transferencias__paginacao {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--cx-sp-1);
  padding: var(--cx-sp-3) var(--cx-sp-4);
  border-top: 1px solid var(--cx-line);
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
@container lista (width <= 1000px) {
  .lista-transferencias__cabecalho {
    display: none;
  }
}
@media (width <= 768px) {
  .lista-transferencias {
    background: transparent;
  }
  .lista-transferencias__paginacao {
    flex-wrap: wrap;
    justify-content: center;
    border: 0;
  }
}
</style>
