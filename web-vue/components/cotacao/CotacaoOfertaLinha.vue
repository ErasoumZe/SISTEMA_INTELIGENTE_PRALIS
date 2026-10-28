<script setup lang="ts">
/**
 * Uma oferta de fornecedor na cotação do produto (doc 58 §4). Fechada, a linha mostra só quem, quanto e as duas
 * ações. "Aceitar" abre a escolha: comprar só desta vez (a referência fica) ou comprar e reajustar a referência
 * para este custo (só quando veio acima dela). Comprar é irreversível: sempre pede confirmação. "Contrapropor" abre
 * o campo do valor.
 */
import type { OfertaDoProdutoDto } from "@padaria/shared";
import { ROTULO_COLUNA_COTACAO } from "@padaria/shared";
import ComprasSituacao from "~/components/compras/base/ComprasSituacao.vue";
import { TOM_SITUACAO } from "~/utils/cotacao-produto";
import { formatarValorDecisao, lerValorDigitado, totalDaProposta } from "~/utils/decisao-compras";

const props = defineProps<{
  oferta: OfertaDoProdutoDto;
  unidade: string | null;
  referencia: string | null;
  /** Mostrar de qual cotação é: só quando o produto está em mais de uma. */
  mostrarCotacao: boolean;
  podeAceitar: boolean;
  podeContrapropor: boolean;
  processando: boolean;
}>();
const emit = defineEmits<{
  aceitar: [oferta: OfertaDoProdutoDto, reajustarReferencia: boolean];
  contrapropor: [oferta: OfertaDoProdutoDto, valor: number];
}>();

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const painel = ref<"aceitar" | "contrapropor" | null>(null);
const reajustar = ref(false);
const valorDigitado = ref("");
const valor = computed(() => lerValorDigitado(valorDigitado.value));
const unidade = computed(() => props.unidade ?? "un");
const quantidade = computed(() => props.oferta.quantidadeDisponivel ?? props.oferta.quantidadePedida);
const total = computed(() => totalDaProposta(props.oferta, quantidade.value));
const temPreco = computed(() => props.oferta.propostaItemId !== null && !props.oferta.indisponivel);
const podeReajustar = computed(() => props.oferta.situacao === "com_aumento");
const detalhe = computed(() => {
  if (props.oferta.indisponivel) return "Não tem o produto";
  if (props.oferta.situacao === "cotado") return "Salvou a resposta, ainda não enviou";
  if (props.oferta.situacao === "enviado") return "Ainda não respondeu";
  return "";
});

function abrir(qual: "aceitar" | "contrapropor") {
  painel.value = painel.value === qual ? null : qual;
  reajustar.value = false;
}
function confirmarCompra() {
  emit("aceitar", props.oferta, podeReajustar.value && reajustar.value);
  painel.value = null;
}
function enviarContraproposta() {
  if (valor.value === null) return;
  emit("contrapropor", props.oferta, valor.value);
  valorDigitado.value = "";
  painel.value = null;
}
</script>

<template>
  <div class="oferta" :data-fornecedor="oferta.fornecedorNome" :data-situacao="oferta.situacao">
    <div class="oferta__linha">
      <div class="oferta__quem">
        <span class="oferta__nome">{{ oferta.fornecedorNome }}</span>
        <span class="oferta__sub">
          <ComprasSituacao :rotulo="ROTULO_COLUNA_COTACAO[oferta.situacao]" :tom="TOM_SITUACAO[oferta.situacao]" />
          <span v-if="detalhe">{{ detalhe }}</span>
          <span v-if="mostrarCotacao">· cotação de {{ DATA_HORA.format(new Date(oferta.abertaEm)) }}</span>
        </span>
      </div>

      <div v-if="temPreco" class="oferta__valores">
        <span class="oferta__custo"
          >{{ formatarValorDecisao(oferta.custoFinalUnitario) }}<small>/{{ unidade }}</small></span
        >
        <span class="oferta__qtd"
          >{{ Number(quantidade) }} {{ unidade
          }}<template v-if="total !== null"> · {{ formatarValorDecisao(total) }}</template></span
        >
      </div>
      <div v-else class="oferta__valores oferta__valores--vazio">
        <span class="oferta__qtd">pedimos {{ Number(oferta.quantidadePedida) }} {{ unidade }}</span>
      </div>

      <div v-if="podeAceitar || podeContrapropor" class="oferta__acoes">
        <v-btn
          v-if="podeContrapropor"
          size="small"
          variant="text"
          :active="painel === 'contrapropor'"
          data-acao="contrapropor"
          @click="abrir('contrapropor')"
          >Contrapropor</v-btn
        >
        <v-btn
          v-if="podeAceitar"
          size="small"
          color="primary"
          :variant="painel === 'aceitar' ? 'tonal' : 'flat'"
          data-acao="aceitar"
          @click="abrir('aceitar')"
          >Aceitar</v-btn
        >
      </div>
    </div>

    <p v-if="oferta.contrapropostaUnitario !== null" class="oferta__aviso">
      <v-icon icon="mdi-swap-horizontal" size="14" /> Você contrapropôs
      {{ formatarValorDecisao(oferta.contrapropostaUnitario) }}/{{ unidade }} · aguardando o fornecedor
    </p>

    <div v-if="painel === 'aceitar'" class="oferta__painel" data-painel="aceitar">
      <v-radio-group v-if="podeReajustar" v-model="reajustar" hide-details density="compact" class="oferta__escolha">
        <v-radio :value="false" data-opcao="so-desta-vez">
          <template #label>
            <span
              ><strong>Só desta vez.</strong>
              {{
                referencia === null
                  ? "O produto continua sem referência."
                  : `A referência continua ${formatarValorDecisao(referencia)}.`
              }}</span
            >
          </template>
        </v-radio>
        <v-radio :value="true" data-opcao="reajustar">
          <template #label>
            <span
              ><strong>Reajustar a referência</strong> para {{ formatarValorDecisao(oferta.custoFinalUnitario) }}/{{
                unidade
              }}.</span
            >
          </template>
        </v-radio>
      </v-radio-group>
      <p v-else class="oferta__texto">Comprar {{ Number(quantidade) }} {{ unidade }} de {{ oferta.fornecedorNome }}?</p>
      <div class="oferta__botoes">
        <v-btn size="small" variant="text" :disabled="processando" @click="painel = null">Cancelar</v-btn>
        <v-btn
          size="small"
          color="primary"
          variant="flat"
          :loading="processando"
          data-acao="confirmar-compra"
          @click="confirmarCompra"
          >Confirmar compra</v-btn
        >
      </div>
    </div>

    <div v-if="painel === 'contrapropor'" class="oferta__painel" data-painel="contrapropor">
      <v-text-field
        v-model="valorDigitado"
        :label="`Seu valor (R$/${unidade})`"
        inputmode="decimal"
        density="compact"
        hide-details
        autofocus
        class="oferta__valor"
        @keyup.enter="enviarContraproposta"
      />
      <div class="oferta__botoes">
        <v-btn size="small" variant="text" :disabled="processando" @click="painel = null">Cancelar</v-btn>
        <v-btn
          size="small"
          color="primary"
          variant="flat"
          :disabled="valor === null"
          :loading="processando"
          data-acao="enviar-contraproposta"
          @click="enviarContraproposta"
          >Enviar contraproposta</v-btn
        >
      </div>
    </div>
  </div>
</template>

<style scoped>
.oferta {
  display: grid;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-3) var(--cx-sp-5);
  border-top: 1px solid var(--cx-line-soft);
}

.oferta__linha {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--cx-sp-4);
}

.oferta__quem {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.oferta__nome {
  color: var(--cx-ink);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.oferta__sub {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cx-sp-2);
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

.oferta__valores {
  display: grid;
  justify-items: end;
  gap: 2px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.oferta__custo {
  color: var(--cx-ink);
  font-size: var(--cx-fs-lead);
  font-weight: 650;
}

.oferta__custo small {
  margin-left: 1px;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
  font-weight: 500;
}

.oferta__qtd {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

.oferta__acoes {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-1);
}

.oferta__aviso {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: rgb(var(--v-theme-info));
  font-size: var(--cx-fs-caption);
}

.oferta__painel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-3) var(--cx-sp-4);
  border-radius: var(--cx-r-md);
  background: var(--cx-surface-sunken);
}

.oferta__escolha {
  flex: 1 1 320px;
}

.oferta__texto {
  margin: 0;
  color: var(--cx-ink);
}

.oferta__botoes {
  display: flex;
  gap: var(--cx-sp-2);
  margin-left: auto;
}

.oferta__valor {
  flex: 0 1 220px;
}

@media (max-width: 599px) {
  .oferta {
    padding-left: var(--cx-sp-4);
    padding-right: var(--cx-sp-4);
  }

  .oferta__linha {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .oferta__acoes {
    grid-column: 1 / -1;
    justify-content: flex-end;
  }
}
</style>
