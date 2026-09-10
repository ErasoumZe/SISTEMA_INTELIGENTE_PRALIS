<script setup lang="ts">
// Cockpit de TESOURARIA (rota /transferencias). O tesoureiro NAO opera caixa — ele move dinheiro
// entre contas (cofre -> caixas -> banco) por transferencia. Substitui a tabela generica pelo
// cockpit: cards Saida/Entrada/Saldo (cor --cat-transferencias) + lista limpa das transferencias.
// A criacao/edicao REUSA o modal de transferencia do workspace (eventos "nova"/"editar"); o botao
// NAO depende de caixa aberto.
//
// A lista recebe da API o trajeto nominal, lacre, estado e data de recebimento.
import { transferenciaContaComoEntrada, transferenciaContaComoSaida, valorEntradaCentavos } from "@padaria/shared";
import type { ItemMenu, OperacaoResumo, Opcao, ResumoCaixa } from "~/types/padaria";
import { dinheiro } from "~/utils/domain";
import { formatarDataSomenteDia } from "~/utils/formatacao";
import {
  camposConferenciaVazios,
  lacreConfereEntrega,
  montarPayloadConfirmacao,
  bloqueiaEnvioPorSobra,
  montarPayloadRecusa,
  valorConferenciaValido
} from "~/utils/conferencia-transferencia";

const props = withDefaults(
  defineProps<{
    resumo: ResumoCaixa | null;
    telaAtual: ItemMenu | null | undefined;
    empresaAtiva: Opcao | null;
    operacoesPaginadas: OperacaoResumo[];
    operacoesTela: OperacaoResumo[];
    totalOperacoes: number;
    pagina: number;
    totalPaginas: number;
    podeCriar?: boolean;
    podeEditar?: boolean;
    // Sem isto a tela oferecia "Conferir" para quem a API recusaria com 403.
    podeConferir?: boolean;
  }>(),
  { podeCriar: false, podeEditar: false, podeConferir: false, operacoesTela: () => [] }
);

const emit = defineEmits<{
  (event: "nova"): void;
  (event: "editar", operacao: OperacaoResumo): void;
  (event: "update:pagina", pagina: number): void;
  (event: "recarregar"): void;
}>();
const { apiPost } = useApi();
const confirmando = ref<OperacaoResumo | null>(null);
// Um unico objeto de campos, zerado a cada abertura: antes eram quatro refs soltas que
// sobreviviam ao fechamento do dialogo, e a segunda conferencia comecava com o valor da primeira
// ja preenchido — convite para confirmar sem contar.
const campos = reactive(camposConferenciaVazios());
const erroConferencia = ref("");
const salvandoConferencia = ref(false);
const modoRecusa = ref(false);
// R-183 · o desfecho da recusa. `false` mantem o comportamento de sempre (registra e reconfere);
// `true` encerra: o cofre credita o contado, a falta vira quebra e o caixa destrava.
const encerrarDivergencia = ref(false);
const sobraConfirmada = ref(false);

function abrirConferencia(operacao: OperacaoResumo) {
  Object.assign(campos, camposConferenciaVazios());
  erroConferencia.value = "";
  modoRecusa.value = false;
  encerrarDivergencia.value = false;
  sobraConfirmada.value = false;
  confirmando.value = operacao;
}

function fecharConferencia() {
  confirmando.value = null;
  modoRecusa.value = false;
  encerrarDivergencia.value = false;
  sobraConfirmada.value = false;
  Object.assign(campos, camposConferenciaVazios());
  erroConferencia.value = "";
}

// O servidor e quem sabe se esta linha e uma entrega do Caixa: a tela nao conhece a conta de cofre
// nem o tipo. Vem no DTO da listagem, calculado com o predicado canonico.
const ehCaixaParaCofre = computed(() => confirmando.value?.ehCaixaParaCofre === true);

// Decisao 5: o valor so e OBRIGATORIO no Caixa -> Cofre (e la 0 e legitimo). Na generica ele
// continua opcional — vazio significa "nao informei", e o payload omite o campo.
const valorValido = computed(() => valorConferenciaValido(campos.valorRecebido));
const valorPendente = computed(() => ehCaixaParaCofre.value && !valorValido.value);
// Sem este bloqueio, deixar o campo vazio em uma entrega lacrada chegava ao servidor como
// `null` e recebia um 409 que parecia ser divergencia de valor. No modo de recusa, lacre
// diferente e uma evidencia valida e deve poder seguir junto do motivo.
const lacrePendente = computed(
  () => !modoRecusa.value && !lacreConfereEntrega(campos.lacre, confirmando.value?.nLacreDoc)
);
const entregaTemLacre = computed(() => Boolean(confirmando.value?.nLacreDoc?.trim()));
const motivoValido = computed(() => Boolean(campos.motivo.trim()));
// A sobra so aparece quando o contado passa do declarado — e ai o consentimento vira obrigatorio,
// senao o servidor recusa com 409. Mostrar a caixa sempre treinaria a pessoa a marcar sem ler.
const contadoAcimaDoDeclarado = computed(() => {
  const operacao = confirmando.value;
  if (!operacao || !valorConferenciaValido(campos.valorRecebido)) return false;
  return Number(campos.valorRecebido) > Number(operacao.valorOriginal);
});
const sobraPendenteDeConsentimento = computed(() =>
  bloqueiaEnvioPorSobra({
    modoRecusa: modoRecusa.value,
    encerrar: encerrarDivergencia.value,
    contouAMais: contadoAcimaDoDeclarado.value,
    confirmou: sobraConfirmada.value
  })
);

// Voltar para "Conferir" desfaz a ESCOLHA de encerrar, e nao so esconde a caixa: escolha que
// sobrevive escondida e a origem de botao travado sem causa visivel.
function alternarModoRecusa() {
  modoRecusa.value = !modoRecusa.value;
  encerrarDivergencia.value = false;
  sobraConfirmada.value = false;
}
// "Nao bateu" so existe onde a rota de recusa existe. Na generica ela responde 404.
const podeRecusar = computed(() => ehCaixaParaCofre.value);

async function enviarConferencia() {
  const operacao = confirmando.value;
  if (!operacao || salvandoConferencia.value) return;
  if (valorPendente.value) return;
  if (modoRecusa.value && (!podeRecusar.value || !motivoValido.value)) return;
  if (sobraPendenteDeConsentimento.value) return;

  erroConferencia.value = "";
  salvandoConferencia.value = true;
  try {
    // Duas rotas distintas de proposito: a recusa precisa ser COMMITADA com motivo, e por isso
    // nao e um desfecho do `/confirmar`.
    const rota = modoRecusa.value ? "recusar-conferencia" : "confirmar";
    const corpo = modoRecusa.value
      ? montarPayloadRecusa(campos, operacao.contaDestinoId ?? "", {
          encerrar: encerrarDivergencia.value,
          sobraConfirmada: sobraConfirmada.value
        })
      : montarPayloadConfirmacao(campos, operacao.contaDestinoId ?? "", ehCaixaParaCofre.value);
    await apiPost(`/api/transferencias/${operacao.id}/${rota}`, corpo);
    fecharConferencia();
    emit("recarregar");
  } catch (error) {
    erroConferencia.value = error instanceof Error ? error.message : "Falha ao conferir";
  } finally {
    salvandoConferencia.value = false;
  }
}

// Total do periodo (sempre confiavel — soma da lista carregada).
const totalPeriodo = computed(() => props.operacoesTela.reduce((soma, op) => soma + Number(op.valorOriginal || 0), 0));

// Split direcional Saida/Entrada/Saldo: so existe quando ha resumo (contexto de caixa). Para o
// tesoureiro puro (sem caixa) o resumo e nulo -> os cards ficam pendentes de backend.
// R-183 · `divergente` entra nos dois lados, com numeros DIFERENTES. A saida e sempre o declarado
// (o dinheiro saiu do caixa e nao volta); a entrada e o que o cofre CONTOU. Somar o declarado nos
// dois lados faria a divergencia desaparecer do cockpit — que e justamente onde a Tesouraria olha.
//
// Os tres predicados vem do `shared`, e nao de uma copia local: o servidor decide o saldo por essas
// mesmas funcoes, e uma lista de status escrita a mao aqui divergiria em silencio no dia em que
// nascesse o sexto status. E o mesmo motivo pelo qual o predicado da entrega ao cofre tem casa
// unica no back.
// O coalesce fica local de proposito: `valorEntradaCentavos` fala em CENTAVOS e esta tela trabalha
// em reais. Passar reais para um parametro chamado `...Centavos` seria mentir no nome para economizar
// uma linha. O que precisava sair daqui era a LISTA DE STATUS, que e onde a divergencia silenciosa
// mora — e ela agora vem do shared.
const valorQueEntrou = (op: OperacaoResumo) => Number(op.valorRecebido ?? op.valorOriginal);

const saida = computed(() =>
  props.operacoesTela
    .filter((op) => transferenciaContaComoSaida(op.status))
    .reduce((total, op) => total + Number(op.valorOriginal), 0)
);
const entrada = computed(() =>
  props.operacoesTela
    .filter((op) => transferenciaContaComoEntrada(op.status))
    .reduce((total, op) => total + valorQueEntrou(op), 0)
);
const saldo = computed(() => entrada.value - saida.value);
</script>

<template>
  <div class="tesouraria">
    <!-- Cabecalho + acao primaria (independente de caixa). Este ja era a forma que o VIS-10
         unifica — titulo, subtitulo e acao a direita, acima dos cards —, entao aqui a mudanca e
         so passar a usar o componente comum. Texto e botao sao os mesmos. -->
    <AppCabecalhoTela :titulo="telaAtual?.titulo ?? 'Tesouraria'">
      <template #subtitulo>
        Movimente dinheiro entre contas (cofre → caixas → banco).
        <span class="tes-count"
          >{{ totalOperacoes }} transferência{{ totalOperacoes === 1 ? "" : "s" }} · total
          {{ dinheiro(totalPeriodo) }}</span
        >
      </template>
      <template #acoes>
        <v-btn v-if="podeCriar" class="tes-nova" prepend-icon="mdi-plus" rounded="pill" @click="emit('nova')">
          Nova transferência
        </v-btn>
      </template>
    </AppCabecalhoTela>

    <!-- Cards de total: Saida · Entrada · Saldo (cor --cat-transferencias) -->
    <section class="tes-cards" aria-label="Totais de transferências">
      <article class="tes-card">
        <span class="tes-cic"><v-icon icon="mdi-arrow-up-right" size="20" /></span>
        <span class="tes-copy">
          <span class="tes-lbl">Saída </span>
          <span class="tes-val neg" :class="{ pend: saida === null }">{{ dinheiro(saida) }}</span>
        </span>
      </article>
      <article class="tes-card">
        <span class="tes-cic"><v-icon icon="mdi-arrow-down-left" size="20" /></span>
        <span class="tes-copy">
          <span class="tes-lbl">Entrada </span>
          <span class="tes-val pos" :class="{ pend: entrada === null }">{{ dinheiro(entrada) }}</span>
        </span>
      </article>
      <article class="tes-card">
        <span class="tes-cic"><v-icon icon="mdi-scale-balance" size="20" /></span>
        <span class="tes-copy">
          <span class="tes-lbl">Saldo </span>
          <span class="tes-val">{{ dinheiro(saldo) }}</span>
        </span>
      </article>
    </section>

    <!-- Lista limpa das transferencias do periodo -->
    <v-card class="tes-list-card" rounded="lg" elevation="1">
      <div class="tes-list" role="table" aria-label="Transferências do período">
        <div class="tes-row tes-row-head" role="row">
          <span>Confirmação</span>
          <span>Data</span>
          <span>Origem → destino</span>
          <span>Lacre</span>
          <span class="tes-num">Valor</span>
          <span>Recebimento</span>
          <span class="tes-acoes-h">Ações</span>
        </div>

        <div v-for="op in operacoesPaginadas" :key="op.id" class="tes-row" role="row">
          <!-- Confirmacao: sem backend de confirmacao nesta branch -> somente leitura + regra. -->
          <span class="tes-conf" data-col="Confirmação">
            <span class="tes-status-chip">
              <v-icon :icon="op.status === 'recebido' ? 'mdi-check-circle-outline' : 'mdi-clock-outline'" size="13" />
              {{ op.status }}
            </span>
          </span>
          <span class="tes-data" data-col="Data">{{ formatarDataSomenteDia(op.dataReferencia) }}</span>
          <span class="tes-desc" data-col="Origem → destino" :title="op.descricao">
            <v-icon icon="mdi-swap-horizontal" size="16" class="tes-desc-ic" />{{ op.contaOrigemNome }} →
            {{ op.contaDestinoNome }}
          </span>
          <span class="tes-lacre" data-col="Lacre">{{ op.nLacreDoc || "—" }}</span>
          <span class="tes-valor tes-num" data-col="Valor">{{ dinheiro(op.valorOriginal) }}</span>
          <span class="tes-receb" data-col="Recebimento">{{
            op.dataRecebimento ? formatarDataSomenteDia(op.dataRecebimento) : "—"
          }}</span>
          <span class="tes-acoes" data-col="Ações">
            <v-btn v-if="podeEditar" size="small" variant="tonal" prepend-icon="mdi-pencil" @click="emit('editar', op)">
              Editar
            </v-btn>
            <v-btn
              v-if="op.status === 'pendente' && podeConferir"
              size="small"
              variant="tonal"
              data-teste="botao-conferir"
              @click="abrirConferencia(op)"
            >
              Conferir
            </v-btn>
          </span>
        </div>

        <div v-if="!operacoesPaginadas.length" class="tes-empty">
          <v-icon icon="mdi-swap-horizontal-variant" size="34" />
          <p>Nenhuma transferência no período.</p>
          <v-btn v-if="podeCriar" class="tes-nova" prepend-icon="mdi-plus" rounded="pill" @click="emit('nova')">
            Nova transferência
          </v-btn>
        </div>
      </div>

      <div v-if="totalOperacoes > 10" class="tes-pag">
        <v-btn
          size="small"
          variant="outlined"
          :disabled="pagina === 1"
          @click="emit('update:pagina', Math.max(1, pagina - 1))"
        >
          Anterior
        </v-btn>
        <span>{{ pagina }} / {{ totalPaginas }}</span>
        <v-btn
          size="small"
          variant="outlined"
          :disabled="pagina === totalPaginas"
          @click="emit('update:pagina', Math.min(totalPaginas, pagina + 1))"
        >
          Próxima
        </v-btn>
      </div>
    </v-card>

    <v-dialog
      :model-value="Boolean(confirmando)"
      max-width="480"
      @update:model-value="(v) => !v && fecharConferencia()"
    >
      <v-card :title="modoRecusa ? 'Registrar divergência' : 'Conferir recebimento'" class="pa-4">
        <v-text-field
          v-model="campos.contaDestinoId"
          label="ID da conta que recebeu (vazio = conta de destino)"
          data-teste="conferencia-conta"
        />
        <!-- R-026: movimento pode nao ter lacre. Vazio vira `null` no payload — nunca string
             vazia, que o schema recusaria e deixaria a conferencia impossivel. -->
        <v-text-field
          v-model="campos.lacre"
          :label="entregaTemLacre ? 'Nº do lacre (obrigatório para esta entrega)' : 'Nº do lacre (vazio se não houver)'"
          :error="lacrePendente"
          :messages="lacrePendente ? 'Confira e informe o lacre registrado na entrega ou use Não bateu.' : undefined"
          data-teste="conferencia-lacre"
        />
        <!-- Decisao 5: no Caixa -> Cofre o valor contado e obrigatorio (0 e valido). Na generica
             ele continua opcional, e vazio significa "nao informei" — o payload omite o campo. -->
        <v-text-field
          v-model="campos.valorRecebido"
          type="number"
          min="0"
          :label="ehCaixaParaCofre ? 'Valor recebido (obrigatório)' : 'Valor recebido (opcional)'"
          :error="valorPendente"
          :messages="
            ehCaixaParaCofre
              ? 'Informe o valor contado. Zero é um valor válido.'
              : 'Deixe em branco se não for conferir o valor.'
          "
          data-teste="conferencia-valor"
        />
        <v-text-field
          v-if="modoRecusa"
          v-model="campos.motivo"
          label="Motivo da divergência (obrigatório)"
          :error="!motivoValido"
          data-teste="conferencia-motivo"
        />
        <!-- R-183 · o desfecho e uma ESCOLHA, e ela precisa estar aqui: sem encerrar, o caixa de
             onde o dinheiro saiu continua travado. -->
        <v-checkbox
          v-if="modoRecusa"
          v-model="encerrarDivergencia"
          density="compact"
          hide-details
          class="mb-1"
          data-teste="conferencia-encerrar"
          label="Encerrar a divergência agora (libera o fechamento do caixa)"
        />
        <v-checkbox
          v-if="modoRecusa && encerrarDivergencia && contadoAcimaDoDeclarado"
          v-model="sobraConfirmada"
          density="compact"
          hide-details
          class="mb-1"
          data-teste="conferencia-sobra"
          label="Confirmo que contei MAIS do que foi declarado"
        />
        <v-alert
          v-if="modoRecusa && !encerrarDivergencia"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-2"
        >
          A transferência continua <strong>pendente</strong> e o caixa segue travado. A divergência fica registrada e o
          operador e a Tesouraria são notificados.
        </v-alert>
        <v-alert v-if="modoRecusa && encerrarDivergencia" type="info" variant="tonal" density="compact" class="mb-2">
          O cofre recebe <strong>o valor contado</strong>. Se faltou, a diferença vira quebra no nome de quem entregou —
          e ela não tem volta. Se sobrou, o cofre recebe a mais e não há quebra.
        </v-alert>
        <v-alert v-if="erroConferencia" type="error" variant="tonal" density="compact">{{ erroConferencia }}</v-alert>
        <v-card-actions class="flex-wrap ga-2">
          <!-- "Nao bateu" so aparece onde a rota de recusa existe: na generica ela responde 404. -->
          <v-btn v-if="podeRecusar" variant="text" data-teste="conferencia-alternar" @click="alternarModoRecusa">
            {{ modoRecusa ? "Voltar a conferir" : "Não bateu" }}
          </v-btn>
          <v-spacer />
          <v-btn :disabled="salvandoConferencia" @click="fecharConferencia()">Fechar</v-btn>
          <v-btn
            :color="modoRecusa ? 'warning' : 'primary'"
            :disabled="
              valorPendente ||
              lacrePendente ||
              (modoRecusa && !motivoValido) ||
              sobraPendenteDeConsentimento ||
              salvandoConferencia
            "
            :loading="salvandoConferencia"
            data-teste="conferencia-enviar"
            @click="enviarConferencia"
          >
            {{ modoRecusa ? (encerrarDivergencia ? "Encerrar divergência" : "Registrar divergência") : "Confirmar" }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.tesouraria {
  display: grid;
  gap: 18px;
}

/* `--cat-transferencias-tinta` e nao `-strong`, e sao as QUATRO ocorrencias do arquivo, nao uma.
   O `-strong` NAO tem contraparte no tema escuro: o bloco `:root[data-theme="dark"]` redefine so
   `-soft` e `-tinta` de cada categoria. Medido, sobre o canvas:
     -strong #bb460a   claro 4,86  ·  escuro 3,54   <- reprovava no escuro
     -tinta            claro 7,05  ·  escuro 8,35
   Trocar so o `.tes-count` consertaria o numero e deixaria as outras tres divergindo dentro do
   mesmo arquivo, entao vao as quatro. O fallback `#9a3412` saiu junto: fallback de hex existe para
   quando o token pode faltar, e este nao pode — se faltar, o defeito e o token, e ele tem de
   aparecer.
   NAO foi criado `--cat-*-strong` no bloco escuro: isso e camada de token (69 §1.1), afeta as seis
   categorias de uma vez, e o guardiao ainda nao alcanca o `:root`. Fica registrado como divida de
   sistema no roteiro. */
.tes-count {
  display: inline-block;
  margin-left: 4px;
  font-weight: 700;
  color: var(--cat-transferencias-tinta);
}
.tes-nova {
  background: var(--cat-transferencias-base, #c2410c) !important;
  color: #fff !important;
  font-weight: 800;
  text-transform: none;
  letter-spacing: 0.2px;
  box-shadow: 0 6px 16px rgb(194 65 12 / 0.26) !important;
}

/* ---- Cards Saida/Entrada/Saldo ---- */
.tes-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.tes-card {
  display: flex;
  align-items: center;
  gap: 13px;
  background: var(--surface, #fff);
  border-radius: 14px;
  padding: 15px 17px;
  box-shadow:
    0 2px 1px -1px rgb(0 0 0 / 0.2),
    0 1px 1px 0 rgb(0 0 0 / 0.14),
    0 1px 3px 0 rgb(0 0 0 / 0.12);
}
.tes-cic {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--cat-transferencias-soft, #fff1e8);
  color: var(--cat-transferencias-base, #c2410c);
}
.tes-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.tes-lbl {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.2px;
  text-transform: uppercase;
  color: var(--shell-ink-soft, #64748b);
}
.tes-regra {
  text-transform: none;
  letter-spacing: 0;
  font-size: 9.5px;
  font-weight: 700;
  color: var(--cat-transferencias-tinta);
  background: var(--cat-transferencias-soft, #fff1e8);
  border-radius: 5px;
  padding: 1px 5px;
}
.tes-val {
  font-size: 21px;
  font-weight: 800;
  letter-spacing: -0.3px;
  font-variant-numeric: tabular-nums;
  color: var(--shell-ink, #1f2733);
}
.tes-val.neg {
  color: var(--negative, #dc2626);
}
.tes-val.pos {
  color: var(--positive, #16a34a);
}
.tes-val.pend {
  color: var(--shell-ink-soft, #94a3b8);
}

/* ---- Lista ---- */
.tes-list-card {
  overflow: hidden;
}
.tes-list {
  display: grid;
}
.tes-row {
  display: grid;
  grid-template-columns: 116px 84px minmax(0, 1fr) 70px 116px 116px 104px;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--line, #e4e8ef);
}
.tes-row:last-child {
  border-bottom: 0;
}
.tes-row-head {
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--shell-ink-soft, #64748b);
  background: color-mix(in srgb, var(--cat-transferencias-base, #c2410c) 5%, #fff);
}
.tes-status-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  padding: 3px 9px;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--shell-ink-soft, #64748b);
  background: #f1f5f9;
}
.tes-data {
  font-size: 13px;
  font-weight: 600;
  color: var(--shell-ink-soft, #64748b);
  white-space: nowrap;
}
.tes-desc {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 14px;
  font-weight: 600;
  color: var(--shell-ink, #1f2733);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tes-desc-ic {
  color: var(--cat-transferencias-base, #c2410c);
  flex: 0 0 auto;
}
.tes-lacre,
.tes-receb {
  font-size: 13px;
  font-weight: 700;
  color: var(--shell-ink-soft, #94a3b8);
}
.tes-valor {
  font-size: 14.5px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--cat-transferencias-tinta);
}
.tes-num {
  text-align: right;
}
.tes-acoes,
.tes-acoes-h {
  justify-self: end;
}

.tes-empty {
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 46px 16px;
  color: var(--shell-ink-soft, #64748b);
}
.tes-empty p {
  margin: 0;
  font-weight: 600;
}

.tes-pag {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid var(--line, #e4e8ef);
}

.tes-nota {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 0;
  color: var(--shell-ink-soft, #64748b);
  font-size: 12.5px;
  font-weight: 500;
}
.tes-nota code {
  font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
  font-size: 12px;
  background: var(--cat-transferencias-soft, #fff1e8);
  color: var(--cat-transferencias-tinta);
  border-radius: 5px;
  padding: 1px 5px;
}

/* ---- Responsivo (breakpoints do projeto) ---- */
@media (width <= 1024px) {
  .tes-row {
    grid-template-columns: 108px 76px minmax(0, 1fr) 104px 96px;
  }
  /* Lacre e recebimento ficam compactos para preservar a densidade. */
  .tes-row-head > :nth-child(4),
  .tes-row-head > :nth-child(6),
  .tes-lacre,
  .tes-receb {
    display: none;
  }
}
@media (width <= 768px) {
  .tes-cards {
    grid-template-columns: 1fr;
  }
  .tes-row {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      "desc valor"
      "meta acoes";
    row-gap: 4px;
  }
  .tes-row-head {
    display: none;
  }
  .tes-conf {
    grid-area: meta;
    display: inline-flex;
  }
  .tes-data {
    display: none;
  }
  .tes-desc {
    grid-area: desc;
  }
  .tes-valor {
    grid-area: valor;
    justify-self: end;
    text-align: right;
  }
  .tes-acoes {
    grid-area: acoes;
  }
}
@media (width <= 560px) {
  .tes-nova {
    width: 100%;
  }
}
</style>
