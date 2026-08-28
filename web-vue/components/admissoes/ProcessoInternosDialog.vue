<script setup lang="ts">
import type { DadosInternosDto, SituacaoExame } from "@padaria/shared";
import { situacoesExame } from "@padaria/shared";
import { rotuloSituacaoExame } from "~/utils/admissoes";

/**
 * O UNICO lugar onde os dados internos do DP e o exame sao editados.
 *
 * Antes a edicao morava embutida no painel de detalhe, com um formulario inline e uma fileira de
 * botoes de exame. Eram dois caminhos para o mesmo ato, dentro de uma tela que deveria ser leitura.
 *
 * Aqui os dois viram um formulario so. O exame continua sendo uma acao PROPRIA no servidor — rota e
 * versao proprias —, mas quem opera ve um lugar so.
 */
const props = defineProps<{
  aberto: boolean;
  internos: DadosInternosDto | null;
  salvando: boolean;
  erro: string;
}>();

const emit = defineEmits<{
  (event: "fechar"): void;
  // UM evento para o formulario inteiro. O servidor tem duas rotas; quem opera preencheu uma
  // tela so, e ela nao pode escolher metade. `dados` vem null quando nada nos internos mudou —
  // um PUT vazio consumiria uma versao e gravaria `internos_alterados` falso na trilha.
  (
    event: "salvar",
    dados: {
      versao: number;
      dataAdmissao: string | null;
      ctpsNumero: string | null;
      ctpsSerie: string | null;
      ctpsUf: string | null;
      pisPasepNit: string | null;
      observacoesRh: string | null;
    } | null,
    exame: SituacaoExame | null
  ): void;
}>();

const formulario = reactive({
  dataAdmissao: "",
  ctpsNumero: "",
  ctpsSerie: "",
  ctpsUf: "",
  pisPasepNit: "",
  observacoesRh: "",
  exameSituacao: "pendente" as SituacaoExame
});

watch(
  () => [props.aberto, props.internos] as const,
  ([aberto, internos]) => {
    if (!aberto || !internos) return;
    formulario.dataAdmissao = internos.dataAdmissao ?? "";
    formulario.ctpsNumero = internos.ctpsNumero ?? "";
    formulario.ctpsSerie = internos.ctpsSerie ?? "";
    formulario.ctpsUf = internos.ctpsUf ?? "";
    formulario.pisPasepNit = internos.pisPasepNit ?? "";
    formulario.observacoesRh = internos.observacoesRh ?? "";
    formulario.exameSituacao = internos.exameSituacao;
  },
  { immediate: true }
);

const ufErro = computed(() =>
  !formulario.ctpsUf || /^[A-Za-z]{2}$/.test(formulario.ctpsUf) ? "" : "UF deve ter duas letras"
);
const pisErro = computed(() =>
  !formulario.pisPasepNit || /^[0-9]{11}$/.test(formulario.pisPasepNit)
    ? ""
    : "PIS/PASEP/NIT deve ter 11 dígitos"
);
const invalido = computed(() => Boolean(ufErro.value || pisErro.value));

const exameMudou = computed(() => formulario.exameSituacao !== props.internos?.exameSituacao);

// O aviso é o que faz a consequência aparecer ANTES do clique. `aso_nao_apto` pausa o processo e
// `aso_apto` o retoma — o DP precisa saber disso na hora de escolher, não depois.
const avisoExame = computed(() => {
  if (!exameMudou.value) return "";
  if (formulario.exameSituacao === "aso_nao_apto") return "O processo será pausado.";
  if (formulario.exameSituacao === "aso_apto" && props.internos?.exameExigeAtencao) {
    return "Se o processo estiver pausado, ele será retomado.";
  }
  return "";
});

/** Os internos so vao se algum campo REALMENTE mudou — ver o comentario do emit. */
const internosMudaram = computed(() => {
  const atual = props.internos;
  if (!atual) return false;
  return (
    (formulario.dataAdmissao || null) !== (atual.dataAdmissao ?? null) ||
    (formulario.ctpsNumero || null) !== (atual.ctpsNumero ?? null) ||
    (formulario.ctpsSerie || null) !== (atual.ctpsSerie ?? null) ||
    (formulario.ctpsUf ? formulario.ctpsUf.toUpperCase() : null) !== (atual.ctpsUf ?? null) ||
    (formulario.pisPasepNit || null) !== (atual.pisPasepNit ?? null) ||
    (formulario.observacoesRh || null) !== (atual.observacoesRh ?? null)
  );
});

function salvar() {
  if (!props.internos || invalido.value) return;
  const dados = internosMudaram.value
    ? {
        versao: props.internos.versao,
        dataAdmissao: formulario.dataAdmissao || null,
        ctpsNumero: formulario.ctpsNumero || null,
        ctpsSerie: formulario.ctpsSerie || null,
        ctpsUf: formulario.ctpsUf ? formulario.ctpsUf.toUpperCase() : null,
        pisPasepNit: formulario.pisPasepNit || null,
        observacoesRh: formulario.observacoesRh || null
      }
    : null;
  emit("salvar", dados, exameMudou.value ? formulario.exameSituacao : null);
}
</script>

<template>
  <v-dialog
    :model-value="aberto"
    max-width="720"
    scrollable
    persistent
    @update:model-value="(valor) => !valor && emit('fechar')"
  >
    <v-card v-if="internos" role="dialog" aria-labelledby="titulo-internos">
      <v-card-title id="titulo-internos" class="d-flex align-center justify-space-between">
        <span>Dados internos do DP</span>
        <v-btn icon="mdi-close" variant="text" size="small" aria-label="Fechar" @click="emit('fechar')" />
      </v-card-title>

      <v-card-text>
        <v-alert v-if="erro" type="error" variant="tonal" density="compact" class="mb-4" role="alert">
          {{ erro }}
        </v-alert>

        <form class="formulario" @submit.prevent="salvar">
          <v-select
            v-model="formulario.exameSituacao"
            :items="[...situacoesExame]"
            :item-title="(valor) => rotuloSituacaoExame[valor as SituacaoExame]"
            label="Exame admissional"
            density="comfortable"
            class="campo-largo"
            :hint="avisoExame"
            persistent-hint
          />

          <v-text-field
            v-model="formulario.dataAdmissao"
            label="Data de admissão"
            type="date"
            density="comfortable"
          />
          <v-text-field v-model="formulario.ctpsNumero" label="CTPS — número" density="comfortable" />
          <v-text-field v-model="formulario.ctpsSerie" label="CTPS — série" density="comfortable" />
          <v-text-field
            v-model="formulario.ctpsUf"
            label="CTPS — UF"
            maxlength="2"
            density="comfortable"
            :error-messages="ufErro"
          />
          <v-text-field
            v-model="formulario.pisPasepNit"
            label="PIS / PASEP / NIT"
            inputmode="numeric"
            density="comfortable"
            class="campo-largo"
            :error-messages="pisErro"
          />
          <v-textarea
            v-model="formulario.observacoesRh"
            label="Observações do RH"
            rows="2"
            density="comfortable"
            class="campo-largo"
          />
        </form>

        <p class="nota">
          Área, setor, CBO, salário, dados bancários e documentos não fazem parte desta etapa.
        </p>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="salvando" @click="emit('fechar')">Cancelar</v-btn>
        <v-btn color="primary" variant="flat" :disabled="invalido || salvando" @click="salvar">
          Salvar
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.formulario {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 12px;
}
.campo-largo {
  grid-column: 1 / -1;
}
.nota {
  font-size: 0.8rem;
  opacity: 0.75;
  margin-top: 10px;
}
@media (max-width: 768px) {
  .formulario {
    grid-template-columns: 1fr;
  }
}
</style>
