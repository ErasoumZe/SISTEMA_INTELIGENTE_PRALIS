<script setup lang="ts">
// Importado de `vue` em vez de contar com o auto-import do Nuxt, como o `ProcessoDetalheDialog`
// ao lado ja faz: sem isto o componente nao monta fora do runtime do Nuxt, e portanto nao tem
// como ser testado — foi por isso que o defeito do select passou batido ate o teste em navegador.
import { computed, reactive, ref, watch } from "vue";
import type {
  ClinicaOcupacionalDto,
  DadosInternosDto,
  RespostaExamesComplementares,
  SituacaoExame,
  TipoExameOcupacional
} from "@padaria/shared";
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
const props = withDefaults(
  defineProps<{
    aberto: boolean;
    empresaId: string;
    internos: DadosInternosDto | null;
    /** Processos ainda não efetivados mantêm o comportamento anterior. */
    efetivado?: boolean;
    salvando: boolean;
    erro: string;
  }>(),
  { efetivado: false }
);

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
      exameTipo: TipoExameOcupacional | null;
      destinoClinica?: { clinicaId: string; unidadeId: string | null } | null;
      exameComplementares: RespostaExamesComplementares | null;
      exameAgendadoPara: string | null;
      exameResponsavelNome: string | null;
      exameResponsavelTelefone: string | null;
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
  exameTipo: null as TipoExameOcupacional | null,
  destinoClinicaId: null as string | null,
  destinoUnidadeId: null as string | null,
  exameComplementares: null as RespostaExamesComplementares | null,
  exameAgendadoPara: "",
  exameResponsavelNome: "",
  exameResponsavelTelefone: "",
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
    formulario.exameTipo = internos.exameTipo;
    formulario.destinoClinicaId = internos.exameClinicaId;
    formulario.destinoUnidadeId = internos.exameUnidadeId;
    formulario.exameComplementares = internos.exameComplementares;
    formulario.exameAgendadoPara = paraHorarioLocal(internos.exameAgendadoPara);
    formulario.exameResponsavelNome = internos.exameResponsavelNome ?? "";
    formulario.exameResponsavelTelefone = internos.exameResponsavelTelefone ?? "";
    formulario.observacoesRh = internos.observacoesRh ?? "";
    formulario.exameSituacao = internos.exameSituacao;
  },
  { immediate: true }
);

const { apiGet } = useApi();
const clinicas = ref<ClinicaOcupacionalDto[]>([]);
const clinicasCarregando = ref(false);
const clinicasErro = ref("");
const clinicasAtivas = computed(() => clinicas.value.filter((clinica) => clinica.ativo));
const unidadesAtivas = computed(
  () =>
    clinicasAtivas.value
      .find((clinica) => clinica.id === formulario.destinoClinicaId)
      ?.unidades.filter((unidade) => unidade.ativo) ?? []
);

watch(
  () => [props.aberto, props.empresaId] as const,
  async ([aberto, empresaId]) => {
    if (!aberto || !empresaId) return;
    clinicasCarregando.value = true;
    clinicasErro.value = "";
    try {
      clinicas.value = await apiGet<ClinicaOcupacionalDto[]>(
        `/api/clinicas-ocupacionais?empresaId=${encodeURIComponent(empresaId)}`
      );
    } catch {
      clinicasErro.value = "Nao foi possivel carregar as clinicas ocupacionais.";
    } finally {
      clinicasCarregando.value = false;
    }
  },
  { immediate: true }
);

watch(
  () => formulario.destinoClinicaId,
  () => {
    if (!unidadesAtivas.value.some((unidade) => unidade.id === formulario.destinoUnidadeId)) {
      formulario.destinoUnidadeId = null;
    }
  }
);

const ufErro = computed(() =>
  !formulario.ctpsUf || /^[A-Za-z]{2}$/.test(formulario.ctpsUf) ? "" : "UF deve ter duas letras"
);
const pisErro = computed(() =>
  !formulario.pisPasepNit || /^[0-9]{11}$/.test(formulario.pisPasepNit) ? "" : "PIS/PASEP/NIT deve ter 11 dígitos"
);
const telefoneErro = computed(() =>
  !formulario.exameResponsavelTelefone || /^[0-9]{10,11}$/.test(formulario.exameResponsavelTelefone)
    ? ""
    : "Telefone deve ter DDD e 10 ou 11 digitos"
);
const invalido = computed(() => Boolean(ufErro.value || pisErro.value || telefoneErro.value));

function paraHorarioLocal(valor: string | null) {
  if (!valor) return "";
  const data = new Date(valor);
  const ajuste = data.getTimezoneOffset() * 60_000;
  return new Date(data.getTime() - ajuste).toISOString().slice(0, 16);
}

function paraIso(valor: string) {
  return valor ? new Date(valor).toISOString() : null;
}

/**
 * O `v-select` precisa de `item-title` E `item-value`, e por isso as opcoes vem como objeto.
 *
 * Com itens PRIMITIVOS e `item-title` FUNCAO — que era como isto estava — o Vuetify grava o
 * ROTULO no `v-model`: o formulario mandava `"ASO apto"` e o servidor devolvia 400, porque o
 * contrato so aceita `aso_apto`. Na pratica o DP nao conseguia mudar o exame por esta tela, e
 * como o convite exige ASO apto, o fluxo inteiro de admissao ficava inalcancavel pela interface.
 * Nenhum teste pegava: os de integracao batem na API ja com o valor certo do enum.
 *
 * O mesmo defeito calava o `avisoExame` abaixo, que compara com `aso_apto`/`aso_nao_apto` e nunca
 * casava depois de o usuario escolher.
 *
 * Este e o formato usado pelos outros selects de enum do projeto (ver `CadastroCamposTurno.vue`).
 */
const opcoesExame = situacoesExame.map((valor) => ({ valor, titulo: rotuloSituacaoExame[valor] }));
const opcoesTipoExame = [
  { valor: "admissional", titulo: "Admissional" },
  { valor: "periodico", titulo: "Periodico" },
  { valor: "mudanca_funcao", titulo: "Mudanca de funcao" },
  { valor: "retorno_trabalho", titulo: "Retorno ao trabalho" },
  { valor: "demissional", titulo: "Demissional" },
  { valor: "pcd", titulo: "Pessoa com deficiencia" }
] as const;
const opcoesComplementares = [
  { valor: "sim", titulo: "Sim" },
  { valor: "nao", titulo: "Nao" },
  { valor: "nao_sabe", titulo: "Nao sabe" }
] as const;

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
    formulario.exameTipo !== atual.exameTipo ||
    formulario.destinoClinicaId !== atual.exameClinicaId ||
    formulario.destinoUnidadeId !== atual.exameUnidadeId ||
    formulario.exameComplementares !== atual.exameComplementares ||
    paraIso(formulario.exameAgendadoPara) !== atual.exameAgendadoPara ||
    (formulario.exameResponsavelNome || null) !== (atual.exameResponsavelNome ?? null) ||
    (formulario.exameResponsavelTelefone || null) !== (atual.exameResponsavelTelefone ?? null) ||
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
        exameTipo: formulario.exameTipo,
        destinoClinica:
          formulario.destinoClinicaId === atual.exameClinicaId && formulario.destinoUnidadeId === atual.exameUnidadeId
            ? undefined
            : formulario.destinoClinicaId
              ? { clinicaId: formulario.destinoClinicaId, unidadeId: formulario.destinoUnidadeId }
              : null,
        exameComplementares: formulario.exameComplementares,
        exameAgendadoPara: paraIso(formulario.exameAgendadoPara),
        exameResponsavelNome: formulario.exameResponsavelNome || null,
        exameResponsavelTelefone: formulario.exameResponsavelTelefone || null,
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
            :items="opcoesExame"
            item-title="titulo"
            item-value="valor"
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
            :disabled="efetivado"
            :hint="efetivado ? 'Data de efetivação histórica: não pode ser alterada.' : undefined"
            persistent-hint
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
          <div class="secao-guia campo-largo">
            <h3>Guia de encaminhamento</h3>
            <p>Dados que acompanham o colaborador para a clinica. A previa A4 fica no detalhe do processo.</p>
          </div>
          <v-select
            v-model="formulario.exameTipo"
            :items="opcoesTipoExame"
            item-title="titulo"
            item-value="valor"
            label="Tipo de exame"
            clearable
            density="comfortable"
          />
          <v-select
            v-model="formulario.destinoClinicaId"
            :items="clinicasAtivas"
            item-title="nome"
            item-value="id"
            label="Clinica ocupacional"
            clearable
            density="comfortable"
            :loading="clinicasCarregando"
            :disabled="clinicasCarregando || Boolean(clinicasErro)"
          />
          <v-select
            v-model="formulario.destinoUnidadeId"
            :items="unidadesAtivas"
            item-title="nome"
            item-value="id"
            label="Unidade da clinica"
            clearable
            density="comfortable"
            :disabled="!formulario.destinoClinicaId || clinicasCarregando || Boolean(clinicasErro)"
          />
          <v-alert v-if="clinicasErro" type="warning" variant="tonal" class="campo-largo">{{ clinicasErro }}</v-alert>
          <v-alert
            v-else-if="internos.exameClinica && !internos.exameClinicaId"
            type="info"
            variant="tonal"
            class="campo-largo"
          >
            Guia legada: {{ internos.exameClinica
            }}<template v-if="internos.exameUnidade"> / {{ internos.exameUnidade }}</template
            >. Selecione uma clínica cadastrada para atualizar o destino.
          </v-alert>
          <v-select
            v-model="formulario.exameComplementares"
            :items="opcoesComplementares"
            item-title="titulo"
            item-value="valor"
            label="Exames complementares?"
            clearable
            density="comfortable"
          />
          <v-text-field
            v-model="formulario.exameAgendadoPara"
            label="Agendado para"
            type="datetime-local"
            density="comfortable"
          />
          <v-text-field
            v-model="formulario.exameResponsavelNome"
            label="Responsavel pela autorizacao"
            density="comfortable"
          />
          <v-text-field
            v-model="formulario.exameResponsavelTelefone"
            label="Telefone do responsavel"
            inputmode="numeric"
            density="comfortable"
            class="campo-largo"
            :error-messages="telefoneErro"
          />
          <v-textarea
            v-model="formulario.observacoesRh"
            label="Observações do RH"
            rows="2"
            density="comfortable"
            class="campo-largo"
          />
        </form>

        <p class="nota">Área, setor, CBO, salário, dados bancários e documentos não fazem parte desta etapa.</p>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="salvando" @click="emit('fechar')">Cancelar</v-btn>
        <v-btn color="primary" variant="flat" :disabled="invalido || salvando" @click="salvar"> Salvar </v-btn>
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
.secao-guia {
  border-top: 1px solid rgb(var(--v-border-color), 0.25);
  margin-top: 8px;
  padding-top: 16px;
}
.secao-guia h3 {
  font-size: 0.92rem;
  margin: 0;
}
.secao-guia p {
  font-size: 0.8rem;
  margin: 4px 0 0;
  opacity: 0.72;
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
