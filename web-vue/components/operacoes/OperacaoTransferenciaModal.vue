<script setup lang="ts">
// Nova transferencia fiel ao mockup (docs/mockups/TODAS-AS-TELAS-mockup.html, tela 1): hero R$,
// Origem -> Destino, numero do lacre (o malote), descricao. REUSA o form e o salvarOperacao do
// contexto (a UI muda, a gravacao continua a mesma). So aparece para 'transferencia'.
import { useWorkspaceContext } from "~/components/workspace/workspace-context";

const { modalOperacaoAberto, entidadeNova, operacaoEditandoId, form, opcoesEmpresa, salvandoOperacao, salvarOperacao } =
  useWorkspaceContext();

const aberto = computed({
  get: () => modalOperacaoAberto.value && entidadeNova.value === "transferencia",
  set: (v: boolean) => {
    if (!v) modalOperacaoAberto.value = false;
  }
});

// Abas visuais (Suprimento/Sangria/Retorno). O tipo "de cofre" (sangria/retorno) vive no fluxo do
// caixa (M2); aqui e a transferencia manual. Deixado como seletor visual — a acao ainda e a mesma.
const abas = ["Suprimento", "Sangria", "Retorno"];
const aba = ref("Suprimento");

function dataISO(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
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
    <div class="tr-modal">
      <div class="tr-head">
        <span class="tr-ic"><v-icon size="19">mdi-swap-horizontal</v-icon></span>
        <span class="tr-titulo">{{ operacaoEditandoId ? "Editar transferência" : "Nova transferência" }}</span>
        <v-icon class="tr-x" size="19" @click="aberto = false">mdi-close</v-icon>
      </div>

      <div class="tr-abas">
        <button v-for="a in abas" :key="a" type="button" class="tr-aba" :class="{ ativa: aba === a }" @click="aba = a">
          {{ a }}
        </button>
      </div>

      <div class="tr-hero">
        <span class="tr-cifra">R$</span>
        <input v-model="form.valorOriginal" class="tr-valor" type="number" inputmode="decimal" placeholder="0,00" />
      </div>

      <div class="tr-datas">
        <button
          type="button"
          class="tr-pill"
          :class="{ ativo: form.dataReferencia === hojeISO }"
          @click="definirData(0)"
        >
          Hoje
        </button>
        <button
          type="button"
          class="tr-pill"
          :class="{ ativo: form.dataReferencia === ontemISO }"
          @click="definirData(-1)"
        >
          Ontem
        </button>
        <input v-model="form.dataReferencia" type="date" class="tr-data-outros" />
      </div>

      <div class="tr-rota">
        <label class="tr-campo">
          <span class="tr-campo-lbl">Origem</span>
          <select v-model="form.contaOrigemId" class="tr-input">
            <option value="">—</option>
            <option v-for="c in opcoesEmpresa.contas" :key="c.id" :value="c.id">{{ c.nome }}</option>
          </select>
        </label>
        <v-icon class="tr-seta" size="17">mdi-arrow-right</v-icon>
        <label class="tr-campo">
          <span class="tr-campo-lbl">Destino</span>
          <select v-model="form.contaDestinoId" class="tr-input">
            <option value="">—</option>
            <option v-for="c in opcoesEmpresa.contas" :key="c.id" :value="c.id">{{ c.nome }}</option>
          </select>
        </label>
      </div>

      <label class="tr-campo tr-lacre">
        <span class="tr-campo-lbl">Lacre (nº do malote)</span>
        <select v-model="form.maloteId" class="tr-input tr-input-lacre">
          <option value="">—</option>
          <option v-for="m in opcoesEmpresa.malotes" :key="m.id" :value="m.id">{{ m.numeroLacre }}</option>
        </select>
      </label>

      <label class="tr-campo">
        <span class="tr-campo-lbl">Descrição</span>
        <input v-model="form.descricao" class="tr-input" placeholder="Ex.: Suprimento CX1M — reforço de troco" />
      </label>

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
/* Mockup tela 1. Laranja = token de categoria "transferencias" do V1. */
.tr-modal {
  background: #fff;
  border: 0.5px solid #e4e8ef;
  border-radius: 16px;
  padding: 20px 22px;
}
.tr-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
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
.tr-abas {
  display: flex;
  gap: 6px;
  margin-bottom: 18px;
}
.tr-aba {
  flex: 1;
  border: 0.5px solid #e4e8ef;
  border-radius: 999px;
  padding: 7px 0;
  background: none;
  color: #64748b;
  font-size: 12px;
  cursor: pointer;
}
.tr-aba.ativa {
  border-color: transparent;
  background: var(--cat-transferencias-soft, #fff1e8);
  color: var(--cat-transferencias-base, #c2410c);
  font-weight: 500;
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
.tr-datas {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 14px;
}
.tr-pill {
  border: 0;
  background: none;
  padding: 6px 12px;
  border-radius: 999px;
  color: #64748b;
  font-size: 12px;
  cursor: pointer;
}
.tr-pill.ativo {
  background: #f4f6fa;
  border: 0.5px solid #cbd2dc;
  color: #1f2733;
}
.tr-data-outros {
  margin-left: auto;
  border: 0.5px solid #e4e8ef;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  color: #64748b;
}
.tr-rota {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-bottom: 12px;
}
.tr-rota .tr-campo {
  flex: 1;
}
.tr-seta {
  margin-bottom: 9px;
  color: var(--cat-transferencias-base, #c2410c);
}
.tr-campo {
  display: block;
  margin-bottom: 12px;
}
.tr-campo-lbl {
  display: block;
  margin-bottom: 3px;
  font-size: 11px;
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
.tr-acoes {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  margin-top: 8px;
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
</style>
