<script setup lang="ts">
// Campo de dinheiro do sistema — UM lugar so. Antes cada tela usava `<input type="number">` cru: o
// usuario digitava 50 e via 50, sem saber se eram reais ou centavos; o teclado brasileiro manda
// virgula e o `type="number"` so aceita ponto; e o spinner aparecia num campo onde ele nao serve.
//
// O que este componente faz e SO exibicao. O `v-model` continua sendo a string decimal com PONTO
// que o payload ja mandava (`z.coerce.number()` do lado de la) — trocar o contrato para centavos
// inteiros e outra rodada, nao esta.
//
// `casas` e o MAXIMO de decimais preservados, nao um fixo: o minimo e sempre 2 (e isso que faz `50`
// virar `50,00`). Existe porque nem toda coluna deste sistema e de 2 casas — valor unitario,
// desconto e juros sao `scale 4` no banco, e arredondar na tela para 2 apagaria o que o usuario
// digitou. Quem e dinheiro de verdade (`scale 2`) usa o default.
import { computed, ref } from "vue";
import { formatarCampoDinheiro, limparDigitacaoDinheiro, numeroDoCampo } from "~/utils/campo-dinheiro";

const props = withDefaults(
  defineProps<{
    modelValue: string | number | null | undefined;
    casas?: number;
    placeholder?: string;
    disabled?: boolean;
  }>(),
  { casas: 2, placeholder: "0,00", disabled: false }
);

const emit = defineEmits<{ "update:modelValue": [string] }>();

// Enquanto o campo esta em foco, o texto e do usuario: reformatar a cada tecla faria o cursor pular
// e transformaria digitar "1.234,5" numa briga com o campo.
const editando = ref(false);
const rascunho = ref("");

const exibido = computed(() => {
  if (editando.value) return rascunho.value;
  const numero = numeroDoCampo(props.modelValue);
  // Campo vazio continua VAZIO: forcar "0,00" apagaria a diferenca entre zero e nao informado.
  return numero === null ? "" : formatarCampoDinheiro(numero, props.casas);
});

function aoDigitar(evento: Event) {
  const alvo = evento.target as HTMLInputElement;
  const limpo = limparDigitacaoDinheiro(alvo.value);
  rascunho.value = limpo;
  if (alvo.value !== limpo) alvo.value = limpo;
  const numero = numeroDoCampo(limpo);
  emit("update:modelValue", numero === null ? "" : String(numero));
}

function aoFocar(evento: FocusEvent) {
  const numero = numeroDoCampo(props.modelValue);
  // Entra em edicao com o numero cru em virgula, sem separador de milhar: ninguem digita por cima
  // de "1.234,56" sem esbarrar no ponto.
  rascunho.value = numero === null ? "" : String(numero).replace(".", ",");
  editando.value = true;
  (evento.target as HTMLInputElement).value = rascunho.value;
}

function aoSair() {
  editando.value = false;
  rascunho.value = "";
}
</script>

<template>
  <!-- `type="text"` + inputmode="decimal": teclado numerico no celular, sem o spinner que nao faz
       sentido em dinheiro e sem a recusa do type="number" a aceitar virgula. -->
  <input
    :value="exibido"
    type="text"
    inputmode="decimal"
    autocomplete="off"
    class="campo-dinheiro"
    :placeholder="props.placeholder"
    :disabled="props.disabled"
    @input="aoDigitar"
    @focus="aoFocar"
    @blur="aoSair"
  />
</template>

<style scoped>
/* Numero alinhado a direita e com algarismo de largura fixa: sem tabular-nums a coluna de valores
   dança a cada digito. Nada de cor, espacamento ou sombra aqui — aparencia e outra rodada. */
.campo-dinheiro {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
