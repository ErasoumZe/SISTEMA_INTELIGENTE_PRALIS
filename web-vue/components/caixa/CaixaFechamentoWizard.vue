<script setup lang="ts">
import { computed, ref } from "vue";
import type { CaixaOperacional, EntregaCofrePendente, PlanejamentoRetorno, ResumoCaixa } from "~/types/padaria";
import { formatarDataHora } from "~/utils/formatacao";
import CaixaFechamentoAjuda from "~/components/caixa/CaixaFechamentoAjuda.vue";
import CaixaFechamentoEtapas from "~/components/caixa/CaixaFechamentoEtapas.vue";
import CaixaFechamentoMaquininha from "~/components/caixa/CaixaFechamentoMaquininha.vue";
import CaixaFechamentoMovimentacoes from "~/components/caixa/CaixaFechamentoMovimentacoes.vue";
import CaixaFechamentoRelatorioVendas from "~/components/caixa/CaixaFechamentoRelatorioVendas.vue";
import CaixaFechamentoResumo from "~/components/caixa/CaixaFechamentoResumo.vue";

type Fechamento = {
  observacao: string;
  lacreFechamento: string;
  valorTotal: string;
  valorEspecie: string;
  valorMoedas: string;
  caixaResponsavelNome: string;
  supervisorResponsavelNome: string;
};

type AnexoFechamento = {
  id: string;
  tipo: "folha_fechamento" | "comprovante_cartao";
  nomeOriginal: string;
  relatorio: unknown;
};

const props = defineProps<{
  caixa: CaixaOperacional;
  resumo: ResumoCaixa | null;
  fechamento: Fechamento;
  saldoAtual: number;
  temSobra: boolean;
  temDeficit: boolean;
  diferencaFechamento: number;
  totalFechamentoContado: number;
  fechamentoDivergente: boolean;
  fechamentoComQuebra: boolean;
  fechamentoComposicaoInformada: boolean;
  fechamentoComposicaoInvalida: boolean;
  observacaoObrigatoriaPendente: boolean;
  lacreFechamentoPendente: boolean;
  responsaveisFechamentoPendentes: boolean;
  lacreFechamentoReservado: string | null;
  planejamentosPendentes: PlanejamentoRetorno[];
  entregasPendentes: EntregaCofrePendente[];
  saldoLivre: number;
  totalPlanejadoCentavos: number;
  fechamentoTravado: boolean;
  motivoTravado: string | null;
  folhaFechamentoEnviada: boolean;
  salvando?: boolean;
}>();

const emit = defineEmits<{
  (event: "solicitarFechamento"): void;
  (event: "executarPlanejamento", payload: { caixaId: string; planejamentoId: string }): void;
  (event: "folhaEnviada", valor: boolean): void;
  (event: "anexosAtualizados", anexos: AnexoFechamento[]): void;
}>();

const etapaAtual = ref(1);
const cabecalhoMobileAberto = ref(false);
const etapas = [
  {
    id: 1,
    titulo: "Resumo",
    resumo: "Confirme operador e supervisor.",
    ajuda: "Informe quem operou o caixa e quem conferiu o fechamento.",
    icone: "mdi-clipboard-text-clock-outline",
    cor: "var(--cx-positive)",
    classe: "resumo"
  },
  {
    id: 2,
    titulo: "Vendas",
    resumo: "Envie a folha CREARE e confira.",
    ajuda: "Envie a folha do CREARE, revise os valores e gere o relatório de vendas.",
    icone: "mdi-receipt-text-outline",
    cor: "var(--cat-entradas-base)",
    classe: "vendas"
  },
  {
    id: 3,
    titulo: "Maquininha",
    resumo: "Envie a leitura do turno.",
    ajuda:
      "Envie a leitura da maquininha. À tarde, o sistema desconta automaticamente a leitura da manhã do mesmo PDV.",
    icone: "mdi-credit-card-outline",
    cor: "var(--cx-brand)",
    classe: "maquininha"
  },
  {
    id: 4,
    titulo: "Relatório final",
    resumo: "Revise vendas, saídas e lacres.",
    ajuda: "Confira os recebimentos, sangrias, despesas, retiradas e lacres usados no turno.",
    icone: "mdi-swap-horizontal",
    cor: "var(--cat-retiradas-base)",
    classe: "movimentacoes"
  },
  {
    id: 5,
    titulo: "Fechamento",
    resumo: "Conte o dinheiro e as moedas.",
    ajuda: "Informe o total contado, registre o lacre e explique qualquer diferença antes de fechar.",
    icone: "mdi-cash-register",
    cor: "var(--cx-attention)",
    classe: "fechamento"
  }
] as const;
const etapaAtualDefinicao = computed(() => etapas.find((etapa) => etapa.id === etapaAtual.value) ?? etapas[0]);
const podeAvancarResumo = computed(() =>
  Boolean(props.fechamento.caixaResponsavelNome.trim() && props.fechamento.supervisorResponsavelNome.trim())
);
const resumo = computed(() => props.resumo);

function irPara(etapa: number) {
  if (etapa <= etapaAtual.value) etapaAtual.value = etapa;
}
</script>

<template>
  <section
    :class="`fechamento-wizard--etapa-${etapaAtual}`"
    :style="{ '--fechamento-etapa-cor': etapaAtualDefinicao.cor }"
    class="fechamento-wizard"
    aria-labelledby="fechamento-wizard-titulo"
    data-teste="etapa-fechamento"
  >
    <div class="fechamento-wizard__resumo-mobile">
      <button
        type="button"
        class="fechamento-wizard__resumo-mobile-botao"
        :aria-expanded="cabecalhoMobileAberto"
        aria-controls="fechamento-cabecalho fechamento-navegacao"
        @click="cabecalhoMobileAberto = !cabecalhoMobileAberto"
      >
        <span>Etapa {{ etapaAtual }} de 5 · {{ etapaAtualDefinicao.titulo }}</span>
        <span>{{ cabecalhoMobileAberto ? "Ocultar detalhes" : etapaAtualDefinicao.resumo }}</span>
      </button>
      <CaixaFechamentoAjuda :etapas="etapas" />
    </div>
    <header
      id="fechamento-cabecalho"
      class="fechamento-wizard__cabecalho"
      :class="{ 'fechamento-wizard__cabecalho--mobile-aberto': cabecalhoMobileAberto }"
    >
      <div>
        <span class="fechamento-wizard__sobretitulo">Fechamento do caixa</span>
        <div class="fechamento-wizard__titulo-com-ajuda">
          <h2 id="fechamento-wizard-titulo">{{ etapaAtualDefinicao.titulo }}</h2>
          <CaixaFechamentoAjuda :etapas="etapas" />
        </div>
        <p>{{ etapaAtualDefinicao.resumo }}</p>
      </div>
      <div class="fechamento-wizard__horarios" aria-label="Horários do caixa">
        <v-chip color="success" variant="tonal" prepend-icon="mdi-play-circle-outline">
          Abertura: {{ formatarDataHora(caixa.dataHoraAbertura) }}
        </v-chip>
        <v-chip color="error" variant="tonal" prepend-icon="mdi-stop-circle-outline">
          Fechamento: {{ caixa.dataHoraFechamento ? formatarDataHora(caixa.dataHoraFechamento) : "não informado" }}
        </v-chip>
      </div>
    </header>

    <nav
      id="fechamento-navegacao"
      class="fechamento-wizard__navegacao"
      :class="{ 'fechamento-wizard__navegacao--mobile-aberta': cabecalhoMobileAberto }"
      aria-label="Etapas do fechamento"
    >
      <ol>
        <li
          v-for="etapa in etapas"
          :key="etapa.id"
          :class="{ 'fechamento-wizard__item--ativa': etapa.id === etapaAtual }"
        >
          <button
            type="button"
            :class="{
              'fechamento-wizard__etapa--ativa': etapa.id === etapaAtual,
              'fechamento-wizard__etapa--concluida': etapa.id < etapaAtual,
              [`fechamento-wizard__etapa--${etapa.classe}`]: true
            }"
            :style="{ '--etapa-cor': etapa.cor }"
            :aria-current="etapa.id === etapaAtual ? 'step' : undefined"
            :aria-controls="etapa.id === 1 ? undefined : `fechamento-painel-${etapa.id}`"
            :disabled="etapa.id > etapaAtual"
            @click="irPara(etapa.id)"
          >
            <span>{{ etapa.id }}</span
            ><v-icon :icon="etapa.icone" size="17" /><strong>{{ etapa.titulo }}</strong>
            <small class="fechamento-wizard__progresso">Etapa {{ etapa.id }} de 5</small>
          </button>
        </li>
      </ol>
    </nav>
    <div class="fechamento-wizard__progresso-mobile" aria-hidden="true">
      <span
        v-for="etapa in etapas"
        :key="etapa.id"
        :class="{ ativa: etapa.id === etapaAtual, concluida: etapa.id < etapaAtual }"
      />
      <strong>Etapa {{ etapaAtual }} de 5</strong>
    </div>

    <CaixaFechamentoResumo
      v-if="etapaAtual === 1"
      :caixa="caixa"
      :fechamento="fechamento"
      :responsaveis-pendentes="!podeAvancarResumo"
    />

    <CaixaFechamentoRelatorioVendas v-else-if="etapaAtual === 2" id="fechamento-painel-2" :caixa-id="caixa.id" />

    <CaixaFechamentoMaquininha v-else-if="etapaAtual === 3" id="fechamento-painel-3" :caixa="caixa" />

    <CaixaFechamentoMovimentacoes v-else-if="etapaAtual === 4" :resumo="resumo" :caixa-id="caixa.id" />

    <CaixaFechamentoEtapas
      v-else
      id="fechamento-painel-5"
      :caixa="caixa"
      :fechamento="fechamento"
      :saldo-atual="saldoAtual"
      :tem-deficit="temDeficit"
      :diferenca-fechamento="diferencaFechamento"
      :total-fechamento-contado="totalFechamentoContado"
      :fechamento-divergente="fechamentoDivergente"
      :fechamento-com-quebra="fechamentoComQuebra"
      :fechamento-composicao-informada="fechamentoComposicaoInformada"
      :fechamento-composicao-invalida="fechamentoComposicaoInvalida"
      :observacao-obrigatoria-pendente="observacaoObrigatoriaPendente"
      :lacre-fechamento-pendente="lacreFechamentoPendente"
      :responsaveis-fechamento-pendentes="responsaveisFechamentoPendentes"
      :lacre-fechamento-reservado="lacreFechamentoReservado"
      :planejamentos-pendentes="planejamentosPendentes"
      :entregas-pendentes="entregasPendentes"
      :fechamento-travado="fechamentoTravado"
      :motivo-travado="motivoTravado"
      :folha-fechamento-enviada="folhaFechamentoEnviada"
      modo-wizard
      :mostrar-responsaveis="false"
      :salvando="salvando"
      @solicitar-fechamento="emit('solicitarFechamento')"
      @executar-planejamento="emit('executarPlanejamento', $event)"
      @folha-enviada="emit('folhaEnviada', $event)"
      @anexos-atualizados="emit('anexosAtualizados', $event)"
    />

    <footer v-if="etapaAtual < 5" class="fechamento-wizard__rodape">
      <v-btn v-if="etapaAtual > 1" color="error" variant="tonal" prepend-icon="mdi-arrow-left" @click="etapaAtual -= 1"
        >Voltar etapa</v-btn
      >
      <v-spacer />
      <v-btn
        v-if="etapaAtual === 1"
        color="success"
        append-icon="mdi-arrow-right"
        :disabled="!podeAvancarResumo"
        data-teste="avancar-resumo-fechamento"
        @click="etapaAtual = 2"
      >
        Ir para vendas
      </v-btn>
      <v-btn
        v-else-if="etapaAtual === 2"
        color="success"
        append-icon="mdi-arrow-right"
        data-teste="avancar-vendas-fechamento"
        @click="etapaAtual = 3"
      >
        Conferir maquininha
      </v-btn>
      <v-btn
        v-else-if="etapaAtual === 3"
        color="success"
        append-icon="mdi-arrow-right"
        data-teste="avancar-maquininha-fechamento"
        @click="etapaAtual = 4"
      >
        Ver relatório final
      </v-btn>
      <v-btn
        v-else
        color="success"
        append-icon="mdi-arrow-right"
        data-teste="avancar-movimentacoes-fechamento"
        @click="etapaAtual = 5"
      >
        Ir para fechamento
      </v-btn>
    </footer>
    <footer v-else class="fechamento-wizard__rodape fechamento-wizard__rodape--ultimo">
      <v-btn color="secondary" variant="tonal" prepend-icon="mdi-arrow-left" @click="etapaAtual = 4"
        >Voltar ao relatório final</v-btn
      >
    </footer>
  </section>
</template>

<style scoped>
.fechamento-wizard {
  max-width: 1120px;
  margin: 0 auto;
}
.fechamento-wizard__cabecalho {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 20px;
}
.fechamento-wizard__resumo-mobile {
  display: none;
}
.fechamento-wizard__sobretitulo {
  color: var(--cx-brand-text);
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}
.fechamento-wizard__cabecalho h2 {
  margin: 2px 0 4px;
  font-size: clamp(1.3rem, 2.5vw, 1.7rem);
}
.fechamento-wizard__titulo-com-ajuda {
  display: flex;
  align-items: center;
  gap: 4px;
}
.fechamento-wizard__titulo-com-ajuda h2 {
  margin: 2px 0 4px;
}
.fechamento-wizard__cabecalho p {
  margin: 0;
  color: var(--cx-ink-soft);
}
.fechamento-wizard__horarios {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.fechamento-wizard__navegacao {
  overflow-x: auto;
  margin-bottom: 18px;
  padding-bottom: 4px;
}
.fechamento-wizard__navegacao ol {
  display: flex;
  min-width: max-content;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.fechamento-wizard__navegacao button {
  display: flex;
  min-height: 46px;
  align-items: center;
  gap: 7px;
  padding: 9px 14px;
  border: 1px solid var(--cx-line);
  border-radius: 10px;
  background: var(--cx-surface);
  color: var(--cx-ink-soft);
  cursor: pointer;
  transition:
    border-color var(--cx-dur-2) var(--cx-ease),
    background var(--cx-dur-2) var(--cx-ease),
    color var(--cx-dur-2) var(--cx-ease);
}
.fechamento-wizard__navegacao button > span {
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border-radius: 999px;
  background: var(--cx-surface-sunken);
  font-size: 0.75rem;
  font-weight: 800;
}
.fechamento-wizard__navegacao button:focus-visible {
  outline: 3px solid var(--cx-focus);
  outline-offset: 2px;
}
.fechamento-wizard__etapa--ativa {
  border-color: var(--etapa-cor) !important;
  background: var(--etapa-cor) !important;
  color: var(--cx-brand-on) !important;
}
.fechamento-wizard__etapa--fechamento.fechamento-wizard__etapa--ativa,
.fechamento-wizard__etapa--fechamento.fechamento-wizard__etapa--ativa :deep(.v-icon) {
  color: var(--cx-canvas) !important;
}
.fechamento-wizard__etapa--vendas.fechamento-wizard__etapa--ativa {
  color: var(--cx-canvas) !important;
}
.fechamento-wizard__etapa--resumo.fechamento-wizard__etapa--ativa {
  color: var(--cx-canvas) !important;
}
.fechamento-wizard__etapa--resumo.fechamento-wizard__etapa--ativa > span {
  background: rgb(0 0 0 / 0.14) !important;
}
.fechamento-wizard__etapa--ativa > span {
  background: rgb(255 255 255 / 0.22) !important;
}
.fechamento-wizard__etapa--concluida {
  border-color: var(--etapa-cor) !important;
  color: var(--etapa-cor) !important;
}
.fechamento-wizard__etapa--concluida > span {
  background: color-mix(in srgb, var(--etapa-cor) 18%, var(--cx-surface)) !important;
}
.fechamento-wizard__progresso {
  display: none;
}
.fechamento-wizard__progresso-mobile {
  display: none;
}
.fechamento-wizard :deep(.fechamento-resumo),
.fechamento-wizard :deep(.relatorio-vendas),
.fechamento-wizard :deep(.maquininha),
.fechamento-wizard :deep(.fechamento-movimentacoes),
.fechamento-wizard :deep(.fechamento-etapas) {
  box-shadow: var(--cx-e-1);
}
.fechamento-wizard--etapa-1 :deep(.fechamento-resumo) {
  border-top: 3px solid var(--cx-positive);
}
.fechamento-wizard--etapa-2 :deep(.relatorio-vendas) {
  border-top: 3px solid var(--cat-entradas-base);
}
.fechamento-wizard--etapa-3 :deep(.maquininha) {
  border-top: 3px solid var(--cx-brand);
}
.fechamento-wizard--etapa-4 :deep(.fechamento-movimentacoes) {
  border-top: 3px solid var(--cat-retiradas-base);
}
.fechamento-wizard--etapa-5 :deep(.fechamento-etapas) {
  border-top: 3px solid var(--cx-attention);
}
.fechamento-wizard__painel {
  padding: clamp(16px, 3vw, 28px);
  border: 1px solid var(--cx-line);
  border-radius: 16px;
  background: var(--cx-surface);
}
.fechamento-wizard__painel h3 {
  margin: 0 0 4px;
}
.fechamento-wizard__acoes-relatorio {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 20px;
}
.fechamento-wizard__rodape {
  position: static;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 18px;
  padding: 0;
  background: transparent;
}
@media (max-width: 720px) {
  .fechamento-wizard__resumo-mobile {
    display: flex;
    width: 100%;
    min-height: 48px;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
    border: 1px solid var(--cx-line);
    border-radius: 10px;
    background: var(--cx-surface);
  }
  .fechamento-wizard__resumo-mobile-botao {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 2px;
    padding: 10px 0 10px 12px;
    border: 0;
    background: transparent;
    color: var(--cx-ink);
    font-weight: 800;
    text-align: left;
  }
  .fechamento-wizard__resumo-mobile-botao span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fechamento-wizard__resumo-mobile-botao span:last-child {
    color: var(--cx-brand-text);
    font-size: 0.78rem;
    font-weight: 700;
    white-space: normal;
  }
  .fechamento-wizard__cabecalho {
    display: none;
  }
  .fechamento-wizard__cabecalho--mobile-aberto {
    display: flex;
    flex-direction: column;
  }
  .fechamento-wizard__horarios {
    justify-content: flex-start;
  }
  .fechamento-wizard__navegacao {
    overflow: visible;
  }
  .fechamento-wizard__navegacao ol {
    min-width: 0;
  }
  .fechamento-wizard__navegacao--mobile-aberta ol {
    flex-direction: column;
  }
  .fechamento-wizard__navegacao li:not(.fechamento-wizard__item--ativa) {
    display: none;
  }
  .fechamento-wizard__navegacao--mobile-aberta li:not(.fechamento-wizard__item--ativa) {
    display: block;
  }
  .fechamento-wizard__navegacao button {
    width: 100%;
  }
  .fechamento-wizard__progresso {
    display: inline;
    margin-left: auto;
    font-size: 0.72rem;
    font-weight: 700;
    opacity: 0.82;
  }
  .fechamento-wizard__progresso-mobile {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: -8px 0 14px;
  }
  .fechamento-wizard__progresso-mobile span {
    width: 8px;
    height: 8px;
    border-radius: var(--cx-r-pill);
    background: var(--cx-line);
  }
  .fechamento-wizard__progresso-mobile span.concluida,
  .fechamento-wizard__progresso-mobile span.ativa {
    background: var(--fechamento-etapa-cor);
  }
  .fechamento-wizard__progresso-mobile strong {
    margin-left: 4px;
    color: var(--cx-ink-soft);
    font-size: 0.75rem;
  }
  .fechamento-wizard__rodape :deep(.v-btn) {
    min-height: 48px;
  }
  .fechamento-wizard__rodape {
    position: sticky;
    bottom: 0;
    z-index: 3;
    padding: 10px 0 calc(10px + env(safe-area-inset-bottom));
    border: 0;
    background: linear-gradient(to bottom, transparent, var(--cx-canvas) 30%);
    box-shadow: none;
  }
}
@media (max-width: 420px) {
  .fechamento-wizard__rodape {
    display: grid;
    grid-template-columns: 1fr;
  }
  .fechamento-wizard__rodape :deep(.v-spacer) {
    display: none;
  }
  .fechamento-wizard__rodape :deep(.v-btn:only-child) {
    grid-column: 1 / -1;
  }
  .fechamento-wizard__rodape :deep(.v-btn),
  .fechamento-wizard__rodape :deep(.v-btn__content) {
    width: 100%;
    white-space: normal;
    text-align: center;
  }
}
</style>
