<script setup lang="ts">
// R-231 · dinheiro sem lacre a caminho deste caixa (ex.: reforço de troco que a gerencia trouxe do Cofre). So vira
// saldo do caixa quando o operador confirma; "Nao recebi" cancela, o valor volta a origem e a Tesouraria e avisada.
// Enquanto houver um aqui, o caixa nao inicia o fechamento.
import { ref, watch } from "vue";
import { useApi } from "~/composables/useApi";
import type { RecebimentoSemLacrePendente } from "~/types/padaria";
import { dinheiro, mensagemErro } from "~/utils/domain";
import { formatarDataHora } from "~/utils/formatacao";

const props = defineProps<{ caixaId: string; recebimentos: RecebimentoSemLacrePendente[] }>();
const emit = defineEmits<{ (event: "resolvido"): void }>();
const { apiPost } = useApi();

const resolvendoId = ref("");
const erro = ref("");
const naoRecebiDe = ref<RecebimentoSemLacrePendente | null>(null);

// O item resolvido fica travado ate a lista do servidor chegar sem ele: soltar antes reabria o botao sobre um
// recebimento ja resolvido (segundo clique = 409).
watch(
  () => props.recebimentos,
  () => {
    resolvendoId.value = "";
  }
);

async function resolver(recebimento: RecebimentoSemLacrePendente, acao: "confirmar" | "nao-recebi") {
  if (resolvendoId.value) return;
  resolvendoId.value = recebimento.id;
  erro.value = "";
  try {
    await apiPost(`/api/caixa/${props.caixaId}/recebimentos-sem-lacre/${recebimento.id}/${acao}`, {});
    naoRecebiDe.value = null;
    emit("resolvido");
  } catch (falha) {
    erro.value = mensagemErro(falha);
    resolvendoId.value = "";
    // Ja resolvido por outra tela ou caixa que saiu de "aberto": a lista na tela esta velha, recarrega.
    if (/já foi resolvido|não está aberto/iu.test(erro.value)) emit("resolvido");
  }
}

function composicao(recebimento: RecebimentoSemLacrePendente) {
  if (recebimento.valorEspecie === null && recebimento.valorMoedas === null) return "";
  return `Físico ${dinheiro(recebimento.valorEspecie ?? 0)} · Moedas ${dinheiro(recebimento.valorMoedas ?? 0)}`;
}
</script>

<template>
  <section
    v-if="recebimentos.length"
    class="rsl"
    aria-labelledby="rsl-titulo"
    role="region"
    data-teste="recebimentos-sem-lacre"
  >
    <header class="rsl__topo">
      <v-icon icon="mdi-cash-fast" size="20" />
      <div>
        <h2 id="rsl-titulo" class="rsl__titulo">Recebimentos pendentes</h2>
        <p class="rsl__sub">
          Dinheiro sem lacre enviado para este caixa. Conte e confirme; só depois ele entra no saldo. O caixa só fecha
          depois de resolver.
        </p>
      </div>
    </header>

    <ul class="rsl__lista">
      <li v-for="recebimento in recebimentos" :key="recebimento.id" class="rsl__item">
        <div class="rsl__dados">
          <strong class="rsl__valor">{{ dinheiro(recebimento.valor) }}</strong>
          <span class="rsl__linha">{{ composicao(recebimento) }}</span>
          <span class="rsl__linha">
            De {{ recebimento.origemNome
            }}<template v-if="recebimento.enviadoPorNome"> · enviado por {{ recebimento.enviadoPorNome }}</template> ·
            {{ formatarDataHora(recebimento.enviadoEm) }}
          </span>
          <span v-if="recebimento.observacao" class="rsl__linha rsl__obs">{{ recebimento.observacao }}</span>
        </div>
        <div class="rsl__acoes">
          <v-btn
            color="success"
            variant="flat"
            size="large"
            prepend-icon="mdi-check"
            :loading="resolvendoId === recebimento.id"
            :disabled="Boolean(resolvendoId)"
            data-teste="recebimento-confirmar"
            @click="resolver(recebimento, 'confirmar')"
          >
            Confirmar recebimento
          </v-btn>
          <v-btn
            color="error"
            variant="outlined"
            size="large"
            prepend-icon="mdi-close"
            :disabled="Boolean(resolvendoId)"
            data-teste="recebimento-nao-recebi"
            @click="naoRecebiDe = recebimento"
          >
            Não recebi
          </v-btn>
        </div>
      </li>
    </ul>
    <p v-if="erro && !naoRecebiDe" class="rsl__erro" role="alert">{{ erro }}</p>

    <v-dialog
      :model-value="Boolean(naoRecebiDe)"
      max-width="420"
      @update:model-value="
        naoRecebiDe = null;
        erro = '';
      "
    >
      <v-card v-if="naoRecebiDe" rounded="lg">
        <v-card-title class="text-wrap">Não recebeu {{ dinheiro(naoRecebiDe.valor) }}?</v-card-title>
        <v-card-text>
          A transferência é cancelada, o valor volta para {{ naoRecebiDe.origemNome }} e a Tesouraria é avisada.
          <!-- O erro aparece aqui dentro: fora do dialogo ele ficava atras do veu. -->
          <p v-if="erro" class="rsl__erro mt-2" role="alert">{{ erro }}</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            variant="text"
            size="large"
            :disabled="Boolean(resolvendoId)"
            @click="
              naoRecebiDe = null;
              erro = '';
            "
            >Voltar</v-btn
          >
          <v-btn
            color="error"
            variant="flat"
            size="large"
            :loading="Boolean(resolvendoId)"
            data-teste="recebimento-nao-recebi-confirmar"
            @click="resolver(naoRecebiDe, 'nao-recebi')"
          >
            Não recebi
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<style scoped>
.rsl {
  display: grid;
  gap: 10px;
  margin-bottom: 14px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--cat-transferencias-base, #c2410c) 45%, transparent);
  border-radius: 12px;
  background: var(--cat-transferencias-soft, #fff1e8);
  color: rgb(var(--v-theme-on-surface));
}
.rsl__topo {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  color: var(--cat-transferencias-base, #c2410c);
}
.rsl__titulo {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
}
.rsl__sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.8);
}
.rsl__lista {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.rsl__item {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-radius: 10px;
  background: rgb(var(--v-theme-surface));
}
.rsl__dados {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.rsl__valor {
  font-size: 20px;
  font-variant-numeric: tabular-nums;
  color: var(--cat-transferencias-base, #c2410c);
}
.rsl__linha {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.8);
}
.rsl__obs {
  font-style: italic;
}
.rsl__acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.rsl__erro {
  margin: 0;
  color: #b42318;
  font-size: 12px;
  font-weight: 600;
}
@media (width <= 560px) {
  .rsl__acoes,
  .rsl__acoes .v-btn {
    width: 100%;
  }
}
</style>
