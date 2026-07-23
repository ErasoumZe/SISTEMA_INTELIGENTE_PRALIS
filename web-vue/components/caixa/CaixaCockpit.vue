<script setup lang="ts">
// Cockpit do caixa fiel ao mockup (docs/mockups/TODAS-AS-TELAS-mockup.html, tela 2): cabecalho do
// caixa + "Dinheiro no caixa" / "Deficit a quitar (malote)" + 6 categorias com barra colorida
// (cores da planilha = tokens --cat-* do V1). Apresentacao: recebe o resumo/caixa ja carregados.
import type { CaixaOperacional, ResumoCaixa } from "~/types/padaria";
import { dinheiro } from "~/utils/domain";

const props = defineProps<{
  resumo: ResumoCaixa;
  caixa: CaixaOperacional;
  usuarioNome: string;
}>();

const deficit = computed(() => Number(props.resumo.dividaCofre ?? 0));
const resultado = computed(() => Number(props.resumo.saldoProprio ?? props.resumo.saldo ?? 0));

type Linha = { chave: string; icone: string; titulo: string; sub: string; valor: number; sinal: -1 | 0 | 1 };
const categorias = computed<Linha[]>(() => [
  {
    chave: "entradas",
    icone: "mdi-cash",
    titulo: "Entradas",
    sub: "vendas",
    valor: props.resumo.totalEntradas,
    sinal: 1
  },
  {
    chave: "transferencias",
    icone: "mdi-swap-horizontal",
    titulo: "Transferências",
    sub: "cofre ⇄ caixa",
    valor: props.resumo.totalTransferencias,
    sinal: props.resumo.totalTransferencias < 0 ? -1 : 1
  },
  {
    chave: "despesas",
    icone: "mdi-receipt-text-outline",
    titulo: "Despesas",
    sub: "despesas do caixa",
    valor: props.resumo.totalDespesas,
    sinal: -1
  },
  {
    chave: "mercadorias",
    icone: "mdi-storefront-outline",
    titulo: "Mercadorias",
    sub: "compras",
    valor: props.resumo.totalMercadorias ?? 0,
    sinal: -1
  },
  {
    chave: "retiradas",
    icone: "mdi-tray-arrow-down",
    titulo: "Retiradas",
    sub: "retiradas",
    valor: props.resumo.totalRetiradas,
    sinal: props.resumo.totalRetiradas > 0 ? -1 : 0
  }
]);

function valorFormatado(l: Linha) {
  const base = dinheiro(Math.abs(l.valor));
  return l.sinal === -1 ? `− ${base}` : base;
}
</script>

<template>
  <div class="cockpit">
    <div class="cockpit-head">
      <div class="cockpit-head-linha">
        <span class="cockpit-dot"></span>
        <span class="cockpit-caixa-nome">Caixa aberto · {{ caixa.pdvNome }}</span>
        <span class="cockpit-spacer"></span>
        <span class="cockpit-usuario">{{ usuarioNome }}</span>
      </div>
      <div class="cockpit-boxes">
        <div class="cockpit-box">
          <div class="cockpit-box-label">Dinheiro no caixa</div>
          <div class="cockpit-box-valor">{{ dinheiro(resumo.saldo) }}</div>
        </div>
        <div v-if="deficit > 0" class="cockpit-box cockpit-box-deficit">
          <div class="cockpit-box-label">Déficit a quitar (malote)</div>
          <div class="cockpit-box-valor">{{ dinheiro(deficit) }}</div>
        </div>
      </div>
    </div>

    <div class="cockpit-cats">
      <div v-for="l in categorias" :key="l.chave" class="cat-row" :style="{ '--cat': `var(--cat-${l.chave}-base)` }">
        <span class="cat-bar"></span>
        <v-icon :color="`var(--cat-${l.chave}-base)`" size="19">{{ l.icone }}</v-icon>
        <div class="cat-info">
          <div class="cat-titulo">{{ l.titulo }}</div>
          <div class="cat-sub">{{ l.sub }}</div>
        </div>
        <span class="cat-valor" :class="{ saida: l.sinal === -1, neutro: l.sinal === 0 }">{{ valorFormatado(l) }}</span>
      </div>
      <div class="cat-row cat-resultado">
        <span class="cat-bar"></span>
        <v-icon color="var(--cat-resultado-base)" size="19">mdi-scale-balance</v-icon>
        <div class="cat-info">
          <div class="cat-titulo">Resultado do caixa</div>
          <div class="cat-sub">próprio, após quitar o cofre</div>
        </div>
        <span class="cat-valor cat-valor-resultado">{{ dinheiro(resultado) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cockpit {
  max-width: 480px;
}
.cockpit-head {
  margin-bottom: 14px;
  padding: 16px 18px;
  border: 0.5px solid #e4e8ef;
  border-radius: 16px;
  background: #fff;
}
.cockpit-head-linha {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.cockpit-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #16a34a;
}
.cockpit-caixa-nome {
  font-size: 14px;
  font-weight: 500;
  color: #1f2733;
}
.cockpit-spacer {
  flex: 1;
}
.cockpit-usuario {
  font-size: 12px;
  color: #64748b;
}
.cockpit-boxes {
  display: flex;
  gap: 10px;
}
.cockpit-box {
  flex: 1;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f4f6fa;
}
.cockpit-box-deficit {
  background: var(--cat-transferencias-soft, #fff1e8);
}
.cockpit-box-label {
  font-size: 11px;
  color: #64748b;
}
.cockpit-box-deficit .cockpit-box-label {
  color: var(--cat-transferencias-base, #c2410c);
}
.cockpit-box-valor {
  font-size: 20px;
  font-weight: 500;
  color: #1f2733;
}
.cockpit-box-deficit .cockpit-box-valor {
  color: var(--cat-transferencias-base, #c2410c);
}
.cockpit-cats {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cat-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 0.5px solid #e4e8ef;
  border-radius: 12px;
  background: #fff;
}
.cat-bar {
  width: 4px;
  height: 34px;
  border-radius: 2px;
  background: var(--cat);
}
.cat-resultado .cat-bar {
  background: var(--cat-resultado-base, #6d28d9);
}
.cat-info {
  flex: 1;
  min-width: 0;
}
.cat-titulo {
  font-size: 14px;
  font-weight: 500;
  color: #1f2733;
}
.cat-sub {
  font-size: 11px;
  color: #64748b;
}
.cat-valor {
  font-size: 15px;
  font-weight: 500;
  color: #1f2733;
}
.cat-valor.saida {
  color: #c0392b;
}
.cat-valor.neutro {
  color: #64748b;
}
.cat-valor-resultado {
  font-size: 16px;
  color: var(--cat-resultado-base, #6d28d9);
}
</style>
