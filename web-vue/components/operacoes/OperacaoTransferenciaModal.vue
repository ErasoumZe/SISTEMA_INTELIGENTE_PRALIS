<script setup lang="ts">
// Transferencia / Malote fiel ao desenho do Rodrigo (PROJECT_BRAIN/14, FOTO 1).
// Cor: token de categoria --cat-transferencias.
import { computed, onMounted, ref, watch } from "vue";
import { paraCentavos } from "@padaria/shared";
import { useWorkspaceContext } from "~/components/workspace/workspace-context";
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
  podePlanejarRetorno
} = useWorkspaceContext();

const aberto = computed({
  get: () => modalOperacaoAberto.value && entidadeNova.value === "transferencia",
  set: (v: boolean) => {
    if (!v) modalOperacaoAberto.value = false;
  }
});

// Campos persistidos da transferencia e linhas independentes de Transferencia de retorno.
const agendamento = computed({
  get: () => Boolean(form.value.agendadaPara),
  set: (ativo: boolean) => {
    form.value.agendadaPara = ativo ? new Date(Date.now() + 3_600_000).toISOString().slice(0, 16) : "";
  }
});
// B5: `dataRecebimento` era estado morto — o template sempre leu `form.dataRecebimento`. Ele nunca
// chegava a payload nenhum e sobrevivia entre aberturas do modal. O planejamento atual e sempre
// reidratado do formulario ao abrir, evitando linhas residuais entre operacoes.
const multiploDestino = ref(false);
const tempoConfirmacaoAberto = ref(false);
const retornoAtivo = ref(false);
const erroPlanejamento = ref("");

// FOTO 1: o padrao da tela e "se ☑ abre esse campo" — as tres checkboxes ficam sempre visiveis e
// cada uma REVELA o seu campo. Ao abrir, elas espelham o que ja esta no formulario: sem isto uma
// transferencia em edicao apareceria com a caixa desmarcada e os candidatos guardados por baixo,
// invisiveis — e o primeiro clique na checkbox os apagaria.
watch(aberto, (estaAberto) => {
  if (!estaAberto) return;
  erroPlanejamento.value = "";
  retornoAtivo.value = form.value.retornosPlanejados.length > 0;
  multiploDestino.value = !retornoAtivo.value && form.value.contasDestinoIds.length > 0;
  tempoConfirmacaoAberto.value = !retornoAtivo.value && !multiploDestino.value && Boolean(form.value.tempoConfirmacao);
  if (retornoAtivo.value || multiploDestino.value) form.value.tempoConfirmacao = null;
});

// Desmarcar LIMPA: candidato fantasma nao pode viajar para o backend.
watch(multiploDestino, (ativo) => {
  if (!ativo) {
    form.value.contasDestinoIds = [];
    return;
  }
  retornoAtivo.value = false;
  form.value.retornosPlanejados = [];
  tempoConfirmacaoAberto.value = false;
  form.value.tempoConfirmacao = null;
});
// R-188: prazo e opcional e exclusivo da transferencia direta. Desmarcar limpa o prazo por
// completo; retorno e multiplo destino nunca carregam prazo escondido.
watch(tempoConfirmacaoAberto, (ativo) => {
  if (!ativo) {
    form.value.tempoConfirmacao = null;
    return;
  }
  multiploDestino.value = false;
  form.value.contasDestinoIds = [];
  retornoAtivo.value = false;
  form.value.retornosPlanejados = [];
  form.value.tempoConfirmacao ??= "1dia";
});

watch(retornoAtivo, (ativo) => {
  erroPlanejamento.value = "";
  if (!ativo) {
    form.value.retornosPlanejados = [];
    return;
  }
  // A programacao sai sempre da conta que recebe a abertura e volta obrigatoriamente para a conta
  // de origem da transferencia inicial (normalmente o Cofre).
  if (!form.value.retornosPlanejados.length) adicionarRetornoPlanejado();
  multiploDestino.value = false;
  form.value.contasDestinoIds = [];
  tempoConfirmacaoAberto.value = false;
  form.value.tempoConfirmacao = null;
  agendamento.value = false;
});

function adicionarRetornoPlanejado() {
  if (form.value.retornosPlanejados.length >= 20) return;
  form.value.retornosPlanejados.push({
    valor: "",
    nLacreDoc: ""
  });
}

function removerRetornoPlanejado(indice: number) {
  form.value.retornosPlanejados.splice(indice, 1);
  if (!form.value.retornosPlanejados.length) retornoAtivo.value = false;
}

function planejamentosValidos() {
  const planos = form.value.retornosPlanejados;
  if (!planos.length) return true;
  const lacres = new Set<string>();
  const totalPlanejadoCentavos = planos.reduce((total, plano) => total + paraCentavos(plano.valor), 0);
  if (planos.some((plano) => !plano.valor || paraCentavos(plano.valor) <= 0 || !plano.nLacreDoc.trim())) {
    erroPlanejamento.value = "Informe valor e lacre em cada transferencia de retorno.";
    return false;
  }
  for (const plano of planos) {
    const lacre = plano.nLacreDoc.trim().toLowerCase();
    if (lacre === form.value.nLacreDoc.trim().toLowerCase() || lacres.has(lacre)) {
      erroPlanejamento.value = "Cada transferência precisa de um lacre diferente.";
      return false;
    }
    lacres.add(lacre);
  }
  if (totalPlanejadoCentavos > paraCentavos(form.value.valorOriginal)) {
    erroPlanejamento.value = "O total programado não pode ser maior que a transferência inicial.";
    return false;
  }
  erroPlanejamento.value = "";
  return true;
}

// R-030: a origem nunca e candidata a receber o proprio envio.
const contasCandidatas = computed(() =>
  opcoesEmpresa.value.contas.filter((conta) => conta.id !== form.value.contaOrigemId)
);
const contasPdvAtivas = computed(
  () => new Set(opcoesEmpresa.value.pdvs.filter((pdv) => pdv.ativo !== false).map((pdv) => pdv.contaId))
);
const contaCofreId = computed(
  () => opcoesEmpresa.value.empresas.find((empresa) => empresa.id === empresaId.value)?.contaCofreId ?? ""
);
const rotaPlanejamentoElegivel = computed(
  () =>
    Boolean(contaCofreId.value) &&
    form.value.contaOrigemId === contaCofreId.value &&
    contasPdvAtivas.value.has(form.value.contaDestinoId) &&
    !multiploDestino.value &&
    !tempoConfirmacaoAberto.value
);

watch(rotaPlanejamentoElegivel, (elegivel) => {
  if (!elegivel && retornoAtivo.value) retornoAtivo.value = false;
});

// Com Multiplo Destino a escolha acontece no PROPRIO campo Destino. As duas colunas do formulario
// viram uma so lista aqui: `contaDestinoId` e NOT NULL no banco (app.schema.ts) e serve apenas de
// ANCORA de armazenamento — o backend faz `[...new Set([contaDestinoId, ...contasDestinoIds])]` e
// grava TODAS em transferencias_destinos_candidatos. Pela R-030 nenhuma tem privilegio sobre a
// outra: desmarcar a ancora simplesmente promove a proxima.
const destinosSelecionados = computed<string[]>({
  get: () => {
    const ancora = form.value.contaDestinoId;
    const demais = form.value.contasDestinoIds;
    return ancora ? [ancora, ...demais.filter((id) => id !== ancora)] : [...demais];
  },
  set: (ids) => {
    const unicos = [...new Set(ids)];
    form.value.contaDestinoId = unicos[0] ?? "";
    form.value.contasDestinoIds = unicos.slice(1);
  }
});

// Trocar a ORIGEM para uma conta que estava marcada tira ela da lista E da selecao. Sem isto o
// insert morre no CHECK `conta_origem_id <> conta_destino_id` com erro cru do banco.
watch(
  () => form.value.contaOrigemId,
  (origem) => {
    if (origem && destinosSelecionados.value.includes(origem)) {
      destinosSelecionados.value = destinosSelecionados.value.filter((id) => id !== origem);
    }
  }
);

const erroDestino = ref("");
watch(destinosSelecionados, (ids) => {
  if (ids.length) erroDestino.value = "";
});
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

// `contaDestinoId` vazio passaria batido aqui e estouraria no backend com erro cru. Barra antes,
// no campo, dizendo o que fazer.
function destinoValido() {
  if (form.value.contaDestinoId) {
    erroDestino.value = "";
    return true;
  }
  erroDestino.value = multiploDestino.value
    ? "Selecione ao menos uma conta de destino."
    : "Escolha a conta de destino.";
  return false;
}

// R-185/R-187: este modal declara os retornos planejados junto da transferencia inicial. As linhas
// nascem `agendada` e sem efeito no saldo. O ato fisico continua tendo um unico caminho: depois de
// abrir o Caixa pelo lacre inicial, o operador executa cada retorno dentro da tela do Caixa.
async function salvarTransferenciaCompleta() {
  if (!destinoValido() || !planejamentosValidos()) return;
  await salvarOperacao();
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
            :disabled="retornoAtivo || Boolean(operacaoEditandoId)"
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
              <option v-for="c in opcoesEmpresa.contas" :key="c.id" :value="c.id">{{ c.nome }}</option>
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
          <label class="tr-check">
            <input v-model="multiploDestino" type="checkbox" :disabled="retornoAtivo || tempoConfirmacaoAberto" />
            <span>Múltiplo Destino</span>
          </label>
          <!-- A escolha das contas acontece no proprio campo "Destino / Entrada" (acima), como no
             desenho: as checkboxes ficam AO LADO de Destino, e esta caixa nao aninha nada. -->

          <!-- R-035: e o "tempo de confirmacao". "Sempre confirmar" foi erro de transcricao da
             FOTO 1, ja retificado no PROJECT_BRAIN/14 — nao voltar com aquele rotulo. -->
          <label class="tr-check">
            <input
              v-model="tempoConfirmacaoAberto"
              type="checkbox"
              :disabled="retornoAtivo || multiploDestino || Boolean(operacaoEditandoId)"
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
          <label v-if="!operacaoEditandoId && podePlanejarRetorno" class="tr-check">
            <input
              v-model="retornoAtivo"
              type="checkbox"
              :disabled="!rotaPlanejamentoElegivel || multiploDestino || tempoConfirmacaoAberto"
              data-teste="opcao-transferencia-retorno"
            />
            <span>Transferência de retorno</span>
          </label>
          <p
            v-if="!operacaoEditandoId && podePlanejarRetorno && !rotaPlanejamentoElegivel"
            class="tr-planejamento-ajuda"
          >
            {{
              multiploDestino || tempoConfirmacaoAberto
                ? "Desative Múltiplo Destino ou Tempo de confirmação para preparar o retorno."
                : "Selecione Cofre como origem e uma conta de PDV ativa como destino para preparar o retorno."
            }}
          </p>
          <section
            v-if="retornoAtivo"
            class="tr-planejamento"
            aria-label="Transferências de retorno programadas"
            data-teste="transferencias-retorno-programadas"
          >
            <p class="tr-planejamento-ajuda">
              As linhas ficam preparadas para o Caixa e não alteram saldo até a execução.
            </p>
            <div v-for="(retorno, indice) in form.retornosPlanejados" :key="indice" class="tr-planejamento-linha">
              <label class="tr-campo">
                <span class="tr-campo-lbl">Valor</span>
                <CampoDinheiro v-model="retorno.valor" class="tr-input" />
              </label>
              <label class="tr-campo">
                <span class="tr-campo-lbl">Lacre</span>
                <input v-model="retorno.nLacreDoc" class="tr-input" placeholder="Ex.: 002" />
              </label>
              <button
                type="button"
                class="tr-remover-retorno"
                :aria-label="`Remover transferência de retorno ${indice + 1}`"
                @click="removerRetornoPlanejado(indice)"
              >
                <v-icon size="16">mdi-close</v-icon>
              </button>
            </div>
            <span v-if="erroPlanejamento" class="tr-erro" role="alert">{{ erroPlanejamento }}</span>
            <button
              type="button"
              class="tr-adicionar-retorno"
              :disabled="form.retornosPlanejados.length >= 20"
              @click="adicionarRetornoPlanejado"
            >
              <v-icon size="16">mdi-plus</v-icon> Adicionar transferência de retorno
            </button>
          </section>
        </div>

        <!-- R-127: o texto do movimento e a OBSERVACAO. Nao esta no desenho, fica discreta no rodape. -->
        <label class="tr-campo">
          <span class="tr-campo-lbl">Observação</span>
          <input v-model="form.observacao" class="tr-input" placeholder="Ex.: Suprimento CX1 — reforço de troco" />
        </label>
      </div>

      <div class="tr-acoes">
        <button type="button" class="tr-salvar-nova" :disabled="salvandoOperacao" @click="salvarTransferenciaCompleta">
          Salvar e criar nova
        </button>
        <button type="button" class="tr-salvar" :disabled="salvandoOperacao" @click="salvarTransferenciaCompleta">
          Salvar
        </button>
      </div>
    </div>
  </v-dialog>
</template>

<style scoped>
/* FOTO 1 do Rodrigo. Laranja = token de categoria "transferencias". */
.tr-modal {
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 0.5px solid #e4e8ef;
  border-radius: 16px;
  /* Nunca ultrapassa a viewport: quem rola e o .tr-corpo. */
  max-height: calc(100dvh - 48px);
  overflow: hidden;
}
.tr-corpo {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 0 22px var(--cx-sp-4);
}
/* Usa --cat-transferencias-faixa (nao -base): o texto por cima e BRANCO e a base da 3,56:1, que
   reprova. A faixa e a variante medida para 4,5:1. Ver web-vue/utils/cores-categoria.ts. */
.tr-faixa {
  flex: 0 0 auto;
  margin-bottom: 16px;
  padding: var(--cx-sp-4) var(--cx-sp-5);
  background: var(--cat-transferencias-faixa, #cc4d0a);
  border-radius: 16px 16px 0 0;
}
.tr-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.tr-ic {
  display: flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgb(255 255 255 / 20%);
  color: #fff;
}
.tr-titulo {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}
.tr-x {
  color: #fff;
  cursor: pointer;
  border-radius: var(--cx-r-sm);
  transition: background var(--cx-dur-1) var(--cx-ease);
}
.tr-x:hover {
  background: rgb(255 255 255 / 22%);
}
.tr-secao {
  margin: 6px 0 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--cat-transferencias-base, #c2410c);
}
.tr-hero {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 14px;
  border-bottom: 2px solid var(--cat-transferencias-base, #c2410c);
  padding-bottom: 6px;
}
.tr-cifra {
  font-size: 16px;
  color: var(--cat-transferencias-base, #c2410c);
}
.tr-valor {
  width: 100%;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--cat-transferencias-base, #c2410c);
  font-size: 34px;
  font-weight: 500;
  letter-spacing: -0.5px;
}
.tr-dois {
  display: flex;
  gap: 10px;
}
.tr-dois .tr-campo {
  flex: 1;
}
.tr-campo {
  display: block;
  margin-bottom: 12px;
}
.tr-indent {
  margin-left: 22px;
}
.tr-campo-lbl {
  display: block;
  margin-bottom: 3px;
  font-size: 11px;
  color: #94a3b8;
}
.tr-hint {
  color: #cbd2dc;
}
.tr-legenda {
  display: block;
  margin-top: 3px;
  font-size: 10px;
  font-style: italic;
  color: #94a3b8;
}
.tr-input {
  width: 100%;
  border: 0.5px solid #e4e8ef;
  border-radius: 8px;
  padding: 9px 10px;
  font-size: 13px;
  color: #1f2733;
  background: #fff;
  outline: none;
}
.tr-input:focus {
  border-color: var(--cat-transferencias-base, #c2410c);
}
.tr-input-lacre {
  border-color: var(--cat-transferencias-base, #c2410c);
  font-weight: 500;
}
.tr-input-ro {
  background: #f4f6fa;
  color: #94a3b8;
}
.tr-data-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.tr-data-input {
  flex: 1;
}
.tr-pill {
  border: 0.5px solid #cbd2dc;
  background: none;
  padding: 8px 12px;
  border-radius: 999px;
  color: #64748b;
  font-size: 12px;
  cursor: pointer;
}
.tr-pill.ativo {
  background: var(--cat-transferencias-soft, #fff1e8);
  border-color: transparent;
  color: var(--cat-transferencias-base, #c2410c);
}
.tr-check {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  color: #1f2733;
  cursor: pointer;
}
.tr-check input {
  width: 16px;
  height: 16px;
  accent-color: var(--cat-transferencias-base, #c2410c);
}
.tr-aviso-contas {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  padding: 12px 14px;
  border: 1px solid #fcd9a8;
  border-radius: 10px;
  background: #fff8ec;
  color: #92600a;
  font-size: 13px;
  font-weight: 600;
}
.tr-rota {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-bottom: 8px;
}
.tr-rota .tr-campo {
  flex: 1;
}
.tr-seta {
  margin-bottom: 9px;
  color: var(--cat-transferencias-base, #c2410c);
}
/* Com a lista de destinos, a linha cresce para baixo: ancora tudo no TOPO e desce a seta ate a
   altura do primeiro campo, senao Origem e seta ficariam boiando no rodape da lista. */
.tr-rota-lista {
  align-items: flex-start;
}
.tr-rota-lista .tr-campo {
  margin-bottom: 0;
}
.tr-rota-lista .tr-seta {
  margin-top: 26px;
  margin-bottom: 0;
}
.tr-retorno-linha {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.tr-sinal {
  flex: 0 0 30px;
  height: 32px;
  border: 0.5px solid #cbd2dc;
  border-radius: 8px;
  background: #fff;
  color: #15803d;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
}
.tr-sinal.neg {
  color: var(--cat-despesas-base, #c0392b);
}
.tr-retorno-valor {
  max-width: 120px;
}
.tr-item-del {
  color: #94a3b8;
  cursor: pointer;
}
.tr-add {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  border: 0.5px solid #e4e8ef;
  border-radius: 8px;
  padding: 6px 12px;
  background: #fff;
  color: #64748b;
  font-size: 12px;
  cursor: pointer;
}
/* Resumo em 3 mini cards, no topo. Saldo e o card de destaque: e o numero que decide. */
.tr-cards {
  display: flex;
  align-items: stretch;
  gap: 8px;
  margin-bottom: 14px;
}
.tr-card {
  /* flex igual + min-width 0: a largura vem do flex, nao do texto. Alternar o olho nao mexe no
     layout — nada pula. */
  flex: 1 1 0;
  min-width: 0;
  padding: 8px 10px;
  border: 0.5px solid #e4e8ef;
  border-radius: 10px;
  background: #f4f6fa;
}
.tr-card-lbl {
  display: block;
  font-size: 10px;
  color: #94a3b8;
  white-space: nowrap;
}
.tr-card-val {
  display: block;
  margin-top: 2px;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  color: #1f2733;
  /* Numero longo encolhe a fonte em vez de quebrar no meio. */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tr-card-saldo {
  border-color: var(--cat-transferencias-base, #c2410c);
  background: var(--cat-transferencias-soft, #fff1e8);
}
.tr-card-saldo .tr-card-val {
  color: var(--cat-transferencias-base, #c2410c);
}
.tr-olho {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 32px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: #94a3b8;
  cursor: pointer;
}
.tr-olho:hover {
  color: var(--cat-transferencias-base, #c2410c);
}
/* Lista de contas candidatas — ocupa o lugar do select de Destino. Rola a partir de ~4 contas em
   vez de esticar o modal. */
.tr-destinos {
  max-height: 132px;
  overflow-y: auto;
  padding: 8px 10px;
  border: 0.5px solid #e4e8ef;
  border-radius: 8px;
  background: #fff;
}
.tr-destino-item:last-child {
  margin-bottom: 0;
}
.tr-erro {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--cat-despesas-base, #c0392b);
}
.tr-acoes {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  padding: 12px 22px;
  background: #fff;
  border-top: 0.5px solid #e4e8ef;
}
.tr-salvar-nova {
  border: 0;
  background: none;
  color: var(--cat-transferencias-base, #c2410c);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.tr-salvar {
  border: 0;
  border-radius: 8px;
  padding: 9px 22px;
  background: var(--cat-transferencias-base, #c2410c);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.tr-salvar:disabled,
.tr-salvar-nova:disabled {
  opacity: 0.6;
  cursor: default;
}
.tr-planejamento {
  margin: 4px 0 12px 22px;
  padding: 10px;
  border: 1px solid #fed7aa;
  border-radius: 8px;
  background: #fff7ed;
}
.tr-planejamento-ajuda {
  margin: 0 0 9px;
  color: #9a3412;
  font-size: 11px;
}
.tr-planejamento-linha {
  display: grid;
  grid-template-columns: minmax(84px, 1fr) minmax(84px, 1fr) 28px;
  gap: 7px;
  align-items: end;
}
.tr-planejamento-linha .tr-campo {
  margin-bottom: 8px;
}
.tr-remover-retorno,
.tr-adicionar-retorno {
  border: 0;
  background: transparent;
  color: var(--cat-transferencias-base, #c2410c);
  cursor: pointer;
}
.tr-remover-retorno {
  height: 34px;
}
.tr-adicionar-retorno {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  font-weight: 600;
}

/* --- Responsividade (560) — so layout. Campos EMPILHAM, o Resumo continua visivel. --- */
@media (width <= 560px) {
  /* N Lacre/Doc + Data Lanç empilham. */
  .tr-dois {
    flex-direction: column;
    gap: 0;
  }
  /* Origem -> Destino empilham; a seta vira vertical (aponta para baixo). */
  .tr-rota {
    flex-direction: column;
    align-items: stretch;
    gap: 2px;
  }
  .tr-seta {
    margin: 2px auto;
    transform: rotate(90deg);
  }
  /* Empilhado, a seta volta a ficar entre os dois campos (nao ha mais coluna a alinhar). */
  .tr-rota-lista .tr-seta {
    margin: 2px auto;
  }
  .tr-rota-lista .tr-campo {
    margin-bottom: 8px;
  }
  /* Os 3 cards QUEBRAM em vez de espremer o numero: a base cabe "R$ 1.234.567,00" inteiro, entao
     o que nao couber lado a lado desce para a linha seguinte. Cortar o saldo com reticencias seria
     esconder justamente o numero que decide. */
  .tr-cards {
    flex-wrap: wrap;
  }
  .tr-card {
    flex: 1 1 132px;
  }
  /* O olho sobe para a propria linha, encostado a direita — assim nunca sobra sozinho embaixo. */
  .tr-olho {
    order: -1;
    width: 100%;
    height: 22px;
    justify-content: flex-end;
  }
  /* Linhas de Transferencia de retorno podem quebrar sem estourar a largura. */
  .tr-retorno-linha {
    flex-wrap: wrap;
  }
  .tr-retorno-valor {
    max-width: none;
  }
  .tr-planejamento-linha {
    grid-template-columns: 1fr 1fr 28px;
  }
  /* Modal fullscreen (casca 100dvh via main.css). O rodape fixo ja vem da regra base; aqui so
     ampliamos a altura e respeitamos a safe-area do iOS. */
  .tr-modal {
    max-height: 100dvh;
    height: 100dvh;
    border-radius: 0;
  }
  .tr-acoes {
    padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  }
}
</style>
