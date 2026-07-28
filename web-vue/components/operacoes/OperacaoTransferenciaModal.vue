<script setup lang="ts">
// Transferencia / Malote fiel ao desenho do Rodrigo (PROJECT_BRAIN/14, FOTO 1). VISUAL-FIRST:
// os campos que o backend JA suporta (valor, data lanc., origem, destino, descricao) salvam normal
// via salvarOperacao; os campos NOVOS (N Lacre/Doc do setor, agendamento + data, data de
// recebimento, multiplo destino, sempre confirmar, retorno/sangria) sao ESTADO LOCAL marcado
// data-pendente="regra" e NAO vao para a API — a persistencia vem na rodada de regras.
// Cor: token de categoria --cat-transferencias.
import { useWorkspaceContext } from "~/components/workspace/workspace-context";

const { modalOperacaoAberto, entidadeNova, operacaoEditandoId, form, opcoesEmpresa, salvandoOperacao, salvarOperacao } =
  useWorkspaceContext();

const aberto = computed({
  get: () => modalOperacaoAberto.value && entidadeNova.value === "transferencia",
  set: (v: boolean) => {
    if (!v) modalOperacaoAberto.value = false;
  }
});

// --- Campos SEM backend nesta rodada (data-pendente="regra"): estado LOCAL, nunca enviado. ---
// TODO(regras): N Lacre/Doc "do setor" digitado (tabela `lacres` da Fase A).
const lacreDoc = ref("");
// TODO(regras): agendamento da transferencia (+ data de agendamento).
const agendamento = ref(false);
const dataAgendamento = ref("");
// TODO(regras): data de recebimento — preenchida quando o destinatario CONFIRMA (fluxo 2 pontas).
const dataRecebimento = ref("");
// TODO(regras): multiplo destino (broadcast) e "sempre confirmar".
const multiploDestino = ref(false);
const sempreConfirmar = ref(false);
// TODO(regras): bloco Retorno/Sangria — linhas repetiveis com sinal (+/-), valor e lacre.
const retornoAberto = ref(false);
type LinhaRetorno = { sinal: "+" | "-"; valor: string; lacre: string };
const retornos = ref<LinhaRetorno[]>([{ sinal: "+", valor: "", lacre: "" }]);
function addRetorno() {
  retornos.value.push({ sinal: "+", valor: "", lacre: "" });
}
function removerRetorno(i: number) {
  if (retornos.value.length > 1) retornos.value.splice(i, 1);
}

// --- Resumo Saida/Entrada/Saldo: calculado no FRONT a partir dos campos visiveis (nao persistido). ---
const totalSaida = computed(() => Number(form.value.valorOriginal || 0));
const totalEntrada = computed(() =>
  retornos.value.reduce((soma, l) => soma + (l.sinal === "-" ? -1 : 1) * Number(l.valor || 0), 0)
);
const saldo = computed(() => totalEntrada.value - totalSaida.value);
function br(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
      <div class="tr-head">
        <span class="tr-ic"><v-icon size="19">mdi-swap-horizontal</v-icon></span>
        <span class="tr-titulo">{{ operacaoEditandoId ? "Editar transferência" : "Nova transferência" }}</span>
        <v-icon class="tr-x" size="19" @click="aberto = false">mdi-close</v-icon>
      </div>

      <!-- Bloco A · Transf. Saída -->
      <div class="tr-secao">Transf. Saída</div>

      <div class="tr-hero">
        <span class="tr-cifra">R$</span>
        <input v-model="form.valorOriginal" class="tr-valor" type="number" inputmode="decimal" placeholder="0,00" />
      </div>

      <div class="tr-dois">
        <label class="tr-campo">
          <span class="tr-campo-lbl">N° Lacre / Doc <span class="tr-hint">(do setor)</span></span>
          <input v-model="lacreDoc" data-pendente="regra" class="tr-input tr-input-lacre" placeholder="Ex.: 001" />
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
        <input v-model="agendamento" type="checkbox" data-pendente="regra" />
        <span>Agendamento</span>
      </label>
      <label v-if="agendamento" class="tr-campo tr-indent">
        <span class="tr-campo-lbl">Data Agendamento</span>
        <input v-model="dataAgendamento" type="datetime-local" data-pendente="regra" class="tr-input" />
      </label>

      <label class="tr-campo">
        <span class="tr-campo-lbl">Data Recebimento</span>
        <input :value="dataRecebimento" data-pendente="regra" class="tr-input tr-input-ro" readonly placeholder="—" />
        <span class="tr-legenda">Preenchido quando confirmado pelo destinatário.</span>
      </label>

      <!-- Sem contas vinculadas ao usuario (contas_usuarios): aviso claro no lugar de selects vazios. -->
      <div v-if="!opcoesEmpresa.contas.length" class="tr-aviso-contas" role="alert">
        <v-icon icon="mdi-alert-circle-outline" size="18" />
        <span>Nenhuma conta vinculada ao seu usuário — peça ao administrador.</span>
      </div>
      <div v-else class="tr-rota">
        <label class="tr-campo">
          <span class="tr-campo-lbl">Origem / Saída</span>
          <select v-model="form.contaOrigemId" class="tr-input">
            <option value="">—</option>
            <option v-for="c in opcoesEmpresa.contas" :key="c.id" :value="c.id">{{ c.nome }}</option>
          </select>
        </label>
        <v-icon class="tr-seta" size="17">mdi-arrow-right</v-icon>
        <label class="tr-campo">
          <span class="tr-campo-lbl">Destino / Entrada</span>
          <select v-model="form.contaDestinoId" class="tr-input">
            <option value="">—</option>
            <option v-for="c in opcoesEmpresa.contas" :key="c.id" :value="c.id">{{ c.nome }}</option>
          </select>
        </label>
      </div>

      <div class="tr-checks">
        <label class="tr-check">
          <input v-model="multiploDestino" type="checkbox" data-pendente="regra" /><span>Múltiplo Destino</span>
        </label>
        <label class="tr-check">
          <input v-model="sempreConfirmar" type="checkbox" data-pendente="regra" /><span>Sempre confirmar</span>
        </label>
        <label class="tr-check">
          <input v-model="retornoAberto" type="checkbox" data-pendente="regra" /><span>Transf. Retorno / Sangria</span>
        </label>
      </div>

      <!-- Bloco B · Transf. Entrada (Retorno / Sangria) — abre pela checkbox acima -->
      <div v-if="retornoAberto" class="tr-retorno" data-pendente="regra">
        <div class="tr-secao">Transf. Entrada (Retorno / Sangria)</div>
        <div v-for="(l, i) in retornos" :key="i" class="tr-retorno-linha">
          <button
            type="button"
            class="tr-sinal"
            :class="{ neg: l.sinal === '-' }"
            @click="l.sinal = l.sinal === '+' ? '-' : '+'"
          >
            {{ l.sinal }}
          </button>
          <input v-model="l.valor" type="number" class="tr-input tr-retorno-valor" placeholder="Valor R$" />
          <input v-model="l.lacre" class="tr-input" placeholder="N° Lacre / Doc" />
          <v-icon size="18" class="tr-item-del" @click="removerRetorno(i)">mdi-close</v-icon>
        </div>
        <button type="button" class="tr-add" @click="addRetorno">
          <v-icon size="15">mdi-plus</v-icon> Adicionar linha
        </button>
      </div>

      <!-- Descrição — obrigatória no backend; não está no desenho, fica discreta no rodapé. -->
      <label class="tr-campo">
        <span class="tr-campo-lbl">Descrição</span>
        <input v-model="form.descricao" class="tr-input" placeholder="Ex.: Suprimento CX1 — reforço de troco" />
      </label>

      <!-- Bloco C · Resumo (calculado no front) -->
      <div class="tr-resumo">
        <div class="tr-resumo-linha">
          <span>Saída (−)</span><b>R$ {{ br(totalSaida) }}</b>
        </div>
        <div class="tr-resumo-linha">
          <span>Entrada (+)</span><b>R$ {{ br(totalEntrada) }}</b>
        </div>
        <div class="tr-resumo-linha tr-resumo-saldo">
          <span>Saldo (±)</span><b>R$ {{ br(saldo) }}</b>
        </div>
      </div>

      <div class="tr-acoes">
        <button type="button" class="tr-salvar-nova" :disabled="salvandoOperacao" @click="salvarOperacao">
          Salvar e criar nova
        </button>
        <button type="button" class="tr-salvar" :disabled="salvandoOperacao" @click="salvarOperacao">Salvar</button>
      </div>
    </div>
  </v-dialog>
</template>

<style scoped>
/* FOTO 1 do Rodrigo. Laranja = token de categoria "transferencias". */
.tr-modal {
  background: #fff;
  border: 0.5px solid #e4e8ef;
  border-radius: 16px;
  padding: 20px 22px;
  /* Nunca ultrapassa a viewport: rola por dentro em qualquer largura (rodape fixo abaixo). Sem
     isto, com todas as secoes abertas o "Salvar" saía para fora da tela. */
  max-height: calc(100dvh - 48px);
  overflow-y: auto;
}
.tr-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.tr-ic {
  display: flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--cat-transferencias-soft, #fff1e8);
  color: var(--cat-transferencias-base, #c2410c);
}
.tr-titulo {
  flex: 1;
  font-size: 16px;
  font-weight: 500;
  color: #1f2733;
}
.tr-x {
  color: #94a3b8;
  cursor: pointer;
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
.tr-checks {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 6px 0 12px;
  padding: 10px 12px;
  border: 0.5px solid #e4e8ef;
  border-radius: 10px;
  background: #fbfcfe;
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
.tr-retorno {
  margin: 4px 0 12px;
  padding: 10px 12px;
  border: 0.5px solid var(--cat-transferencias-base, #c2410c);
  border-radius: 10px;
  background: var(--cat-transferencias-soft, #fff1e8);
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
.tr-resumo {
  margin: 6px 0 14px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f4f6fa;
}
.tr-resumo-linha {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: #64748b;
  padding: 2px 0;
}
.tr-resumo-saldo {
  margin-top: 4px;
  padding-top: 6px;
  border-top: 0.5px solid #e4e8ef;
  color: var(--cat-resultado-base, #6d28d9);
  font-weight: 700;
}
.tr-resumo-saldo b {
  color: var(--cat-resultado-base, #6d28d9);
}
.tr-acoes {
  position: sticky;
  bottom: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  /* margens negativas = rodape "full-bleed" ate as bordas do modal (padding 20/22). */
  margin: 12px -22px -20px;
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
  /* Linhas de Retorno/Sangria podem quebrar sem estourar a largura. */
  .tr-retorno-linha {
    flex-wrap: wrap;
  }
  .tr-retorno-valor {
    max-width: none;
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
