<script setup lang="ts">
// D4 · painel da RETAGUARDA para programar entregas ao cofre.
//
// Aqui a Tesouraria/Gestao escolhe um caixa ABERTO e pede uma entrega: ela nasce `agendada` e nao
// movimenta dinheiro nenhum. Quem executa e o operador, na tela do Caixa — de proposito nao existe
// botao de executar aqui: sao dois atos de duas pessoas, e so o segundo mexe em dinheiro.
//
// Este painel NAO reusa o modal generico de transferencia (D9): retorno/sangria tem um unico
// caminho, e criar um segundo aqui recriaria exatamente o que foi removido nesta branch.
import type { CaixaAbertoResumo, SolicitacaoCofre } from "~/types/padaria";
import { dinheiro } from "~/utils/domain";
import CampoDinheiro from "~/components/comum/CampoDinheiro.vue";

const props = defineProps<{
  caixasAbertos: CaixaAbertoResumo[];
  solicitacoes: SolicitacaoCofre[];
  caixaSelecionadoId: string;
  salvando?: boolean;
  podeProgramar?: boolean;
}>();

const emit = defineEmits<{
  (event: "selecionarCaixa", caixaId: string): void;
  (
    event: "programar",
    payload: {
      caixaId: string;
      tipo: "sangria" | "retorno";
      valor: number;
      observacao: string | null;
      idempotenciaChave: string;
      aoConcluir: (sucesso: boolean) => void;
    }
  ): void;
  (
    event: "cancelar",
    payload: {
      caixaId: string;
      solicitacaoId: string;
      motivo: string;
      aoConcluir: (sucesso: boolean) => void;
    }
  ): void;
}>();

const nova = reactive({ tipo: "sangria" as "sangria" | "retorno", valor: "", observacao: "" });

// B2 · uma chave por INTENCAO: nasce no primeiro envio, sobrevive ao erro (o retry precisa da
// MESMA chave, senao o servidor entende ordem nova e a Tesouraria pede o dinheiro duas vezes), e
// so e trocada quando o ato termina bem ou quando muda de fato o que esta sendo pedido.
const chave = ref("");
const intencaoDaChave = ref("");

// `crypto.randomUUID` exige contexto seguro. Em https e localhost existe; num acesso por IP da
// rede da loja (http://192.168.x.x) o navegador nao o expoe, e sem fallback a tela quebraria.
function novoUuid(): string {
  const aleatorio = globalThis.crypto;
  if (typeof aleatorio?.randomUUID === "function") return aleatorio.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/gu, (caractere) => {
    const digito = Number(caractere);
    return (digito ^ (Math.floor(Math.random() * 256) & (15 >> (digito / 4)))).toString(16);
  });
}

function chaveParaIntencao(assinatura: string): string {
  if (chave.value && intencaoDaChave.value === assinatura) return chave.value;
  chave.value = novoUuid();
  intencaoDaChave.value = assinatura;
  return chave.value;
}

const valorNumerico = computed(() => Number(nova.valor || 0));
const podeEnviar = computed(
  () => Boolean(props.caixaSelecionadoId) && valorNumerico.value > 0 && !props.salvando && props.podeProgramar !== false
);

function programar() {
  if (!podeEnviar.value) return;
  const observacao = nova.observacao.trim() || null;
  emit("programar", {
    caixaId: props.caixaSelecionadoId,
    tipo: nova.tipo,
    valor: valorNumerico.value,
    observacao,
    idempotenciaChave: chaveParaIntencao(
      `${props.caixaSelecionadoId}|${nova.tipo}|${valorNumerico.value}|${observacao ?? ""}`
    ),
    // Limpa SO no sucesso. Em erro, valor, observacao e a chave ficam de pe: o retry sai com um
    // clique e carrega a MESMA chave, que e o que impede a ordem duplicada.
    aoConcluir: (sucesso: boolean) => {
      if (!sucesso) return;
      nova.valor = "";
      nova.observacao = "";
      chave.value = "";
      intencaoDaChave.value = "";
    }
  });
}

const cancelando = ref<SolicitacaoCofre | null>(null);
const motivoCancelamento = ref("");

function abrirCancelamento(solicitacao: SolicitacaoCofre) {
  cancelando.value = solicitacao;
  motivoCancelamento.value = "";
}

// Este dialogo E a confirmacao do cancelamento — nao ha um segundo "tem certeza?" depois dele.
// Nada e fechado nem limpo antes da resposta: em erro, o motivo digitado e a solicitacao escolhida
// continuam de pe e um clique tenta de novo.
function confirmarCancelamento() {
  const solicitacao = cancelando.value;
  if (!solicitacao || !motivoCancelamento.value.trim() || props.salvando) return;
  emit("cancelar", {
    caixaId: props.caixaSelecionadoId,
    solicitacaoId: solicitacao.id,
    motivo: motivoCancelamento.value,
    aoConcluir: (sucesso: boolean) => {
      if (!sucesso) return;
      cancelando.value = null;
      motivoCancelamento.value = "";
    }
  });
}

const caixasSelect = computed(() =>
  props.caixasAbertos.map((caixa) => ({
    id: caixa.id,
    nome: `${caixa.pdvNome} · ${caixa.usuarioCaixaNome ?? "sem operador"} · ${caixa.dataMovimento}`
  }))
);
</script>

<template>
  <v-card rounded="lg" elevation="1" class="mb-4">
    <v-card-title class="text-subtitle-1">Programar entrega ao cofre</v-card-title>
    <v-card-text>
      <v-alert v-if="!caixasAbertos.length" type="info" variant="tonal" density="compact" class="mb-3">
        Nenhum caixa aberto no momento. A entrega é programada para um caixa aberto.
      </v-alert>

      <v-row v-else dense>
        <v-col cols="12" md="6">
          <v-select
            :model-value="caixaSelecionadoId"
            :items="caixasSelect"
            item-title="nome"
            item-value="id"
            label="Caixa aberto"
            data-teste="solicitacao-caixa"
            @update:model-value="(v) => emit('selecionarCaixa', String(v ?? ''))"
          />
        </v-col>
        <v-col cols="12" md="3">
          <v-select
            v-model="nova.tipo"
            :items="[
              { id: 'sangria', nome: 'Sangria' },
              { id: 'retorno', nome: 'Retorno' }
            ]"
            item-title="nome"
            item-value="id"
            label="Tipo"
            data-teste="solicitacao-tipo"
          />
        </v-col>
        <v-col cols="12" md="3">
          <CampoDinheiro v-model="nova.valor" label="Valor a recolher" data-teste="solicitacao-valor" />
        </v-col>
        <v-col cols="12" md="9">
          <v-text-field v-model="nova.observacao" label="Observação (opcional)" data-teste="solicitacao-observacao" />
        </v-col>
        <v-col cols="12" md="3" class="d-flex align-center">
          <v-btn
            color="primary"
            prepend-icon="mdi-clipboard-text-clock-outline"
            block
            :disabled="!podeEnviar"
            :loading="salvando"
            data-teste="solicitacao-programar"
            @click="programar"
          >
            Programar
          </v-btn>
        </v-col>
      </v-row>

      <template v-if="solicitacoes.length">
        <v-divider class="my-4" />
        <div class="text-subtitle-2 mb-2">Aguardando execução do operador</div>
        <v-alert
          v-for="solicitacao in solicitacoes"
          :key="solicitacao.id"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-2"
          data-teste="solicitacao-agendada"
        >
          <div class="d-flex flex-wrap align-center ga-3">
            <div class="flex-grow-1">
              <strong>{{ dinheiro(solicitacao.valor) }}</strong>
              · {{ solicitacao.tipo === "sangria" ? "Sangria" : "Retorno" }}
              <div v-if="solicitacao.observacao" class="text-caption">{{ solicitacao.observacao }}</div>
            </div>
            <v-btn
              size="small"
              variant="text"
              color="error"
              :disabled="salvando"
              data-teste="solicitacao-cancelar"
              @click="abrirCancelamento(solicitacao)"
            >
              Cancelar
            </v-btn>
          </div>
        </v-alert>
        <p class="text-caption mb-0">
          Enquanto houver solicitação aqui, o caixa não fecha — ela precisa ser executada ou cancelada.
        </p>
      </template>
    </v-card-text>

    <v-dialog
      :model-value="Boolean(cancelando)"
      max-width="440"
      :persistent="salvando"
      @update:model-value="(v) => !v && !salvando && (cancelando = null)"
    >
      <v-card title="Cancelar solicitação" class="pa-4">
        <p class="text-body-2 mb-3">
          A solicitação não é apagada: fica registrada como cancelada, com quem cancelou, quando e por quê.
        </p>
        <v-text-field
          v-model="motivoCancelamento"
          label="Motivo (obrigatório)"
          :error="!motivoCancelamento.trim()"
          :disabled="salvando"
          data-teste="cancelamento-motivo"
        />
        <v-card-actions>
          <v-spacer />
          <!-- Desistir preserva tudo: nada foi enviado, e o motivo digitado some junto com a
               intencao de cancelar. -->
          <v-btn :disabled="salvando" @click="cancelando = null">Voltar</v-btn>
          <v-btn
            color="error"
            :disabled="!motivoCancelamento.trim() || salvando"
            :loading="salvando"
            data-teste="cancelamento-confirmar"
            @click="confirmarCancelamento"
          >
            Cancelar solicitação
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>
