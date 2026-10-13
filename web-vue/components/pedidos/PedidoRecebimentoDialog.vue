<script setup lang="ts">
/**
 * Conferencia fisica do recebimento.
 *
 * E o unico ato que aumenta estoque (R-208), entao a tela precisa deixar obvio o que vai entrar:
 * por item, quanto foi pedido, quanto ja chegou e quanto ainda falta. A quantidade comeca no
 * pendente, mas o conferente abaixa o numero quando chega menos — e o resumo no rodape mostra o
 * total que sera somado ao saldo antes de ele confirmar.
 */
import type { PedidoDto } from "@padaria/shared";

const aberto = defineModel<boolean>({ required: true });
const props = defineProps<{ pedido: PedidoDto | null; salvando: boolean }>();
const emit = defineEmits<{
  confirmar: [itens: Array<{ pedidoItemId: string; quantidadeConferida: number }>, observacao: string];
}>();

const observacao = ref("");
const quantidades = reactive<Record<string, string>>({});

const itens = computed(() => props.pedido?.itens ?? []);
const pendentes = computed(() => itens.value.filter((item) => Number(item.quantidadePendente) > 0));

watch(
  () => [aberto.value, props.pedido?.id],
  () => {
    observacao.value = "";
    for (const chave of Object.keys(quantidades)) delete quantidades[chave];
    for (const item of itens.value) quantidades[item.id] = item.quantidadePendente;
  },
  { immediate: true }
);

const numero = (valor: string | undefined) => {
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : 0;
};

const conferidos = computed(() =>
  pendentes.value
    .map((item) => ({ pedidoItemId: item.id, quantidadeConferida: numero(quantidades[item.id]) }))
    .filter((item) => item.quantidadeConferida > 0)
);
const totalConferido = computed(() => conferidos.value.reduce((soma, item) => soma + item.quantidadeConferida, 0));

/** Nenhum item pode receber mais do que o pendente — e a mesma trava do servidor. */
function excedeu(itemId: string, pendente: string) {
  return numero(quantidades[itemId]) > Number(pendente);
}
const algumExcedeu = computed(() => pendentes.value.some((item) => excedeu(item.id, item.quantidadePendente)));

const impedimento = computed(() => {
  if (!pendentes.value.length) return "Este pedido não tem item pendente.";
  if (algumExcedeu.value) return "Há item conferido acima do que falta chegar.";
  if (!conferidos.value.length) return "Informe a quantidade conferida de ao menos um item.";
  return "";
});

const formatar = (valor: number) => valor.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

function receberTudo() {
  for (const item of pendentes.value) quantidades[item.id] = item.quantidadePendente;
}

function zerarTudo() {
  for (const item of pendentes.value) quantidades[item.id] = "0";
}

function progresso(item: { quantidade: string; quantidadeRecebida: string }) {
  const pedido = Number(item.quantidade);
  if (!pedido) return 0;
  return Math.min((Number(item.quantidadeRecebida) / pedido) * 100, 100);
}
</script>

<template>
  <v-dialog v-model="aberto" max-width="820" scrollable persistent>
    <v-card v-if="pedido" class="recebimento">
      <div class="recebimento__topo">
        <div>
          <h2 class="text-h6">Conferir recebimento</h2>
          <p class="text-caption text-medium-emphasis mb-0">{{ pedido.fornecedorNome ?? "Pedido histórico" }}</p>
        </div>
        <v-chip size="small" color="success" variant="tonal" label>+{{ formatar(totalConferido) }} no estoque</v-chip>
      </div>

      <v-card-text class="recebimento__corpo">
        <v-alert type="info" density="compact" variant="tonal">
          Só a quantidade conferida aqui entra no estoque. O que não chegou continua pendente.
        </v-alert>

        <div class="recebimento__atalhos">
          <v-btn size="small" variant="text" prepend-icon="mdi-check-all" @click="receberTudo">Recebi tudo</v-btn>
          <v-btn size="small" variant="text" prepend-icon="mdi-numeric-0-box-outline" @click="zerarTudo">Zerar</v-btn>
        </div>

        <div v-for="item in pendentes" :key="item.id" class="recebimento__item" :data-item="item.id">
          <div class="recebimento__produto">
            <div class="font-weight-medium">{{ item.descricaoProduto }}</div>
            <v-progress-linear :model-value="progresso(item)" color="success" height="4" rounded class="my-2" />
            <div class="recebimento__numeros">
              <span>Pedido {{ formatar(Number(item.quantidade)) }}</span>
              <span>Já recebido {{ formatar(Number(item.quantidadeRecebida)) }}</span>
              <strong>Falta {{ formatar(Number(item.quantidadePendente)) }}</strong>
            </div>
          </div>
          <v-text-field
            v-model="quantidades[item.id]"
            type="number"
            min="0"
            :max="item.quantidadePendente"
            step="0.001"
            label="Quantidade conferida"
            density="comfortable"
            hide-details="auto"
            class="recebimento__campo"
            :error="excedeu(item.id, item.quantidadePendente)"
            :error-messages="
              excedeu(item.id, item.quantidadePendente)
                ? `Falta apenas ${formatar(Number(item.quantidadePendente))}.`
                : undefined
            "
          />
        </div>

        <div v-if="!pendentes.length" class="recebimento__vazio">Todos os itens deste pedido já foram recebidos.</div>

        <v-textarea
          v-model="observacao"
          rows="2"
          auto-grow
          label="Observação da conferência"
          density="comfortable"
          hide-details
        />
      </v-card-text>

      <div class="recebimento__rodape">
        <span v-if="impedimento" class="recebimento__impedimento">{{ impedimento }}</span>
        <span v-else class="recebimento__resumo"
          >{{ conferidos.length }} item(ns) conferido(s) · entra {{ formatar(totalConferido) }} no estoque</span
        >
        <v-spacer />
        <v-btn variant="text" @click="aberto = false">Cancelar</v-btn>
        <v-btn
          color="success"
          variant="flat"
          :loading="salvando"
          :disabled="Boolean(impedimento)"
          @click="emit('confirmar', conferidos, observacao)"
          >Confirmar recebimento</v-btn
        >
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.recebimento {
  border-radius: var(--cx-r-xl, 22px);
}

.recebimento__topo {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cx-sp-3, 12px);
  padding: var(--cx-sp-5, 20px) var(--cx-sp-6, 24px) var(--cx-sp-3, 12px);
  border-bottom: 1px solid var(--cx-line-soft, #eef1f6);
}

.recebimento__corpo {
  display: grid;
  gap: var(--cx-sp-3, 12px);
  padding: var(--cx-sp-4, 16px) var(--cx-sp-6, 24px);
}

.recebimento__atalhos {
  display: flex;
  gap: var(--cx-sp-2, 8px);
}

.recebimento__item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 180px;
  gap: var(--cx-sp-4, 16px);
  align-items: center;
  padding: var(--cx-sp-3, 12px);
  border: 1px solid var(--cx-line-soft, #eef1f6);
  border-radius: var(--cx-r-md, 12px);
}

.recebimento__produto {
  min-width: 0;
}

.recebimento__numeros {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-3, 12px);
  font-size: 0.75rem;
  color: var(--cx-ink-soft, #5b6675);
}

.recebimento__vazio {
  padding: var(--cx-sp-6, 24px);
  text-align: center;
  color: var(--cx-ink-soft, #5b6675);
}

.recebimento__rodape {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cx-sp-2, 8px);
  padding: var(--cx-sp-3, 12px) var(--cx-sp-6, 24px) var(--cx-sp-4, 16px);
  border-top: 1px solid var(--cx-line-soft, #eef1f6);
}

.recebimento__impedimento {
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-warning));
}

.recebimento__resumo {
  font-size: 0.8125rem;
  color: var(--cx-ink-soft, #5b6675);
}

@media (max-width: 599px) {
  .recebimento__item {
    grid-template-columns: minmax(0, 1fr);
  }

  .recebimento__topo,
  .recebimento__corpo,
  .recebimento__rodape {
    padding-left: var(--cx-sp-4, 16px);
    padding-right: var(--cx-sp-4, 16px);
  }
}
</style>
