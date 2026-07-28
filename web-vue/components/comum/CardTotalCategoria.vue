<script setup lang="ts">
// Card de total no padrao Mobills: icone circular colorido (cor da categoria via --cat-*),
// rotulo pequeno + numero grande. Elevacao Material (Vuetify 1-2), sem sombra custom.
// Componente-base REUTILIZAVEL (rodada de SHELL) — as telas de listagem o adotam no topo.
import { dinheiro } from "~/utils/domain";

const props = withDefaults(
  defineProps<{
    rotulo: string;
    valor: number | string;
    // Chave da categoria: entradas | transferencias | despesas | mercadorias | retiradas | resultado | contas.
    categoria?: string;
    icone?: string;
    // Cor explicita (hex/var) — sobrepoe a cor da categoria quando informada.
    cor?: string;
    // "moeda" formata como BRL; "texto" mostra o valor como veio.
    formato?: "moeda" | "texto";
    // Cor do numero: neutro (ink) | positivo (verde) | negativo (vermelho) | auto (pelo sinal).
    tom?: "neutro" | "positivo" | "negativo" | "auto";
    legenda?: string;
    elevacao?: number | string;
  }>(),
  { formato: "moeda", tom: "neutro", elevacao: 2 }
);

const iconesPorCategoria: Record<string, string> = {
  entradas: "mdi-arrow-down-left",
  transferencias: "mdi-swap-horizontal",
  despesas: "mdi-receipt-text",
  mercadorias: "mdi-package-variant-closed",
  retiradas: "mdi-wallet",
  resultado: "mdi-chart-box",
  contas: "mdi-bank"
};

const iconeResolvido = computed(
  () => props.icone ?? (props.categoria ? iconesPorCategoria[props.categoria] : undefined) ?? "mdi-circle-medium"
);

const paleta = computed(() => {
  if (props.cor) return { base: props.cor, soft: `color-mix(in srgb, ${props.cor} 14%, #ffffff)` };
  if (props.categoria)
    return { base: `var(--cat-${props.categoria}-base)`, soft: `var(--cat-${props.categoria}-soft)` };
  return { base: "var(--brand, #6515dd)", soft: "var(--brand-soft, #edf3fb)" };
});

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
  <v-card class="card-total" :elevation="elevacao" rounded="lg">
    <span class="card-total-icone" :style="{ background: paleta.soft, color: paleta.base }">
      <v-icon :icon="iconeResolvido" size="22" />
    </span>
    <span class="card-total-copy">
      <span class="card-total-rotulo">{{ rotulo }}</span>
      <span class="card-total-valor" :style="{ color: corValor }">{{ valorFormatado }}</span>
      <span v-if="legenda" class="card-total-legenda">{{ legenda }}</span>
    </span>
  </v-card>
</template>

<style scoped>
.card-total {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
}
.card-total-icone {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 50%;
}
.card-total-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.card-total-rotulo {
  color: var(--shell-ink-soft, #64748b);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.2px;
  text-transform: uppercase;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-total-valor {
  font-size: 22px;
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -0.3px;
}
.card-total-legenda {
  color: var(--shell-ink-soft, #64748b);
  font-size: 12px;
  font-weight: 600;
}
@media (width <= 560px) {
  .card-total {
    padding: 13px 14px;
    gap: 11px;
  }
  .card-total-icone {
    width: 40px;
    height: 40px;
  }
  .card-total-valor {
    font-size: 19px;
  }
}
</style>
