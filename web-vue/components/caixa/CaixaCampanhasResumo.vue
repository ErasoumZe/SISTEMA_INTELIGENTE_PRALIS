<script setup lang="ts">
import { ref, watch } from "vue";
import type { CampanhaComProgresso } from "@padaria/shared/campanhas";
import CampanhaProgresso from "~/components/campanhas/CampanhaProgresso.vue";

/**
 * O resultado da campanha no fechamento (R-199): SOMENTE LEITURA e somente informativo.
 *
 * Nao entra em `calcularTotaisCaixa`, nao altera saldo, nao vira lancamento e nao toca contas, folha
 * nem financeiro. Vive como componente proprio, fora do fluxo de dinheiro da tela, justamente para
 * que nenhuma alteracao aqui consiga mexer numa formula do caixa por acidente.
 */
const props = defineProps<{ empresaId: string; pdvId: string; dia: string }>();

const { apiGet } = useApi();
const campanhas = ref<CampanhaComProgresso[]>([]);

async function carregar() {
  if (!props.empresaId || !props.pdvId || !props.dia) {
    campanhas.value = [];
    return;
  }
  const params = new URLSearchParams({ empresaId: props.empresaId, pdvId: props.pdvId, dia: props.dia });
  try {
    campanhas.value = await apiGet<CampanhaComProgresso[]>(`/api/campanhas/fechamento?${params.toString()}`);
  } catch {
    // Campanha e informacao adicional: falhar aqui nao pode atrapalhar o fechamento do caixa, que e
    // a operacao que a padaria realmente precisa concluir.
    campanhas.value = [];
  }
}

watch(() => [props.empresaId, props.pdvId, props.dia], carregar, { immediate: true });
</script>

<template>
  <section v-if="campanhas.length" class="caixa-campanhas" data-teste="caixa-campanhas">
    <h3 class="caixa-campanhas__titulo">
      <v-icon size="18">mdi-trophy-outline</v-icon>
      <span>Campanhas deste PDV</span>
    </h3>

    <article v-for="campanha in campanhas" :key="campanha.id" class="caixa-campanhas__item">
      <div class="caixa-campanhas__cabecalho">
        <strong>{{ campanha.titulo }}</strong>
        <span class="caixa-campanhas__periodo">{{ campanha.inicio }} a {{ campanha.fim }}</span>
      </div>
      <p class="caixa-campanhas__mensagem">{{ campanha.mensagem }}</p>

      <CampanhaProgresso :campanha="campanha" compacto />

      <p class="caixa-campanhas__bonificacao">
        Bonificação:
        <template v-if="campanha.bonificacaoTipo === 'dinheiro'">
          R$ {{ campanha.bonificacaoValor?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) }}
        </template>
        <template v-else-if="campanha.bonificacaoTipo === 'percentual'">{{ campanha.bonificacaoValor }}%</template>
        <template v-else>{{ campanha.bonificacaoTexto }}</template>
      </p>
    </article>

    <p class="caixa-campanhas__aviso">
      Informação de acompanhamento. A bonificação não é lançada em caixa, financeiro nem folha — ela é apurada e paga
      fora do sistema.
    </p>
  </section>
</template>

<style scoped>
.caixa-campanhas {
  display: grid;
  gap: 12px;
  margin: 20px 0;
  padding: 16px;
  border: 1px solid var(--cx-line);
  border-radius: 12px;
  background: var(--cx-surface-sunken);
}

.caixa-campanhas__titulo {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
}

.caixa-campanhas__item {
  display: grid;
  gap: 2px;
  padding-top: 8px;
  border-top: 1px solid var(--cx-line-soft);
}

.caixa-campanhas__item:first-of-type {
  padding-top: 0;
  border-top: 0;
}

.caixa-campanhas__cabecalho {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
}

.caixa-campanhas__periodo {
  font-size: 0.78rem;
  color: var(--cx-ink-soft);
}

.caixa-campanhas__mensagem {
  margin: 0;
  font-size: 0.9rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.caixa-campanhas__bonificacao {
  margin: 8px 0 0;
  font-size: 0.88rem;
}

.caixa-campanhas__aviso {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.45;
  color: var(--cx-ink-soft);
}
</style>
