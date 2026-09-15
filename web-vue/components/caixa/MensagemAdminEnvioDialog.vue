<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { LinhaHistoricoCaixa } from "@padaria/shared";
import type { AlvoMensagem, TipoAlvoMensagem } from "@padaria/shared/mensagens-admin";
import type { Opcao } from "~/types/padaria";
import { mensagemErro } from "~/utils/domain";
import { useMensagensAdmin } from "~/composables/useMensagensAdmin";

const props = defineProps<{
  modelValue: boolean;
  empresaId: string;
  pdvs: Opcao[];
  caixasAbertos: LinhaHistoricoCaixa[];
}>();
const emit = defineEmits<{
  (event: "update:modelValue", valor: boolean): void;
  (event: "enviada", destinatarios: number): void;
  (event: "erro", mensagem: string): void;
}>();

const { enviar } = useMensagensAdmin();

const titulo = ref("");
const corpo = ref("");
const validoAte = ref("");
const alvo = ref<TipoAlvoMensagem>("caixas_abertos");
const pdvsEscolhidos = ref<string[]>([]);
const operadoresEscolhidos = ref<string[]>([]);
const enviando = ref(false);

const ALVOS = [
  {
    value: "caixas_abertos",
    title: "Todos os caixas abertos agora",
    ajuda: "Foto deste instante. Quem abrir depois não recebe."
  },
  { value: "empresa", title: "Toda a empresa", ajuda: "Quem tem permissão de operar caixa, com ou sem caixa aberto." },
  { value: "pdv", title: "PDVs específicos", ajuda: "Alcança também quem abrir esses PDVs enquanto a mensagem valer." },
  { value: "operador", title: "Operadores específicos", ajuda: "Escolhidos entre os que estão com caixa aberto." }
] as const;

const ajudaDoAlvo = computed(() => ALVOS.find((item) => item.value === alvo.value)?.ajuda ?? "");

// Operadores vêm do monitor que já está na tela: nenhuma rota nova e nenhuma permissão de cadastro
// de usuários para mandar uma mensagem.
const operadores = computed(() => {
  const vistos = new Map<string, string>();
  for (const caixa of props.caixasAbertos) {
    if (!caixa.usuarioCaixaId) continue;
    vistos.set(
      caixa.usuarioCaixaId,
      `${caixa.colaboradorNome ?? caixa.usuarioCaixaNome ?? "Operador"} · ${caixa.pdvNome}`
    );
  }
  return [...vistos].map(([value, title]) => ({ value, title }));
});

const alvoIncompleto = computed(
  () =>
    (alvo.value === "pdv" && !pdvsEscolhidos.value.length) ||
    (alvo.value === "operador" && !operadoresEscolhidos.value.length)
);
const podeEnviar = computed(
  () => Boolean(titulo.value.trim()) && Boolean(corpo.value.trim()) && !alvoIncompleto.value && !enviando.value
);

function limpar() {
  titulo.value = "";
  corpo.value = "";
  validoAte.value = "";
  alvo.value = "caixas_abertos";
  pdvsEscolhidos.value = [];
  operadoresEscolhidos.value = [];
}

watch(
  () => props.modelValue,
  (aberto) => {
    if (aberto) limpar();
  }
);

function montarAlvos(): AlvoMensagem[] {
  if (alvo.value === "pdv") return pdvsEscolhidos.value.map((pdvId) => ({ tipo: "pdv", pdvId }));
  if (alvo.value === "operador")
    return operadoresEscolhidos.value.map((usuarioId) => ({ tipo: "operador", usuarioId }));
  return [{ tipo: alvo.value }];
}

async function confirmar() {
  if (!podeEnviar.value) return;
  enviando.value = true;
  try {
    const criada = await enviar({
      empresaId: props.empresaId,
      titulo: titulo.value.trim(),
      corpo: corpo.value.trim(),
      // `datetime-local` não tem fuso; o servidor compara com `now()`, então convertemos aqui.
      validoAte: validoAte.value ? new Date(validoAte.value).toISOString() : null,
      alvos: montarAlvos()
    });
    emit("enviada", criada.destinatarios);
    emit("update:modelValue", false);
  } catch (error) {
    emit("erro", mensagemErro(error));
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="620"
    scrollable
    class="envio-mensagem-dialog"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card class="envio-mensagem" data-teste="mensagem-admin-envio">
      <v-card-title class="envio-mensagem__titulo">Enviar mensagem aos PDVs</v-card-title>

      <v-card-text class="envio-mensagem__corpo">
        <v-text-field
          v-model="titulo"
          label="Título"
          maxlength="120"
          counter
          autofocus
          hide-details="auto"
          class="mb-4"
        />
        <v-textarea
          v-model="corpo"
          label="Mensagem"
          maxlength="2000"
          counter
          rows="4"
          auto-grow
          hide-details="auto"
          class="mb-4"
        />

        <v-select
          v-model="alvo"
          :items="ALVOS"
          item-title="title"
          item-value="value"
          label="Quem recebe"
          :hint="ajudaDoAlvo"
          persistent-hint
          class="mb-4"
        />

        <v-select
          v-if="alvo === 'pdv'"
          v-model="pdvsEscolhidos"
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

        <template v-if="alvo === 'operador'">
          <v-select
            v-if="operadores.length"
            v-model="operadoresEscolhidos"
            :items="operadores"
            label="Operadores"
            multiple
            chips
            closable-chips
            hide-details="auto"
            class="mb-4"
          />
          <v-alert v-else type="info" variant="tonal" density="compact" class="mb-4">
            Nenhum caixa aberto agora — não há operador para escolher. Use "Toda a empresa".
          </v-alert>
        </template>

        <v-text-field
          v-model="validoAte"
          type="datetime-local"
          label="Válida até (opcional)"
          hint="Depois desta data a mensagem para de alcançar quem abrir caixa."
          persistent-hint
        />
      </v-card-text>

      <v-card-actions class="envio-mensagem__acoes">
        <v-btn variant="text" @click="emit('update:modelValue', false)">Cancelar</v-btn>
        <v-spacer />
        <v-btn
          color="primary"
          variant="flat"
          prepend-icon="mdi-send"
          :loading="enviando"
          :disabled="!podeEnviar"
          data-teste="mensagem-admin-enviar"
          @click="confirmar"
        >
          Enviar
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.envio-mensagem {
  display: flex;
  flex-direction: column;
  max-height: 88dvh;
}

.envio-mensagem__titulo {
  font-size: 1.1rem;
  font-weight: 700;
  padding: 18px 20px 6px;
  white-space: normal;
}

.envio-mensagem__corpo {
  padding: 12px 20px 4px;
}

.envio-mensagem__acoes {
  /* §13.3: no celular o formulario e alto e as acoes precisam ficar alcancaveis sem rolar. */
  position: sticky;
  bottom: 0;
  padding: 12px 16px;
  background: var(--cx-surface);
  border-top: 1px solid var(--cx-line-soft);
}

@media (width <= 480px) {
  .envio-mensagem__acoes :deep(.v-btn) {
    min-height: 44px;
  }
}
</style>
