<script setup lang="ts">
/**
 * A contagem (doc 57 §1): o cartão com o recorte (grupo, área, setor) e a lista de produtos com o saldo do
 * sistema e o campo da quantidade contada. Salvar guarda o que já foi contado; Concluir fecha a conferência.
 * Nada aqui mexe no estoque: só registra.
 */
import { useDisplay } from "vuetify";
import { ROTULO_RANKING_CONFERENCIA, type ConferenciaDetalheDto } from "@padaria/shared";
import { formatarQuantidade } from "~/utils/formatacao";

const aberto = defineModel<boolean>({ required: true });
const props = defineProps<{ conferencia: ConferenciaDetalheDto | null; podeContar: boolean; salvando: boolean }>();
const emit = defineEmits<{
  salvar: [itens: Array<{ itemId: string; quantidadeContada: number | null }>];
  concluir: [itens: Array<{ itemId: string; quantidadeContada: number | null }>];
}>();

const contagem = ref<Record<string, string>>({});
const busca = ref("");
watch(
  () => props.conferencia,
  (conferencia) => {
    contagem.value = Object.fromEntries(
      (conferencia?.itens ?? []).map((item) => [
        item.itemId,
        item.quantidadeContada === null ? "" : String(Number(item.quantidadeContada))
      ])
    );
    busca.value = "";
  },
  { immediate: true }
);

const aberta = computed(() => props.conferencia?.status === "agendada" && props.podeContar);
const itens = computed(() => {
  const termo = busca.value.trim().toLocaleLowerCase("pt-BR");
  const todos = props.conferencia?.itens ?? [];
  return termo ? todos.filter((item) => item.descricao.toLocaleLowerCase("pt-BR").includes(termo)) : todos;
});
const contados = computed(() => Object.values(contagem.value).filter((valor) => valor !== "").length);
const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function diferenca(saldo: string, contada: string) {
  if (contada === "") return null;
  return Number(contada) - Number(saldo);
}
/** So o que mudou desde a ultima gravacao: quem ja contou um item continua sendo o autor dele. */
function payload() {
  const anterior = new Map((props.conferencia?.itens ?? []).map((item) => [item.itemId, item.quantidadeContada]));
  return Object.entries(contagem.value)
    .map(([itemId, valor]) => ({ itemId, quantidadeContada: valor === "" ? null : Number(valor) }))
    .filter((item) => {
      const antes = anterior.get(item.itemId);
      return (antes === null || antes === undefined ? null : Number(antes)) !== item.quantidadeContada;
    });
}
// Celular: o dialogo ocupa a tela inteira (`$vuetify` no template nao e tipado no typecheck do Nuxt).
const telaPequena = useDisplay().xs;
</script>

<template>
  <v-dialog v-model="aberto" max-width="860" scrollable :fullscreen="telaPequena">
    <v-card v-if="conferencia" data-dialogo="contagem">
      <v-card-title class="d-flex flex-wrap align-center justify-space-between ga-2">
        <span>Conferência de {{ DATA_HORA.format(new Date(conferencia.data)) }}</span>
        <v-chip size="small" label :color="conferencia.status === 'concluida' ? 'success' : 'info'"
          >{{ contados }}/{{ conferencia.itens.length }} contados</v-chip
        >
      </v-card-title>
      <v-card-text class="d-grid ga-3">
        <dl class="recorte">
          <div>
            <dt>Grupo</dt>
            <dd>{{ conferencia.grupo ?? "Todos" }}</dd>
          </div>
          <div>
            <dt>Área</dt>
            <dd>{{ conferencia.areaEstoque ?? "Todas" }}</dd>
          </div>
          <div>
            <dt>Setor / local</dt>
            <dd>{{ conferencia.localEstoque ?? conferencia.localVenda ?? "Todos" }}</dd>
          </div>
          <div v-if="conferencia.ranking">
            <dt>Recorte</dt>
            <dd>{{ ROTULO_RANKING_CONFERENCIA[conferencia.ranking] }}</dd>
          </div>
        </dl>
        <v-alert v-if="conferencia.observacao" type="info" variant="tonal" density="compact">{{
          conferencia.observacao
        }}</v-alert>
        <v-text-field
          v-model="busca"
          prepend-inner-icon="mdi-magnify"
          label="Buscar produto"
          density="compact"
          hide-details
          clearable
        />
        <p v-if="!conferencia.itens.length" class="text-medium-emphasis">Nenhum produto neste recorte.</p>
        <div v-for="item in itens" :key="item.itemId" class="linha" :data-produto="item.descricao">
          <div class="linha__produto">
            <strong>{{ item.descricao }}</strong>
            <span class="text-caption text-medium-emphasis"
              >Sistema: {{ formatarQuantidade(item.saldoSistema) }} {{ item.unidade ?? "" }}</span
            >
          </div>
          <v-text-field
            v-model="contagem[item.itemId]"
            type="number"
            inputmode="decimal"
            min="0"
            step="0.001"
            label="Contado"
            density="compact"
            :suffix="item.unidade ?? ''"
            :disabled="!aberta"
            hide-details
            class="linha__campo"
          />
          <span
            class="linha__diferenca"
            :class="{
              'text-error': (diferenca(item.saldoSistema, contagem[item.itemId] ?? '') ?? 0) < 0,
              'text-success': (diferenca(item.saldoSistema, contagem[item.itemId] ?? '') ?? 0) > 0
            }"
            >{{
              diferenca(item.saldoSistema, contagem[item.itemId] ?? "") === null
                ? ""
                : formatarQuantidade(diferenca(item.saldoSistema, contagem[item.itemId] ?? ""))
            }}</span
          >
        </div>
      </v-card-text>
      <v-card-actions class="flex-wrap">
        <span class="text-caption text-medium-emphasis px-2">A contagem só registra; o estoque não muda.</span>
        <v-spacer />
        <v-btn variant="text" @click="aberto = false">Fechar</v-btn>
        <template v-if="aberta">
          <v-btn variant="tonal" color="primary" :loading="salvando" @click="emit('salvar', payload())">Salvar</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :loading="salvando"
            :disabled="contados < conferencia.itens.length"
            @click="emit('concluir', payload())"
            >Concluir</v-btn
          >
        </template>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.recorte {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-2) var(--cx-sp-6);
  margin: 0;
  padding: var(--cx-sp-3);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface-sunken);
}

.recorte dt {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-micro);
  font-weight: 700;
  letter-spacing: var(--cx-tracking-wide);
  text-transform: uppercase;
}

.recorte dd {
  margin: 0;
  font-weight: 600;
}

.linha {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 160px 64px;
  gap: var(--cx-sp-3);
  align-items: center;
  padding: var(--cx-sp-2) 0;
  border-bottom: 1px solid var(--cx-line-soft);
}

.linha__produto {
  display: grid;
}

.linha__diferenca {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  text-align: right;
}

@media (max-width: 599px) {
  .linha {
    grid-template-columns: minmax(0, 1fr) 120px;
  }

  .linha__diferenca {
    grid-column: 1 / -1;
    text-align: left;
  }
}
</style>
