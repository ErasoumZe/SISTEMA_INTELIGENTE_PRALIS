<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RECUO_MAXIMO_INICIO_VENDAS_MIN } from "@padaria/shared";
import { mensagemErro } from "~/utils/domain";
import { formatarDataHora } from "~/utils/formatacao";

// R-224 · "Ajustar início" das vendas do caixa. Para quando o operador abriu o caixa no sistema depois de ja estar
// vendendo no PDV (ex.: abriu 13:18, vende desde 13:00). Pode recuar ate 60 min da abertura OFICIAL, com motivo; a
// abertura oficial continua registrada e o servidor guarda o log. O fim continua sendo o corte do fechamento.
type Resultado = {
  inicioVendas: string;
  aberturaOficial: string;
  vendasAnexadas: number;
  vendasDesanexadas: number;
  relatorioVendasInvalidado: boolean;
};

// `sugestao` (R-225): o "Periodo de" da folha do CREARE nao bate com o inicio das vendas e cabe na janela.
const props = defineProps<{
  caixaId: string;
  aberturaOficial: string;
  inicioVendas: string;
  sugestao?: { inicio: string; periodoTexto: string } | null;
}>();
const emit = defineEmits<{ (event: "ajustado", resultado: Resultado): void }>();
const { apiPost } = useApi();

const RECUO_MAXIMO_MIN = RECUO_MAXIMO_INICIO_VENDAS_MIN;
const inicioAtual = ref(props.inicioVendas);
watch(
  () => props.inicioVendas,
  (valor) => {
    inicioAtual.value = valor;
  }
);

const aberto = ref(false);
const hora = ref("");
const motivo = ref("");
const enviando = ref(false);
const erro = ref("");

function horaLocal(iso: string) {
  const data = new Date(iso);
  return `${String(data.getHours()).padStart(2, "0")}:${String(data.getMinutes()).padStart(2, "0")}`;
}
const oficial = computed(() => new Date(props.aberturaOficial));
const horaMinima = computed(() => {
  const limite = oficial.value.getTime() - RECUO_MAXIMO_MIN * 60_000;
  return horaLocal(new Date(Math.ceil(limite / 60_000) * 60_000).toISOString());
});
const horaMaxima = computed(() => horaLocal(props.aberturaOficial));
const ajustado = computed(() => new Date(inicioAtual.value).getTime() !== oficial.value.getTime());

// Monta o instante no MESMO dia da abertura oficial, no fuso do navegador (o do PDV). O servidor confere tudo.
function instanteEscolhido() {
  const [h, m] = hora.value.split(":").map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return null;
  const data = new Date(oficial.value);
  data.setHours(h, m, 0, 0);
  return data;
}
const problema = computed(() => {
  const instante = instanteEscolhido();
  if (!instante) return "Escolha a hora.";
  const recuo = oficial.value.getTime() - instante.getTime();
  if (recuo < 0) return "A hora precisa ser antes da abertura oficial.";
  if (recuo > RECUO_MAXIMO_MIN * 60_000) return `No máximo ${RECUO_MAXIMO_MIN} minutos antes da abertura oficial.`;
  if (motivo.value.trim().length < 3) return "Escreva o motivo.";
  return "";
});

function abrir() {
  hora.value = horaLocal(props.sugestao?.inicio ?? inicioAtual.value);
  motivo.value = props.sugestao ? `Início conforme a folha do CREARE (Período de ${props.sugestao.periodoTexto}).` : "";
  erro.value = "";
  aberto.value = true;
}

async function confirmar() {
  const instante = instanteEscolhido();
  if (problema.value || !instante) return;
  enviando.value = true;
  erro.value = "";
  try {
    const resultado = await apiPost<Resultado>(`/api/caixa/${encodeURIComponent(props.caixaId)}/inicio-vendas`, {
      inicio: instante.toISOString(),
      motivo: motivo.value.trim()
    });
    inicioAtual.value = resultado.inicioVendas;
    aberto.value = false;
    emit("ajustado", resultado);
  } catch (falha) {
    erro.value = mensagemErro(falha);
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <section
    class="inicio-vendas"
    :class="{ 'inicio-vendas--sugerido': sugestao }"
    aria-labelledby="inicio-vendas-titulo"
    data-teste="inicio-vendas"
  >
    <div class="inicio-vendas__texto">
      <strong id="inicio-vendas-titulo">Vendas a partir de {{ formatarDataHora(inicioAtual) }}</strong>
      <small v-if="ajustado" data-teste="inicio-vendas-oficial"
        >Início ajustado. Abertura oficial no sistema: {{ formatarDataHora(aberturaOficial) }} (fica no
        registro).</small
      >
      <small v-else>É a hora em que o caixa foi aberto no sistema.</small>
      <small v-if="sugestao" class="inicio-vendas__sugestao" role="status" data-teste="inicio-vendas-sugerido">
        A folha do CREARE começa {{ sugestao.periodoTexto }}. Ajuste o início para as vendas desse horário entrarem.
      </small>
    </div>
    <v-btn
      :variant="sugestao ? 'flat' : 'outlined'"
      color="primary"
      prepend-icon="mdi-clock-edit-outline"
      class="inicio-vendas__botao"
      data-teste="botao-ajustar-inicio"
      @click="abrir"
      >Ajustar início</v-btn
    >

    <v-dialog v-model="aberto" max-width="460" scrollable>
      <v-card data-teste="dialogo-inicio-vendas">
        <v-card-title>Ajustar início das vendas</v-card-title>
        <v-card-text>
          <p class="mb-3">
            Use se você já estava vendendo no PDV antes de abrir o caixa no sistema. As vendas a partir desta hora
            passam a contar neste caixa. Pode voltar até {{ RECUO_MAXIMO_MIN }} minutos antes da abertura oficial ({{
              horaMaxima
            }}).
          </p>
          <v-text-field
            v-model="hora"
            type="time"
            label="Vendas a partir de"
            :min="horaMinima"
            :max="horaMaxima"
            data-teste="campo-hora-inicio"
          />
          <v-textarea
            v-model="motivo"
            label="Motivo (obrigatório)"
            auto-grow
            rows="2"
            counter="500"
            maxlength="500"
            data-teste="campo-motivo-inicio"
          />
          <p v-if="problema && hora" class="inicio-vendas__aviso" role="status">{{ problema }}</p>
          <v-alert v-if="erro" type="error" variant="tonal" density="compact" role="alert">{{ erro }}</v-alert>
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer />
          <v-btn variant="text" class="inicio-vendas__botao" :disabled="enviando" @click="aberto = false"
            >Cancelar</v-btn
          >
          <v-btn
            color="primary"
            variant="flat"
            class="inicio-vendas__botao"
            :loading="enviando"
            :disabled="Boolean(problema)"
            data-teste="confirmar-inicio-vendas"
            @click="confirmar"
            >Confirmar</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<style scoped>
.inicio-vendas {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-2) var(--cx-sp-3);
  margin-top: var(--cx-sp-3);
  padding: var(--cx-sp-3);
  border: 1px solid var(--cx-line);
  border-radius: var(--cx-r-md);
}
.inicio-vendas--sugerido {
  border-color: var(--cx-attention);
  background: color-mix(in srgb, var(--cx-attention) 10%, transparent);
}
.inicio-vendas__sugestao {
  color: var(--cx-ink) !important;
  font-weight: 600;
}
.inicio-vendas__texto {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.inicio-vendas__texto small {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
.inicio-vendas__botao {
  min-height: 44px;
}
.inicio-vendas__aviso {
  margin: 0 0 var(--cx-sp-2);
  color: rgb(var(--v-theme-error));
  font-size: var(--cx-fs-caption);
}
@media (width <= 480px) {
  .inicio-vendas__botao {
    width: 100%;
  }
}
</style>
