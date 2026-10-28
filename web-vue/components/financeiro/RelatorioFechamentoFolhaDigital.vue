<script setup lang="ts">
import { computed } from "vue";
import VendasCanceladasBotao from "./VendasCanceladasBotao.vue";

type Registro = Record<string, unknown>;
type LinhaMaquininha = { forma: string; liquido: number | null };

// Folha digital do fechamento: so VALORES (vendas, cartoes, gaveta e o Relatorio final). Quem abriu/fechou fica em
// "Quem fechou"; lacres e sangrias ficam em "Lacres e sangrias" (sem repetir aqui).
const props = defineProps<{
  caixa: Registro;
  resumo: Registro | null;
  maquininha: LinhaMaquininha[];
  relatorioVendas: Registro | null;
  ajuste: Registro | null;
  vendasCanceladas?: Registro[];
  dinheiro: (valor: number) => string;
  numero: (valor: unknown) => number;
  texto: (valor: unknown) => string;
  dataHora: (valor: unknown) => string;
}>();

const totalCartoes = computed(() => props.maquininha.reduce((total, linha) => total + (linha.liquido ?? 0), 0));
const dadosVendas = computed(() => registro(props.relatorioVendas?.dados));
const vendas = computed(() => registro(dadosVendas.value.vendas));
const porPagamento = computed(() =>
  (Array.isArray(vendas.value.porFormaPagamento) ? vendas.value.porFormaPagamento : []).map(registro)
);
const diferenca = computed(() => {
  if (props.ajuste) return props.numero(props.ajuste.valorDiferenca);
  const esperado = props.numero(props.resumo?.valorFisicoEsperadoFechamento);
  const contado =
    props.numero(props.resumo?.valorEspecieFechamento) + props.numero(props.resumo?.valorMoedasFechamento);
  return contado - esperado;
});
const situacaoDiferenca = computed(() =>
  diferenca.value < 0
    ? { chave: "falta", titulo: "Falta", icone: "mdi-arrow-down-bold", texto: "Falta a justificar no fechamento." }
    : diferenca.value > 0
      ? { chave: "sobra", titulo: "Sobra", icone: "mdi-arrow-up-bold", texto: "Sobra registrada no fechamento." }
      : { chave: "bateu", titulo: "Bateu", icone: "mdi-check-circle", texto: "Valores físicos conferem." }
);
const diferencaTexto = computed(() => {
  if (!diferenca.value) return "R$ 0,00";
  return `${diferenca.value > 0 ? "+" : "−"}${props.dinheiro(Math.abs(diferenca.value))}`;
});
const totalVendas = computed(() => {
  const totalDeclarado = vendas.value.totalGeral;
  if (totalDeclarado !== null && totalDeclarado !== undefined && totalDeclarado !== "")
    return props.numero(totalDeclarado);
  return porPagamento.value.reduce((total, item) => total + props.numero(item.total), 0);
});

function registro(valor: unknown): Registro {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Registro) : {};
}
function rotuloPagamento(item: Registro) {
  return props.texto(item.formaPagamento || item.categoriaFechamentoCaixa).replace("--", "Não informado");
}
</script>

<template>
  <section class="fd" aria-labelledby="fd-titulo" data-teste="folha-digital">
    <h3 id="fd-titulo" class="fd__titulo">Folha digital</h3>

    <div class="fd__blocos">
      <section class="fd__bloco" aria-labelledby="fd-vendas">
        <h4 id="fd-vendas">Vendas PDV / CREARE · {{ dinheiro(totalVendas) }}</h4>
        <div v-if="porPagamento.length" class="fd__linhas">
          <div v-for="(item, indice) in porPagamento" :key="String(item.id || indice)">
            <span>{{ rotuloPagamento(item) }}</span
            ><strong class="cx-num">{{ dinheiro(numero(item.total)) }}</strong>
          </div>
        </div>
        <p v-else>Nenhum relatório CREARE gerado neste caixa.</p>
      </section>

      <section class="fd__bloco" aria-labelledby="fd-cartoes">
        <h4 id="fd-cartoes">Cartões (líquido) · {{ dinheiro(totalCartoes) }}</h4>
        <div v-if="maquininha.length" class="fd__linhas">
          <div v-for="linha in maquininha" :key="linha.forma">
            <span>{{ linha.forma }}</span
            ><strong class="cx-num">{{ linha.liquido === null ? "Não informado" : dinheiro(linha.liquido) }}</strong>
          </div>
        </div>
        <p v-else>Nenhuma leitura de maquininha informada.</p>
      </section>

      <section class="fd__bloco" aria-labelledby="fd-gaveta">
        <h4 id="fd-gaveta">Contagem da gaveta</h4>
        <div class="fd__linhas">
          <div>
            <span>Em notas</span><strong class="cx-num">{{ dinheiro(numero(resumo?.valorEspecieFechamento)) }}</strong>
          </div>
          <div>
            <span>Em moedas</span><strong class="cx-num">{{ dinheiro(numero(resumo?.valorMoedasFechamento)) }}</strong>
          </div>
          <div class="fd__total">
            <span>Contado na gaveta</span>
            <strong class="cx-num">{{
              dinheiro(numero(resumo?.valorEspecieFechamento) + numero(resumo?.valorMoedasFechamento))
            }}</strong>
          </div>
          <div>
            <span>Esperado na gaveta</span
            ><strong class="cx-num">{{ dinheiro(numero(resumo?.valorFisicoEsperadoFechamento)) }}</strong>
          </div>
        </div>
      </section>
    </div>

    <section class="fd__final" aria-labelledby="fd-final">
      <h4 id="fd-final">Relatório final</h4>
      <div class="fd__cards">
        <div class="fd__card fd__card--vendas">
          <span>Venda</span><strong class="cx-num">{{ dinheiro(totalVendas) }}</strong>
        </div>
        <div class="fd__card fd__card--transferencias">
          <span>Transferências (entrada − saída)</span>
          <strong class="cx-num">{{
            dinheiro(numero(resumo?.totalTransferenciasEntrada) - numero(resumo?.totalTransferenciasSaida))
          }}</strong>
          <small
            >Entrada {{ dinheiro(numero(resumo?.totalTransferenciasEntrada)) }} · Saída
            {{ dinheiro(numero(resumo?.totalTransferenciasSaida)) }}</small
          >
        </div>
        <div class="fd__card fd__card--despesas">
          <span>Despesas</span><strong class="cx-num">{{ dinheiro(numero(resumo?.totalDespesas)) }}</strong>
        </div>
        <div class="fd__card fd__card--mercadorias">
          <span>Mercadorias</span><strong class="cx-num">{{ dinheiro(numero(resumo?.totalMercadorias)) }}</strong>
        </div>
        <div class="fd__card fd__card--retiradas">
          <span>Retiradas</span><strong class="cx-num">{{ dinheiro(numero(resumo?.totalRetiradas)) }}</strong>
        </div>
      </div>

      <div class="fd__diferenca" :data-estado="situacaoDiferenca.chave" data-teste="diferenca-geral">
        <v-icon :icon="situacaoDiferenca.icone" size="28" aria-hidden="true" />
        <div>
          <span>Diferença geral · {{ situacaoDiferenca.titulo }}</span>
          <strong class="cx-num">{{ diferencaTexto }}</strong>
          <small>{{ situacaoDiferenca.texto }}</small>
        </div>
      </div>

      <VendasCanceladasBotao :vendas="vendasCanceladas ?? []" :dinheiro="dinheiro" :numero="numero" :texto="texto" />
    </section>
  </section>
</template>

<style scoped>
.fd {
  display: grid;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-4);
  border: 1px solid var(--cx-line);
  border-left: 4px solid #3b82f6;
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface-raised);
  color: var(--cx-ink);
}
.fd__titulo {
  margin: 0;
  font-size: var(--cx-fs-lead);
  font-weight: 800;
}
.fd__blocos {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr));
  gap: var(--cx-sp-3);
}
.fd__bloco {
  padding: var(--cx-sp-3);
  border-radius: var(--cx-r-md);
  background: var(--cx-surface-sunken);
}
.fd__bloco h4,
.fd__final h4 {
  margin: 0 0 var(--cx-sp-2);
  font-size: var(--cx-fs-body);
  font-weight: 700;
}
.fd__bloco p {
  margin: 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
.fd__linhas {
  display: grid;
  gap: var(--cx-sp-1);
}
.fd__linhas > div {
  display: flex;
  justify-content: space-between;
  gap: var(--cx-sp-3);
}
.fd__linhas span {
  min-width: 0;
  overflow-wrap: anywhere;
}
.fd__linhas strong {
  flex: none;
  text-align: right;
}
.fd__total {
  padding-top: var(--cx-sp-1);
  border-top: 1px solid var(--cx-line);
}
.fd__final {
  display: grid;
  gap: var(--cx-sp-3);
}
.fd__cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr));
  gap: var(--cx-sp-2);
}
.fd__card {
  display: grid;
  align-content: center;
  gap: 2px;
  min-height: 72px;
  padding: var(--cx-sp-2) var(--cx-sp-3);
  border-left: 4px solid var(--cor);
  border-radius: var(--cx-r-md);
  background: color-mix(in srgb, var(--cor) 12%, transparent);
  overflow-wrap: anywhere;
}
.fd__card span,
.fd__diferenca span {
  font-size: var(--cx-fs-caption);
  font-weight: 700;
  text-transform: uppercase;
}
.fd__card strong {
  font-size: var(--cx-fs-title);
}
.fd__card small {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
.fd__card--vendas {
  --cor: #d99b00;
}
.fd__card--transferencias {
  --cor: #f97316;
}
.fd__card--despesas {
  --cor: #ef4444;
}
.fd__card--mercadorias {
  --cor: #16a34a;
}
.fd__card--retiradas {
  --cor: #2563eb;
}
.fd__diferenca {
  --cor: var(--cx-positive);
  display: flex;
  align-items: center;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-3);
  border-left: 4px solid var(--cor);
  border-radius: var(--cx-r-md);
  background: color-mix(in srgb, var(--cor) 12%, transparent);
}
.fd__diferenca[data-estado="falta"] {
  --cor: var(--cx-negative);
}
.fd__diferenca[data-estado="sobra"] {
  --cor: #d99b00;
}
.fd__diferenca > div {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.fd__diferenca strong {
  font-size: var(--cx-fs-h2);
}
.fd__diferenca small {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
</style>
