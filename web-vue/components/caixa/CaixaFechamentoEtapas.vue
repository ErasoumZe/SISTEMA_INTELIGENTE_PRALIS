<script setup lang="ts">
import { computed, useTemplateRef } from "vue";
import type { CaixaOperacional, EntregaCofrePendente, PlanejamentoRetorno } from "~/types/padaria";
import { dinheiro } from "~/utils/domain";
import { deCentavos } from "@padaria/shared";
import EntregasAguardandoConferencia from "~/components/caixa/EntregasAguardandoConferencia.vue";
import CampoDinheiro from "~/components/comum/CampoDinheiro.vue";
import CampoObservacaoVoz from "~/components/caixa/CampoObservacaoVoz.vue";
import CaixaFechamentoAnexos from "~/components/caixa/CaixaFechamentoAnexos.vue";

type Fechamento = {
  observacao: string;
  lacreFechamento: string;
  valorTotal: string;
  valorEspecie: string;
  valorMoedas: string;
  caixaResponsavelNome: string;
  supervisorResponsavelNome: string;
};

const props = defineProps<{
  caixa: CaixaOperacional;
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
  modoWizard?: boolean;
  mostrarResponsaveis?: boolean;
  salvando?: boolean;
}>();

const emit = defineEmits<{
  (event: "solicitarFechamento"): void;
  (event: "executarPlanejamento", payload: { caixaId: string; planejamentoId: string }): void;
  (event: "folhaEnviada", valor: boolean): void;
  (
    event: "anexosAtualizados",
    anexos: Array<{
      id: string;
      tipo: "folha_fechamento" | "comprovante_cartao";
      nomeOriginal: string;
      relatorio: unknown;
    }>
  ): void;
}>();

const blocoTravas = useTemplateRef<HTMLElement>("blocoTravas");
const podeSolicitarFechamento = computed(
  () =>
    !props.observacaoObrigatoriaPendente &&
    !props.fechamentoComposicaoInvalida &&
    !props.lacreFechamentoPendente &&
    !props.responsaveisFechamentoPendentes &&
    props.fechamentoComposicaoInformada &&
    props.folhaFechamentoEnviada
);

function solicitarFechamento() {
  if (props.fechamentoTravado) {
    blocoTravas.value?.scrollIntoView({ behavior: "smooth", block: "center" });
    blocoTravas.value?.focus({ preventScroll: true });
    return;
  }
  if (!podeSolicitarFechamento.value) return;
  emit("solicitarFechamento");
}
</script>

<template>
  <section
    class="fechamento-etapas"
    :aria-labelledby="modoWizard ? undefined : 'fechamento-etapas-titulo'"
    :aria-label="modoWizard ? 'Fechamento físico e envio para Tesouraria' : undefined"
    :data-teste="modoWizard ? undefined : 'etapa-fechamento'"
  >
    <header v-if="!modoWizard" class="fechamento-etapas__cabecalho">
      <div>
        <div class="fechamento-etapas__sobretitulo">Etapa de encerramento</div>
        <h2 id="fechamento-etapas-titulo" class="text-h5">Fechamento do caixa</h2>
        <p class="text-body-2 mb-0">Conte o físico, anexe a folha obrigatória e confira tudo antes de encerrar.</p>
      </div>
    </header>
    <header v-else class="fechamento-etapas__cabecalho mb-4">
      <div>
        <div class="fechamento-etapas__sobretitulo">Etapa 5 · fechamento</div>
        <h3 class="text-h5">Fechamento do caixa</h3>
        <p class="text-body-2 mb-0">Conte o físico, anexe a folha obrigatória e envie o malote para a Tesouraria.</p>
      </div>
    </header>

    <section class="fechamento-etapas__situacao" aria-label="Situação do fechamento">
      <div class="fechamento-etapas__saldo-esperado" data-teste="valor-esperado-fechamento">
        <v-icon icon="mdi-calculator-variant-outline" size="24" />
        <div>
          <span>Valor físico esperado</span><strong>{{ dinheiro(saldoAtual) }}</strong>
        </div>
        <small>Dinheiro e moedas que devem seguir para a Tesouraria.</small>
      </div>
      <v-alert
        v-if="fechamentoDivergente"
        :type="diferencaFechamento < 0 ? 'error' : 'warning'"
        variant="tonal"
        class="fechamento-etapas__alerta-divergencia"
        data-teste="alerta-quebra"
      >
        <div class="text-subtitle-2 mb-1">
          Conferência física: {{ dinheiro(totalFechamentoContado) }} contado para {{ dinheiro(saldoAtual) }} esperado
        </div>
        <template v-if="diferencaFechamento < 0">
          A falta de <strong>{{ dinheiro(Math.abs(diferencaFechamento)) }}</strong> gera quebra de caixa e notifica a
          Tesouraria.
        </template>
        <template v-else>
          Há sobra de <strong>{{ dinheiro(diferencaFechamento) }}</strong
          >; não há quebra positiva, mas a Tesouraria será notificada.
        </template>
        A observação é obrigatória e fica registrada com o responsável e o horário do servidor.
      </v-alert>

      <v-alert v-if="temSobra" type="warning" variant="tonal" class="fechamento-etapas__alerta-retorno">
        <template v-if="planejamentosPendentes.length">
          Há {{ dinheiro(saldoAtual) }} em espécie no caixa; {{ dinheiro(deCentavos(totalPlanejadoCentavos)) }} estão
          reservados para as transferências de retorno programadas. Somente os {{ dinheiro(saldoLivre) }} livres podem
          ser transferidos à parte.
        </template>
        <template v-else>
          Há {{ dinheiro(saldoAtual) }} em espécie no caixa. Ao fechar, o restante volta ao cofre automaticamente, no
          mesmo ato.
        </template>
      </v-alert>
    </section>

    <section
      class="fechamento-etapas__grupo fechamento-etapas__grupo--contagem"
      aria-labelledby="contagem-fechamento-titulo"
    >
      <header class="fechamento-etapas__grupo-cabecalho">
        <div>
          <span>Conferência física</span>
          <h4 id="contagem-fechamento-titulo">Dinheiro contado</h4>
        </div>
        <small>Dinheiro + moedas devem bater com o total declarado.</small>
      </header>
      <v-row dense>
        <v-col cols="12" sm="6" md="4">
          <CampoDinheiro v-model="fechamento.valorEspecie" label="Dinheiro em cédulas" icone="mdi-cash" />
        </v-col>
        <v-col cols="12" sm="6" md="4">
          <CampoDinheiro v-model="fechamento.valorMoedas" label="Moedas" icone="mdi-circle-multiple-outline" />
        </v-col>
        <v-col cols="12" md="4">
          <CampoDinheiro
            v-model="fechamento.valorTotal"
            label="Total contado"
            icone="mdi-cash-multiple"
            :hint="`Esperado: ${dinheiro(saldoAtual)}`"
            persistent-hint
            :error="fechamentoComposicaoInvalida"
            :error-messages="fechamentoComposicaoInvalida ? 'Total deve ser igual a dinheiro físico mais moedas.' : ''"
          />
        </v-col>
      </v-row>
    </section>

    <div ref="blocoTravas" tabindex="-1" class="fechamento-etapas__travas">
      <v-alert
        v-if="planejamentosPendentes.length"
        type="warning"
        variant="tonal"
        class="mb-4"
        data-teste="planejamentos-retorno"
      >
        <div class="text-subtitle-2 mb-2">Transferências de retorno programadas</div>
        <div
          v-for="planejamento in planejamentosPendentes"
          :key="planejamento.id"
          class="d-flex align-center flex-wrap ga-2 mb-2"
        >
          <span
            >{{ dinheiro(planejamento.valor) }} · lacre {{ planejamento.lacre }} ·
            {{ planejamento.contaDestinoNome }}</span
          >
          <v-btn
            size="small"
            color="warning"
            :loading="salvando"
            @click="emit('executarPlanejamento', { caixaId: caixa.id, planejamentoId: planejamento.id })"
          >
            Executar agora
          </v-btn>
        </div>
        Execute cada linha quando o dinheiro sair da gaveta. Enquanto houver linha programada, o fechamento fica
        bloqueado. Cancelamentos devem ser feitos pela retaguarda.
      </v-alert>
      <EntregasAguardandoConferencia :entregas="entregasPendentes" />
    </div>

    <div
      v-if="caixa.caixaResponsavelNomeAbertura || caixa.supervisorResponsavelNomeAbertura"
      class="fechamento-abertura-responsavel mb-4"
    >
      <v-icon icon="mdi-account-cash-outline" size="small" />
      <span v-if="caixa.caixaResponsavelNomeAbertura"
        >Caixa que abriu: <strong>{{ caixa.caixaResponsavelNomeAbertura }}</strong></span
      >
      <span v-if="caixa.supervisorResponsavelNomeAbertura"
        >· Supervisor na abertura: <strong>{{ caixa.supervisorResponsavelNomeAbertura }}</strong></span
      >
    </div>

    <section class="fechamento-etapas__documento" aria-label="Folha obrigatória do fechamento">
      <CaixaFechamentoAnexos
        modo="folha"
        :caixa-id="caixa.id"
        @folha-enviada="emit('folhaEnviada', $event)"
        @anexos-atualizados="emit('anexosAtualizados', $event)"
      />
    </section>

    <section class="fechamento-etapas__grupo" aria-labelledby="registro-fechamento-titulo">
      <header class="fechamento-etapas__grupo-cabecalho">
        <div>
          <span>Registro operacional</span>
          <h4 id="registro-fechamento-titulo">Lacre e observação</h4>
        </div>
        <small>Identifique o malote e registre qualquer ocorrência.</small>
      </header>
      <v-row dense>
        <v-col cols="12" md="7">
          <CampoObservacaoVoz
            v-model="fechamento.observacao"
            :label="fechamentoDivergente ? 'Observação da divergência (obrigatória)' : 'Observação do fechamento'"
            :error="observacaoObrigatoriaPendente"
            :messages="observacaoObrigatoriaPendente ? 'Explique a falta antes de fechar o caixa.' : ''"
            data-teste="observacao-fechamento"
          />
        </v-col>
        <v-col cols="12" md="5">
          <v-text-field
            v-model="fechamento.lacreFechamento"
            :label="
              lacreFechamentoReservado
                ? 'Lacre reservado para fechamento (obrigatório)'
                : 'Lacre de fechamento (obrigatório)'
            "
            placeholder="Ex.: FCH-001"
            :hint="
              lacreFechamentoReservado
                ? 'Digite manualmente o número físico reservado no malote. Ele precisa ser exatamente igual ao informado pela Tesouraria.'
                : 'Identifica o lacre físico colocado ao fechar a gaveta. Obrigatório em todo fechamento.'
            "
            persistent-hint
            :color="lacreFechamentoPendente ? 'error' : 'primary'"
            :base-color="lacreFechamentoPendente ? 'error' : undefined"
            :error="lacreFechamentoPendente"
            :error-messages="lacreFechamentoPendente ? 'Informe o lacre antes de fechar o caixa.' : ''"
            prepend-inner-icon="mdi-lock-alert-outline"
            required
            data-teste="lacre-fechamento"
          />
        </v-col>
        <v-col v-if="mostrarResponsaveis !== false" cols="12" md="6">
          <v-text-field
            v-model="fechamento.caixaResponsavelNome"
            label="Caixa responsável no fechamento (obrigatório)"
            placeholder="Digite o nome do responsável pelo caixa"
            :error="!fechamento.caixaResponsavelNome.trim()"
            :error-messages="!fechamento.caixaResponsavelNome.trim() ? 'Informe o caixa responsável.' : ''"
            prepend-inner-icon="mdi-account-cash-outline"
            required
          />
        </v-col>
        <v-col v-if="mostrarResponsaveis !== false" cols="12" md="6">
          <v-text-field
            v-model="fechamento.supervisorResponsavelNome"
            label="Supervisor responsável no fechamento (obrigatório)"
            placeholder="Digite o nome do supervisor"
            :error="!fechamento.supervisorResponsavelNome.trim()"
            :error-messages="!fechamento.supervisorResponsavelNome.trim() ? 'Informe o supervisor responsável.' : ''"
            prepend-inner-icon="mdi-account-supervisor-outline"
            required
          />
        </v-col>
      </v-row>
    </section>

    <footer
      class="fechamento-etapas__acao-final"
      :class="{ 'fechamento-etapas__acao-final--pronta': podeSolicitarFechamento }"
    >
      <div>
        <span>{{ podeSolicitarFechamento ? "Pronto para encerrar" : "Pendências antes de encerrar" }}</span>
        <strong>{{
          podeSolicitarFechamento
            ? "Revise uma última vez antes de bloquear novas vendas."
            : "Preencha os campos obrigatórios para liberar o fechamento."
        }}</strong>
      </div>
      <div>
        <v-btn
          color="error"
          prepend-icon="mdi-lock"
          :disabled="!podeSolicitarFechamento"
          :aria-disabled="fechamentoTravado ? 'true' : undefined"
          :class="{ 'botao-travado': fechamentoTravado }"
          :loading="salvando"
          :aria-describedby="fechamentoTravado ? 'motivo-fechamento-travado' : undefined"
          data-teste="botao-fechar"
          @click="solicitarFechamento"
        >
          {{ fechamentoComQuebra ? "Encerrar com divergência" : "Encerrar e enviar à Tesouraria" }}
        </v-btn>
        <p
          v-if="fechamentoTravado"
          id="motivo-fechamento-travado"
          class="text-caption mt-2 mb-0"
          data-teste="motivo-fechamento-travado"
        >
          Fechamento travado: {{ motivoTravado }}
        </p>
      </div>
    </footer>
  </section>
</template>

<style src="./CaixaFechamentoEtapas.css" scoped></style>
