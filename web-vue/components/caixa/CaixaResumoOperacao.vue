<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { dinheiro } from "~/utils/domain";
import CaixaResumoMaloteAbertura from "~/components/caixa/CaixaResumoMaloteAbertura.vue";

type Categoria = {
  chave: string;
  titulo: string;
  icone: string;
  valor: number;
  detalhe?: string;
};

type FormaPagamento = {
  chave: string;
  titulo: string;
  icone: string;
  valor: number;
  quantidade: number;
};

const props = defineProps<{
  categorias: Categoria[];
  formasPagamento: FormaPagamento[];
  saldo: number;
  caixaId: string;
  vendasCanceladasQuantidade: number;
}>();
const maloteAberturaAberto = ref(false);

const emit = defineEmits<{
  (event: "selecionarCategoria", chave: string, valor: number): void;
  (event: "verVendasCanceladas"): void;
}>();

function selecionarCategoria(categoria: Categoria) {
  if (categoria.chave === "transferencias") {
    maloteAberturaAberto.value = true;
    return;
  }
  emit("selecionarCategoria", categoria.chave, categoria.valor);
}

const route = useRoute();

// Prévia estritamente local para a composição visual. Não substitui nem cria uma
// venda, e permanece desligada fora de `?preview=tipos-venda` em desenvolvimento.
const formasPagamentoPreview: FormaPagamento[] = [
  { chave: "preview-pix", titulo: "PIX", icone: "mdi-qrcode", valor: 0, quantidade: 0 },
  { chave: "preview-credito", titulo: "Cartão de crédito", icone: "mdi-credit-card-outline", valor: 0, quantidade: 0 },
  { chave: "preview-debito", titulo: "Cartão de débito", icone: "mdi-credit-card-outline", valor: 0, quantidade: 0 },
  { chave: "preview-dinheiro", titulo: "Dinheiro", icone: "mdi-cash", valor: 0, quantidade: 0 },
  { chave: "preview-voucher", titulo: "Voucher", icone: "mdi-ticket-percent-outline", valor: 0, quantidade: 0 },
  { chave: "preview-crediario", titulo: "Crediário", icone: "mdi-notebook-outline", valor: 0, quantidade: 0 },
  {
    chave: "preview-outros",
    titulo: "Outras formas",
    icone: "mdi-dots-horizontal-circle-outline",
    valor: 0,
    quantidade: 0
  }
];

const mostrandoPreviewTiposVenda = computed(() => import.meta.dev && route.query.preview === "tipos-venda");
const formasPagamentoExibidas = computed(() =>
  mostrandoPreviewTiposVenda.value ? formasPagamentoPreview : props.formasPagamento
);
const formasPagamentoVisiveis = ref(true);
const movimentacoesVisiveis = ref(true);
const telaCompacta = ref(false);
let observadorTelaCompacta: MediaQueryList | null = null;

function atualizarTelaCompacta() {
  telaCompacta.value = observadorTelaCompacta?.matches ?? false;
  if (!telaCompacta.value) {
    formasPagamentoVisiveis.value = true;
    movimentacoesVisiveis.value = true;
  }
}

onMounted(() => {
  observadorTelaCompacta = window.matchMedia?.("(max-width: 768px)") ?? null;
  atualizarTelaCompacta();
  if (telaCompacta.value) {
    formasPagamentoVisiveis.value = false;
    movimentacoesVisiveis.value = false;
  }
  observadorTelaCompacta?.addEventListener("change", atualizarTelaCompacta);
});

onBeforeUnmount(() => observadorTelaCompacta?.removeEventListener("change", atualizarTelaCompacta));

function nomeFormaPagamento(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("pt-BR");
}

function classeFormaPagamento(nome: string) {
  const normalizado = nomeFormaPagamento(nome);
  if (normalizado.includes("pix")) return "pagamento-pix";
  if (normalizado.includes("credito")) return "pagamento-credito";
  if (normalizado.includes("debito")) return "pagamento-debito";
  if (normalizado.includes("dinheiro") || normalizado.includes("especie")) return "pagamento-dinheiro";
  if (normalizado.includes("crediario")) return "pagamento-crediario";
  if (normalizado.includes("voucher")) return "pagamento-voucher";
  if (normalizado.includes("furto") || normalizado.includes("desvio")) return "pagamento-desvio";
  return "pagamento-outros";
}

const entrada = computed(() => props.categorias.find((categoria) => categoria.chave === "entradas") ?? null);
const outrasCategorias = computed(() => props.categorias.filter((categoria) => categoria.chave !== "entradas"));
</script>

<template>
  <section class="caixa-resumo-operacao" aria-label="Resumo operacional do caixa">
    <div class="destaques-turno">
      <section class="saldo-turno" data-teste="resumo-saldo-caixa" aria-label="Saldo físico do caixa">
        <div class="saldo-turno__icone"><v-icon icon="mdi-cash-register" size="22" /></div>
        <div class="saldo-turno__conteudo">
          <span class="saldo-turno__rotulo">Saldo do caixa</span>
          <strong>{{ dinheiro(saldo) }}</strong>
          <span>Saldo físico do turno</span>
        </div>
      </section>
      <button
        v-if="entrada"
        type="button"
        class="destaque-entrada"
        :aria-label="`Consultar vendas nas Entradas: ${dinheiro(entrada.valor)}`"
        @click="emit('selecionarCategoria', entrada.chave, entrada.valor)"
      >
        <span class="destaque-entrada__icone"><v-icon :icon="entrada.icone" size="22" /></span>
        <span class="destaque-entrada__conteudo">
          <span class="destaque-entrada__rotulo">Entradas</span>
          <strong>{{ dinheiro(entrada.valor) }}</strong>
          <span>{{ entrada.detalhe || "Vendas do PDV neste turno" }}</span>
        </span>
      </button>
    </div>

    <div class="caixa-resumo-operacao__grade">
      <section
        class="movimentacoes"
        :class="{ 'movimentacoes--recolhida': telaCompacta && !movimentacoesVisiveis }"
        aria-labelledby="movimentacoes-caixa"
      >
        <header class="bloco-cabecalho">
          <div>
            <h2 id="movimentacoes-caixa">Movimentações</h2>
            <p>Resumo do turno. Selecione uma linha para consultar os detalhes.</p>
          </div>
          <v-btn
            class="movimentacoes__alternar"
            size="small"
            variant="text"
            :append-icon="movimentacoesVisiveis ? 'mdi-chevron-up' : 'mdi-chevron-down'"
            :aria-expanded="movimentacoesVisiveis"
            aria-controls="movimentacoes-lista"
            @click="movimentacoesVisiveis = !movimentacoesVisiveis"
          >
            {{ movimentacoesVisiveis ? "Ocultar" : "Ver movimentações" }}
          </v-btn>
        </header>

        <div id="movimentacoes-lista" v-show="movimentacoesVisiveis || !telaCompacta" class="movimentacoes__lista">
          <div
            v-for="categoria in outrasCategorias"
            :key="categoria.chave"
            class="movimento"
            :class="`movimento--${categoria.chave}`"
          >
            <button
              type="button"
              class="movimento__principal"
              :aria-label="`Ver ${categoria.titulo}: ${dinheiro(categoria.valor)}`"
              @click="selecionarCategoria(categoria)"
            >
              <span class="movimento__icone"><v-icon :icon="categoria.icone" size="20" /></span>
              <span class="movimento__descricao">
                <strong>{{ categoria.titulo }}</strong>
                <small>{{ categoria.detalhe || "Valor registrado no turno atual" }}</small>
              </span>
              <strong class="movimento__valor">{{ dinheiro(categoria.valor) }}</strong>
              <v-icon class="movimento__seta" icon="mdi-chevron-right" size="20" aria-hidden="true" />
            </button>
            <CaixaResumoMaloteAbertura
              v-if="categoria.chave === 'transferencias' && caixaId"
              :caixa-id="caixaId"
              :aberto="maloteAberturaAberto"
              @update:aberto="maloteAberturaAberto = $event"
            />
          </div>

          <button
            type="button"
            class="movimento movimento--canceladas movimento__principal"
            :aria-label="`Ver ${vendasCanceladasQuantidade} vendas canceladas`"
            @click="emit('verVendasCanceladas')"
          >
            <span class="movimento__icone"><v-icon icon="mdi-cancel" size="20" /></span>
            <span class="movimento__descricao">
              <strong>Vendas canceladas</strong>
              <small>{{
                vendasCanceladasQuantidade === 1
                  ? "1 venda cancelada"
                  : `${vendasCanceladasQuantidade} vendas canceladas`
              }}</small>
            </span>
            <strong class="movimento__valor">{{ vendasCanceladasQuantidade }}</strong>
            <v-icon class="movimento__seta" icon="mdi-chevron-right" size="20" aria-hidden="true" />
          </button>
        </div>
      </section>

      <section v-if="formasPagamentoExibidas.length" class="formas-pagamento" aria-labelledby="formas-pagamento-caixa">
        <header class="bloco-cabecalho">
          <div>
            <h2 id="formas-pagamento-caixa">Vendas por forma de pagamento</h2>
            <p v-if="mostrandoPreviewTiposVenda">Prévia local: tipos ilustrativos, sem vendas registradas.</p>
            <p v-else>Atualização automática a cada 1 minuto.</p>
          </div>
          <v-btn
            class="formas-pagamento__alternar"
            size="small"
            variant="text"
            :append-icon="formasPagamentoVisiveis ? 'mdi-chevron-up' : 'mdi-chevron-down'"
            :aria-expanded="formasPagamentoVisiveis"
            aria-controls="formas-pagamento-lista"
            @click="formasPagamentoVisiveis = !formasPagamentoVisiveis"
          >
            {{ formasPagamentoVisiveis ? "Ocultar" : "Ver formas" }}
          </v-btn>
        </header>

        <ul
          id="formas-pagamento-lista"
          v-show="formasPagamentoVisiveis || !telaCompacta"
          class="formas-pagamento__lista"
        >
          <li
            v-for="forma in formasPagamentoExibidas"
            :key="forma.chave"
            class="forma-pagamento"
            :class="classeFormaPagamento(forma.titulo)"
          >
            <span class="forma-pagamento__icone"><v-icon :icon="forma.icone" size="18" /></span>
            <span class="forma-pagamento__nome">
              <strong>{{ forma.titulo }}</strong>
              <small>{{ forma.quantidade }} {{ forma.quantidade === 1 ? "venda" : "vendas" }}</small>
            </span>
            <strong class="forma-pagamento__valor">{{ dinheiro(forma.valor) }}</strong>
          </li>
        </ul>
      </section>
    </div>
  </section>
</template>

<style scoped>
.caixa-resumo-operacao {
  display: grid;
  gap: var(--cx-sp-4);
}

.destaques-turno {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cx-sp-3);
}
.saldo-turno {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-3);
  min-width: 0;
  padding: var(--cx-sp-4) var(--cx-sp-5);
  border: 0;
  border-radius: var(--cx-r-lg);
  background: var(--cat-resultado-base);
  color: #fff;
  font: inherit;
  text-align: left;
}

.saldo-turno__icone,
.movimento__icone,
.forma-pagamento__icone {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
}

.saldo-turno__icone {
  width: 42px;
  height: 42px;
  border-radius: var(--cx-r-md);
  background: rgb(255 255 255 / 0.18);
}
.saldo-turno__conteudo {
  display: grid;
  min-width: 0;
}
.saldo-turno__rotulo,
.saldo-turno__conteudo > span:last-child {
  font-size: var(--cx-fs-caption);
  font-weight: 700;
}
.saldo-turno__conteudo > span:last-child {
  opacity: 0.82;
}
.saldo-turno strong {
  margin: 2px 0;
  font-size: clamp(24px, 3vw, 32px);
  line-height: 1.15;
}

.caixa-resumo-operacao__grade {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--cx-sp-4);
}
.movimentacoes,
.formas-pagamento {
  overflow: hidden;
  border: 1px solid var(--cx-line);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface);
}
.movimentacoes--recolhida {
  border-color: color-mix(in srgb, var(--cx-brand) 28%, var(--cx-line));
  background: color-mix(in srgb, var(--cx-brand) 4%, var(--cx-surface));
}
.movimentacoes--recolhida .bloco-cabecalho {
  border-bottom-color: transparent;
}
.bloco-cabecalho {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-4) var(--cx-sp-4) var(--cx-sp-3);
  border-bottom: 1px solid var(--cx-line-soft);
}
.bloco-cabecalho h2,
.bloco-cabecalho p {
  margin: 0;
}
.bloco-cabecalho h2 {
  color: var(--cx-ink);
  font-size: var(--cx-fs-lead);
  line-height: 1.25;
}
.bloco-cabecalho p {
  margin-top: 3px;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

.movimentacoes__lista,
.formas-pagamento__lista {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: var(--cx-sp-3);
  margin: 0;
  padding: var(--cx-sp-3);
  list-style: none;
}

.movimento {
  display: grid;
  min-width: 0;
  overflow: hidden;
  border-radius: var(--cx-r-md);
  background: var(--movimento-cor);
}
.movimento__principal {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  grid-template-areas: "icone descricao" "icone valor";
  align-content: start;
  align-items: start;
  width: 100%;
  min-height: 96px;
  gap: var(--cx-sp-2) var(--cx-sp-3);
  padding: var(--cx-sp-3) var(--cx-sp-4);
  border: 0;
  background: transparent;
  color: #fff;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background var(--cx-dur-1) var(--cx-ease);
}
.movimento__principal:hover {
  background: rgb(0 0 0 / 0.12);
}
.movimento__principal:focus-visible {
  position: relative;
  z-index: 1;
  outline: 3px solid var(--cx-focus);
  outline-offset: -3px;
}
.movimento__icone {
  grid-area: icone;
  align-self: start;
  width: 38px;
  height: 38px;
  border-radius: var(--cx-r-sm);
  background: rgb(255 255 255 / 0.2);
  color: inherit;
}
.movimento__descricao,
.forma-pagamento__nome {
  display: grid;
  min-width: 0;
}
.movimento__descricao {
  grid-area: descricao;
}
.movimento__descricao strong,
.forma-pagamento__nome strong {
  overflow: hidden;
  color: inherit;
  font-size: var(--cx-fs-body);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.movimento__descricao small,
.forma-pagamento__nome small {
  overflow: hidden;
  margin-top: 2px;
  color: rgb(255 255 255 / 0.8);
  font-size: var(--cx-fs-micro);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.forma-pagamento__nome small {
  color: var(--cx-ink-soft);
}
.movimento__valor,
.forma-pagamento__valor {
  grid-area: valor;
  align-self: start;
  color: inherit;
  font-size: var(--cx-fs-lead);
  line-height: 1.15;
  white-space: nowrap;
}
.forma-pagamento__valor {
  color: var(--forma-cor);
}
.movimento__seta {
  display: none;
}
.movimento__malote {
  display: block;
  padding: 0 var(--cx-sp-4) var(--cx-sp-3);
  color: rgb(255 255 255 / 0.86);
}
.destaque-entrada {
  --movimento-cor: #f4ea45;
  display: flex;
  align-items: center;
  gap: var(--cx-sp-3);
  min-width: 0;
  padding: var(--cx-sp-4) var(--cx-sp-5);
  border: 0;
  border-radius: var(--cx-r-lg);
  background: var(--movimento-cor);
  color: #241a00;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.destaque-entrada:hover,
.destaque-entrada:focus-visible {
  background: var(--movimento-cor);
}
.destaque-entrada:focus-visible {
  outline: 3px solid var(--cx-focus);
  outline-offset: 3px;
}
.destaque-entrada__icone {
  display: grid;
  flex: 0 0 auto;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: var(--cx-r-md);
  background: rgb(36 26 0 / 0.16);
}
.destaque-entrada__conteudo {
  display: grid;
  min-width: 0;
}
.destaque-entrada__rotulo,
.destaque-entrada__conteudo > span:last-child {
  font-size: var(--cx-fs-caption);
  font-weight: 700;
}
.destaque-entrada__conteudo > span:last-child {
  color: rgb(36 26 0 / 0.72);
  opacity: 0.9;
}
.destaque-entrada strong {
  margin: 2px 0;
  font-size: clamp(24px, 3vw, 32px);
  line-height: 1.15;
}

.forma-pagamento {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  grid-template-areas: "icone nome" "valor valor";
  align-items: center;
  gap: var(--cx-sp-3);
  min-height: 72px;
  padding: var(--cx-sp-2) var(--cx-sp-3);
  border: 1px solid color-mix(in srgb, var(--forma-cor) 38%, var(--cx-line));
  border-inline-start: 4px solid var(--forma-cor);
  border-radius: var(--cx-r-md);
  background: color-mix(in srgb, var(--forma-cor) 9%, var(--cx-surface));
  color: var(--cx-ink);
}
.forma-pagamento__icone {
  grid-area: icone;
  width: 34px;
  height: 34px;
  border-radius: var(--cx-r-sm);
  background: color-mix(in srgb, var(--forma-cor) 20%, var(--cx-surface));
  color: var(--forma-cor);
}
.forma-pagamento__nome {
  grid-area: nome;
}

.movimento--entradas {
  --movimento-cor: #f4ea45;
}
.movimento--transferencias {
  --movimento-cor: var(--cat-transferencias-faixa);
}
.movimento--sangrias {
  --movimento-cor: #9a5b00;
}
.movimento--despesas {
  --movimento-cor: var(--cat-despesas-faixa);
}
.movimento--mercadorias {
  --movimento-cor: var(--cat-mercadorias-faixa);
}
.movimento--retiradas {
  --movimento-cor: var(--cat-retiradas-faixa);
}
.movimento--canceladas {
  --movimento-cor: #424a55;
  background: var(--movimento-cor);
}
.movimento--canceladas:hover {
  background: color-mix(in srgb, var(--movimento-cor) 92%, #000 8%);
}
.pagamento-pix {
  --forma-cor: #008f82;
}
.pagamento-credito {
  --forma-cor: #6d28d9;
}
.pagamento-debito {
  --forma-cor: #2463f5;
}
.pagamento-dinheiro {
  --forma-cor: #15803d;
}
.pagamento-crediario {
  --forma-cor: #b45309;
}
.pagamento-voucher {
  --forma-cor: #c2410c;
}
.pagamento-desvio {
  --forma-cor: #dc2626;
}
.pagamento-outros {
  --forma-cor: #64748b;
}

@media (width <= 768px) {
  .destaques-turno {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--cx-sp-2);
  }
  .saldo-turno {
    padding: var(--cx-sp-4);
  }
  .movimentacoes__lista,
  .formas-pagamento__lista {
    grid-template-columns: minmax(0, 1fr);
    gap: 1px;
    padding: 0;
  }
  .formas-pagamento__alternar {
    flex: 0 0 auto;
    margin-inline-start: var(--cx-sp-2);
  }
  .movimentacoes--recolhida .bloco-cabecalho {
    align-items: center;
    min-height: 76px;
  }
  .movimentacoes__alternar {
    flex: 0 0 auto;
    margin-inline-start: var(--cx-sp-2);
    white-space: nowrap;
  }
  .movimento,
  .forma-pagamento {
    min-height: 0;
    border-radius: 0;
  }
  .movimento__principal {
    grid-template-columns: 36px minmax(0, 1fr) auto;
    grid-template-areas: "icone descricao valor";
    min-height: 66px;
    gap: var(--cx-sp-2);
    padding: var(--cx-sp-3);
  }
  .movimento__icone {
    width: 36px;
    height: 36px;
  }
  .movimento__valor,
  .forma-pagamento__valor {
    font-size: var(--cx-fs-caption);
  }
  .movimento__malote {
    padding: 0 var(--cx-sp-3) var(--cx-sp-3) calc(var(--cx-sp-3) + 40px + var(--cx-sp-2));
  }
  .destaque-entrada {
    min-height: 66px;
    border-radius: var(--cx-r-md);
  }
  .forma-pagamento {
    grid-template-columns: 34px minmax(0, 1fr) auto;
    grid-template-areas: "icone nome valor";
    min-height: 64px;
    padding: var(--cx-sp-3);
  }
}

@media (width >= 769px) {
  .formas-pagamento__alternar,
  .movimentacoes__alternar {
    display: none;
  }
}
</style>
