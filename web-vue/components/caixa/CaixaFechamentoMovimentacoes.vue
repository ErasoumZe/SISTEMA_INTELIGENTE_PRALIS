<script setup lang="ts">
import type { DetalheCaixaResponse } from "@padaria/shared";
import type { ResumoCaixa } from "~/types/padaria";
import { normalizarTotaisRelatorioVendas, type TotaisRelatorioVendas } from "~/utils/caixa-fechamento";
import { dinheiro } from "~/utils/domain";
import CaixaRelatorioFinalFolhaCreare from "~/components/caixa/CaixaRelatorioFinalFolhaCreare.vue";
import type { FolhaCreareGerada } from "~/utils/folha-creare";

type RelatorioVendas = {
  periodoInicio: string;
  periodoFim: string;
  dados: {
    versao?: number;
    vendas: TotaisRelatorioVendas;
    canceladas: unknown[];
    creare?: FolhaCreareGerada | null;
  };
};
type LeituraMaquininha = Partial<Record<"credito" | "debito" | "pix" | "voucher", number | null>>;
type RelatorioMaquininha = { relatorio: { dadosRevisados: unknown } | null };
type Transferencia = {
  id: string;
  tipo: "abertura" | "suprimento" | "sangria" | "retorno";
  valor: number;
  lacre: string | null;
};
type Transferencias = { itens: Transferencia[] };

const props = defineProps<{ resumo: ResumoCaixa | null; caixaId: string; pdvNome?: string | null }>();
const { apiGet } = useApi();
const carregando = ref(false);
const erro = ref("");
const vendas = ref<ReturnType<typeof normalizarTotaisRelatorioVendas> | null>(null);
const canceladas = ref<unknown[]>([]);
const leituraMaquininha = ref<LeituraMaquininha>({});
const transferencias = ref<Transferencia[]>([]);
const lancamentos = ref<DetalheCaixaResponse["lancamentos"]>([]);
const folhaCreare = ref<{ creare: FolhaCreareGerada; versao: number } | null>(null);
const periodoVendas = ref<{ inicio: string; fim: string } | null>(null);
const correcaoMaquininha = ref<{ justificativa: string; campos: string[] } | null>(null);
const formasMaquininha = [
  { chave: "credito", titulo: "Crédito" },
  { chave: "debito", titulo: "Débito" },
  { chave: "pix", titulo: "Pix" },
  { chave: "voucher", titulo: "Voucher" }
] as const;

function numero(valor: unknown) {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}
function leitura(valor: unknown): LeituraMaquininha {
  if (!valor || typeof valor !== "object") return {};
  const dados = valor as Record<string, unknown>;
  return Object.fromEntries(formasMaquininha.map(({ chave }) => [chave, numero(dados[chave])])) as LeituraMaquininha;
}
async function carregar() {
  if (!props.caixaId) return;
  carregando.value = true;
  erro.value = "";
  try {
    const [relatorioVendas, relatorioMaquininha, movimentos, detalhe] = await Promise.all([
      apiGet<RelatorioVendas | null>(`/api/caixa/${encodeURIComponent(props.caixaId)}/relatorio-vendas`),
      apiGet<RelatorioMaquininha>(`/api/caixa/${encodeURIComponent(props.caixaId)}/relatorio-maquininha`),
      apiGet<Transferencias>(`/api/caixa/${encodeURIComponent(props.caixaId)}/transferencias`),
      apiGet<DetalheCaixaResponse>(`/api/caixa/${encodeURIComponent(props.caixaId)}/detalhe`)
    ]);
    vendas.value = relatorioVendas ? normalizarTotaisRelatorioVendas(relatorioVendas.dados.vendas) : null;
    canceladas.value = relatorioVendas?.dados.canceladas ?? [];
    const creare = relatorioVendas?.dados.creare;
    folhaCreare.value = creare ? { creare, versao: relatorioVendas?.dados.versao ?? 0 } : null;
    periodoVendas.value = relatorioVendas
      ? { inicio: relatorioVendas.periodoInicio, fim: relatorioVendas.periodoFim }
      : null;
    const dados = relatorioMaquininha.relatorio?.dadosRevisados;
    const revisado = dados && typeof dados === "object" ? (dados as Record<string, unknown>) : {};
    leituraMaquininha.value = leitura(revisado.liquidos);
    const acumulada = revisado.leituraAcumulada;
    const correcao =
      acumulada && typeof acumulada === "object" ? (acumulada as Record<string, unknown>).correcaoManual : null;
    correcaoMaquininha.value =
      correcao && typeof correcao === "object" ? (correcao as { justificativa: string; campos: string[] }) : null;
    transferencias.value = movimentos.itens.filter((item) => item.tipo === "sangria" || item.tipo === "retorno");
    lancamentos.value = detalhe.lancamentos.filter((grupo) =>
      ["despesas", "mercadorias", "retiradas"].includes(grupo.categoria)
    );
  } catch {
    erro.value = "Não foi possível carregar o consolidado deste caixa.";
  } finally {
    carregando.value = false;
  }
}

watch(
  () => props.caixaId,
  () => void carregar(),
  { immediate: true }
);
</script>

<template>
  <section
    id="fechamento-painel-4"
    class="fechamento-movimentacoes"
    aria-labelledby="movimentacoes-fechamento-titulo"
    data-teste="fechamento-movimentacoes"
  >
    <span class="fechamento-movimentacoes__sobretitulo">Etapa 4 · relatório final</span>
    <h3 id="movimentacoes-fechamento-titulo">Relatório final do turno</h3>
    <p class="text-body-2 text-medium-emphasis">Vendas, maquininha e movimentos registrados neste caixa.</p>

    <v-alert v-if="erro" type="error" density="compact" class="mt-4">{{ erro }}</v-alert>
    <v-alert v-else-if="carregando" type="info" variant="tonal" density="compact" class="mt-4">
      Carregando o consolidado do turno.
    </v-alert>

    <template v-else>
      <CaixaRelatorioFinalFolhaCreare
        v-if="folhaCreare"
        :creare="folhaCreare.creare"
        :versao="folhaCreare.versao"
        :maquininha="leituraMaquininha"
        :periodo="periodoVendas"
        :pdv-nome="pdvNome"
        :correcao-maquininha="correcaoMaquininha"
      />
      <section class="fechamento-movimentacoes__visao" aria-label="Visão geral do turno">
        <article class="fechamento-movimentacoes__vendas">
          <v-icon icon="mdi-receipt-text-check-outline" size="22" />
          <span>Vendas aprovadas</span>
          <strong>{{ vendas?.quantidade ?? 0 }}</strong>
          <small>{{ dinheiro(vendas?.totalGeral ?? 0) }}</small>
        </article>
        <article class="fechamento-movimentacoes__canceladas">
          <v-icon icon="mdi-receipt-text-remove-outline" size="22" />
          <span>Canceladas</span>
          <strong>{{ canceladas.length }}</strong>
          <small>Fora do total aprovado</small>
        </article>
      </section>

      <section
        class="fechamento-movimentacoes__bloco fechamento-movimentacoes__bloco--vendas"
        aria-labelledby="formas-venda-titulo"
      >
        <header>
          <div>
            <span>Vendas</span>
            <h4 id="formas-venda-titulo">Pagamentos por tipo</h4>
          </div>
          <v-chip size="small" color="success" variant="tonal">{{ vendas?.quantidade ?? 0 }} vendas</v-chip>
        </header>
        <details class="fechamento-movimentacoes__detalhes">
          <summary>Ver pagamentos por tipo</summary>
          <div v-if="vendas?.porFormaPagamento.length" class="fechamento-movimentacoes__formas">
            <article
              v-for="forma in vendas.porFormaPagamento"
              :key="forma.formaPagamento"
              :class="`fechamento-movimentacoes__forma--${forma.categoriaFechamentoCaixa ?? 'outros'}`"
            >
              <span>{{ forma.formaPagamento }}</span>
              <strong>{{ dinheiro(forma.total) }}</strong>
              <small>{{ forma.quantidade }} venda{{ forma.quantidade === 1 ? "" : "s" }}</small>
            </article>
          </div>
          <p v-else class="fechamento-movimentacoes__vazio">Gere o relatório de vendas na etapa anterior.</p>
        </details>
      </section>

      <section v-if="transferencias.length" class="fechamento-movimentacoes__bloco" aria-label="Sangrias e lacres">
        <header>
          <div>
            <span>Movimentos de cofre</span>
            <h4>Sangrias e retornos</h4>
          </div>
          <v-icon icon="mdi-bag-personal-outline" size="22" />
        </header>
        <details class="fechamento-movimentacoes__detalhes">
          <summary>Ver sangrias, retornos e lacres</summary>
          <div class="fechamento-movimentacoes__formas">
            <article v-for="item in transferencias" :key="item.id">
              <span>{{ item.tipo === "sangria" ? "Sangria" : "Retorno" }}</span>
              <strong>{{ dinheiro(item.valor) }}</strong>
              <small>Lacre: {{ item.lacre || "não informado" }}</small>
            </article>
          </div>
        </details>
      </section>

      <section
        v-if="resumo"
        class="fechamento-movimentacoes__bloco fechamento-movimentacoes__bloco--caixa"
        aria-labelledby="movimentos-caixa-titulo"
      >
        <header>
          <div>
            <span>Caixa</span>
            <h4 id="movimentos-caixa-titulo">Entradas e saídas</h4>
          </div>
          <v-icon icon="mdi-swap-horizontal" size="22" />
        </header>
        <details class="fechamento-movimentacoes__detalhes">
          <summary>Ver entradas e saídas detalhadas</summary>
          <dl class="fechamento-movimentacoes__totais">
            <div class="fechamento-movimentacoes__total--entradas">
              <dt>Entradas no PDV</dt>
              <dd>{{ dinheiro(resumo.totalEntradas) }}</dd>
            </div>
            <div class="fechamento-movimentacoes__total--transferencias-entrada">
              <dt>Transferências recebidas</dt>
              <dd>{{ dinheiro(resumo.totalTransferenciasEntrada ?? 0) }}</dd>
            </div>
            <div class="fechamento-movimentacoes__total--transferencias-saida">
              <dt>Transferências enviadas</dt>
              <dd>{{ dinheiro(resumo.totalTransferenciasSaida ?? 0) }}</dd>
            </div>
            <div class="fechamento-movimentacoes__total--despesas">
              <dt>Despesas</dt>
              <dd>{{ dinheiro(resumo.totalDespesas) }}</dd>
            </div>
            <div class="fechamento-movimentacoes__total--mercadorias">
              <dt>Mercadorias</dt>
              <dd>{{ dinheiro(resumo.totalMercadorias ?? 0) }}</dd>
            </div>
            <div class="fechamento-movimentacoes__total--retiradas">
              <dt>Retiradas</dt>
              <dd>{{ dinheiro(resumo.totalRetiradas) }}</dd>
            </div>
          </dl>
        </details>
      </section>

      <section v-if="lancamentos.length" class="fechamento-movimentacoes__bloco" aria-label="Saídas do caixa">
        <header>
          <div>
            <span>Saídas registradas</span>
            <h4>Despesas, mercadorias e retiradas</h4>
          </div>
          <v-icon icon="mdi-receipt-text-clock-outline" size="22" />
        </header>
        <details class="fechamento-movimentacoes__detalhes">
          <summary>Ver cada saída do turno</summary>
          <div class="fechamento-movimentacoes__formas">
            <article v-for="grupo in lancamentos" :key="grupo.categoria">
              <span>{{ grupo.titulo }}</span>
              <strong>{{ dinheiro(grupo.total) }}</strong>
              <small>{{ grupo.itens.length }} registro{{ grupo.itens.length === 1 ? "" : "s" }}</small>
              <ul class="fechamento-movimentacoes__lista">
                <li v-for="item in grupo.itens" :key="item.id">
                  <span>{{ item.descricao || "Sem descrição" }}</span>
                  <strong>{{ dinheiro(item.valor) }}</strong>
                </li>
              </ul>
            </article>
          </div>
        </details>
      </section>
    </template>
  </section>
</template>

<style scoped>
.fechamento-movimentacoes {
  padding: clamp(16px, 3vw, 28px);
  border: 1px solid var(--cx-line);
  border-radius: 16px;
  background: var(--cx-surface);
}
.fechamento-movimentacoes h3 {
  margin: 0 0 4px;
}
.fechamento-movimentacoes__sobretitulo {
  display: block;
  margin-bottom: 4px;
  color: var(--cat-retiradas-tinta);
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}
.fechamento-movimentacoes__totais {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 12px 0 0;
}
.fechamento-movimentacoes__visao {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 18px;
}
.fechamento-movimentacoes__visao article {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 10px;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--cx-line);
  border-radius: 12px;
  background: var(--cx-surface-sunken);
}
.fechamento-movimentacoes__visao :deep(.v-icon) {
  grid-row: span 2;
}
.fechamento-movimentacoes__visao span,
.fechamento-movimentacoes__visao small {
  color: var(--cx-ink-soft);
  font-size: 0.78rem;
  font-weight: 700;
}
.fechamento-movimentacoes__visao strong {
  font-size: 1.15rem;
}
.fechamento-movimentacoes__visao small {
  grid-column: 1 / -1;
  margin-top: 6px;
  font-weight: 500;
}
.fechamento-movimentacoes__vendas {
  border-color: color-mix(in srgb, var(--cx-positive) 48%, var(--cx-line)) !important;
  background: color-mix(in srgb, var(--cx-positive) 16%, var(--cx-surface-sunken)) !important;
}
.fechamento-movimentacoes__vendas :deep(.v-icon) {
  color: var(--cx-positive);
}
.fechamento-movimentacoes__canceladas {
  border-color: color-mix(in srgb, var(--cx-attention) 48%, var(--cx-line)) !important;
  background: color-mix(in srgb, var(--cx-attention) 16%, var(--cx-surface-sunken)) !important;
}
.fechamento-movimentacoes__canceladas :deep(.v-icon) {
  color: var(--cx-attention);
}
.fechamento-movimentacoes__bloco {
  margin-top: 16px;
  padding: 16px;
  border: 1px solid var(--cx-line);
  border-radius: 12px;
  background: var(--cx-surface-sunken);
}
.fechamento-movimentacoes__bloco--vendas {
  border-color: color-mix(in srgb, var(--cx-positive) 42%, var(--cx-line));
  background: color-mix(in srgb, var(--cx-positive) 14%, var(--cx-surface));
}
.fechamento-movimentacoes__bloco--caixa {
  border-color: color-mix(in srgb, var(--cat-retiradas-base) 42%, var(--cx-line));
  background: color-mix(in srgb, var(--cat-retiradas-base) 14%, var(--cx-surface));
}
.fechamento-movimentacoes__bloco header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.fechamento-movimentacoes__bloco header > div {
  min-width: 0;
}
.fechamento-movimentacoes__bloco header span {
  display: block;
  color: var(--cx-brand-text);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.fechamento-movimentacoes__bloco h4 {
  margin: 2px 0 0;
  overflow-wrap: anywhere;
}
.fechamento-movimentacoes__bloco > header > :deep(.v-icon) {
  color: var(--cx-brand-text);
}
.fechamento-movimentacoes__formas {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
  gap: 10px;
  margin-top: 12px;
}
.fechamento-movimentacoes__detalhes {
  margin-top: 10px;
}
.fechamento-movimentacoes__detalhes summary {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  min-width: 0;
  cursor: pointer;
  color: var(--cx-brand-text);
  font-size: 0.82rem;
  font-weight: 800;
  list-style: none;
}
.fechamento-movimentacoes__detalhes summary::-webkit-details-marker {
  display: none;
}
.fechamento-movimentacoes__detalhes summary::after {
  display: block;
  flex: 0 0 18px;
  width: 18px;
  margin-left: auto;
  color: var(--cx-ink-soft);
  content: "\25BE";
  font-size: 1.1rem;
  line-height: 1;
  text-align: center;
}
.fechamento-movimentacoes__detalhes[open] summary::after {
  transform: rotate(180deg);
}
.fechamento-movimentacoes__formas article {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--cx-line);
  border-radius: 10px;
  background: var(--cx-surface);
}
.fechamento-movimentacoes__formas span,
.fechamento-movimentacoes__formas small {
  color: var(--cx-ink-soft);
  font-size: 0.78rem;
  font-weight: 700;
}
.fechamento-movimentacoes__formas strong {
  font-size: 1rem;
}
.fechamento-movimentacoes__forma--dinheiro {
  border-color: color-mix(in srgb, var(--cx-positive) 45%, var(--cx-line)) !important;
  background: color-mix(in srgb, var(--cx-positive) 24%, var(--cx-surface)) !important;
}
.fechamento-movimentacoes__forma--credito,
.fechamento-movimentacoes__forma--voucher {
  border-color: color-mix(in srgb, var(--cx-brand) 45%, var(--cx-line)) !important;
  background: color-mix(in srgb, var(--cx-brand) 24%, var(--cx-surface)) !important;
}
.fechamento-movimentacoes__forma--debito {
  border-color: color-mix(in srgb, var(--cat-retiradas-base) 45%, var(--cx-line)) !important;
  background: color-mix(in srgb, var(--cat-retiradas-base) 24%, var(--cx-surface)) !important;
}
.fechamento-movimentacoes__forma--pix {
  border-color: color-mix(in srgb, var(--cat-mercadorias-base) 45%, var(--cx-line)) !important;
  background: color-mix(in srgb, var(--cat-mercadorias-base) 24%, var(--cx-surface)) !important;
}
.fechamento-movimentacoes__forma--crediario,
.fechamento-movimentacoes__forma--outros {
  border-color: color-mix(in srgb, var(--cx-attention) 45%, var(--cx-line)) !important;
  background: color-mix(in srgb, var(--cx-attention) 24%, var(--cx-surface)) !important;
}
.fechamento-movimentacoes__vazio {
  margin: 12px 0 0;
  color: var(--cx-ink-soft);
}
.fechamento-movimentacoes__lista {
  display: grid;
  gap: 6px;
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
}
.fechamento-movimentacoes__lista li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding-top: 6px;
  border-top: 1px solid var(--cx-line);
  font-size: 0.78rem;
}
.fechamento-movimentacoes__lista li span {
  overflow-wrap: anywhere;
}
.fechamento-movimentacoes__lista li strong {
  flex: 0 0 auto;
  font-size: 0.78rem;
}
.fechamento-movimentacoes__totais > div {
  min-width: 0;
  padding: 12px;
  border-radius: 10px;
  background: var(--cx-surface-sunken);
}
.fechamento-movimentacoes dt {
  color: var(--cx-ink-soft);
  font-size: 0.72rem;
  font-weight: 700;
}
.fechamento-movimentacoes dd {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
  font-size: 1.05rem;
  font-weight: 800;
}
.fechamento-movimentacoes__saldo {
  border: 1px solid var(--cat-resultado-base) !important;
  background: var(--cat-resultado-soft) !important;
}
.fechamento-movimentacoes__total--entradas {
  border-inline-start: 3px solid var(--cat-entradas-base);
}
.fechamento-movimentacoes__total--transferencias-entrada {
  border-inline-start: 3px solid var(--cat-transferencias-base);
}
.fechamento-movimentacoes__total--transferencias-saida {
  border-inline-start: 3px solid var(--cx-negative);
}
.fechamento-movimentacoes__total--despesas {
  border-inline-start: 3px solid var(--cat-despesas-base);
}
.fechamento-movimentacoes__total--mercadorias {
  border-inline-start: 3px solid var(--cat-mercadorias-base);
}
.fechamento-movimentacoes__total--retiradas {
  border-inline-start: 3px solid var(--cat-retiradas-base);
}
@media (max-width: 720px) {
  .fechamento-movimentacoes__visao,
  .fechamento-movimentacoes__totais {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 420px) {
  .fechamento-movimentacoes__visao,
  .fechamento-movimentacoes__totais {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .fechamento-movimentacoes__bloco {
    padding: 12px;
  }
  .fechamento-movimentacoes__visao article,
  .fechamento-movimentacoes__formas article,
  .fechamento-movimentacoes__totais > div {
    padding: 10px;
  }
}
@media (max-width: 340px) {
  .fechamento-movimentacoes__visao,
  .fechamento-movimentacoes__totais {
    grid-template-columns: 1fr;
  }
}
</style>
