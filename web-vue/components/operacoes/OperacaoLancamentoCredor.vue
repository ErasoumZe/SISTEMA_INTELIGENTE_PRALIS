<script setup lang="ts">
// Bloco Classificação: Tipo de credor · Credor · Grupo · Conta · Descrição. Grupo/Conta/Descrição nao estao no desenho enxuto,
// mas o backend precisa deles para salvar. Estado vem do modal via provide/inject.
import { useOperacaoLancamentoBloco } from "~/components/operacoes/useOperacaoLancamento";

const { cat, CREDORES, rotuloCredor, tipoCredor, credorId, credorOpcoes, grupoId, grupoOpcoes, opcoesEmpresa, form } =
  useOperacaoLancamentoBloco();
</script>

<template>
  <!-- Linha 3: Tipo de credor → Credor -->
  <div class="lc-campo-lbl lc-mt">Tipo de credor</div>
  <div class="lc-credor-tipos">
    <button
      v-for="t in CREDORES[cat]"
      :key="t"
      type="button"
      class="lc-chip"
      :class="{ ativo: tipoCredor === t }"
      @click="tipoCredor = t"
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

  <!-- Grupo + Conta (nao estao no desenho, mas o backend precisa para salvar) -->
  <div class="lc-dois">
    <label class="lc-campo">
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
      <select v-else v-model="form.contaOrigemId" class="lc-input">
        <option value="">—</option>
        <option v-for="c in opcoesEmpresa.contas" :key="c.id" :value="c.id">{{ c.nome }}</option>
      </select>
    </label>
  </div>

  <!-- Descrição: obrigatória no backend (descricao NOT NULL) e importante para auditoria. Nao
       esta no desenho enxuto, mas fica acessivel aqui. -->
  <label class="lc-campo">
    <span class="lc-campo-lbl">Descrição</span>
    <input v-model="form.descricao" class="lc-input" placeholder="Ex.: Insumos — farinha e fermento" />
  </label>
</template>
