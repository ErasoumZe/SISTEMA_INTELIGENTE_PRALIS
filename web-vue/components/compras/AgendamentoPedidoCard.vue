<script setup lang="ts">
import {
  PRAZO_RESPOSTA_ATALHOS,
  type AgendamentoDto,
  type AgendamentoPayload,
  type GrupoAgendamentoDto,
  type MargemVariacao,
  type RegraRecorrencia,
  type ResponsavelPedidoDto,
  type TerminoRecorrencia
} from "@padaria/shared";
import ComprasSecao from "~/components/compras/base/ComprasSecao.vue";
import MargemVariacaoCampo from "~/components/compras/MargemVariacaoCampo.vue";
import RecorrenciaCampo from "~/components/compras/RecorrenciaCampo.vue";

// O formulário do agendamento de pedido (doc 56 §2.2, doc 58 §1/§2/§8), em quatro partes com o porquê de cada
// uma: o pedido (grupo e os produtos marcados na lista de baixo), quando (primeira data e repetição), quem executa
// e o que o fornecedor vê (tempo de resposta, variação aceita, horário de recebimento). Sem quantidade: ela é posta
// na Solicitação de compra, na data.
const props = defineProps<{
  empresaId: string;
  grupos: GrupoAgendamentoDto[];
  produtosMarcados: string[];
  editando: AgendamentoDto | null;
  salvando: boolean;
  responsaveis: ResponsavelPedidoDto[];
}>();
const emit = defineEmits<{ salvar: [payload: AgendamentoPayload, aPartirDe: string | undefined]; cancelar: [] }>();

// Datas no dia de Sao Paulo, como o servidor calcula a agenda.
const DIA_LOCAL = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
const diaLocal = (instante: Date) => DIA_LOCAL.format(instante);
const hoje = () => diaLocal(new Date());
const amanha = () => diaLocal(new Date(Date.now() + 86_400_000));

const form = reactive({
  grupo: "",
  subgrupo: "",
  inicioData: amanha(),
  inicioHora: "08:00",
  prazo: 24 as number,
  margem: 10 as MargemVariacao,
  responsavelId: null as string | null,
  recebimentoInicio: "",
  recebimentoFim: "",
  aPartirDe: ""
});
const regra = ref<RegraRecorrencia>({ tipo: "padrao", frequencia: "semanal", intervalo: 1 });
const termino = ref<TerminoRecorrencia>({ tipo: "nunca" });
const erro = ref("");

const gruposPai = computed(() => props.grupos.filter((grupo) => !grupo.grupoPaiId));
const subgrupos = computed(() => props.grupos.filter((grupo) => grupo.grupoPaiId && grupo.grupoPaiId === form.grupo));
const totalMarcados = computed(() => props.produtosMarcados.length);
const PRAZOS = PRAZO_RESPOSTA_ATALHOS.map((horas) => ({
  value: horas,
  title: horas < 24 ? `${horas} horas` : `${horas / 24} dia(s)`
}));

function limpar() {
  Object.assign(form, {
    grupo: "",
    subgrupo: "",
    inicioData: amanha(),
    inicioHora: "08:00",
    prazo: 24,
    margem: 10,
    responsavelId: null,
    recebimentoInicio: "",
    recebimentoFim: "",
    aPartirDe: ""
  });
  regra.value = { tipo: "padrao", frequencia: "semanal", intervalo: 1 };
  termino.value = { tipo: "nunca" };
  erro.value = "";
}

watch(
  () => props.editando,
  (agenda) => {
    if (!agenda) return limpar();
    const grupo = props.grupos.find((item) => item.id === agenda.grupoMercadoriaId);
    Object.assign(form, {
      grupo: grupo?.grupoPaiId ?? agenda.grupoMercadoriaId,
      subgrupo: grupo?.grupoPaiId ? agenda.grupoMercadoriaId : "",
      inicioData: agenda.inicioData,
      inicioHora: agenda.inicioHora,
      prazo: agenda.prazoRespostaHoras,
      margem: agenda.margemVariacaoPercentual as MargemVariacao,
      responsavelId: agenda.responsavelId,
      recebimentoInicio: agenda.recebimentoInicio ?? "",
      recebimentoFim: agenda.recebimentoFim ?? "",
      aPartirDe: agenda.proximas[0] ? diaLocal(new Date(agenda.proximas[0].dataAtual)) : hoje()
    });
    regra.value = agenda.regra;
    termino.value = agenda.termino;
  },
  { immediate: true }
);
watch(
  () => form.grupo,
  (novo, antigo) => {
    if (antigo !== undefined && novo !== antigo && !subgrupos.value.some((item) => item.id === form.subgrupo))
      form.subgrupo = "";
  }
);

function salvar() {
  erro.value = "";
  const grupoMercadoriaId = form.subgrupo || form.grupo;
  if (!grupoMercadoriaId) return void (erro.value = "Escolha o grupo do pedido.");
  if (!totalMarcados.value) return void (erro.value = "Marque ao menos um produto na lista abaixo.");
  if (!form.inicioData || !form.inicioHora) return void (erro.value = "Informe a data e a hora do primeiro pedido.");
  if (!form.responsavelId) return void (erro.value = "Escolha o responsável por executar o pedido.");
  if (Boolean(form.recebimentoInicio) !== Boolean(form.recebimentoFim))
    return void (erro.value = "Informe o início e o fim do horário de recebimento.");
  if (form.recebimentoInicio && form.recebimentoFim <= form.recebimentoInicio)
    return void (erro.value = "O fim do recebimento vem depois do início.");
  const prazo = Number(form.prazo);
  if (!Number.isInteger(prazo) || prazo < 1 || prazo > 720)
    return void (erro.value = "O tempo de resposta vai de 1 a 720 horas.");
  emit(
    "salvar",
    {
      empresaId: props.empresaId,
      grupoMercadoriaId,
      inicioData: form.inicioData,
      inicioHora: form.inicioHora,
      regra: regra.value,
      termino: termino.value,
      prazoRespostaHoras: prazo,
      margemVariacaoPercentual: form.margem,
      responsavelId: form.responsavelId,
      recebimentoInicio: form.recebimentoInicio || null,
      recebimentoFim: form.recebimentoFim || null,
      produtos: props.produtosMarcados.map((produtoId) => ({ produtoId }))
    },
    props.editando ? form.aPartirDe || undefined : undefined
  );
}

defineExpose({ limpar });
</script>

<template>
  <ComprasSecao
    :titulo="editando ? 'Editar agendamento' : 'Novo agendamento'"
    descricao="Na data, o responsável recebe o aviso no sino, confere as quantidades na Solicitação de compra e envia."
    data-secao="card-agendamento"
  >
    <template #acoes>
      <v-btn icon="mdi-close" variant="text" size="small" aria-label="Fechar o formulário" @click="emit('cancelar')" />
    </template>

    <v-alert v-if="erro" type="error" variant="tonal" density="compact" class="mb-2">{{ erro }}</v-alert>
    <div class="form">
      <div class="form__linha">
        <div class="form__rotulo">
          <strong>Pedido</strong>
          <span>O grupo e os produtos marcados na lista abaixo.</span>
        </div>
        <div class="form__campos">
          <v-select
            v-model="form.grupo"
            :items="gruposPai"
            item-title="nome"
            item-value="id"
            label="Grupo *"
            hide-details="auto"
          />
          <v-select
            v-model="form.subgrupo"
            :items="subgrupos"
            item-title="nome"
            item-value="id"
            label="Subgrupo"
            clearable
            :disabled="!subgrupos.length"
            hide-details="auto"
          />
          <p class="form__info" :class="{ 'form__info--ok': totalMarcados }" data-campo="produtos-marcados">
            <v-icon :icon="totalMarcados ? 'mdi-check-circle' : 'mdi-arrow-down-circle-outline'" size="18" />
            {{ totalMarcados }} produto(s) marcado(s) na lista abaixo
          </p>
        </div>
      </div>

      <div class="form__linha">
        <div class="form__rotulo">
          <strong>Quando</strong>
          <span>O primeiro pedido e a repetição.</span>
        </div>
        <div class="form__campos">
          <v-text-field
            v-model="form.inicioData"
            type="date"
            label="Primeiro pedido em *"
            :min="hoje()"
            hide-details="auto"
          />
          <v-text-field v-model="form.inicioHora" type="time" label="Hora *" hide-details="auto" />
          <div class="form__largo">
            <RecorrenciaCampo v-model:regra="regra" v-model:termino="termino" :inicio-data="form.inicioData" />
          </div>
          <v-text-field
            v-if="editando"
            v-model="form.aPartirDe"
            type="date"
            label="Mudanças valem a partir de"
            hint="As datas anteriores ficam como estão."
            persistent-hint
            class="form__largo"
          />
        </div>
      </div>

      <div class="form__linha">
        <div class="form__rotulo">
          <strong>Responsável</strong>
          <span>Recebe o aviso na data, confere e envia.</span>
        </div>
        <div class="form__campos">
          <v-select
            v-model="form.responsavelId"
            :items="responsaveis"
            item-title="nome"
            item-value="usuarioId"
            label="Responsável por executar *"
            hide-details="auto"
            data-campo="responsavel"
          />
        </div>
      </div>

      <div class="form__linha">
        <div class="form__rotulo">
          <strong>Para o fornecedor</strong>
          <span>O que ele vê na cotação.</span>
        </div>
        <div class="form__campos">
          <div class="form__grupo">
            <v-text-field
              v-model.number="form.prazo"
              type="number"
              min="1"
              max="720"
              label="Tempo de resposta da cotação (horas)"
              hide-details="auto"
            />
            <div class="form__atalhos" role="group" aria-label="Atalhos do tempo de resposta">
              <v-chip
                v-for="atalho in PRAZOS"
                :key="atalho.value"
                size="small"
                :color="Number(form.prazo) === atalho.value ? 'primary' : undefined"
                :variant="Number(form.prazo) === atalho.value ? 'flat' : 'outlined'"
                @click="form.prazo = atalho.value"
                >{{ atalho.title }}</v-chip
              >
            </div>
          </div>
          <div class="form__grupo" data-campo="horario-recebimento">
            <div class="form__par">
              <v-text-field v-model="form.recebimentoInicio" type="time" label="Recebemos das" hide-details />
              <v-text-field v-model="form.recebimentoFim" type="time" label="Até" hide-details />
            </div>
            <span class="form__ajuda">Horário de recebimento da loja (opcional).</span>
          </div>
          <div class="form__largo"><MargemVariacaoCampo v-model="form.margem" /></div>
        </div>
      </div>
    </div>

    <template #rodape>
      <v-spacer />
      <v-btn variant="text" @click="emit('cancelar')">Cancelar</v-btn>
      <v-btn color="primary" variant="flat" :loading="salvando" @click="salvar">Salvar</v-btn>
    </template>
  </ComprasSecao>
</template>

<style scoped>
.form {
  display: grid;
}

.form__linha {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  gap: var(--cx-sp-5);
  padding: var(--cx-sp-4) 0;
  border-top: 1px solid var(--cx-line-soft);
}

.form__linha:first-child {
  border-top: 0;
  padding-top: var(--cx-sp-2);
}

.form__rotulo {
  display: grid;
  align-content: start;
  gap: 2px;
}

.form__rotulo strong {
  color: var(--cx-ink);
  font-size: var(--cx-fs-body);
}

.form__rotulo span,
.form__ajuda {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

.form__campos {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cx-sp-3) var(--cx-sp-4);
  align-items: start;
  max-width: 720px;
}

.form__largo {
  grid-column: 1 / -1;
}

.form__grupo {
  display: grid;
  gap: var(--cx-sp-2);
}

.form__atalhos {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-2);
}

.form__par {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cx-sp-2);
}

.form__info {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-2);
  grid-column: 1 / -1;
  margin: 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

.form__info--ok {
  color: var(--cx-positive);
  font-weight: 600;
}

@media (max-width: 767px) {
  .form__linha {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--cx-sp-3);
  }

  .form__campos {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
