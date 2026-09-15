<script setup lang="ts">
// R-167/R-176 (#152) — onde o Admin decide PARA ONDE vai o dinheiro de uma forma de pagamento.
//
// Componente proprio, e nao mais um campo no cadastro generico, por tres motivos que sao o mesmo:
// e outro ATO (decidir destino de dinheiro, nao renomear forma), outra PERMISSAO (a dedicada da
// R-176) e outro publico (so o Admin). Nao e segunda rota para cadastrar forma — e a unica rota
// para rotear.
import { computed, ref, watch } from "vue";
import { useApi } from "~/composables/useApi";
import RegrasRecebimentoTeste from "~/components/financeiro/RegrasRecebimentoTeste.vue";

type Conta = { id: string; nome?: string };
type Disponibilidade = "imediata" | "por_evento";
type Roteamento = {
  adquirente: string | null;
  usaContaDoPdv: boolean;
  contaRecebivelId: string | null;
  contaFinalId: string | null;
  disponibilidade: Disponibilidade | null;
};

const props = defineProps<{
  aberto: boolean;
  empresaId: string;
  forma: { id: string; nome: string } | null;
  contas: Conta[];
  podeConfigurar: boolean;
}>();

const emit = defineEmits<{ (event: "fechar"): void; (event: "salvo"): void }>();

const { apiGet, apiPut } = useApi();

const carregando = ref(false);
const salvando = ref(false);
// Dois erros SEPARADOS, e a separacao e o conserto: com um so, falhar ao salvar trocava o formulario
// inteiro pelo alerta e o Admin perdia o que preencheu — e o "tentar de novo" recarregava do servidor
// por cima. Erro de CARGA substitui o formulario (nao ha o que preservar); erro de SALVAR fica ao lado
// dele, com o preenchimento intacto.
const erroCarga = ref("");
const erroSalvar = ref("");
// A forma nao foi encontrada na listagem: estado DESCONHECIDO, nunca "sem roteamento". Tratar
// ausencia como "sem roteamento" faria o Salvar apagar o destino de uma forma ja configurada.
const naoEncontrada = ref(false);
const destino = ref<"sem_roteamento" | "conta_do_pdv" | "recebivel">("sem_roteamento");
const adquirente = ref("");
const contaRecebivelId = ref<string | null>(null);
const contaFinalId = ref<string | null>(null);

// BLOQUEADO: rotear para conta propria exige conta cadastrada. Sem nenhuma, o caminho "recebivel"
// nao pode nem ser oferecido — oferecer e deixar o Admin preencher para receber erro no fim.
const semContas = computed(() => props.contas.length === 0);

const opcoesDestino = computed(() => [
  { valor: "sem_roteamento", titulo: "Sem roteamento", ajuda: "A venda fica pendente e nao entra em saldo." },
  {
    valor: "conta_do_pdv",
    titulo: "Dinheiro na conta do PDV",
    ajuda: "Disponivel na hora, no caixa que registrou a venda."
  },
  {
    valor: "recebivel",
    titulo: "Recebivel (cartao, Pix, voucher)",
    ajuda: semContas.value
      ? "Cadastre ao menos uma conta para usar este destino."
      : "Entra no financeiro e so vira saldo quando a liquidacao confirmar."
  }
]);

function aplicar(roteamento: Roteamento) {
  adquirente.value = roteamento.adquirente ?? "";
  contaRecebivelId.value = roteamento.contaRecebivelId;
  contaFinalId.value = roteamento.contaFinalId;
  if (roteamento.disponibilidade === "imediata") destino.value = "conta_do_pdv";
  else if (roteamento.disponibilidade === "por_evento") destino.value = "recebivel";
  else destino.value = "sem_roteamento";
}

async function carregar() {
  if (!props.forma || !props.podeConfigurar) return;
  carregando.value = true;
  erroCarga.value = "";
  erroSalvar.value = "";
  naoEncontrada.value = false;
  try {
    // A listagem so devolve as colunas de roteamento a quem tem a permissao dedicada — por isso o
    // dialogo le da mesma rota que a tela ja usa, em vez de inventar um GET por id.
    const formas = await apiGet<Array<{ id: string } & Partial<Roteamento>>>(
      `/api/formas_pagamento?empresaId=${props.empresaId}&pageSize=100`
    );
    const atual = formas.find((item) => item.id === props.forma?.id);
    if (!atual) {
      // Nao achou = nao sei. Assumir "sem roteamento" seria o estado MAIS DESTRUTIVO: o Salvar
      // mandaria `disponibilidade: null` e apagaria o destino de uma forma que pode estar roteada.
      naoEncontrada.value = true;
      erroCarga.value = "Nao foi possivel ler o roteamento atual desta forma.";
      return;
    }
    aplicar({
      adquirente: atual.adquirente ?? null,
      usaContaDoPdv: atual.usaContaDoPdv ?? false,
      contaRecebivelId: atual.contaRecebivelId ?? null,
      contaFinalId: atual.contaFinalId ?? null,
      disponibilidade: atual.disponibilidade ?? null
    });
  } catch {
    erroCarga.value = "Nao foi possivel carregar o roteamento desta forma.";
  } finally {
    carregando.value = false;
  }
}

watch(
  () => [props.aberto, props.forma?.id],
  ([aberto]) => {
    if (aberto) void carregar();
  },
  { immediate: true }
);

const podeSalvar = computed(() => {
  if (salvando.value || carregando.value || !props.podeConfigurar) return false;
  // Sem saber o estado atual, salvar so pode destruir.
  if (naoEncontrada.value || erroCarga.value) return false;
  if (destino.value === "recebivel") return Boolean(contaRecebivelId.value && contaFinalId.value);
  return true;
});

async function salvar() {
  if (!props.forma || !podeSalvar.value) return;
  salvando.value = true;
  erroSalvar.value = "";
  const corpo = {
    empresaId: props.empresaId,
    nome: props.forma.nome,
    adquirente: adquirente.value.trim() || null,
    usaContaDoPdv: destino.value === "conta_do_pdv",
    contaRecebivelId: destino.value === "recebivel" ? contaRecebivelId.value : null,
    contaFinalId: destino.value === "recebivel" ? contaFinalId.value : null,
    disponibilidade: destino.value === "conta_do_pdv" ? "imediata" : destino.value === "recebivel" ? "por_evento" : null
  };
  try {
    await apiPut(`/api/formas-pagamento/${props.forma.id}`, corpo);
    emit("salvo");
    emit("fechar");
  } catch (falha) {
    // Fica no `erroSalvar`: o formulario continua na tela, com tudo que o Admin preencheu.
    erroSalvar.value = falha instanceof Error ? falha.message : "Nao foi possivel salvar o roteamento.";
  } finally {
    salvando.value = false;
  }
}
</script>

<template>
  <v-dialog
    :model-value="aberto"
    max-width="860"
    scrollable
    aria-labelledby="titulo-roteamento-financeiro"
    @update:model-value="emit('fechar')"
  >
    <v-card>
      <v-card-title id="titulo-roteamento-financeiro" class="text-wrap">
        Configurar recebimento — {{ forma?.nome }}
      </v-card-title>

      <v-card-text>
        <!-- SEM PERMISSAO: a tela diz o que falta, em vez de um formulario morto. -->
        <v-alert v-if="!podeConfigurar" type="info" variant="tonal" density="comfortable">
          Voce nao tem permissao para configurar o roteamento financeiro. Fale com o Admin.
        </v-alert>

        <!-- CARREGANDO -->
        <div v-else-if="carregando" class="py-6 text-center">
          <v-progress-circular indeterminate color="primary" aria-label="Carregando roteamento" />
        </div>

        <!-- ERRO DE CARGA com nova tentativa. Nao ha formulario a preservar aqui. -->
        <v-alert v-else-if="erroCarga" type="error" variant="tonal" density="comfortable">
          {{ erroCarga }}
          <template #append>
            <v-btn size="small" variant="text" @click="carregar">Tentar de novo</v-btn>
          </template>
        </v-alert>

        <div v-else class="roteamento">
          <p class="text-body-2 mb-4">
            Enquanto uma forma nao tem destino, a venda paga por ela fica <strong>pendente</strong> e nao entra em
            saldo. Nada cai em conta por omissao.
          </p>

          <v-radio-group v-model="destino" hide-details class="mb-2" label="Destino do dinheiro desta forma">
            <v-radio
              v-for="opcao in opcoesDestino"
              :key="opcao.valor"
              :value="opcao.valor"
              :disabled="opcao.valor === 'recebivel' && semContas"
            >
              <template #label>
                <span class="d-flex flex-column">
                  <span class="font-weight-medium">{{ opcao.titulo }}</span>
                  <span class="text-caption text-medium-emphasis">{{ opcao.ajuda }}</span>
                </span>
              </template>
            </v-radio>
          </v-radio-group>

          <!-- BLOQUEADO: falta pre-requisito, e a tela diz qual. -->
          <v-alert v-if="semContas" type="warning" variant="tonal" density="compact" class="mb-4">
            Nenhuma conta cadastrada nesta empresa. Cadastre uma conta para poder rotear cartao, Pix ou voucher.
          </v-alert>

          <div v-if="destino === 'recebivel'" class="campos">
            <v-select
              v-model="contaRecebivelId"
              :items="contas"
              item-title="nome"
              item-value="id"
              label="Conta de recebivel"
              hint="Onde o valor fica enquanto a adquirente nao liquidou."
              persistent-hint
              density="comfortable"
            />
            <v-select
              v-model="contaFinalId"
              :items="contas"
              item-title="nome"
              item-value="id"
              label="Conta final"
              hint="Onde o dinheiro cai quando a liquidacao confirmar."
              persistent-hint
              density="comfortable"
            />
          </div>

          <v-text-field
            v-if="destino !== 'sem_roteamento'"
            v-model="adquirente"
            label="Adquirente ou provedor (opcional)"
            hint="Ex.: Cielo, Rede, PagSeguro. E atributo da forma, nao muda o destino."
            persistent-hint
            density="comfortable"
            class="mt-4"
          />

          <!-- ERRO DE SALVAR: ao lado do formulario, que continua preenchido. -->
          <v-alert v-if="erroSalvar" type="error" variant="tonal" density="compact" class="mt-4">
            {{ erroSalvar }}
            <template #append>
              <v-btn size="small" variant="text" :disabled="!podeSalvar" @click="salvar">Tentar de novo</v-btn>
            </template>
          </v-alert>

          <RegrasRecebimentoTeste
            :empresa-id="empresaId"
            :forma-id="forma?.id ?? null"
            :pode-configurar="podeConfigurar"
          />
        </div>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="emit('fechar')">Fechar</v-btn>
        <v-btn
          v-if="podeConfigurar"
          color="primary"
          variant="flat"
          :loading="salvando"
          :disabled="!podeSalvar"
          @click="salvar"
        >
          Salvar recebimento
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.roteamento {
  /* 390px: o conteudo cabe na largura. Se algum dia estourar, ROLA — nunca e cortado, que e modo de
     falha pior: o usuario nao ve que ha algo ali. */
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
}

.campos {
  display: grid;
  gap: 12px;
  grid-template-columns: 1fr;
}

@media (min-width: 768px) {
  .campos {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
