<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { BonificacaoTipo, CampanhaComProgresso } from "@padaria/shared/campanhas";
import type { Opcao } from "~/types/padaria";

// So o formulario. Quem chama a API e a pagina — assim este arquivo e testavel sem rede e a tela
// continua sendo o unico lugar que conhece as rotas de campanha.
const props = defineProps<{
  modelValue: boolean;
  pdvs: Opcao[];
  campanha: CampanhaComProgresso | null;
}>();
const emit = defineEmits<{
  (event: "update:modelValue", valor: boolean): void;
  (event: "salvar", dados: Record<string, unknown>): void;
}>();

const titulo = ref("");
const mensagem = ref("");
const inicio = ref("");
const fim = ref("");
const metaValor = ref<number | null>(null);
const bonificacaoTipo = ref<BonificacaoTipo>("dinheiro");
const bonificacaoValor = ref<number | null>(null);
const bonificacaoTexto = ref("");
const pdvIds = ref<string[]>([]);

const TIPOS = [
  { value: "dinheiro", title: "Dinheiro (R$)" },
  { value: "percentual", title: "Percentual (%)" },
  { value: "recompensa", title: "Recompensa (texto)" }
] as const;

const exigeTexto = computed(() => bonificacaoTipo.value === "recompensa");
const periodoInvertido = computed(() => Boolean(inicio.value && fim.value && fim.value < inicio.value));
const percentualAlto = computed(() => bonificacaoTipo.value === "percentual" && (bonificacaoValor.value ?? 0) > 100);

const podeSalvar = computed(
  () =>
    Boolean(titulo.value.trim()) &&
    Boolean(mensagem.value.trim()) &&
    Boolean(inicio.value) &&
    Boolean(fim.value) &&
    !periodoInvertido.value &&
    (metaValor.value ?? 0) > 0 &&
    pdvIds.value.length > 0 &&
    !percentualAlto.value &&
    (exigeTexto.value ? Boolean(bonificacaoTexto.value.trim()) : (bonificacaoValor.value ?? 0) > 0)
);

watch(
  () => props.modelValue,
  (aberto) => {
    if (!aberto) return;
    const atual = props.campanha;
    titulo.value = atual?.titulo ?? "";
    mensagem.value = atual?.mensagem ?? "";
    inicio.value = atual?.inicio ?? "";
    fim.value = atual?.fim ?? "";
    metaValor.value = atual?.metaValor ?? null;
    bonificacaoTipo.value = atual?.bonificacaoTipo ?? "dinheiro";
    bonificacaoValor.value = atual?.bonificacaoValor ?? null;
    bonificacaoTexto.value = atual?.bonificacaoTexto ?? "";
    pdvIds.value = atual?.pdvs.map((pdv) => pdv.pdvId) ?? [];
  }
);

function salvar() {
  if (!podeSalvar.value) return;
  emit("salvar", {
    titulo: titulo.value.trim(),
    mensagem: mensagem.value.trim(),
    inicio: inicio.value,
    fim: fim.value,
    metaValor: metaValor.value,
    bonificacaoTipo: bonificacaoTipo.value,
    // As tres formas sao mutuamente exclusivas: mandar as duas derruba no Zod e no CHECK do banco.
    bonificacaoValor: exigeTexto.value ? null : bonificacaoValor.value,
    bonificacaoTexto: exigeTexto.value ? bonificacaoTexto.value.trim() : null,
    pdvIds: pdvIds.value
  });
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="640"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card class="campanha-form" data-teste="campanha-formulario">
      <v-card-title class="campanha-form__titulo">
        {{ campanha ? "Editar campanha" : "Nova campanha" }}
      </v-card-title>

      <v-card-text class="campanha-form__corpo">
        <v-text-field v-model="titulo" label="Título" maxlength="120" counter hide-details="auto" class="mb-4" />
        <v-textarea
          v-model="mensagem"
          label="Mensagem aos PDVs"
          maxlength="2000"
          counter
          rows="3"
          auto-grow
          hide-details="auto"
          class="mb-4"
        />

        <div class="campanha-form__periodo">
          <v-text-field v-model="inicio" type="date" label="Início" hide-details="auto" />
          <v-text-field
            v-model="fim"
            type="date"
            label="Fim"
            :error="periodoInvertido"
            :error-messages="periodoInvertido ? 'O fim não pode ser anterior ao início.' : ''"
            hide-details="auto"
          />
        </div>

        <v-text-field
          v-model.number="metaValor"
          type="number"
          min="0"
          step="0.01"
          label="Meta de vendas (R$)"
          hint="Soma do líquido das vendas do CREARE dos PDVs participantes, no período."
          persistent-hint
          class="mt-4 mb-4"
        />

        <v-select
          v-model="pdvIds"
          :items="pdvs"
          item-title="nome"
          item-value="id"
          label="PDVs participantes"
          multiple
          chips
          closable-chips
          hide-details="auto"
          class="mb-4"
        />

        <v-select
          v-model="bonificacaoTipo"
          :items="TIPOS"
          item-title="title"
          item-value="value"
          label="Bonificação"
          hint="Informativa e auditável. Não gera lançamento em caixa, financeiro nem folha."
          persistent-hint
          class="mb-4"
        />

        <v-text-field
          v-if="!exigeTexto"
          v-model.number="bonificacaoValor"
          type="number"
          min="0"
          :step="bonificacaoTipo === 'percentual' ? 1 : 0.01"
          :label="bonificacaoTipo === 'percentual' ? 'Percentual (%)' : 'Valor (R$)'"
          :error="percentualAlto"
          :error-messages="percentualAlto ? 'Percentual não pode passar de 100.' : ''"
          hide-details="auto"
        />
        <v-textarea
          v-else
          v-model="bonificacaoTexto"
          label="Recompensa"
          maxlength="500"
          counter
          rows="2"
          auto-grow
          hide-details="auto"
        />
      </v-card-text>

      <v-card-actions class="campanha-form__acoes">
        <v-btn variant="text" @click="emit('update:modelValue', false)">Cancelar</v-btn>
        <v-spacer />
        <v-btn color="primary" variant="flat" :disabled="!podeSalvar" data-teste="campanha-salvar" @click="salvar">
          Salvar
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.campanha-form {
  display: flex;
  flex-direction: column;
  max-height: 88dvh;
}

.campanha-form__titulo {
  font-size: 1.1rem;
  font-weight: 700;
  padding: 18px 20px 6px;
  white-space: normal;
}

.campanha-form__corpo {
  padding: 12px 20px 4px;
}

.campanha-form__periodo {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
  gap: 12px;
}

.campanha-form__acoes {
  position: sticky;
  bottom: 0;
  padding: 12px 16px;
  background: var(--cx-surface);
  border-top: 1px solid var(--cx-line-soft);
}
</style>
