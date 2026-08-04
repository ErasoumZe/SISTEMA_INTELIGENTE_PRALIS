<script setup lang="ts">
import type { CaixaStatus, Opcao, ResumoCaixa } from "~/types/padaria";
import { dinheiro } from "~/utils/domain";
import { dataHoraLocal, formatarDataHora } from "~/utils/formatacao";
import CaixaAutorizacoes from "~/components/caixa/CaixaAutorizacoes.vue";

const props = defineProps<{
  resumo: ResumoCaixa | null;
  status: CaixaStatus | null;
  pdvs: Opcao[];
  turnos?: Opcao[];
  maquininhas?: Opcao[];
  empresaId: string;
  permissoes: string[];
  usuarioId: string;
  usuarioNome: string;
  salvando?: boolean;
}>();

const emit = defineEmits<{
  (
    event: "abrirCaixa",
    payload: {
      pdvId: string;
      usuarioCaixaId: string;
      turnoId?: string | null;
      maquininhaId?: string | null;
      lacreAbertura?: string | null;
      dataHoraAbertura: string;
      observacao: string | null;
    }
  ): void;
  (event: "retornarSaldo", payload: { caixaId: string; valor: number; observacao: string | null }): void;
  (event: "fecharCaixa", payload: { caixaId: string; observacao: string | null }): void;
  (event: "recarregar"): void;
}>();

const abertura = reactive({
  pdvId: "",
  turnoId: "",
  dataHoraAbertura: dataHoraLocal()
});
// Campos auxiliares da abertura conforme a FOTO 5.
const aberturaExtra = reactive({ numeroLacre: "", maquininhaId: "" });
const fechamento = reactive({ observacao: "" });

const caixaAberto = computed(() => props.status?.caixaAberto ?? null);
const resumoAtual = computed(() => props.resumo ?? props.status?.resumo ?? null);
const precisaAcerto = computed(() => Number(resumoAtual.value?.saldo ?? 0) > 0);
const maquininhasSelect = computed(() =>
  (props.maquininhas ?? []).map((item) => ({
    ...item,
    nome: `${item.apelido ?? item.nome} · ${item.numeroSerie ?? "sem série"}`
  }))
);

// Cockpit por categoria: a cor entra como ACENTO (barra/chip/total) via os tokens --cat-* da main,
// nunca como fundo de bloco. Os valores vem SEMPRE da API (nada recalculado no front). "Resultado"
// (saldo fisico) e o card-ancora. Sem card de deficit (fundo simples, PROJECT_BRAIN/12).
type CardCategoria = { chave: string; titulo: string; icone: string; valor: number; detalhe?: string };

const categorias = computed<CardCategoria[]>(() => {
  const r = resumoAtual.value;
  if (!r) return [];
  const entrada = r.totalTransferenciasEntrada ?? 0;
  const saida = r.totalTransferenciasSaida ?? 0;
  return [
    { chave: "entradas", titulo: "Entradas", icone: "mdi-arrow-down-bold-circle-outline", valor: r.totalEntradas },
    {
      chave: "transferencias",
      titulo: "Transferencias",
      icone: "mdi-bank-transfer",
      valor: r.totalTransferencias,
      detalhe: `entra ${dinheiro(entrada)} · sai ${dinheiro(saida)}`
    },
    { chave: "despesas", titulo: "Despesas", icone: "mdi-cash-minus", valor: r.totalDespesas },
    {
      chave: "mercadorias",
      titulo: "Mercadorias",
      icone: "mdi-package-variant-closed",
      valor: r.totalMercadorias ?? 0
    },
    { chave: "retiradas", titulo: "Retiradas", icone: "mdi-cash-remove", valor: r.totalRetiradas }
  ];
});

watch(
  () => props.pdvs,
  (pdvs) => {
    if (!abertura.pdvId && pdvs[0]?.id) abertura.pdvId = pdvs[0].id;
  },
  { immediate: true }
);

watch(
  caixaAberto,
  () => {
    if (!caixaAberto.value) {
      fechamento.observacao = "";
    }
  },
  { immediate: true }
);

function abrir() {
  emit("abrirCaixa", {
    pdvId: abertura.pdvId,
    usuarioCaixaId: props.usuarioId,
    turnoId: abertura.turnoId || null,
    maquininhaId: aberturaExtra.maquininhaId || null,
    lacreAbertura: aberturaExtra.numeroLacre || null,
    dataHoraAbertura: abertura.dataHoraAbertura,
    observacao: null
  });
}

function retornarSaldo() {
  const caixa = caixaAberto.value;
  const valor = Number(resumoAtual.value?.saldo ?? 0);
  if (!caixa || valor <= 0) return;
  emit("retornarSaldo", { caixaId: caixa.id, valor, observacao: fechamento.observacao || null });
}

function fechar() {
  const caixa = caixaAberto.value;
  if (!caixa) return;
  emit("fecharCaixa", {
    caixaId: caixa.id,
    observacao: fechamento.observacao || null
  });
}
</script>

<template>
  <v-card>
    <v-card-title>Caixa</v-card-title>
    <v-card-text>
      <v-alert v-if="!pdvs.length" type="warning" variant="tonal" class="mb-4">
        Cadastre um PDV com conta vinculada antes de abrir caixa.
      </v-alert>

      <!-- Sem caixa aberto o autorizador ainda precisa da fila de autorizacoes: o proprio
           CaixaAutorizacoes decide o que mostrar (so o botao Autorizacoes, neste caso). -->
      <div v-if="!caixaAberto" class="mb-4">
        <CaixaAutorizacoes
          :empresa-id="empresaId"
          :caixa-aberto="null"
          :permissoes="permissoes"
          @alterado="emit('recarregar')"
        />
      </div>

      <!-- Abertura de Caixa fiel ao desenho do Rodrigo (FOTO 5): enxuta, 4 campos em 2x2. -->
      <template v-if="!caixaAberto">
        <v-row dense>
          <v-col cols="12" md="6">
            <v-select v-model="abertura.pdvId" :items="pdvs" item-title="nome" item-value="id" label="Ponto de Venda" />
          </v-col>
          <v-col cols="12" md="6">
            <v-select
              v-model="abertura.turnoId"
              :items="turnos ?? []"
              item-title="nome"
              item-value="id"
              label="Turno"
              clearable
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="aberturaExtra.numeroLacre"
              label="Transf. Entrada / N° Lacre"
              placeholder="Ex.: 001"
              hint="Lacre da transferencia de entrada."
              persistent-hint
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-select
              v-model="aberturaExtra.maquininhaId"
              :items="maquininhasSelect"
              item-title="nome"
              item-value="id"
              label="Maq. Cartão / N° Série"
              hint="Opcional"
              clearable
            />
          </v-col>
        </v-row>

        <!-- Campos que o backend exige para abrir (fora do desenho enxuto): data/hora + usuário. -->
        <v-row dense class="mt-2">
          <v-col cols="12" md="6">
            <v-text-field
              v-model="abertura.dataHoraAbertura"
              type="datetime-local"
              label="Data e hora de abertura"
              density="comfortable"
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field :model-value="usuarioNome" label="Usuário do caixa" readonly density="comfortable" />
          </v-col>
          <v-col cols="12">
            <v-btn
              color="primary"
              prepend-icon="mdi-cash-register"
              :loading="salvando"
              :disabled="!abertura.pdvId"
              @click="abrir"
            >
              Abrir caixa
            </v-btn>
          </v-col>
        </v-row>
      </template>

      <template v-else>
        <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-4">
          <v-alert type="success" variant="tonal" class="flex-grow-1 mb-0">
            Caixa aberto em {{ formatarDataHora(caixaAberto.dataHoraAbertura) }} no {{ caixaAberto.pdvNome }}.
            <span v-if="caixaAberto.maquininhaId">
              Maquininha: {{ caixaAberto.maquininhaApelido }} · {{ caixaAberto.maquininhaNumeroSerie }}.
            </span>
          </v-alert>
          <CaixaAutorizacoes
            :empresa-id="empresaId"
            :caixa-aberto="caixaAberto"
            :permissoes="permissoes"
            @alterado="emit('recarregar')"
          />
        </div>

        <!-- Cockpit por categoria: cor como acento (barra/chip/total), fundo do card neutro.
             Grid auto-responsivo (nunca aperta) — restyle da grade real, sem o cockpit pesado
             que foi revertido. Totais vindos da API; "Resultado" e o card-ancora. -->
        <div v-if="resumoAtual" class="cat-grid">
          <div v-for="cat in categorias" :key="cat.chave" class="cat-card" :class="`cat-${cat.chave}`">
            <span class="cat-bar" aria-hidden="true" />
            <div class="cat-body">
              <div class="cat-head">
                <span class="cat-chip"><v-icon :icon="cat.icone" size="18" /></span>
                <span class="cat-titulo">{{ cat.titulo }}</span>
              </div>
              <div class="cat-valor">{{ dinheiro(cat.valor) }}</div>
              <div v-if="cat.detalhe" class="cat-detalhe">{{ cat.detalhe }}</div>
            </div>
          </div>

          <div class="cat-card cat-resultado cat-card--ancora">
            <span class="cat-bar" aria-hidden="true" />
            <div class="cat-body">
              <div class="cat-head">
                <span class="cat-chip"><v-icon icon="mdi-cash-multiple" size="18" /></span>
                <span class="cat-titulo">Resultado no caixa</span>
              </div>
              <div class="cat-valor">{{ dinheiro(resumoAtual.saldo) }}</div>
              <div class="cat-detalhe">saldo fisico do turno</div>
            </div>
          </div>
        </div>

        <v-divider class="my-5" />

        <v-alert v-if="precisaAcerto" type="warning" variant="tonal" class="my-5">
          Ainda há {{ dinheiro(resumoAtual?.saldo || 0) }} no caixa. Lance o retorno ao cofre antes de fechar.
        </v-alert>

        <v-row dense>
          <v-col v-if="precisaAcerto" cols="12">
            <v-btn color="warning" prepend-icon="mdi-bank-transfer-out" :loading="salvando" @click="retornarSaldo">
              Lançar retorno de {{ dinheiro(resumoAtual?.saldo || 0) }}
            </v-btn>
          </v-col>
          <v-col cols="12" md="8">
            <v-text-field v-model="fechamento.observacao" label="Observação do fechamento" />
          </v-col>
          <v-col cols="12">
            <v-btn
              color="primary"
              prepend-icon="mdi-lock"
              :disabled="precisaAcerto"
              :loading="salvando"
              @click="fechar"
            >
              Fechar caixa
            </v-btn>
          </v-col>
        </v-row>
      </template>
    </v-card-text>
  </v-card>
</template>

<style scoped>
/* Grade auto-responsiva: cada card tem largura minima confortavel e quebra sozinho — nunca aperta
   como no cockpit "fiel ao mockup" que foi revertido no contexto real. */
.cat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 12px;
}

/* Card NA COR da categoria (decisao do Jose, 04/08/2026 — antes era neutro de proposito, com a cor
   so na barra de 4px). Fundo em -soft, borda em -base e barra mais grossa: os cinco retangulos
   passam a ser reconheciveis de longe, que era o pedido.
   O valor usa -strong e nao -base porque ele fica SOBRE o -soft; a base perderia contraste. */
.cat-card {
  position: relative;
  display: flex;
  overflow: hidden;
  border: 1px solid var(--cat);
  border-radius: 14px;
  background: var(--cat-soft);
}

.cat-bar {
  flex: 0 0 6px;
  background: var(--cat);
}

.cat-body {
  min-width: 0;
  padding: 12px 14px;
}

.cat-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cat-chip {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  /* O chip agora fica SOBRE o fundo -soft: se ele tambem fosse -soft, sumiria. Cheio, com icone
     branco, ele volta a ser o ponto de leitura do card. */
  background: var(--cat);
  color: #fff;
}

.cat-titulo {
  overflow: hidden;
  color: var(--cat-strong);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.3px;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.cat-valor {
  margin-top: 8px;
  color: var(--cat-strong);
  font-size: 20px;
  font-weight: 800;
  line-height: 1.1;
}

.cat-detalhe {
  margin-top: 2px;
  color: var(--padaria-muted-foreground, #71717a);
  font-size: 11px;
  font-weight: 600;
}

/* Card-ancora (Resultado): ocupa a linha inteira, barra e valor mais fortes. Continua neutro no
   fundo — o destaque e por peso/tamanho/largura, nao por bloco colorido. */
.cat-card--ancora {
  grid-column: 1 / -1;
}

.cat-card--ancora .cat-bar {
  flex-basis: 6px;
}

.cat-card--ancora .cat-valor {
  font-size: 26px;
}

/* Token por categoria (base = barra/chip/total; soft = fundo do chip). Fixos da main. */
.cat-entradas {
  --cat: var(--cat-entradas-base);
  --cat-soft: var(--cat-entradas-soft);
  --cat-strong: var(--cat-entradas-strong);
}
.cat-transferencias {
  --cat: var(--cat-transferencias-base);
  --cat-soft: var(--cat-transferencias-soft);
  --cat-strong: var(--cat-transferencias-strong);
}
.cat-despesas {
  --cat: var(--cat-despesas-base);
  --cat-soft: var(--cat-despesas-soft);
  --cat-strong: var(--cat-despesas-strong);
}
.cat-mercadorias {
  --cat: var(--cat-mercadorias-base);
  --cat-soft: var(--cat-mercadorias-soft);
  --cat-strong: var(--cat-mercadorias-strong);
}
.cat-retiradas {
  --cat: var(--cat-retiradas-base);
  --cat-soft: var(--cat-retiradas-soft);
  --cat-strong: var(--cat-retiradas-strong);
}
.cat-resultado {
  --cat: var(--cat-resultado-base);
  --cat-soft: var(--cat-resultado-soft);
  --cat-strong: var(--cat-resultado-strong);
}

/* Celular: as categorias empilham em 1 coluna (a barra de cor e o total continuam visiveis). No
   tablet o auto-fill/minmax ja mantem cards com largura confortavel (>=190px). */
@media (width <= 560px) {
  .cat-grid {
    grid-template-columns: 1fr;
  }
}
</style>
