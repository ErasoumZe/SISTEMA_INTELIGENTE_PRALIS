<script setup lang="ts">
import { computed, ref } from "vue";
import type { CaixaOperacional, EntregaCofrePendente, PlanejamentoRetorno, ResumoCaixa } from "~/types/padaria";
import { formatarDataHora } from "~/utils/formatacao";
import CaixaFechamentoAjuda from "~/components/caixa/CaixaFechamentoAjuda.vue";
import CaixaFechamentoEtapas from "~/components/caixa/CaixaFechamentoEtapas.vue";
import CaixaFechamentoMaquininha from "~/components/caixa/CaixaFechamentoMaquininha.vue";
import CaixaFechamentoMovimentacoes from "~/components/caixa/CaixaFechamentoMovimentacoes.vue";
import CaixaFechamentoRelatorioVendas from "~/components/caixa/CaixaFechamentoRelatorioVendas.vue";
import CaixaGerenteFechamentoDialog from "~/components/caixa/CaixaGerenteFechamentoDialog.vue";
import type { ContagemFisicaRelatorio } from "@padaria/shared";

type Fechamento = {
  observacao: string;
  lacreFechamento: string;
  caixaResponsavelNome: string;
  supervisorResponsavelNome: string;
};

type AnexoFechamento = {
  id: string;
  tipo: "folha_fechamento" | "comprovante_cartao" | "relatorio_vendas_creare";
  nomeOriginal: string;
  relatorio: unknown;
};

const props = defineProps<{
  caixa: CaixaOperacional;
  resumo: ResumoCaixa | null;
  fechamento: Fechamento;
  contagemFisica: ContagemFisicaRelatorio | null;
  fechamentoDivergente: boolean;
  fechamentoComQuebra: boolean;
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
  (event: "inicioAjustado"): void;
  (event: "contagem", contagem: ContagemFisicaRelatorio | null): void;
}>();

const etapaAtual = ref(1);
const etapasNavegacaoVisiveis = ref(false);
const etapas = [
  {
    id: 1,
    titulo: "Vendas",
    resumo: "Digite o dinheiro do malote, anexe a folha CREARE e gere o relatório de vendas.",
    passos: [
      "Primeiro digite as cédulas e as moedas com que você fecha a gaveta (o que vai no malote de fechamento).",
      "Envie a folha de vendas do CREARE deste turno pela câmera ou galeria.",
      "Revise os campos como estão no cupom: período, troco inicial, formas de pagamento, total, despesas e sangria.",
      "Se o horário da folha não bater com o início das vendas, use Ajustar início.",
      "Gere o relatório para o sistema comparar a folha com as vendas e saídas registradas.",
      "A folha CREARE é diferente da folha do malote usada no fechamento físico."
    ],
    quandoAvancar: "a contagem estiver registrada, a foto anexada e o relatório de vendas gerado.",
    cor: "var(--cat-entradas-base)"
  },
  {
    id: 2,
    titulo: "Maquininha",
    resumo: "Envie a leitura e confira o líquido do turno.",
    passos: [
      "Abra somente o painel do turno em que está trabalhando.",
      "Envie o comprovante pela câmera ou galeria e revise crédito, débito, Pix e voucher.",
      "No primeiro turno, informe o total do próprio turno.",
      "No segundo turno do mesmo PDV e máquina na mesma data, informe o acumulado: o sistema desconta a manhã automaticamente.",
      "O acumulado da tarde não pode ser menor que a leitura salva pela manhã."
    ],
    quandoAvancar: "a leitura do turno estiver salva sem pendência.",
    cor: "var(--cx-brand)"
  },
  {
    id: 3,
    titulo: "Relatório final",
    resumo: "Revise recebimentos, saídas, lacres e diferenças.",
    passos: [
      "Confira a comparação CREARE × Pralis e os recebimentos por forma de pagamento.",
      "Revise os valores da maquininha e as vendas canceladas.",
      "Abra os blocos de sangrias, retornos, lacres, entradas e saídas para conferir cada item.",
      "Se houver pendência ou divergência, volte à etapa correspondente, corrija e gere ou salve novamente."
    ],
    quandoAvancar: "os dados consolidados estiverem revisados e sem pendência operacional.",
    cor: "var(--cat-retiradas-base)"
  },
  {
    id: 4,
    titulo: "Fechamento",
    resumo: "Anexe a folha do malote, informe o lacre e envie à Tesouraria.",
    passos: [
      "A contagem do dinheiro já foi feita em Vendas; aqui não se conta de novo.",
      "Anexe a folha de fechamento do malote e informe o lacre físico reservado para este fechamento.",
      "Se a contagem divergiu, explique o motivo na observação; o campo aceita preenchimento por voz.",
      "Execute retornos programados, se existirem, e só então envie o malote à Tesouraria."
    ],
    quandoAvancar: "o físico, a folha, o lacre e as justificativas obrigatórias estiverem preenchidos.",
    cor: "var(--cx-attention)"
  }
] as const;
const etapaAtualDefinicao = computed(() => etapas.find((etapa) => etapa.id === etapaAtual.value) ?? etapas[0]);
// R-232 · a etapa "Resumo" saiu: ao entrar no fechamento, um popup rapido confirma o gerente responsavel.
// A confirmacao vale para este caixa nesta aba (recarregar a tela nao pergunta de novo).
const chaveGerente = `cicluz:fechamento:gerente:${props.caixa.id}`;
function lerGerenteConfirmado() {
  try {
    return sessionStorage.getItem(chaveGerente) === "1";
  } catch {
    return false;
  }
}
const gerenteConfirmado = ref(lerGerenteConfirmado());
function confirmarGerente() {
  gerenteConfirmado.value = true;
  try {
    sessionStorage.setItem(chaveGerente, "1");
  } catch {
    // Sem armazenamento (aba privada): o popup volta a aparecer, sem prejuizo.
  }
}
const TOTAL_ETAPAS = 4;
const resumo = computed(() => props.resumo);

function formatarHora(dataHora: string | null | undefined) {
  if (!dataHora) return "—";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(dataHora));
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
      <strong>Etapa {{ etapaAtual }} de {{ TOTAL_ETAPAS }} · {{ etapaAtualDefinicao.titulo }}</strong>
      <div class="fechamento-wizard__acoes-topo">
        <CaixaFechamentoAjuda :etapa="etapaAtualDefinicao" />
        <v-btn
          :aria-expanded="etapasNavegacaoVisiveis"
          aria-controls="fechamento-navegacao"
          :aria-label="etapasNavegacaoVisiveis ? 'Fechar etapas' : 'Mostrar etapas'"
          :icon="etapasNavegacaoVisiveis ? 'mdi-chevron-up' : 'mdi-chevron-down'"
          size="small"
          variant="text"
          @click="etapasNavegacaoVisiveis = !etapasNavegacaoVisiveis"
        />
      </div>
      <div class="fechamento-wizard__horarios-mobile" aria-label="Horários do caixa">
        <span>Abertura {{ formatarHora(caixa.dataHoraAbertura) }}</span>
        <span>Fechamento {{ formatarHora(caixa.dataHoraFechamento) }}</span>
      </div>
    </div>
    <header id="fechamento-cabecalho" class="fechamento-wizard__cabecalho">
      <div class="fechamento-wizard__etapa-topo">
        <h2 id="fechamento-wizard-titulo">
          Etapa {{ etapaAtual }} de {{ TOTAL_ETAPAS }} · {{ etapaAtualDefinicao.titulo }}
        </h2>
        <div class="fechamento-wizard__acoes-topo">
          <CaixaFechamentoAjuda :etapa="etapaAtualDefinicao" />
          <v-btn
            :aria-expanded="etapasNavegacaoVisiveis"
            aria-controls="fechamento-navegacao"
            :aria-label="etapasNavegacaoVisiveis ? 'Fechar etapas' : 'Mostrar etapas'"
            :icon="etapasNavegacaoVisiveis ? 'mdi-chevron-up' : 'mdi-chevron-down'"
            size="small"
            variant="text"
            @click="etapasNavegacaoVisiveis = !etapasNavegacaoVisiveis"
          />
        </div>
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

    <section
      v-show="etapasNavegacaoVisiveis"
      id="fechamento-navegacao"
      class="fechamento-wizard__resumo-etapa-atual"
      aria-label="Resumo da etapa atual"
    >
      <strong>O que fazer agora</strong>
      <p>{{ etapaAtualDefinicao.resumo }}</p>
    </section>
    <div class="fechamento-wizard__progresso-mobile" aria-hidden="true">
      <span
        v-for="etapa in etapas"
        :key="etapa.id"
        :class="{ ativa: etapa.id === etapaAtual, concluida: etapa.id < etapaAtual }"
      />
      <strong>Etapa {{ etapaAtual }} de {{ TOTAL_ETAPAS }}</strong>
    </div>

    <CaixaGerenteFechamentoDialog
      :model-value="!gerenteConfirmado"
      :fechamento="fechamento"
      @confirmado="confirmarGerente"
    />

    <CaixaFechamentoRelatorioVendas
      v-if="etapaAtual === 1"
      id="fechamento-painel-1"
      :caixa-id="caixa.id"
      :abertura-oficial="caixa.abertoEm"
      :inicio-vendas="caixa.dataHoraAbertura"
      @inicio-ajustado="emit('inicioAjustado')"
      @contagem="emit('contagem', $event)"
    />

    <CaixaFechamentoMaquininha v-else-if="etapaAtual === 2" id="fechamento-painel-2" :caixa="caixa" />

    <CaixaFechamentoMovimentacoes
      v-else-if="etapaAtual === 3"
      :resumo="resumo"
      :caixa-id="caixa.id"
      :pdv-nome="caixa.pdvNome"
    />

    <CaixaFechamentoEtapas
      v-else
      id="fechamento-painel-4"
      :caixa="caixa"
      :fechamento="fechamento"
      :contagem-fisica="contagemFisica"
      :fechamento-divergente="fechamentoDivergente"
      :fechamento-com-quebra="fechamentoComQuebra"
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
      :salvando="salvando"
      @solicitar-fechamento="emit('solicitarFechamento')"
      @executar-planejamento="emit('executarPlanejamento', $event)"
      @folha-enviada="emit('folhaEnviada', $event)"
      @anexos-atualizados="emit('anexosAtualizados', $event)"
    />

    <footer
      v-if="etapaAtual < TOTAL_ETAPAS"
      class="fechamento-wizard__rodape"
      :class="{ 'fechamento-wizard__rodape--inicio': etapaAtual === 1 }"
    >
      <v-btn v-if="etapaAtual > 1" color="error" variant="tonal" prepend-icon="mdi-arrow-left" @click="etapaAtual -= 1"
        >Voltar etapa</v-btn
      >
      <v-spacer />
      <v-btn
        v-if="etapaAtual === 1"
        color="success"
        append-icon="mdi-arrow-right"
        :disabled="!contagemFisica"
        data-teste="avancar-vendas-fechamento"
        @click="etapaAtual = 2"
      >
        Conferir maquininha
      </v-btn>
      <v-btn
        v-else-if="etapaAtual === 2"
        color="success"
        append-icon="mdi-arrow-right"
        data-teste="avancar-maquininha-fechamento"
        @click="etapaAtual = 3"
      >
        Ver relatório final
      </v-btn>
      <v-btn
        v-else
        color="success"
        append-icon="mdi-arrow-right"
        data-teste="avancar-movimentacoes-fechamento"
        @click="etapaAtual = 4"
      >
        Ir para fechamento
      </v-btn>
    </footer>
    <footer v-else class="fechamento-wizard__rodape fechamento-wizard__rodape--ultimo">
      <v-btn color="secondary" variant="tonal" prepend-icon="mdi-arrow-left" @click="etapaAtual = 3"
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
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}
.fechamento-wizard__resumo-mobile {
  display: none;
}
.fechamento-wizard__cabecalho h2 {
  margin: 0;
  font-size: clamp(1rem, 2.1vw, 1.35rem);
}
.fechamento-wizard__etapa-topo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.fechamento-wizard__acoes-topo {
  display: flex;
  align-items: center;
  gap: 2px;
}
.fechamento-wizard__horarios {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.fechamento-wizard__resumo-etapa-atual {
  margin-bottom: 18px;
}
.fechamento-wizard__resumo-etapa-atual strong {
  color: var(--cx-ink);
  font-size: 0.82rem;
  font-weight: 800;
}
.fechamento-wizard__resumo-etapa-atual p {
  margin: 0;
  color: var(--cx-ink-soft);
  font-size: 0.76rem;
  line-height: 1.3;
}
.fechamento-wizard__progresso-mobile {
  display: none;
}
.fechamento-wizard :deep(.relatorio-vendas),
.fechamento-wizard :deep(.maquininha),
.fechamento-wizard :deep(.fechamento-movimentacoes),
.fechamento-wizard :deep(.fechamento-etapas) {
  box-shadow: var(--cx-e-1);
}
.fechamento-wizard--etapa-1 :deep(.relatorio-vendas) {
  border-top: 3px solid var(--cat-entradas-base);
}
.fechamento-wizard--etapa-2 :deep(.maquininha) {
  border-top: 3px solid var(--cx-brand);
}
.fechamento-wizard--etapa-3 :deep(.fechamento-movimentacoes) {
  border-top: 3px solid var(--cat-retiradas-base);
}
.fechamento-wizard--etapa-4 :deep(.fechamento-etapas) {
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
    display: grid;
    width: 100%;
    grid-template-columns: minmax(0, 1fr) auto;
    min-height: 56px;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
    padding: 8px 8px 8px 12px;
    border: 1px solid var(--cx-line);
    border-radius: 10px;
    background: var(--cx-surface);
  }
  .fechamento-wizard__resumo-mobile > strong {
    min-width: 0;
    color: var(--cx-ink);
    font-size: 0.9rem;
  }
  .fechamento-wizard__horarios-mobile {
    display: flex;
    grid-column: 1 / -1;
    flex-wrap: wrap;
    gap: 6px 12px;
    color: var(--cx-ink-soft);
    font-size: 0.72rem;
    font-weight: 700;
  }
  .fechamento-wizard__cabecalho {
    display: none;
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
  .fechamento-wizard__rodape--inicio :deep(.v-btn) {
    min-width: min(250px, 100%);
  }
  .fechamento-wizard__rodape--inicio :deep(.v-btn__content) {
    justify-content: space-between;
    white-space: nowrap;
  }
  .fechamento-wizard__rodape {
    position: sticky;
    bottom: 0;
    z-index: 3;
    padding: 10px 0 calc(10px + env(safe-area-inset-bottom));
    border: 0;
    background: transparent;
    box-shadow: none;
  }
}
@media (max-width: 560px) and (min-width: 421px) {
  .fechamento-wizard__rodape {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .fechamento-wizard__rodape :deep(.v-spacer) {
    display: none;
  }
  .fechamento-wizard__rodape :deep(.v-btn) {
    min-width: 0;
    width: 100%;
  }
  .fechamento-wizard__rodape :deep(.v-btn__content) {
    justify-content: space-between;
    white-space: nowrap;
    text-align: center;
  }
  .fechamento-wizard__rodape--inicio :deep(.v-spacer + .v-btn) {
    grid-column: 1 / -1;
    justify-self: end;
    width: min(250px, 100%);
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
  .fechamento-wizard__rodape :deep(.v-btn) {
    width: 100%;
  }
  .fechamento-wizard__rodape :deep(.v-btn__content) {
    justify-content: space-between;
    white-space: nowrap;
    text-align: center;
  }
}
@media (max-width: 600px) {
  .fechamento-wizard__rodape {
    position: static;
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
    padding: 0;
  }
  .fechamento-wizard__rodape :deep(.v-spacer) {
    display: none;
  }
  .fechamento-wizard__rodape :deep(.v-btn) {
    min-width: 0;
    width: 100%;
    max-width: 100%;
  }
  .fechamento-wizard__rodape :deep(.v-btn__content) {
    display: flex;
    width: 100%;
    justify-content: space-between;
    white-space: nowrap;
  }
}
@media (min-width: 601px) and (max-width: 720px) {
  .fechamento-wizard__rodape :deep(.v-btn) {
    min-width: 0;
    max-width: 100%;
  }
}
@media (max-width: 360px) {
  .fechamento-wizard__rodape :deep(.v-btn) {
    font-size: 0.78rem;
  }
}
</style>
