<script setup lang="ts">
import { computed, useTemplateRef } from "vue";
import type { ContagemFisicaRelatorio } from "@padaria/shared";
import type { CaixaOperacional, EntregaCofrePendente, PlanejamentoRetorno } from "~/types/padaria";
import { dinheiro } from "~/utils/domain";
import EntregasAguardandoConferencia from "~/components/caixa/EntregasAguardandoConferencia.vue";
import CampoObservacaoVoz from "~/components/caixa/CampoObservacaoVoz.vue";
import CaixaFechamentoAnexos from "~/components/caixa/CaixaFechamentoAnexos.vue";
import CampoLacreFechamento from "~/components/caixa/CampoLacreFechamento.vue";

type Fechamento = {
  observacao: string;
  lacreFechamento: string;
  caixaResponsavelNome: string;
  supervisorResponsavelNome: string;
};

const props = defineProps<{
  caixa: CaixaOperacional;
  fechamento: Fechamento;
  // R-232 · a contagem foi feita (cega) em Vendas; aqui ela so aparece, nao se conta de novo.
  contagemFisica: ContagemFisicaRelatorio | null;
  fechamentoComQuebra: boolean;
  observacaoObrigatoriaPendente: boolean;
  lacreFechamentoPendente: boolean;
  responsaveisFechamentoPendentes: boolean;
  lacreFechamentoReservado: string | null;
  planejamentosPendentes: PlanejamentoRetorno[];
  entregasPendentes: EntregaCofrePendente[];
  fechamentoTravado: boolean;
  motivoTravado: string | null;
  folhaFechamentoEnviada: boolean;
  modoWizard?: boolean;
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
      tipo: "folha_fechamento" | "comprovante_cartao" | "relatorio_vendas_creare";
      nomeOriginal: string;
      relatorio: unknown;
    }>
  ): void;
}>();

const blocoTravas = useTemplateRef<HTMLElement>("blocoTravas");
const podeSolicitarFechamento = computed(
  () =>
    !props.observacaoObrigatoriaPendente &&
    !props.lacreFechamentoPendente &&
    !props.responsaveisFechamentoPendentes &&
    Boolean(props.contagemFisica) &&
    props.folhaFechamentoEnviada
);

const diferenca = computed(() => props.contagemFisica?.diferenca ?? null);
// Diz POR QUE ainda nao da para encerrar (antes era so "Preencha os campos obrigatorios").
const motivoPendente = computed(() => {
  if (!props.contagemFisica) return "Registre a contagem do dinheiro em Vendas e gere o relatório.";
  if (props.lacreFechamentoPendente) return "Informe o lacre de fechamento.";
  if (props.observacaoObrigatoriaPendente) return "Explique a falta na observação.";
  if (props.responsaveisFechamentoPendentes) return "Confirme o gerente responsável.";
  if (!props.folhaFechamentoEnviada) return "Anexe a foto da folha de fechamento.";
  return "Preencha os campos obrigatórios para liberar o fechamento.";
});

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
        <p class="text-body-2 mb-0">Anexe a folha obrigatória, informe o lacre e confira tudo antes de encerrar.</p>
      </div>
    </header>

    <!-- Fechamento cego (R-236, Marco 12/11/2026): o caixa nao ve o resultado antes de fechar (nem a falta). Depois
         de encerrar, aparece "Tudo certo" ou a falta, para explicar. Quem confere o fechamento ve aqui. -->
    <section
      v-if="contagemFisica && diferenca === null"
      class="fechamento-etapas__situacao"
      aria-label="Resultado da contagem"
    >
      <v-alert type="info" variant="tonal" data-teste="aviso-resultado-depois">
        Depois de encerrar, o sistema mostra se a contagem bateu.
      </v-alert>
    </section>
    <section
      v-else-if="contagemFisica && diferenca !== null"
      class="fechamento-etapas__situacao"
      aria-label="Resultado da contagem"
    >
      <v-alert
        :type="diferenca < 0 ? 'error' : 'success'"
        variant="tonal"
        class="fechamento-etapas__alerta-divergencia"
        data-teste="alerta-quebra"
      >
        <template v-if="diferenca < 0">
          <div class="text-subtitle-2 mb-1">Falta de {{ dinheiro(Math.abs(diferenca)) }} no caixa</div>
          A falta gera quebra de caixa e avisa a Tesouraria. Explique o motivo na observação.
        </template>
        <template v-else>
          <div class="text-subtitle-2">Tudo certo com a contagem.</div>
        </template>
      </v-alert>
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
            :label="fechamentoComQuebra ? 'Observação da falta (obrigatória)' : 'Observação do fechamento'"
            :error="observacaoObrigatoriaPendente"
            :messages="observacaoObrigatoriaPendente ? 'Explique a falta antes de fechar o caixa.' : ''"
            data-teste="observacao-fechamento"
          />
        </v-col>
        <v-col cols="12" md="5">
          <CampoLacreFechamento
            v-model="fechamento.lacreFechamento"
            :reservado="lacreFechamentoReservado"
            :pendente="lacreFechamentoPendente"
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
          podeSolicitarFechamento ? "Revise uma última vez antes de bloquear novas vendas." : motivoPendente
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
          {{ fechamentoComQuebra ? "Encerrar com falta" : "Encerrar e enviar à Tesouraria" }}
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
