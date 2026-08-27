<script setup lang="ts">
import type { DadosInternosDto, SituacaoExame } from "@padaria/shared";
import { situacoesExame } from "@padaria/shared";
import { corSituacaoExame, rotuloSituacaoExame } from "~/utils/admissoes";
import { formatarDataHora } from "~/utils/formatacao";

/**
 * ADM-003 V1A — bloco INTERNO do DP.
 *
 * Vive fora do `ProcessoDetalhePainel` porque aquele arquivo ja passava de 250 linhas e este bloco
 * tem formulario, estado de edicao e uma acao propria. Sao duas responsabilidades, e o AGENTS.md
 * §4.5 manda quebrar antes de crescer.
 *
 * Nao ha aqui: area, setor, CBO, salario, dados bancarios, documentos, convite ou upload. Nenhum
 * deles pertence a esta vertical.
 */
const props = defineProps<{
  internos: DadosInternosDto;
  podeEditar: boolean;
  processando: boolean;
  // Cancelado nao se edita: o bloco vira leitura, como o resto do processo.
  emAndamento: boolean;
}>();

const emit = defineEmits<{
  (event: "salvar", dados: Omit<DadosInternosDto, "exameExigeAtencao" | "exameAtualizadoPorNome" | "exameAtualizadoEm">): void;
  (event: "atualizarExame", situacao: SituacaoExame): void;
}>();

const editando = ref(false);
const formulario = reactive({
  dataAdmissao: "",
  ctpsNumero: "",
  ctpsSerie: "",
  ctpsUf: "",
  pisPasepNit: "",
  observacoesRh: ""
});

function carregarDoServidor() {
  formulario.dataAdmissao = props.internos.dataAdmissao ?? "";
  formulario.ctpsNumero = props.internos.ctpsNumero ?? "";
  formulario.ctpsSerie = props.internos.ctpsSerie ?? "";
  formulario.ctpsUf = props.internos.ctpsUf ?? "";
  formulario.pisPasepNit = props.internos.pisPasepNit ?? "";
  formulario.observacoesRh = props.internos.observacoesRh ?? "";
}

// Recarrega quando o servidor responde: depois de salvar, o pai recarrega o processo e o formulario
// precisa refletir o que ficou gravado, nao o que foi digitado.
watch(() => props.internos, carregarDoServidor, { immediate: true, deep: true });

function abrirEdicao() {
  carregarDoServidor();
  editando.value = true;
}

function salvar() {
  emit("salvar", {
    versao: props.internos.versao,
    dataAdmissao: formulario.dataAdmissao || null,
    ctpsNumero: formulario.ctpsNumero || null,
    ctpsSerie: formulario.ctpsSerie || null,
    ctpsUf: formulario.ctpsUf || null,
    pisPasepNit: formulario.pisPasepNit || null,
    observacoesRh: formulario.observacoesRh || null,
    exameSituacao: props.internos.exameSituacao
  });
  editando.value = false;
}

const dataAdmissaoExibida = computed(() =>
  props.internos.dataAdmissao ? props.internos.dataAdmissao.split("-").reverse().join("/") : "—"
);
</script>

<template>
  <section class="bloco-internos">
    <header class="bloco-cabecalho">
      <h3>Dados internos do DP</h3>
      <v-btn
        v-if="podeEditar && emAndamento && !editando"
        variant="text"
        size="small"
        :disabled="processando"
        @click="abrirEdicao"
      >
        Editar
      </v-btn>
    </header>

    <!-- Enquanto o exame nao estiver realizado, o DP ve o aviso. `exameExigeAtencao` vem DERIVADO do
         servidor: a tela nao reimplementa a regra, e o banco nao a guarda. -->
    <v-alert
      v-if="internos.exameExigeAtencao"
      type="warning"
      variant="tonal"
      density="compact"
      class="mb-3"
    >
      Exame admissional {{ rotuloSituacaoExame[internos.exameSituacao].toLowerCase() }}. A admissão não
      se conclui enquanto ele não estiver realizado.
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

    <div v-if="podeEditar && emAndamento" class="exame-acoes">
      <v-btn
        v-for="situacao in situacoesExame"
        :key="situacao"
        size="small"
        variant="outlined"
        :disabled="processando || situacao === internos.exameSituacao"
        @click="emit('atualizarExame', situacao)"
      >
        {{ rotuloSituacaoExame[situacao] }}
      </v-btn>
    </div>

    <dl v-if="!editando" class="bloco-campos">
      <dt>Data de admissão</dt>
      <dd>{{ dataAdmissaoExibida }}</dd>
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

    <form v-else class="bloco-formulario" @submit.prevent="salvar">
      <v-text-field v-model="formulario.dataAdmissao" label="Data de admissão" type="date" density="comfortable" />
      <div class="ctps">
        <v-text-field v-model="formulario.ctpsNumero" label="CTPS — número" density="comfortable" />
        <v-text-field v-model="formulario.ctpsSerie" label="Série" density="comfortable" />
        <v-text-field
          v-model="formulario.ctpsUf"
          label="UF"
          maxlength="2"
          density="comfortable"
          hint="Duas letras"
        />
      </div>
      <v-text-field
        v-model="formulario.pisPasepNit"
        label="PIS / PASEP / NIT"
        inputmode="numeric"
        density="comfortable"
        hint="11 dígitos"
      />
      <v-textarea v-model="formulario.observacoesRh" label="Observações do RH" rows="2" density="comfortable" />
      <div class="bloco-acoes">
        <v-btn variant="text" :disabled="processando" @click="editando = false">Cancelar</v-btn>
        <v-btn color="primary" variant="flat" type="submit" :disabled="processando">Salvar</v-btn>
      </div>
    </form>

    <p class="bloco-nota">
      Área, setor, CBO, salário, dados bancários e documentos não fazem parte desta etapa.
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
  margin-bottom: 8px;
}
.exame-rotulo {
  font-size: 0.8rem;
  opacity: 0.7;
}
.exame-autoria {
  font-size: 0.78rem;
  opacity: 0.7;
}
.exame-acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
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
.bloco-formulario {
  display: grid;
  gap: 4px;
}
.ctps {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  gap: 8px;
}
.bloco-acoes {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.bloco-nota {
  font-size: 0.78rem;
  opacity: 0.7;
  margin-top: 12px;
}
@media (max-width: 600px) {
  .ctps {
    grid-template-columns: 1fr;
  }
  .bloco-campos {
    grid-template-columns: 1fr;
  }
}
</style>
