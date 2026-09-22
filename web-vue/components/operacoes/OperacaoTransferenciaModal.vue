<script setup lang="ts">
// Transferencia / Malote fiel ao desenho do Rodrigo (PROJECT_BRAIN/14, FOTO 1).
// Cor: token de categoria --cat-transferencias.
import { computed, onMounted, ref, watch } from "vue";
import { useWorkspaceContext } from "~/components/workspace/workspace-context";
import { useTransferenciaModal } from "~/composables/useTransferenciaModal";
import CampoDinheiro from "~/components/comum/CampoDinheiro.vue";

const {
  modalOperacaoAberto,
  entidadeNova,
  operacaoEditandoId,
  empresaId,
  form,
  opcoesEmpresa,
  salvandoOperacao,
  salvarOperacao,
  abrirOperacao
} = useWorkspaceContext();

const aberto = computed({
  get: () => modalOperacaoAberto.value && entidadeNova.value === "transferencia",
  set: (v: boolean) => {
    if (!v) modalOperacaoAberto.value = false;
  }
});

const {
  agendamento,
  multiploDestino,
  tempoConfirmacaoAberto,
  contasCandidatas,
  destinosSelecionados,
  erroDestino,
  destinoValido
} = useTransferenciaModal({ aberto, empresaId, form, opcoesEmpresa });

// --- Resumo da Saida: calculado no FRONT a partir do campo visivel (nao persistido). ---
const totalSaida = computed(() => Number(form.value.valorOriginal || 0));
function br(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Olho do resumo: mesma ideia de app de banco. A escolha e do USUARIO, entao sobrevive a fechar e
// reabrir o modal. Default visivel; le no onMounted para nao tocar em localStorage durante o SSR.
const CHAVE_RESUMO_VISIVEL = "cicluz:transferencia:resumo-visivel";
const resumoVisivel = ref(true);
onMounted(() => {
  resumoVisivel.value = localStorage.getItem(CHAVE_RESUMO_VISIVEL) !== "0";
});
watch(resumoVisivel, (visivel) => localStorage.setItem(CHAVE_RESUMO_VISIVEL, visivel ? "1" : "0"));
// Oculto, o NUMERO some e o rotulo fica. A largura do card e do flex, nao do texto — nao pula.
function valorResumo(n: number) {
  return resumoVisivel.value ? `R$ ${br(n)}` : "R$ ••••";
}

async function salvarTransferenciaCompleta(criarNova = false) {
  if (!destinoValido()) return;
  const resultado = await salvarOperacao();
  if (criarNova && resultado) await abrirOperacao("transferencia");
}

function dataISO(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}
const hojeISO = computed(() => dataISO(0));
</script>

<template>
  <v-dialog v-model="aberto" max-width="470">
    <div class="tr-modal">
      <!-- FAIXA do cabecalho na cor da categoria (E2), igual aos modais de Lancamento. Sangra ate a
           borda pelo margin negativo que anula o padding do .tr-modal. Laranja fixo: a transferencia
           nao troca de categoria. -->
      <div class="tr-faixa">
        <div class="tr-head">
          <span class="tr-ic"><v-icon size="19">mdi-swap-horizontal</v-icon></span>
          <span class="tr-titulo">{{ operacaoEditandoId ? "Editar transferência" : "Nova transferência" }}</span>
          <v-icon class="tr-x" size="19" @click="aberto = false">mdi-close</v-icon>
        </div>
      </div>

      <!-- CORPO rolavel. O rodape fica FORA dele: era sticky dentro do mesmo scroller, e o conteudo
           passava por baixo dos botoes por construcao. -->
      <div class="tr-corpo">
        <!-- Bloco C · Resumo — no TOPO: e a resposta de "o que isto faz com o meu dinheiro", e o
           usuario nao deveria ter que rolar ate o fim para ve-la. Valores sao os mesmos computed
           de sempre; nada e recalculado nem persistido. -->
        <div class="tr-cards">
          <!-- D9: "Entrada (+)" e "Saldo (±)" so existiam por causa das linhas de retorno.
             Sem elas, Entrada seria sempre 0 e Saldo o negativo da Saida — dois numeros que nao
             informam nada. Restou o unico que responde "o que isto faz com o meu dinheiro". -->
          <div class="tr-card">
            <span class="tr-card-lbl">Saída (−)</span>
            <b class="tr-card-val">{{ valorResumo(totalSaida) }}</b>
          </div>
          <button
            type="button"
            class="tr-olho"
            :aria-label="resumoVisivel ? 'Ocultar valores' : 'Mostrar valores'"
            :aria-pressed="!resumoVisivel"
            @click="resumoVisivel = !resumoVisivel"
          >
            <v-icon size="18">{{ resumoVisivel ? "mdi-eye-outline" : "mdi-eye-off-outline" }}</v-icon>
          </button>
        </div>

        <!-- Bloco A · Transf. Saída -->
        <div class="tr-secao">Transf. Saída</div>

        <div class="tr-hero">
          <span class="tr-cifra">R$</span>
          <CampoDinheiro v-model="form.valorOriginal" class="tr-valor" />
        </div>

        <div class="tr-dois">
          <label class="tr-campo">
            <span class="tr-campo-lbl">N° Lacre / Doc <span class="tr-hint">(do setor)</span></span>
            <input v-model="form.nLacreDoc" required class="tr-input tr-input-lacre" placeholder="Ex.: 001" />
          </label>
          <label class="tr-campo">
            <span class="tr-campo-lbl">Data Lanç</span>
            <div class="tr-data-row">
              <button
                type="button"
                class="tr-pill"
                :class="{ ativo: form.dataReferencia === hojeISO }"
                @click="form.dataReferencia = hojeISO"
              >
                Hoje
              </button>
              <input v-model="form.dataReferencia" type="date" class="tr-input tr-data-input" />
            </div>
          </label>
        </div>

        <label class="tr-check">
          <input
            v-model="agendamento"
            type="checkbox"
            :disabled="Boolean(operacaoEditandoId)"
            data-teste="opcao-agendamento"
          />
          <span>Agendamento</span>
        </label>
        <label v-if="agendamento" class="tr-campo tr-indent">
          <span class="tr-campo-lbl">Data Agendamento</span>
          <input
            v-model="form.agendadaPara"
            type="datetime-local"
            class="tr-input"
            :disabled="Boolean(operacaoEditandoId)"
          />
        </label>

        <label class="tr-campo">
          <span class="tr-campo-lbl">Data Recebimento</span>
          <input :value="form.dataRecebimento" class="tr-input tr-input-ro" readonly placeholder="—" />
          <span class="tr-legenda">Preenchido quando confirmado pelo destinatário.</span>
        </label>

        <!-- Sem contas vinculadas ao usuario (contas_usuarios): aviso claro no lugar de selects vazios. -->
        <div v-if="!opcoesEmpresa.contas.length" class="tr-aviso-contas" role="alert">
          <v-icon icon="mdi-alert-circle-outline" size="18" />
          <span>Nenhuma conta vinculada ao seu usuário — peça ao administrador.</span>
        </div>
        <div v-else class="tr-rota" :class="{ 'tr-rota-lista': multiploDestino }">
          <label class="tr-campo">
            <span class="tr-campo-lbl">Origem / Saída</span>
            <select v-model="form.contaOrigemId" class="tr-input">
              <option value="">—</option>
              <option v-for="c in opcoesEmpresa.contas" :key="c.id" :value="c.id">{{ c.nome }}</option>
            </select>
          </label>
          <v-icon class="tr-seta" size="17">mdi-arrow-right</v-icon>
          <!-- <div>, nao <label>: com Multiplo Destino este campo contem <label> por conta, e label
             aninhado rouba o clique das checkboxes de dentro. -->
          <div class="tr-campo">
            <span class="tr-campo-lbl">Destino / Entrada</span>
            <select
              v-if="!multiploDestino"
              v-model="form.contaDestinoId"
              class="tr-input"
              aria-label="Destino / Entrada"
            >
              <option value="">—</option>
              <option v-for="c in contasCandidatas" :key="c.id" :value="c.id">{{ c.nome }}</option>
            </select>
            <!-- R-030: candidatas, todas iguais. A primeira que confirmar com o lacre leva o valor
               INTEIRO — por isso a lista so marca contas e nao tem valor por destino. -->
            <div v-else class="tr-destinos" role="group" aria-label="Destino / Entrada — contas candidatas">
              <label v-for="c in contasCandidatas" :key="c.id" class="tr-check tr-destino-item">
                <input v-model="destinosSelecionados" type="checkbox" :value="c.id" />
                <span>{{ c.nome }}</span>
              </label>
            </div>
            <span v-if="erroDestino" class="tr-erro" role="alert">{{ erroDestino }}</span>
          </div>
        </div>

        <!-- R-188: uma unica opcao declara varias linhas de valor+lacre. O destino e sempre a
           conta de origem da transferencia inicial e a execucao financeira ocorre no Caixa. -->
        <div class="tr-opcoes">
          <label class="tr-check" :class="{ 'tr-check-desabilitado': tempoConfirmacaoAberto }">
            <input v-model="multiploDestino" type="checkbox" :disabled="tempoConfirmacaoAberto" />
            <span>Múltiplo Destino</span>
          </label>
          <!-- A escolha das contas acontece no proprio campo "Destino / Entrada" (acima), como no
             desenho: as checkboxes ficam AO LADO de Destino, e esta caixa nao aninha nada. -->

          <!-- R-035: e o "tempo de confirmacao". "Sempre confirmar" foi erro de transcricao da
             FOTO 1, ja retificado no PROJECT_BRAIN/14 — nao voltar com aquele rotulo. -->
          <label
            class="tr-check"
            :class="{ 'tr-check-desabilitado': multiploDestino || Boolean(operacaoEditandoId) }"
          >
            <input
              v-model="tempoConfirmacaoAberto"
              type="checkbox"
              :disabled="multiploDestino || Boolean(operacaoEditandoId)"
            />
            <span>Tempo de confirmação</span>
          </label>
          <label v-if="tempoConfirmacaoAberto" class="tr-campo tr-indent">
            <span class="tr-campo-lbl">Tempo de confirmação</span>
            <select v-model="form.tempoConfirmacao" class="tr-input" :disabled="Boolean(operacaoEditandoId)">
              <option value="5min">5 minutos</option>
              <option value="10min">10 minutos</option>
              <option value="30min">30 minutos</option>
              <option value="1h">1 hora</option>
              <option value="1dia">1 dia</option>
              <option value="10dias">10 dias</option>
              <option value="30dias">30 dias</option>
            </select>
          </label>
        </div>

        <!-- R-127: o texto do movimento e a OBSERVACAO. Nao esta no desenho, fica discreta no rodape. -->
        <label class="tr-campo">
          <span class="tr-campo-lbl">Observação</span>
          <input v-model="form.observacao" class="tr-input" placeholder="Ex.: Suprimento CX1 — reforço de troco" />
        </label>
      </div>

      <div class="tr-acoes">
        <button
          type="button"
          class="tr-salvar-nova"
          :disabled="salvandoOperacao"
          @click="salvarTransferenciaCompleta(true)"
        >
          Salvar e criar nova
        </button>
        <button
          type="button"
          class="tr-salvar"
          :disabled="salvandoOperacao"
          @click="salvarTransferenciaCompleta(false)"
        >
          Salvar
        </button>
      </div>
    </div>
  </v-dialog>
</template>

<style scoped src="./OperacaoTransferenciaModal.css"></style>
