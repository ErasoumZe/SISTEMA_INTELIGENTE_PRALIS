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
import { computed } from "vue";
import {
  contarDigitos,
  formatarCampoDinheiro,
  limparDigitacaoDinheiro,
  numeroDoCampo,
  posicaoAposDigitos
} from "~/utils/campo-dinheiro";

const props = withDefaults(
  defineProps<{
    modelValue: string | number | null | undefined;
    casas?: number;
    label?: string;
    placeholder?: string;
    disabled?: boolean;
  }>(),
  { casas: 2, placeholder: "0,00", disabled: false }
);

const emit = defineEmits<{ "update:modelValue": [string] }>();

const exibido = computed(() => {
  const numero = numeroDoCampo(props.modelValue);
  // Campo vazio continua VAZIO: forcar "0,00" apagaria a diferenca entre zero e nao informado.
  return numero === null ? "" : formatarCampoDinheiro(numero, props.casas);
});

// Formata A CADA TECLA (decisao do Jose, 04/08/2026 — antes so no blur). A versao anterior deixava
// para o blur com o argumento de que reformatar faria o cursor pular; a preocupacao era legitima, a
// conclusao nao. O que impede o pulo e reancorar o cursor pelo numero de DIGITOS a esquerda dele, e
// nao pela posicao em caracteres: assim o separador de milhar pode entrar ou sair que o cursor
// continua onde a pessoa estava. Digitar 1 mostra 1,00; 1234 mostra 1.234,00 sem o cursor sair do
// lugar. NAO volte para "so no blur" sem ler isto.
function aoDigitar(evento: Event) {
  const alvo = evento.target as HTMLInputElement;
  const digitado = (evento as InputEvent).data;
  const bruto = alvo.value;
  const posicao = alvo.selectionStart ?? bruto.length;
  const digitosAEsquerda = contarDigitos(bruto.slice(0, posicao));

  const numero = numeroDoCampo(limparDigitacaoDinheiro(bruto));
  emit("update:modelValue", numero === null ? "" : String(numero));

  const formatado = numero === null ? "" : formatarCampoDinheiro(numero, props.casas);
  alvo.value = formatado;

  // Digitou o separador: o cursor pula para DEPOIS da virgula, para os proximos digitos caírem nos
  // centavos. Sem isto, "15" + "," + "5" viraria "155,00" em vez de "15,50".
  const virgula = formatado.indexOf(",");
  const destino =
    (digitado === "," || digitado === ".") && virgula >= 0
      ? virgula + 1
      : posicaoAposDigitos(formatado, digitosAEsquerda);
  alvo.setSelectionRange(destino, destino);
}
</script>

<template>
  <label v-if="props.label" class="campo-dinheiro__grupo">
    <span class="campo-dinheiro__rotulo">{{ props.label }}</span>
    <!-- `type="text"` + inputmode="decimal": teclado numerico no celular, sem o spinner que nao faz
         sentido em dinheiro e sem a recusa do type="number" a aceitar virgula. -->
    <input
      :value="exibido"
      type="text"
      inputmode="decimal"
      autocomplete="off"
      class="campo-dinheiro campo-dinheiro--com-rotulo"
      :placeholder="props.placeholder"
      :disabled="props.disabled"
      @input="aoDigitar"
    />
  </label>
  <input
    v-else
    :value="exibido"
    type="text"
    inputmode="decimal"
    autocomplete="off"
    class="campo-dinheiro"
    :placeholder="props.placeholder"
    :disabled="props.disabled"
    @input="aoDigitar"
  />
</template>

<style scoped>
/* Numero alinhado a direita e com algarismo de largura fixa: sem tabular-nums a coluna de valores
   dança a cada digito. Nada de cor, espacamento ou sombra aqui — aparencia e outra rodada. */
.campo-dinheiro {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.campo-dinheiro__grupo {
  display: grid;
  gap: 6px;
  width: 100%;
  color: rgb(var(--v-theme-on-surface-variant));
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.1;
}

.campo-dinheiro--com-rotulo {
  width: 100%;
  min-height: 56px;
  padding: 0 16px;
  border: 1px solid rgb(var(--v-theme-outline));
  border-radius: 8px;
  outline: none;
  color: rgb(var(--v-theme-on-surface));
  background: transparent;
  font: inherit;
  font-size: 1rem;
}

.campo-dinheiro--com-rotulo:focus {
  border-color: rgb(var(--v-theme-primary));
  box-shadow: 0 0 0 1px rgb(var(--v-theme-primary));
}

.campo-dinheiro--com-rotulo:disabled {
  opacity: 0.6;
}
</style>
