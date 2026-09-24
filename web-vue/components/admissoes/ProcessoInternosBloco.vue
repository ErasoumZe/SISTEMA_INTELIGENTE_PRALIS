<script setup lang="ts">
import type { DadosInternosDto } from "@padaria/shared";
import { corSituacaoExame, rotuloSituacaoExame } from "~/utils/admissoes";
import { formatarDataHora } from "~/utils/formatacao";

/**
 * ADM-003 V1B — bloco INTERNO do DP, agora SÓ LEITURA.
 *
 * A edição saiu daqui por inteiro: havia um formulário inline e uma fileira de botões de exame, dois
 * caminhos para o mesmo ato dentro de um painel que deveria ser de leitura. Agora existe um botão
 * "Editar", e ele abre o único modal.
 *
 * Nada aqui de área, setor, CBO, salário, dados bancários, documentos ou convite.
 */
defineProps<{
  internos: DadosInternosDto;
  podeEditar: boolean;
  processando: boolean;
  // Cancelado não se edita. Pausado, sim — é registrando o ASO apto que ele volta a andar.
  editavel: boolean;
}>();

const emit = defineEmits<{ (event: "editar"): void }>();

function dataExibida(data: string | null) {
  return data ? data.split("-").reverse().join("/") : "—";
}
</script>

<template>
  <section class="bloco-internos">
    <header class="bloco-cabecalho">
      <h3>Dados internos do DP</h3>
      <v-btn v-if="podeEditar && editavel" variant="text" size="small" :disabled="processando" @click="emit('editar')">
        Editar
      </v-btn>
    </header>

    <!-- `exameExigeAtencao` vem DERIVADO do servidor: a tela não reimplementa a regra. -->
    <v-alert
      v-if="internos.exameExigeAtencao"
      type="warning"
      variant="tonal"
      density="compact"
      class="mb-3"
      role="status"
    >
      Exame admissional: {{ rotuloSituacaoExame[internos.exameSituacao].toLowerCase() }}. A admissão não se conclui
      enquanto o ASO não voltar apto.
    </v-alert>

    <div class="exame">
      <span class="exame-rotulo">Exame admissional</span>
      <v-chip size="small" variant="tonal" :color="corSituacaoExame(internos.exameSituacao)">
        {{ rotuloSituacaoExame[internos.exameSituacao] }}
      </v-chip>
      <span v-if="internos.exameAtualizadoEm" class="exame-autoria">
        por {{ internos.exameAtualizadoPorNome ?? "—" }} ·
        {{ formatarDataHora(internos.exameAtualizadoEm) }}
      </span>
    </div>

    <dl class="bloco-campos">
      <dt>Data de admissão</dt>
      <dd>{{ dataExibida(internos.dataAdmissao) }}</dd>
      <dt>CTPS</dt>
      <dd>
        {{ internos.ctpsNumero ?? "—" }}
        <template v-if="internos.ctpsSerie">/ série {{ internos.ctpsSerie }}</template>
        <template v-if="internos.ctpsUf">/ {{ internos.ctpsUf }}</template>
      </dd>
      <dt>PIS / PASEP / NIT</dt>
      <dd>{{ internos.pisPasepNit ?? "—" }}</dd>
      <dt>Observações do RH</dt>
      <dd>{{ internos.observacoesRh ?? "—" }}</dd>
    </dl>

    <p class="bloco-nota">
      A guia do exame é física e preenchida à mão — o sistema só registra que foi entregue. Área, setor, CBO, salário,
      dados bancários e documentos não fazem parte desta etapa.
    </p>
  </section>
</template>

<style scoped>
.bloco-internos {
  border-top: 1px solid rgb(var(--v-border-color), 0.2);
  padding-top: 16px;
  margin-top: 16px;
}
.bloco-cabecalho {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}
.bloco-cabecalho h3 {
  font-size: 0.95rem;
  font-weight: 600;
}
.exame {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.exame-rotulo {
  font-size: 0.8rem;
  opacity: 0.7;
}
.exame-autoria {
  font-size: 0.78rem;
  opacity: 0.7;
}
.bloco-campos {
  display: grid;
  grid-template-columns: minmax(140px, auto) 1fr;
  gap: 6px 16px;
  font-size: 0.9rem;
}
.bloco-campos dt {
  opacity: 0.7;
}
.bloco-campos dd {
  margin: 0;
}
.bloco-nota {
  font-size: 0.78rem;
  opacity: 0.7;
  margin-top: 12px;
}
@media (max-width: 768px) {
  .bloco-campos {
    grid-template-columns: 1fr;
  }
}
</style>
