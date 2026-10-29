<script setup lang="ts">
import CampoDinheiro from "~/components/comum/CampoDinheiro.vue";
import ConfirmacaoTransferenciaDialog from "~/components/operacoes/ConfirmacaoTransferenciaDialog.vue";
import { useTransferenciaFormulario } from "~/composables/useTransferenciaFormulario";
import { dinheiro } from "~/utils/domain";
const {
  operacaoEditandoId,
  form,
  opcoesEmpresa,
  salvandoOperacao,
  agendamento,
  multiploDestino,
  tempoConfirmacaoAberto,
  contasCandidatas,
  destinosSelecionados,
  erroDestino,
  totalSaida,
  campoFisico,
  campoMoedas,
  totalDigitado,
  erroComposicao,
  erroLacre,
  novoLacreRetorno,
  lacresRetornoAtivos,
  confirmacaoAberta,
  contaOrigemSelecionada,
  destinoSemPdv,
  preparandoMaloteParaCaixa,
  valorEspecieDeclarado,
  valorMoedasDeclarado,
  saldoOrigem,
  destinosConfirmacao,
  verificarLacreDisponivel,
  adicionarLacreRetorno,
  removerLacreRetorno,
  resumoVisivel,
  valorResumo,
  revisarTransferencia,
  confirmarTransferencia
} = useTransferenciaFormulario();
</script>

<template>
  <div class="tr-modal">
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

      <!-- Ordem do fluxo (pedido do Marco, 29/10): 1) de onde para onde, 2) quanto vai, 3) os lacres
           (abertura, fechamento, sangria). So a ordem e o rotulo mudaram: as regras sao as mesmas. -->
      <div class="tr-secao">1 · Origem e destino</div>
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
        <div class="tr-campo">
          <span class="tr-campo-lbl">Destino / Entrada</span>
          <select v-if="!multiploDestino" v-model="form.contaDestinoId" class="tr-input" aria-label="Destino / Entrada">
            <option value="">—</option>
            <option v-for="c in contasCandidatas" :key="c.id" :value="c.id">{{ c.nome }}</option>
          </select>
          <div v-else class="tr-destinos" role="group" aria-label="Destino / Entrada — contas candidatas">
            <label v-for="c in contasCandidatas" :key="c.id" class="tr-check tr-destino-item">
              <input v-model="destinosSelecionados" type="checkbox" :value="c.id" />
              <span>{{ c.nome }}</span>
            </label>
          </div>
          <span v-if="erroDestino" class="tr-erro" role="alert">{{ erroDestino }}</span>
        </div>
      </div>
      <div v-if="contaOrigemSelecionada && saldoOrigem !== null" class="tr-saldo-conta">
        <v-icon size="16" :icon="contaOrigemSelecionada.ehCofre ? 'mdi-safe-square-outline' : 'mdi-wallet-outline'" />
        <span
          >Disponível em {{ contaOrigemSelecionada.nome }}: <strong>{{ dinheiro(saldoOrigem) }}</strong></span
        >
      </div>
      <div v-if="destinoSemPdv" class="tr-aviso-malote" role="status">
        Esta conta não está vinculada a um PDV. Vincule-a a um PDV para informar composição do malote, lacres de
        retorno/sangria e lacre de fechamento.
      </div>

      <div class="tr-secao">2 · Valor transferido</div>
      <!-- So dinheiro fisico e moedas; o valor da transferencia e a soma (nao ha campo de total separado). -->
      <section class="tr-malote" aria-label="Valor transferido: dinheiro físico e moedas">
        <p>
          {{
            preparandoMaloteParaCaixa
              ? "Informe o dinheiro físico e as moedas que seguem para o caixa."
              : "Informe o dinheiro físico e as moedas transferidos."
          }}
          O total é a soma dos dois.
        </p>
        <div class="tr-dois">
          <CampoDinheiro v-model="campoFisico" label="Dinheiro físico" icone="mdi-cash" data-teste="malote-dinheiro" />
          <CampoDinheiro v-model="campoMoedas" label="Moedas" icone="mdi-circle-multiple" data-teste="malote-moedas" />
        </div>
        <span v-if="erroComposicao" class="tr-erro" role="alert">{{ erroComposicao }}</span>
        <div class="tr-total-malote" data-teste="malote-total">
          <span>Total da transferência</span>
          <strong>{{ dinheiro(totalDigitado) }}</strong>
        </div>
      </section>

      <div class="tr-secao">3 · Lacres</div>
      <label class="tr-campo tr-campo-lacre-principal">
        <span class="tr-campo-lbl"
          >{{ preparandoMaloteParaCaixa ? "Lacre do malote de abertura" : "Lacre do malote" }}
          <span class="tr-hint">(obrigatório)</span></span
        >
        <input
          v-model="form.nLacreDoc"
          required
          class="tr-input tr-input-lacre"
          placeholder="Ex.: 001"
          @blur="void verificarLacreDisponivel()"
        />
        <span v-if="erroLacre" class="tr-erro" role="alert">{{ erroLacre }}</span>
        <span class="tr-legenda">Identifica o malote que será entregue ao Caixa.</span>
      </label>

      <template v-if="preparandoMaloteParaCaixa">
        <label class="tr-campo tr-lacre-fechamento-planejado">
          <span class="tr-campo-lbl">Lacre do malote de fechamento <span class="tr-hint">(obrigatório)</span></span>
          <input
            v-model="form.lacreFechamentoPlanejado"
            class="tr-input"
            placeholder="Número do lacre enviado aberto"
            maxlength="100"
          />
          <span class="tr-legenda">
            Vai aberto dentro do malote principal. O operador verá este número ao abrir e deverá digitá-lo ao fechar o
            caixa.
          </span>
        </label>
        <div class="tr-lacres-sangria">
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
        </div>
      </template>

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
      <p class="tr-recebimento">
        Recebimento: <strong>{{ form.dataRecebimento || "aguardando confirmação do destinatário" }}</strong>
      </p>
    </div>

    <div class="tr-acoes">
      <button type="button" class="tr-salvar-nova" :disabled="salvandoOperacao" @click="revisarTransferencia(true)">
        Salvar e criar nova
      </button>
      <button type="button" class="tr-salvar" :disabled="salvandoOperacao" @click="revisarTransferencia(false)">
        Salvar
      </button>
    </div>
  </div>

  <ConfirmacaoTransferenciaDialog
    :aberto="confirmacaoAberta"
    :salvando="salvandoOperacao"
    :valor-total="totalSaida"
    :valor-especie="valorEspecieDeclarado"
    :valor-moedas="valorMoedasDeclarado"
    :lacre-malote="form.nLacreDoc"
    :lacres-retorno="form.lacresRetorno"
    :lacre-fechamento-planejado="form.lacreFechamentoPlanejado"
    :origem="contaOrigemSelecionada?.nome ?? 'Não informada'"
    :destinos="destinosConfirmacao"
    :agendada-para="form.agendadaPara"
    @editar="confirmacaoAberta = false"
    @confirmar="confirmarTransferencia"
  />
</template>

<style scoped src="./OperacaoTransferenciaModal.css"></style>
