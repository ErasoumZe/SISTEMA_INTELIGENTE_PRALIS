<script setup lang="ts">
// Nova despesa fiel ao mockup (docs/mockups/TODAS-AS-TELAS-mockup.html, tela 3): estilo Mobills +
// esteira do ciclo de vida (Lancado -> Efetuado -> Pago -> Conferido). REUSA o form e o
// salvarOperacao do contexto (a UI muda, a gravacao continua a mesma). So aparece para 'despesa'.
import { useWorkspaceContext } from "~/components/workspace/workspace-context";

const {
  modalOperacaoAberto,
  entidadeNova,
  operacaoEditandoId,
  form,
  opcoesEmpresa,
  valorTotalOperacao,
  discriminandoDespesa,
  itensDespesa,
  salvandoOperacao,
  salvarOperacao
} = useWorkspaceContext();

const aberto = computed({
  get: () => modalOperacaoAberto.value && entidadeNova.value === "despesa",
  set: (v: boolean) => {
    if (!v) modalOperacaoAberto.value = false;
  }
});

const maisDetalhes = ref(false);

const CICLO = ["Lançado", "Efetuado", "Pago", "Conferido"];

function dataISO(offsetDias: number) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  return d.toISOString().slice(0, 10);
}
function definirData(offset: number) {
  form.value.dataReferencia = dataISO(offset);
}
const hojeISO = computed(() => dataISO(0));
const ontemISO = computed(() => dataISO(-1));
</script>

<template>
  <v-dialog v-model="aberto" max-width="440">
    <div class="op-modal op-despesa">
      <div class="op-head">
        <span class="op-ic"><v-icon size="19">mdi-receipt-text-outline</v-icon></span>
        <span class="op-titulo">{{ operacaoEditandoId ? "Editar despesa" : "Nova despesa" }}</span>
        <v-icon class="op-x" size="19" @click="aberto = false">mdi-close</v-icon>
      </div>

      <div class="op-hero">
        <span class="op-cifra">R$</span>
        <input v-model="form.valorOriginal" class="op-valor" type="number" inputmode="decimal" placeholder="0,00" />
      </div>
      <div class="op-hero-total">total {{ valorTotalOperacao ? `R$ ${valorTotalOperacao}` : "—" }}</div>

      <div class="op-ciclo">
        <span class="op-ciclo-lbl">Ciclo:</span>
        <template v-for="(etapa, i) in CICLO" :key="etapa">
          <span class="op-pill" :class="{ ativo: i === 0 }">{{ etapa }}</span>
          <v-icon v-if="i < CICLO.length - 1" size="13" class="op-ciclo-sep">mdi-chevron-right</v-icon>
        </template>
      </div>

      <div class="op-datas">
        <button
          type="button"
          class="op-pill op-pill-btn"
          :class="{ ativo: form.dataReferencia === hojeISO }"
          @click="definirData(0)"
        >
          Hoje
        </button>
        <button
          type="button"
          class="op-pill op-pill-btn"
          :class="{ ativo: form.dataReferencia === ontemISO }"
          @click="definirData(-1)"
        >
          Ontem
        </button>
        <input v-model="form.dataReferencia" type="date" class="op-data-outros" />
      </div>

      <label class="op-campo">
        <span class="op-campo-lbl">Descrição</span>
        <input v-model="form.descricao" class="op-input" placeholder="Ex.: Correios — telegrama funcionário" />
      </label>

      <div class="op-dois">
        <label class="op-campo">
          <span class="op-campo-lbl">Grupo</span>
          <select v-model="form.grupoDespesaId" class="op-input">
            <option value="">—</option>
            <option v-for="g in opcoesEmpresa.gruposDespesas" :key="g.id" :value="g.id">{{ g.nome }}</option>
          </select>
        </label>
        <label class="op-campo">
          <span class="op-campo-lbl">Conta</span>
          <select v-model="form.contaOrigemId" class="op-input">
            <option value="">—</option>
            <option v-for="c in opcoesEmpresa.contas" :key="c.id" :value="c.id">{{ c.nome }}</option>
          </select>
        </label>
      </div>

      <button type="button" class="op-linha" @click="discriminandoDespesa = !discriminandoDespesa">
        <v-icon size="17">mdi-format-list-bulleted</v-icon> Discriminar itens
        <span class="op-linha-flex"></span>
        <v-icon size="16">{{ discriminandoDespesa ? "mdi-chevron-down" : "mdi-chevron-right" }}</v-icon>
      </button>

      <div v-if="discriminandoDespesa" class="op-itens">
        <div v-for="(item, index) in itensDespesa" :key="`d-${index}`" class="op-item">
          <input v-model="item.descricao" class="op-input" placeholder="Descrição do item" />
          <input v-model="item.valor" type="number" class="op-input op-item-valor" placeholder="R$" />
          <v-icon size="18" class="op-item-del" @click="itensDespesa.length > 1 && itensDespesa.splice(index, 1)"
            >mdi-close</v-icon
          >
        </div>
        <button
          type="button"
          class="op-add"
          @click="itensDespesa.push({ descricao: '', valor: '', grupoDespesaId: '' })"
        >
          <v-icon size="15">mdi-plus</v-icon> Adicionar item
        </button>
      </div>

      <button type="button" class="op-linha op-linha-top" @click="maisDetalhes = !maisDetalhes">
        <v-icon size="17">mdi-dots-horizontal</v-icon> Mais detalhes
        <span class="op-linha-flex"></span>
        <v-icon size="16">{{ maisDetalhes ? "mdi-chevron-down" : "mdi-chevron-right" }}</v-icon>
      </button>
      <div v-if="maisDetalhes" class="op-mais">
        <label class="op-campo">
          <span class="op-campo-lbl">Observação</span>
          <input v-model="form.observacao" class="op-input" />
        </label>
        <div class="op-dois">
          <label class="op-campo">
            <span class="op-campo-lbl">Vencimento</span>
            <input v-model="form.dataVencimento" type="date" class="op-input" />
          </label>
          <label class="op-campo">
            <span class="op-campo-lbl">Pagamento</span>
            <input v-model="form.dataPagamento" type="date" class="op-input" />
          </label>
        </div>
      </div>

      <div class="op-acoes">
        <button type="button" class="op-salvar-nova" :disabled="salvandoOperacao" @click="salvarOperacao">
          Salvar e criar nova
        </button>
        <button type="button" class="op-salvar" :disabled="salvandoOperacao" @click="salvarOperacao">Salvar</button>
      </div>
    </div>
  </v-dialog>
</template>

<style scoped>
/* Mockup tela 3. Vermelho = token de categoria "despesas" do V1. */
.op-modal {
  background: #fff;
  border: 0.5px solid #e4e8ef;
  border-radius: 16px;
  padding: 20px 22px;
}
.op-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.op-ic {
  display: flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--cat-despesas-soft, #fdecea);
  color: var(--cat-despesas-base, #c0392b);
}
.op-titulo {
  flex: 1;
  font-size: 16px;
  font-weight: 500;
  color: #1f2733;
}
.op-x {
  color: #94a3b8;
  cursor: pointer;
}
.op-hero {
  display: flex;
  align-items: baseline;
  gap: 6px;
  border-bottom: 2px solid var(--cat-despesas-base, #c0392b);
  padding-bottom: 6px;
}
.op-cifra {
  font-size: 16px;
  color: var(--cat-despesas-base, #c0392b);
}
.op-valor {
  width: 100%;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--cat-despesas-base, #c0392b);
  font-size: 34px;
  font-weight: 500;
  letter-spacing: -0.5px;
}
.op-hero-total {
  margin: 4px 0 16px;
  font-size: 11px;
  color: #94a3b8;
}
.op-ciclo {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}
.op-ciclo-lbl {
  font-size: 12px;
  color: #64748b;
}
.op-ciclo-sep {
  color: #94a3b8;
}
.op-pill {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  color: #94a3b8;
}
.op-pill.ativo {
  background: #f4f6fa;
  border: 0.5px solid #cbd2dc;
  color: #1f2733;
}
.op-datas {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
}
.op-pill-btn {
  border: 0;
  background: none;
  cursor: pointer;
  font-size: 12px;
}
.op-data-outros {
  margin-left: auto;
  border: 0.5px solid #e4e8ef;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  color: #64748b;
}
.op-campo {
  display: block;
  margin-bottom: 10px;
}
.op-campo-lbl {
  display: block;
  margin-bottom: 3px;
  font-size: 11px;
  color: #94a3b8;
}
.op-input {
  width: 100%;
  border: 0.5px solid #e4e8ef;
  border-radius: 8px;
  padding: 9px 10px;
  font-size: 13px;
  color: #1f2733;
  background: #fff;
  outline: none;
}
.op-input:focus {
  border-color: var(--cat-despesas-base, #c0392b);
}
.op-dois {
  display: flex;
  gap: 8px;
}
.op-dois .op-campo {
  flex: 1;
}
.op-linha {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 0;
  border: 0;
  background: none;
  color: #64748b;
  font-size: 13px;
  cursor: pointer;
}
.op-linha-top {
  border-top: 0.5px solid #e4e8ef;
  margin-bottom: 6px;
}
.op-linha-flex {
  flex: 1;
}
.op-itens {
  margin-bottom: 8px;
}
.op-item {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.op-item-valor {
  max-width: 110px;
}
.op-item-del {
  color: #94a3b8;
  cursor: pointer;
}
.op-add {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0.5px solid #e4e8ef;
  border-radius: 8px;
  padding: 6px 12px;
  background: none;
  color: #64748b;
  font-size: 12px;
  cursor: pointer;
}
.op-mais {
  margin-bottom: 8px;
}
.op-acoes {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  margin-top: 8px;
}
.op-salvar-nova {
  border: 0;
  background: none;
  color: var(--cat-despesas-base, #c0392b);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.op-salvar {
  border: 0;
  border-radius: 8px;
  padding: 9px 22px;
  background: var(--cat-despesas-base, #c0392b);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.op-salvar:disabled,
.op-salvar-nova:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
