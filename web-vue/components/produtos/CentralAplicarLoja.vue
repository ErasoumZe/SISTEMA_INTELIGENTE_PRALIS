<script setup lang="ts">
/**
 * Fase B2 da virada (R-222): a loja passa a ter os produtos dela como estão no backup do paralelo (o espelho da
 * planilha). Prévia sem gravar; aplicar exige a frase e o hash da prévia e grava em lotes, com progresso. Refazer
 * é seguro: o que já existe só é atualizado. Produtos antigos do PDV com o mesmo código são juntados no que mais
 * vendeu; os outros ficam inativos, com as vendas antigas.
 */
import type { Opcao } from "~/types/padaria";

interface PreviaLoja {
  loja: string;
  total: number;
  criar: number;
  atualizar: number;
  juntar: number;
  inativar: number;
  juntados: Array<{ codigoInterno: string | null; fica: string | null; inativados: string[] }>;
  bloqueados: number;
  ativos: number;
  inativos: number;
  motivos: Record<string, number>;
  exemplosBloqueados: Array<{ codigoInterno: string | null; nome: string; motivo: string }>;
  amostra: Array<{
    acao: string;
    codigoInterno: string | null;
    nome: string;
    situacao: string | null;
    precoVenda: number | null;
  }>;
  hashPlano: string;
  confirmacao: string;
}
interface LoteAplicado {
  total: number;
  processados: number;
  proximoCursor: number | null;
  criados: number;
  atualizados: number;
  juntados: number;
  ignorados: number;
  falhas: Array<{ nome: string; motivo: string }>;
}

const props = defineProps<{ cargaId: string; empresas: Opcao[]; empresaInicial: string }>();
const { apiGet, apiPost } = useApi();
const empresaId = ref(props.empresaInicial);
const previa = ref<PreviaLoja | null>(null);
const confirmacao = ref("");
const conferindo = ref(false);
const aplicando = ref(false);
const erro = ref("");
const progresso = ref({ processados: 0, criados: 0, atualizados: 0, juntados: 0, ignorados: 0 });
const aGravar = computed(() => (previa.value ? previa.value.criar + previa.value.atualizar + previa.value.juntar : 0));
const falhas = ref<Array<{ nome: string; motivo: string }>>([]);
const concluido = ref(false);
watch([empresaId, () => props.cargaId], () => {
  previa.value = null;
  confirmacao.value = "";
  concluido.value = false;
});
const fraseOk = computed(() => confirmacao.value.trim().toUpperCase() === previa.value?.confirmacao);
const percentual = computed(() =>
  previa.value?.total ? Math.round((progresso.value.processados / previa.value.total) * 100) : 0
);
const brl = (valor: number | null) =>
  valor == null ? "sem preço" : valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function conferir() {
  conferindo.value = true;
  erro.value = "";
  concluido.value = false;
  try {
    previa.value = await apiGet<PreviaLoja>(
      `/api/produtos/central/cargas/${props.cargaId}/loja/previa?empresaId=${encodeURIComponent(empresaId.value)}`
    );
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não consegui conferir.";
  } finally {
    conferindo.value = false;
  }
}

async function aplicar() {
  if (!previa.value || !fraseOk.value) return;
  aplicando.value = true;
  erro.value = "";
  progresso.value = { processados: 0, criados: 0, atualizados: 0, juntados: 0, ignorados: 0 };
  falhas.value = [];
  let cursor: number | null = 0;
  try {
    while (cursor !== null) {
      const lote: LoteAplicado = await apiPost<LoteAplicado>(
        `/api/produtos/central/cargas/${props.cargaId}/loja/aplicar`,
        {
          empresaId: empresaId.value,
          confirmacao: confirmacao.value,
          hashPlano: previa.value.hashPlano,
          cursor
        }
      );
      progresso.value = {
        processados: lote.processados,
        criados: progresso.value.criados + lote.criados,
        atualizados: progresso.value.atualizados + lote.atualizados,
        juntados: progresso.value.juntados + lote.juntados,
        ignorados: progresso.value.ignorados + lote.ignorados
      };
      falhas.value.push(...lote.falhas);
      cursor = lote.proximoCursor;
    }
    concluido.value = true;
    confirmacao.value = "";
  } catch (falha) {
    erro.value = `${falha instanceof Error ? falha.message : "Falha no lote."} Parou em ${progresso.value.processados} de ${previa.value.total}; aplicar de novo é seguro.`;
  } finally {
    aplicando.value = false;
  }
}
</script>

<template>
  <v-card rounded="lg" class="aplicar-loja">
    <v-card-title>Aplicar a loja pelo backup do paralelo</v-card-title>
    <v-card-text class="aplicar-loja__corpo">
      <p>
        Passo da virada: a loja passa a ter os produtos dela <strong>como estão no paralelo</strong> — ativos e
        inativos, com preço, custo, margem, estoque mínimo e máximo, grupo e fiscal. Quem já está ligado à BASE é
        atualizado (o histórico de vendas fica); o resto é criado. Foto fica de fora.
      </p>
      <p>
        Produtos antigos do PDV com o mesmo código (com e sem zeros) são <strong>juntados</strong>: fica o que mais
        vendeu, que recebe as vendas novas dos dois códigos; os outros ficam inativos, com as vendas antigas.
      </p>
      <div class="aplicar-loja__acoes">
        <v-select v-model="empresaId" :items="empresas" item-title="nome" item-value="id" label="Loja" hide-details />
        <v-btn
          variant="tonal"
          prepend-icon="mdi-clipboard-check-outline"
          :loading="conferindo"
          :disabled="aplicando"
          @click="conferir"
        >
          Conferir sem gravar
        </v-btn>
      </div>
      <v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>
      <template v-if="previa">
        <p>
          {{ previa.loja }}: <strong class="cx-num">{{ previa.criar }}</strong> a criar ·
          <strong class="cx-num">{{ previa.atualizar }}</strong> a atualizar ·
          <strong class="cx-num">{{ previa.juntar }}</strong> a juntar ({{ previa.inativar }} antigos inativados) ·
          {{ previa.bloqueados }} de fora · {{ previa.total }} no backup ({{ previa.ativos }} ativos,
          {{ previa.inativos }} inativos)
        </p>
        <ul v-if="Object.keys(previa.motivos).length" class="aplicar-loja__lista">
          <li v-for="(n, motivo) in previa.motivos" :key="motivo">{{ n }} · {{ motivo }}</li>
        </ul>
        <ul v-if="previa.juntados.length" class="aplicar-loja__lista">
          <li v-for="par in previa.juntados" :key="`${par.codigoInterno}-${par.fica}`">
            juntar · {{ par.codigoInterno ?? "sem código" }} · fica {{ par.fica }}
            <template v-if="par.inativados.length"> · inativa {{ par.inativados.join(", ") }}</template>
          </li>
        </ul>
        <ul v-if="previa.amostra.length" class="aplicar-loja__lista">
          <li v-for="item in previa.amostra.slice(0, 8)" :key="`${item.acao}-${item.codigoInterno}-${item.nome}`">
            {{ item.acao }} · {{ item.codigoInterno ?? "sem código" }} · {{ item.nome }} · {{ item.situacao }} ·
            {{ brl(item.precoVenda) }}
          </li>
        </ul>
        <div class="aplicar-loja__acoes">
          <v-text-field
            v-model="confirmacao"
            :label="`Digite: ${previa.confirmacao}`"
            :disabled="aplicando"
            hide-details
          />
          <v-btn
            color="primary"
            prepend-icon="mdi-database-arrow-down"
            :disabled="!fraseOk || aGravar === 0"
            :loading="aplicando"
            @click="aplicar"
          >
            Aplicar {{ aGravar }}
          </v-btn>
        </div>
      </template>
      <template v-if="aplicando || concluido">
        <v-progress-linear :model-value="percentual" color="primary" height="8" rounded />
        <p>
          {{ progresso.processados }} de {{ previa?.total }} · {{ progresso.criados }} criados ·
          {{ progresso.atualizados }} atualizados · {{ progresso.juntados }} juntados · {{ progresso.ignorados }} de
          fora · {{ falhas.length }} falhas
        </p>
        <v-alert v-if="concluido" type="success" variant="tonal">Loja aplicada pelo backup.</v-alert>
        <ul v-if="falhas.length" class="aplicar-loja__lista">
          <li v-for="(falha, i) in falhas.slice(0, 50)" :key="i">{{ falha.nome }} · {{ falha.motivo }}</li>
        </ul>
      </template>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.aplicar-loja__corpo {
  display: grid;
  gap: var(--cx-sp-3);
}
.aplicar-loja__corpo p {
  margin: 0;
}
.aplicar-loja__acoes {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--cx-sp-3);
  align-items: center;
}
.aplicar-loja__lista {
  margin: 0;
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
  overflow-wrap: anywhere;
}
@media (max-width: 768px) {
  .aplicar-loja__acoes {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
