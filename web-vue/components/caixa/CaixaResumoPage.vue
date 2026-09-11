<script setup lang="ts">
import type { CaixaStatus, Opcao, ResumoCaixa } from "~/types/padaria";
import { dinheiro } from "~/utils/domain";
import { formatarDataHora } from "~/utils/formatacao";
import CaixaAutorizacoes from "~/components/caixa/CaixaAutorizacoes.vue";
import EntregasAguardandoConferencia from "~/components/caixa/EntregasAguardandoConferencia.vue";
import { motivoFechamentoTravado } from "~/utils/fechamento-travas";
import CampoDinheiro from "~/components/comum/CampoDinheiro.vue";

const props = defineProps<{
  resumo: ResumoCaixa | null;
  status: CaixaStatus | null;
  pdvs: Opcao[];
  turnos?: Opcao[];
  maquininhas?: Opcao[];
  empresaId: string;
  permissoes: string[];
  usuarioId: string;
  usuarioNome: string;
  salvando?: boolean;
}>();

const emit = defineEmits<{
  (
    event: "abrirCaixa",
    payload: {
      pdvId: string;
      usuarioCaixaId: string;
      turnoId?: string | null;
      maquininhaId?: string | null;
      lacreAbertura?: string | null;
      observacao: string | null;
    }
  ): void;
  (event: "executarPlanejamento", payload: { caixaId: string; planejamentoId: string }): void;
  // D5: lacre por movimento (opcional, R-026). D6: `lacreRetorno` e o do retorno final que o
  // proprio fechamento cria quando ainda ha sobra. B2: `idempotenciaChave` identifica a INTENCAO;
  // `aoConcluir` traz o desfecho de volta, porque `emit` nao devolve o retorno do handler.
  (
    event: "retornarSaldo",
    payload: {
      caixaId: string;
      valor: number;
      lacre: string | null;
      observacao: string | null;
      idempotenciaChave: string;
      aoConcluir: (sucesso: boolean) => void;
    }
  ): void;
  (event: "fecharCaixa", payload: { caixaId: string; observacao: string | null; lacreRetorno: string | null }): void;
  (event: "recarregar"): void;
}>();

const abertura = reactive({
  pdvId: "",
  turnoId: ""
});
// Campos auxiliares da abertura conforme a FOTO 5.
const aberturaExtra = reactive({ numeroLacre: "", maquininhaId: "" });
const fechamento = reactive({ observacao: "", lacreRetorno: "" });
// D1: o valor da entrega e digitavel. Vazio significa "a sobra inteira" — o padrao continua sendo
// devolver tudo, mas o operador pode enviar parte agora e o resto depois (varios movimentos).
// `observacao` e propria da entrega, separada da observacao do FECHAMENTO: sao dois atos, e
// misturar as duas fazia a nota do fechamento virar parte da intencao da entrega — qualquer
// correcao no texto do fechamento rodaria a chave de idempotencia e liberaria uma entrega dupla.
const entrega = reactive({ valor: "", lacre: "", observacao: "" });

// B2 · a chave de idempotencia da tela.
// Regra: uma chave por INTENCAO. Ela nasce no primeiro envio, sobrevive a erro e a cancelamento
// (o retry precisa da MESMA chave, senao o servidor trata como entrega nova e duplica o dinheiro),
// e so e trocada quando o ato termina bem ou quando o operador muda de fato o que quer entregar.
const chaveEntrega = ref("");
const intencaoDaChave = ref("");

// `crypto.randomUUID` exige contexto seguro. Em https e em localhost existe; num acesso por IP da
// rede da loja (http://192.168.x.x) o navegador nao o expoe, e sem o fallback a tela quebraria
// justamente onde ela roda todo dia.
function novoUuid(): string {
  const aleatorio = globalThis.crypto;
  if (typeof aleatorio?.randomUUID === "function") return aleatorio.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/gu, (caractere) => {
    const digito = Number(caractere);
    return (digito ^ (Math.floor(Math.random() * 256) & (15 >> (digito / 4)))).toString(16);
  });
}

// A "intencao" e o conjunto que o servidor compara para decidir entre retry e ato novo. Se ele
// mudar, a chave TEM de mudar — senao o servidor devolve 409 e o operador fica travado sem
// entender por que. Se nao mudar, a chave TEM de ficar — e o que impede a entrega dupla.
function chaveParaIntencao(assinatura: string): string {
  if (chaveEntrega.value && intencaoDaChave.value === assinatura) return chaveEntrega.value;
  chaveEntrega.value = novoUuid();
  intencaoDaChave.value = assinatura;
  return chaveEntrega.value;
}

function limparEntrega() {
  entrega.valor = "";
  entrega.lacre = "";
  entrega.observacao = "";
  chaveEntrega.value = "";
  intencaoDaChave.value = "";
}

const caixaAberto = computed(() => props.status?.caixaAberto ?? null);
const resumoAtual = computed(() => props.resumo ?? props.status?.resumo ?? null);
const saldoAtual = computed(() => Number(resumoAtual.value?.saldo ?? 0));
// D7: sobra e deficit sao situacoes DIFERENTES e precisam de tratamento visual diferente.
// A sobra nunca vira quebra positiva — ela volta ao cofre. O deficit vira quebra no nome do
// operador, e ele tem que saber disso ANTES de confirmar, nao por snackbar vermelho depois.
const temSobra = computed(() => saldoAtual.value > 0);
const temDeficit = computed(() => saldoAtual.value < 0);
const deficitAbsoluto = computed(() => Math.abs(saldoAtual.value));
// D7: observacao e obrigatoria quando ha quebra — a mesma regra do servidor, espelhada na tela
// para que o botao nao dispare um 400 previsivel.
const observacaoObrigatoriaPendente = computed(() => temDeficit.value && !fechamento.observacao.trim());

// G1/R-171 · a trava vem do MESMO retrato que trouxe o saldo, e nao de uma regra recalculada aqui:
// o servidor continua sendo a autoridade, a tela so mostra a recusa dele antes do clique.
const entregasPendentes = computed(() => props.status?.entregasPendentes ?? []);
const planejamentosPendentes = computed(() => props.status?.planejamentosPendentes ?? []);

// A trava ja existia na API desde a Fatia 1, mas o operador so a descobria clicando e levando 400.
// Uma computada, um motivo, e o botao para antes — sem uma segunda definicao da regra na tela.
const motivoTravado = computed(() => {
  if (planejamentosPendentes.value.length) return "há retorno/sangria planejado aguardando execução ou cancelamento";
  return motivoFechamentoTravado(
    entregasPendentes.value.length,
    entregasPendentes.value.filter((entrega) => entrega.valorContado !== null).length
  );
});
const fechamentoTravado = computed(() => motivoTravado.value !== null);
const blocoTravas = useTemplateRef<HTMLElement>("blocoTravas");
const maquininhasSelect = computed(() =>
  (props.maquininhas ?? []).map((item) => ({
    ...item,
    nome: `${item.apelido ?? item.nome} · ${item.numeroSerie ?? "sem série"}`
  }))
);

// Cockpit por categoria: a cor entra como ACENTO (barra/chip/total) via os tokens --cat-* da main,
// nunca como fundo de bloco. Os valores vem SEMPRE da API (nada recalculado no front). "Resultado"
// (saldo fisico) e o card-ancora. Sem card de deficit (fundo simples, PROJECT_BRAIN/12).
type CardCategoria = { chave: string; titulo: string; icone: string; valor: number; detalhe?: string };

const categorias = computed<CardCategoria[]>(() => {
  const r = resumoAtual.value;
  if (!r) return [];
  const entrada = r.totalTransferenciasEntrada ?? 0;
  const saida = r.totalTransferenciasSaida ?? 0;
  return [
    { chave: "entradas", titulo: "Entradas", icone: "mdi-arrow-down-bold-circle-outline", valor: r.totalEntradas },
    {
      chave: "transferencias",
      titulo: "Transferencias",
      icone: "mdi-bank-transfer",
      valor: r.totalTransferencias,
      detalhe: `entra ${dinheiro(entrada)} · sai ${dinheiro(saida)}`
    },
    { chave: "despesas", titulo: "Despesas", icone: "mdi-cash-minus", valor: r.totalDespesas },
    {
      chave: "mercadorias",
      titulo: "Mercadorias",
      icone: "mdi-package-variant-closed",
      valor: r.totalMercadorias ?? 0
    },
    { chave: "retiradas", titulo: "Retiradas", icone: "mdi-cash-remove", valor: r.totalRetiradas }
  ];
});

watch(
  () => props.pdvs,
  (pdvs) => {
    if (!abertura.pdvId && pdvs[0]?.id) abertura.pdvId = pdvs[0].id;
  },
  { immediate: true }
);

watch(
  caixaAberto,
  () => {
    if (!caixaAberto.value) {
      fechamento.observacao = "";
    }
  },
  { immediate: true }
);

function abrir() {
  emit("abrirCaixa", {
    pdvId: abertura.pdvId,
    usuarioCaixaId: props.usuarioId,
    turnoId: abertura.turnoId || null,
    maquininhaId: aberturaExtra.maquininhaId || null,
    lacreAbertura: aberturaExtra.numeroLacre || null,
    observacao: null
  });
}

// D1: entrega PARCIAL durante o turno. Sem valor digitado, envia a sobra inteira. O servidor
// recalcula o teto sob trava — o numero que a tela viu nunca e prova de nada.
const valorEntregaEfetivo = computed(() => {
  const digitado = Number(entrega.valor || 0);
  return digitado > 0 ? digitado : saldoAtual.value;
});
// D1 na TELA: o servidor continua sendo a autoridade (ele recalcula sob trava), mas deixar o
// operador disparar um valor que ja se sabe impossivel so gera 400 e desconfianca. Aqui o aviso
// e imediato e o botao nao dispara.
const entregaAcimaDoSaldo = computed(() => valorEntregaEfetivo.value > saldoAtual.value);
const entregaBloqueada = computed(
  () => Boolean(props.salvando) || valorEntregaEfetivo.value <= 0 || entregaAcimaDoSaldo.value
);

function retornarSaldo() {
  const caixa = caixaAberto.value;
  // Guarda de duplo clique: enquanto `salvando` estiver ligado o ato nao repete. O botao tambem
  // fica em loading/disabled, mas Enter no campo e clique rapido furam o visual.
  if (!caixa || entregaBloqueada.value) return;
  const valor = valorEntregaEfetivo.value;
  const lacre = entrega.lacre || null;
  const observacao = entrega.observacao || null;
  emit("retornarSaldo", {
    caixaId: caixa.id,
    valor,
    lacre,
    observacao,
    idempotenciaChave: chaveParaIntencao(`avulsa|${caixa.id}|${valor}|${lacre ?? ""}|${observacao ?? ""}`),
    // Limpa SO no sucesso confirmado. Em erro (ou confirmacao negada) valor, lacre, observacao e
    // a chave ficam de pe: o operador tenta de novo com um clique, e o retry carrega a MESMA
    // chave — que e o que impede a segunda entrega do mesmo envelope.
    aoConcluir: (sucesso: boolean) => {
      if (sucesso) limparEntrega();
    }
  });
}

// D6: um unico ato. Se ainda ha sobra, o servidor devolve o restante ao cofre dentro da MESMA
// transacao do fechamento; se o saldo ja e zero, apenas fecha. Nao existe segundo botao.
function fechar() {
  const caixa = caixaAberto.value;
  // Travado por entrega em transito: o botao continua focavel de proposito (`aria-disabled`, nao
  // `disabled`), porque botao morto nao entra na navegacao por teclado e o leitor de tela nunca
  // chega ao motivo. Clicar leva ao motivo, que e a unica coisa util a fazer aqui.
  if (fechamentoTravado.value) {
    blocoTravas.value?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  // Mesma guarda de duplo clique da entrega: fechar duas vezes nao pode nem chegar a sair da tela.
  if (!caixa || props.salvando || observacaoObrigatoriaPendente.value) return;
  emit("fecharCaixa", {
    caixaId: caixa.id,
    observacao: fechamento.observacao || null,
    lacreRetorno: fechamento.lacreRetorno || null
  });
}
</script>

<template>
  <v-card>
    <!-- Titulo removido: o nome da tela ja e o cabecalho da pagina (VIS-10). -->
    <v-card-text>
      <v-alert v-if="!pdvs.length" type="warning" variant="tonal" class="mb-4">
        Cadastre um PDV com conta vinculada antes de abrir caixa.
      </v-alert>

      <!-- Sem caixa aberto o autorizador ainda precisa da fila de autorizacoes: o proprio
           CaixaAutorizacoes decide o que mostrar (so o botao Autorizacoes, neste caso). -->
      <div v-if="!caixaAberto" class="mb-4">
        <CaixaAutorizacoes
          :empresa-id="empresaId"
          :caixa-aberto="null"
          :permissoes="permissoes"
          @alterado="emit('recarregar')"
        />
      </div>

      <!-- Abertura de Caixa fiel ao desenho do Rodrigo (FOTO 5): enxuta, 4 campos em 2x2. -->
      <template v-if="!caixaAberto">
        <v-row dense>
          <v-col cols="12" md="6">
            <v-select v-model="abertura.pdvId" :items="pdvs" item-title="nome" item-value="id" label="Ponto de Venda" />
          </v-col>
          <v-col cols="12" md="6">
            <v-select
              v-model="abertura.turnoId"
              :items="turnos ?? []"
              item-title="nome"
              item-value="id"
              label="Turno"
              clearable
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="aberturaExtra.numeroLacre"
              label="Transf. Entrada / N° Lacre"
              placeholder="Ex.: 001"
              hint="Lacre da transferencia de entrada."
              persistent-hint
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-select
              v-model="aberturaExtra.maquininhaId"
              :items="maquininhasSelect"
              item-title="nome"
              item-value="id"
              label="Maq. Cartão / N° Série"
              hint="Opcional"
              clearable
            />
          </v-col>
        </v-row>

        <!-- R-184: o operador nao escolhe o instante. A API registra o relogio do servidor no
             clique; mostrar um datetime editavel aqui criava duas verdades para a abertura. -->
        <v-row dense class="mt-2">
          <v-col cols="12" md="6">
            <v-text-field
              model-value="Registrada automaticamente ao abrir"
              label="Data e hora de abertura"
              prepend-inner-icon="mdi-clock-check-outline"
              readonly
              density="comfortable"
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field :model-value="usuarioNome" label="Usuário do caixa" readonly density="comfortable" />
          </v-col>
          <v-col cols="12">
            <v-btn
              color="primary"
              prepend-icon="mdi-cash-register"
              :loading="salvando"
              :disabled="!abertura.pdvId"
              @click="abrir"
            >
              Abrir caixa
            </v-btn>
          </v-col>
        </v-row>
      </template>

      <template v-else>
        <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-4">
          <v-alert type="success" variant="tonal" class="flex-grow-1 mb-0">
            Caixa aberto em {{ formatarDataHora(caixaAberto.dataHoraAbertura) }} no {{ caixaAberto.pdvNome }}.
            <span v-if="caixaAberto.maquininhaId">
              Maquininha: {{ caixaAberto.maquininhaApelido }} · {{ caixaAberto.maquininhaNumeroSerie }}.
            </span>
          </v-alert>
          <CaixaAutorizacoes
            :empresa-id="empresaId"
            :caixa-aberto="caixaAberto"
            :permissoes="permissoes"
            @alterado="emit('recarregar')"
          />
        </div>

        <!-- Cockpit por categoria: cor como acento (barra/chip/total), fundo do card neutro.
             Grid auto-responsivo (nunca aperta) — restyle da grade real, sem o cockpit pesado
             que foi revertido. Totais vindos da API; "Resultado" e o card-ancora. -->
        <div v-if="resumoAtual" class="cat-grid">
          <div v-for="cat in categorias" :key="cat.chave" class="cat-card" :class="`cat-${cat.chave}`">
            <span class="cat-bar" aria-hidden="true" />
            <div class="cat-body">
              <div class="cat-head">
                <span class="cat-chip"><v-icon :icon="cat.icone" size="18" /></span>
                <span class="cat-titulo">{{ cat.titulo }}</span>
              </div>
              <div class="cat-valor">{{ dinheiro(cat.valor) }}</div>
              <div v-if="cat.detalhe" class="cat-detalhe">{{ cat.detalhe }}</div>
            </div>
          </div>

          <div class="cat-card cat-resultado cat-card--ancora">
            <span class="cat-bar" aria-hidden="true" />
            <div class="cat-body">
              <div class="cat-head">
                <span class="cat-chip"><v-icon icon="mdi-cash-multiple" size="18" /></span>
                <span class="cat-titulo">Resultado no caixa</span>
              </div>
              <div class="cat-valor">{{ dinheiro(resumoAtual.saldo) }}</div>
              <div class="cat-detalhe">saldo fisico do turno</div>
            </div>
          </div>
        </div>

        <v-divider class="my-5" />

        <!-- D1/D6: a sobra nao bloqueia mais o fechamento. Ou o operador entrega parte agora, ou
           fecha e o servidor devolve o restante no mesmo ato. -->
        <v-alert v-if="temSobra" type="info" variant="tonal" class="my-5">
          Há {{ dinheiro(saldoAtual) }} em espécie no caixa. Você pode entregar parte agora ou fechar o caixa — ao
          fechar, o restante volta ao cofre automaticamente, no mesmo ato.
        </v-alert>

        <!-- D7: o deficit e o evento mais grave do modulo. O operador precisa saber ANTES de
           confirmar que vai ficar com uma quebra no nome dele — nao descobrir por snackbar. -->
        <v-alert v-if="temDeficit" type="error" variant="tonal" class="my-5" data-teste="alerta-quebra">
          <div class="text-subtitle-2 mb-1">Falta {{ dinheiro(deficitAbsoluto) }} no caixa</div>
          Ao fechar, será registrada uma <strong>quebra de caixa</strong> de {{ dinheiro(deficitAbsoluto) }}, atribuída
          a <strong>{{ caixaAberto?.usuarioCaixaNome ?? "o operador do caixa" }}</strong
          >, e a Tesouraria será notificada. A observação abaixo é obrigatória e será registrada junto com a quebra.
        </v-alert>

        <!-- G1/R-171 · o que ja saiu e ninguem conferiu: a unica coisa que trava o fechamento.
             R-179/Fatia 3: o bloco "Entregas solicitadas pela Tesouraria" saiu daqui junto com o
             painel que o alimentava. Executar uma ordem era um SEGUNDO caminho para o mesmo ato do
             botao de entregar abaixo — mesmo dinheiro, mesmas contas, outra porta. -->
        <div ref="blocoTravas" tabindex="-1">
          <v-alert
            v-if="planejamentosPendentes.length"
            type="warning"
            variant="tonal"
            class="mb-4"
            data-teste="planejamentos-retorno"
          >
            <div class="text-subtitle-2 mb-2">Retornos/Sangrias programados</div>
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
                @click="emit('executarPlanejamento', { caixaId: caixaAberto!.id, planejamentoId: planejamento.id })"
              >
                Executar agora
              </v-btn>
            </div>
            Execute cada linha quando o dinheiro sair da gaveta. Enquanto houver linha programada, o fechamento fica
            bloqueado.
          </v-alert>
          <EntregasAguardandoConferencia :entregas="entregasPendentes" />
        </div>

        <v-row dense>
          <v-col v-if="temSobra" cols="12" md="4">
            <label class="caixa-valor-entrega">
              <span class="caixa-valor-entrega__rotulo">Valor a entregar (vazio = tudo)</span>
              <CampoDinheiro
                v-model="entrega.valor"
                class="caixa-valor-entrega__input"
                :class="{ 'caixa-valor-entrega__input--erro': entregaAcimaDoSaldo }"
                :aria-invalid="entregaAcimaDoSaldo ? 'true' : undefined"
                :aria-describedby="entregaAcimaDoSaldo ? 'erro-valor-entrega' : undefined"
                data-teste="valor-entrega"
              />
              <span v-if="entregaAcimaDoSaldo" id="erro-valor-entrega" class="caixa-valor-entrega__erro">
                Máximo disponível: {{ dinheiro(saldoAtual) }}
              </span>
            </label>
          </v-col>
          <v-col v-if="temSobra" cols="12" md="4">
            <v-text-field v-model="entrega.lacre" label="N° do lacre (opcional)" data-teste="lacre-entrega" />
          </v-col>
          <v-col v-if="temSobra" cols="12" md="4">
            <v-btn
              color="warning"
              prepend-icon="mdi-bank-transfer-out"
              :disabled="entregaBloqueada"
              :loading="salvando"
              data-teste="botao-entregar"
              @click="retornarSaldo"
            >
              Entregar ao cofre
            </v-btn>
          </v-col>
          <v-col v-if="temSobra" cols="12">
            <v-text-field
              v-model="entrega.observacao"
              label="Observação da entrega (opcional)"
              data-teste="observacao-entrega"
            />
          </v-col>
          <v-col cols="12" md="8">
            <v-text-field
              v-model="fechamento.observacao"
              :label="temDeficit ? 'Observação da quebra (obrigatória)' : 'Observação do fechamento'"
              :error="observacaoObrigatoriaPendente"
              :messages="observacaoObrigatoriaPendente ? 'Explique a falta antes de fechar o caixa.' : ''"
              data-teste="observacao-fechamento"
            />
          </v-col>
          <v-col v-if="temSobra" cols="12" md="4">
            <v-text-field v-model="fechamento.lacreRetorno" label="Lacre do retorno final (opcional)" />
          </v-col>
          <v-col cols="12">
            <v-btn
              :color="temDeficit ? 'error' : 'primary'"
              prepend-icon="mdi-lock"
              :disabled="observacaoObrigatoriaPendente"
              :aria-disabled="fechamentoTravado ? 'true' : undefined"
              :class="{ 'botao-travado': fechamentoTravado }"
              :loading="salvando"
              :aria-describedby="fechamentoTravado ? 'motivo-fechamento-travado' : undefined"
              data-teste="botao-fechar"
              @click="fechar"
            >
              {{ temDeficit ? "Fechar com quebra" : "Fechar caixa" }}
            </v-btn>
            <p
              v-if="fechamentoTravado"
              id="motivo-fechamento-travado"
              class="text-caption mt-2 mb-0"
              data-teste="motivo-fechamento-travado"
            >
              Fechamento travado: {{ motivoTravado }}
            </p>
          </v-col>
        </v-row>
      </template>
    </v-card-text>
  </v-card>
</template>

<style scoped>
/* Travado, mas vivo: fica cinza e com cursor de recusa, e continua focavel — quem chega por
   teclado precisa poder alcancar o botao para descobrir por que ele nao fecha. */
.botao-travado {
  opacity: 0.55;
  cursor: not-allowed;
}

/* CampoDinheiro e um input nativo para preservar a digitacao monetaria brasileira. Aqui ele era
   usado sem a moldura que os outros formularios fornecem e, no tema escuro, sobrava apenas o
   placeholder `0,00`. O rotulo, a borda e o estado de erro pertencem a este formulario do Caixa. */
.caixa-valor-entrega {
  position: relative;
  display: block;
  width: 100%;
}

.caixa-valor-entrega__rotulo {
  position: absolute;
  z-index: 1;
  top: -7px;
  left: 12px;
  padding-inline: 4px;
  background: rgb(var(--v-theme-surface));
  color: rgba(var(--v-theme-on-surface), 0.78);
  font-size: 12px;
  font-weight: 500;
  line-height: 14px;
}

.caixa-valor-entrega__input {
  box-sizing: border-box;
  width: 100%;
  min-height: 56px;
  padding: 0 16px;
  border: 2px solid rgba(var(--v-theme-on-surface), 0.58);
  border-radius: 4px;
  outline: none;
  background: transparent;
  color: rgb(var(--v-theme-on-surface));
  font-size: 16px;
}

.caixa-valor-entrega__input:hover {
  border-color: rgba(var(--v-theme-on-surface), 0.72);
}

.caixa-valor-entrega__input:focus {
  border-width: 2px;
  border-color: rgb(var(--v-theme-primary));
}

.caixa-valor-entrega__input--erro {
  border-color: rgb(var(--v-theme-error));
}

.caixa-valor-entrega__erro {
  padding-inline: 16px;
  color: rgb(var(--v-theme-error));
  font-size: 12px;
}

/* Grade auto-responsiva: cada card tem largura minima confortavel e quebra sozinho — nunca aperta
   como no cockpit "fiel ao mockup" que foi revertido no contexto real. */
.cat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 12px;
}

/* Card NA COR da categoria (decisao do Jose, 04/08/2026 — antes era neutro de proposito, com a cor
   so na barra de 4px). Fundo em -soft, borda em -base e barra mais grossa: os cinco retangulos
   passam a ser reconheciveis de longe, que era o pedido.
   O valor usa -tinta e nao -base porque ele fica SOBRE o -soft; a base perderia contraste — e a
   tinta e a unica variante medida para os DOIS modos (auditoria de 04/08/2026). */
.cat-card {
  position: relative;
  display: flex;
  overflow: hidden;
  border: 1px solid var(--cat);
  border-radius: 14px;
  background: var(--cat-soft);
}

.cat-bar {
  flex: 0 0 6px;
  background: var(--cat);
}

.cat-body {
  min-width: 0;
  padding: 12px 14px;
}

.cat-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cat-chip {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  /* O chip agora fica SOBRE o fundo -soft: se ele tambem fosse -soft, sumiria. Cheio, com icone
     branco, ele volta a ser o ponto de leitura do card. */
  background: var(--cat-faixa);
  color: #fff;
}

.cat-titulo {
  overflow: hidden;
  color: var(--cat-tinta);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.3px;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.cat-valor {
  margin-top: 8px;
  color: var(--cat-tinta);
  font-size: 20px;
  font-weight: 800;
  line-height: 1.1;
}

.cat-detalhe {
  margin-top: 2px;
  color: var(--padaria-muted-foreground, #71717a);
  font-size: 11px;
  font-weight: 600;
}

/* Card-ancora (Resultado): ocupa a linha inteira, barra e valor mais fortes. Continua neutro no
   fundo — o destaque e por peso/tamanho/largura, nao por bloco colorido. */
.cat-card--ancora {
  grid-column: 1 / -1;
}

.cat-card--ancora .cat-bar {
  flex-basis: 6px;
}

.cat-card--ancora .cat-valor {
  font-size: 26px;
}

/* Token por categoria. Fixos da main.css.
   base = borda e barra · faixa = chip (icone branco por cima) · soft = fundo do card ·
   tinta = titulo e valor (TEXTO sobre o soft). O -strong saiu: ele foi escolhido por contraste
   sobre o soft CLARO e, com o soft escuro, virava escuro-sobre-escuro. */
.cat-entradas {
  --cat: var(--cat-entradas-base);
  --cat-soft: var(--cat-entradas-soft);
  --cat-tinta: var(--cat-entradas-tinta);
  --cat-faixa: var(--cat-entradas-faixa);
}
.cat-transferencias {
  --cat: var(--cat-transferencias-base);
  --cat-soft: var(--cat-transferencias-soft);
  --cat-tinta: var(--cat-transferencias-tinta);
  --cat-faixa: var(--cat-transferencias-faixa);
}
.cat-despesas {
  --cat: var(--cat-despesas-base);
  --cat-soft: var(--cat-despesas-soft);
  --cat-tinta: var(--cat-despesas-tinta);
  --cat-faixa: var(--cat-despesas-faixa);
}
.cat-mercadorias {
  --cat: var(--cat-mercadorias-base);
  --cat-soft: var(--cat-mercadorias-soft);
  --cat-tinta: var(--cat-mercadorias-tinta);
  --cat-faixa: var(--cat-mercadorias-faixa);
}
.cat-retiradas {
  --cat: var(--cat-retiradas-base);
  --cat-soft: var(--cat-retiradas-soft);
  --cat-tinta: var(--cat-retiradas-tinta);
  --cat-faixa: var(--cat-retiradas-faixa);
}
.cat-resultado {
  --cat: var(--cat-resultado-base);
  --cat-soft: var(--cat-resultado-soft);
  --cat-tinta: var(--cat-resultado-tinta);
  --cat-faixa: var(--cat-resultado-faixa);
}

/* Celular: as categorias empilham em 1 coluna (a barra de cor e o total continuam visiveis). No
   tablet o auto-fill/minmax ja mantem cards com largura confortavel (>=190px). */
@media (width <= 560px) {
  .cat-grid {
    grid-template-columns: 1fr;
  }
}
</style>
