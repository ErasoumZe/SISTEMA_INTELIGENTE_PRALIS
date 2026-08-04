<script setup lang="ts">
// Linha de transacao no padrao Mobills (densidade alta): situacao . data . descricao .
// chip de categoria colorido . conta . valor (verde/vermelho pelo sinal) . acoes.
// Componente-base REUTILIZAVEL (rodada de SHELL). Corrige o defeito do Mobills: aqui a
// DESCRICAO e de primeira classe (nunca "Transferencia entrada..." ilegivel).
import { dinheiro } from "~/utils/domain";

const props = withDefaults(
  defineProps<{
    descricao: string;
    valor: number | string;
    situacao?: "efetuado" | "pendente" | "cancelado" | string;
    data?: string;
    // Chave da categoria para a cor do chip: entradas | transferencias | despesas | mercadorias | retiradas | resultado | contas.
    categoria?: string;
    categoriaRotulo?: string;
    conta?: string;
    formato?: "moeda" | "texto";
    // Cor do valor: auto (pelo sinal) | positivo | negativo | neutro.
    tom?: "auto" | "positivo" | "negativo" | "neutro";
  }>(),
  { formato: "moeda", tom: "auto" }
);

const situacoes: Record<string, { cor: string; icone: string; rotulo: string }> = {
  efetuado: { cor: "var(--positive, #16a34a)", icone: "mdi-check-circle", rotulo: "Efetuado" },
  pendente: { cor: "#f59e0b", icone: "mdi-clock-outline", rotulo: "Pendente" },
  cancelado: { cor: "#94a3b8", icone: "mdi-close-circle", rotulo: "Cancelado" }
};
const situacaoInfo = computed(() => (props.situacao ? situacoes[props.situacao] : undefined));

const estiloChip = computed(() =>
  props.categoria
    ? { color: `var(--cat-${props.categoria}-strong)`, background: `var(--cat-${props.categoria}-soft)` }
    : { color: "var(--shell-ink-soft, #64748b)", background: "#f1f5f9" }
);

const valorFormatado = computed(() =>
  props.formato === "moeda" && props.valor !== "" && props.valor != null ? dinheiro(props.valor) : String(props.valor)
);

const corValor = computed(() => {
  const numero =
    typeof props.valor === "number"
      ? props.valor
      : Number(
          String(props.valor)
            .replace(/[^\d,-]/g, "")
            .replace(".", "")
            .replace(",", ".")
        );
  const efetivo = props.tom === "auto" ? (numero < 0 ? "negativo" : "positivo") : props.tom;
  if (efetivo === "positivo") return "var(--positive, #16a34a)";
  if (efetivo === "negativo") return "var(--negative, #dc2626)";
  return "var(--shell-ink, #1f2733)";
});
</script>

<template>
  <div class="linha-tx">
    <span
      v-if="situacaoInfo"
      class="linha-tx-situacao"
      :style="{ color: situacaoInfo.cor }"
      :title="situacaoInfo.rotulo"
    >
      <v-icon :icon="situacaoInfo.icone" size="18" />
    </span>
    <span v-else class="linha-tx-situacao linha-tx-situacao-vazia" aria-hidden="true" />

    <span class="linha-tx-data">{{ data }}</span>

    <span class="linha-tx-descricao" :title="descricao">{{ descricao }}</span>

    <span class="linha-tx-chip-wrap">
      <span v-if="categoria || categoriaRotulo" class="linha-tx-chip" :style="estiloChip">
        {{ categoriaRotulo ?? categoria }}
      </span>
    </span>

    <span class="linha-tx-conta" :title="conta">{{ conta }}</span>

    <span class="linha-tx-valor" :style="{ color: corValor }">{{ valorFormatado }}</span>

    <span class="linha-tx-acoes"><slot name="acoes" /></span>
  </div>
</template>

<style scoped>
.linha-tx {
  display: grid;
  grid-template-columns: 24px 92px minmax(0, 1fr) auto 140px 130px auto;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--shell-line, #e4e8ef);
  transition: background 0.12s ease;
}
.linha-tx:hover {
  background: var(--shell-hover, #f3f5f9);
}
.linha-tx-situacao {
  display: inline-flex;
  justify-content: center;
}
.linha-tx-situacao-vazia {
  width: 18px;
  height: 18px;
}
.linha-tx-data {
  color: var(--shell-ink-soft, #64748b);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
.linha-tx-descricao {
  color: var(--shell-ink, #1f2733);
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.linha-tx-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}
.linha-tx-conta {
  color: var(--shell-ink-soft, #64748b);
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.linha-tx-valor {
  font-size: 14.5px;
  font-weight: 800;
  text-align: right;
  white-space: nowrap;
}
.linha-tx-acoes {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  justify-content: flex-end;
}

/* Densidade responsiva: em telas medias some a coluna Conta; no celular vira 2 linhas. */
@media (width <= 1024px) {
  .linha-tx {
    grid-template-columns: 24px 84px minmax(0, 1fr) auto 118px auto;
  }
  .linha-tx-conta {
    display: none;
  }
}
@media (width <= 768px) {
  .linha-tx {
    grid-template-columns: 20px minmax(0, 1fr) auto auto;
    grid-template-areas:
      "sit desc desc valor"
      "sit meta chip acoes";
    row-gap: 2px;
    padding: 10px 12px;
  }
  .linha-tx-situacao,
  .linha-tx-situacao-vazia {
    grid-area: sit;
    align-self: start;
    margin-top: 2px;
  }
  .linha-tx-descricao {
    grid-area: desc;
  }
  .linha-tx-data {
    grid-area: meta;
  }
  .linha-tx-chip-wrap {
    grid-area: chip;
    justify-self: end;
  }
  .linha-tx-conta {
    display: none;
  }
  .linha-tx-valor {
    grid-area: valor;
    justify-self: end;
  }
  .linha-tx-acoes {
    grid-area: acoes;
  }
}
</style>
