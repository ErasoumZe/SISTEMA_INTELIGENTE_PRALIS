<script setup lang="ts">
// Transferencia / Malote fiel ao desenho do Rodrigo (PROJECT_BRAIN/14, FOTO 1).
// Cor: token de categoria --cat-transferencias.
import { computed, onMounted, ref, watch } from "vue";
import { paraCentavos } from "@padaria/shared";
import { useWorkspaceContext } from "~/components/workspace/workspace-context";
import { useTransferenciaModal } from "~/composables/useTransferenciaModal";
import CampoDinheiro from "~/components/comum/CampoDinheiro.vue";

const {
  modalOperacaoAberto,
  entidadeNova,
  operacaoEditandoId,
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
} = useTransferenciaModal({ aberto, form, opcoesEmpresa });

// --- Resumo da Saida: calculado no FRONT a partir do campo visivel (nao persistido). ---
const totalSaida = computed(() => Number(form.value.valorOriginal || 0));
const erroComposicao = ref("");
const novoLacreRetorno = ref("");
const lacresRetornoAtivos = ref(false);
const contaOrigemSelecionada = computed(() =>
  opcoesEmpresa.value.contas.find((conta) => conta.id === form.value.contaOrigemId)
);
const contaDestinoSelecionada = computed(() =>
  opcoesEmpresa.value.contas.find((conta) => conta.id === form.value.contaDestinoId)
);
const preparandoMaloteParaCaixa = computed(() => {
  return Boolean(contaOrigemSelecionada.value?.ehCofre && contaDestinoSelecionada.value?.ehContaPdv);
});
const composicaoMaloteInformada = computed(
  () => form.value.valorEspecieDeclarado.trim() !== "" && form.value.valorMoedasDeclarado.trim() !== ""
);
const composicaoMaloteBate = computed(
  () =>
    composicaoMaloteInformada.value &&
    paraCentavos(form.value.valorEspecieDeclarado) + paraCentavos(form.value.valorMoedasDeclarado) ===
      paraCentavos(form.value.valorOriginal)
);

watch(preparandoMaloteParaCaixa, (preparando) => {
  erroComposicao.value = "";
  if (!preparando) {
    form.value.valorEspecieDeclarado = "";
    form.value.valorMoedasDeclarado = "";
    form.value.lacresRetorno = [];
    novoLacreRetorno.value = "";
    lacresRetornoAtivos.value = false;
  }
});
watch(lacresRetornoAtivos, (ativo) => {
  if (!ativo) {
    form.value.lacresRetorno = [];
    novoLacreRetorno.value = "";
  }
});
watch(aberto, (estaAberto) => {
  if (!estaAberto) lacresRetornoAtivos.value = false;
});
// Ao reabrir uma transferência que já possui bolsas, revela a mesma área para edição.
watch(
  () => form.value.lacresRetorno.length,
  (quantidade) => {
    if (quantidade) lacresRetornoAtivos.value = true;
  },
  { immediate: true }
);
const lacresRetornoDuplicados = computed(
  () => new Set(form.value.lacresRetorno.map((lacre) => lacre.trim())).size !== form.value.lacresRetorno.length
);
function adicionarLacreRetorno() {
  const numero = novoLacreRetorno.value.trim();
  if (!numero || form.value.lacresRetorno.includes(numero)) return;
  form.value.lacresRetorno.push(numero);
  novoLacreRetorno.value = "";
}
function removerLacreRetorno(indice: number) {
  form.value.lacresRetorno.splice(indice, 1);
}
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
  if (preparandoMaloteParaCaixa.value && !composicaoMaloteInformada.value) {
    erroComposicao.value = "Informe dinheiro físico e moedas do malote.";
    return;
  }
  if (preparandoMaloteParaCaixa.value && !composicaoMaloteBate.value) {
    erroComposicao.value = "Dinheiro físico + moedas deve ser igual ao valor total.";
    return;
  }
  if (preparandoMaloteParaCaixa.value && lacresRetornoDuplicados.value) {
    erroComposicao.value = "Cada lacre de retorno / sangria deve ser informado uma unica vez.";
    return;
  }
  erroComposicao.value = "";
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
  <v-dialog v-model="aberto" max-width="470" persistent no-click-animation>
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

        <section v-if="preparandoMaloteParaCaixa" class="tr-malote" aria-label="Composição do malote para abertura">
          <strong>Composição do malote <span>(obrigatória)</span></strong>
          <p>Informe o dinheiro físico e as moedas que seguem para o caixa.</p>
          <div class="tr-dois">
            <CampoDinheiro
              v-model="form.valorEspecieDeclarado"
              label="Dinheiro físico"
              icone="mdi-cash"
              data-teste="malote-dinheiro"
            />
            <CampoDinheiro
              v-model="form.valorMoedasDeclarado"
              label="Moedas"
              icone="mdi-circle-multiple"
              data-teste="malote-moedas"
            />
          </div>
          <span v-if="erroComposicao" class="tr-erro" role="alert">{{ erroComposicao }}</span>
          <span v-else-if="composicaoMaloteInformada && !composicaoMaloteBate" class="tr-erro" role="alert"
            >Dinheiro físico + moedas deve ser igual ao valor total.</span
          >
          <span v-else-if="composicaoMaloteBate" class="tr-ok">Composição do malote conferida.</span>
          <label class="tr-check tr-lacres-opcao">
            <input v-model="lacresRetornoAtivos" type="checkbox" />
            <span>Lacres de retorno / sangria <span class="tr-hint">(opcional)</span></span>
          </label>
          <div v-if="lacresRetornoAtivos" class="tr-lacres-retorno">
            <p>Informe os lacres das bolsas abertas que seguem dentro deste malote.</p>
            <div class="tr-lacre-adicionar">
              <input
                v-model="novoLacreRetorno"
                class="tr-input"
                placeholder="Número do lacre da bolsa"
                maxlength="100"
                @keydown.enter.prevent="adicionarLacreRetorno"
              />
              <button
                type="button"
                class="tr-lacre-botao"
                :disabled="!novoLacreRetorno.trim()"
                @click="adicionarLacreRetorno"
              >
                <v-icon size="17">mdi-plus</v-icon> Adicionar lacre
              </button>
            </div>
            <div v-if="form.lacresRetorno.length" class="tr-lacres-lista" aria-label="Lacres de retorno adicionados">
              <span v-for="(lacre, indice) in form.lacresRetorno" :key="`${lacre}-${indice}`" class="tr-lacre-chip">
                Bolsa {{ indice + 1 }}: {{ lacre }}
                <button type="button" :aria-label="`Remover lacre ${lacre}`" @click="removerLacreRetorno(indice)">
                  <v-icon size="15">mdi-close</v-icon>
                </button>
              </span>
            </div>
            <span class="tr-legenda">{{ form.lacresRetorno.length }} lacre(s) de sangria adicionado(s).</span>
          </div>
        </section>

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
          <label class="tr-check" :class="{ 'tr-check-desabilitado': multiploDestino || Boolean(operacaoEditandoId) }">
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
