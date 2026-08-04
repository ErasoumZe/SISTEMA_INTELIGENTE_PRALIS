<script setup lang="ts">
// Bloco Classificação: Tipo de credor · Credor · Grupo · Conta · Descrição. Grupo/Conta/Descrição nao estao no desenho enxuto,
// mas o backend precisa deles para salvar. Estado vem do modal via provide/inject.
import { useOperacaoLancamentoBloco } from "~/components/operacoes/useOperacaoLancamento";

const {
  cat,
  credoresOferecidos,
  escolherTipoCredor,
  rotuloCredor,
  tipoCredor,
  credorId,
  credorOpcoes,
  grupoId,
  grupoOpcoes,
  opcoesEmpresa,
  form,
  contaTravadaDoCaixa,
  contaTravadaDoCaixaNome
} = useOperacaoLancamentoBloco();
</script>

<template>
  <!-- Linha 3: Tipo de credor → Credor -->
  <div class="lc-campo-lbl lc-mt">Tipo de credor</div>
  <div class="lc-credor-tipos">
    <button
      v-for="t in credoresOferecidos"
      :key="t"
      type="button"
      class="lc-chip"
      :class="{ ativo: tipoCredor === t }"
      @click="escolherTipoCredor(t)"
    >
      {{ rotuloCredor[t] }}
    </button>
  </div>
  <label class="lc-campo">
    <span class="lc-campo-lbl">Credor</span>
    <select v-model="credorId" class="lc-input">
      <option value="">—</option>
      <option v-for="o in credorOpcoes" :key="o.id" :value="o.id">{{ o.nome }}</option>
    </select>
  </label>

  <!-- Conta (nao esta no desenho, mas o backend precisa para salvar).
       O GRUPO saiu daqui em despesa e mercadoria (decisao do Jose, 04/08/2026): nessas duas o grupo
       e do ITEM e vive na discriminacao, onde vem preenchido do cadastro. Continua no cabecalho da
       RETIRADA, que nao discrimina (R-050) e portanto nao tem outro lugar para ele. -->
  <div class="lc-dois">
    <label v-if="cat === 'retirada'" class="lc-campo">
      <span class="lc-campo-lbl">Grupo</span>
      <select v-model="grupoId" class="lc-input">
        <option value="">—</option>
        <option v-for="g in grupoOpcoes" :key="g.id" :value="g.id">{{ g.nome }}</option>
      </select>
    </label>
    <label class="lc-campo">
      <span class="lc-campo-lbl">Conta</span>
      <!-- Sem contas vinculadas (contas_usuarios): aviso no lugar de um select vazio. -->
      <div v-if="!opcoesEmpresa.contas.length" class="lc-aviso-contas" role="alert">
        <v-icon icon="mdi-alert-circle-outline" size="16" />
        <span>Nenhuma conta vinculada ao seu usuário — peça ao administrador.</span>
      </div>
      <!-- R-121: operador de caixa nao ESCOLHE a conta — a saida sai da conta do caixa aberto.
           Campo de leitura, e nao um <select> desabilitado, porque a conta do PDV pode nao estar
           entre as contas vinculadas ao operador: como <option> ela nao existiria e o campo
           apareceria cinza e VAZIO. O valor persistido vive em form.contaOrigemId. -->
      <template v-else-if="contaTravadaDoCaixa">
        <input :value="contaTravadaDoCaixaNome" class="lc-input" readonly aria-label="Conta" />
        <span class="lc-campo-nota">Saída do caixa aberto</span>
      </template>
      <select v-else v-model="form.contaOrigemId" class="lc-input">
        <option value="">—</option>
        <option v-for="c in opcoesEmpresa.contas" :key="c.id" :value="c.id">{{ c.nome }}</option>
      </select>
    </label>
  </div>

  <!-- R-127: o texto do movimento e a OBSERVACAO. Grava em `observacao`; `descricao` virou legado e
       sai numa migration futura. Registro antigo reabre com o texto porque o form cai no fallback. -->
  <label class="lc-campo">
    <span class="lc-campo-lbl">Observação</span>
    <input v-model="form.observacao" class="lc-input" placeholder="Ex.: Insumos — farinha e fermento" />
  </label>
</template>
