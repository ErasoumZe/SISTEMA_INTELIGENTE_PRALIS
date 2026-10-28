<script setup lang="ts">
/**
 * Ligar os produtos da loja a BASE (passo da virada, R-222): pelo codigo interno, so o inequivoco.
 * Previa sem gravar; ligar exige a frase e o hash da previa.
 */
import type { Opcao } from "~/types/padaria";

interface PreviaVinculo {
  loja: string;
  total: number;
  jaLigados: number;
  ligar: number;
  motivos: Record<string, number>;
  exemplosSemVinculo: Array<{ produtoId: string; nome: string; codigoInterno: string | null; motivo: string }>;
  amostra: Array<{ produtoId: string; nome: string; codigoInterno: string | null; nomeNaBase: string }>;
  hashPlano: string;
  confirmacao: string;
}

const MOTIVO: Record<string, string> = {
  "sem-codigo": "Sem código interno",
  "sem-base": "O código não existe na BASE",
  "base-ambigua": "O código está em mais de um produto da BASE",
  "base-ja-tem-copia": "Esse produto da BASE já tem cópia nesta loja",
  "codigo-disputado": "Dois produtos da loja apontam para o mesmo produto da BASE",
  "barras-divergem": "O código de barras da loja e o da BASE se contradizem"
};

const props = defineProps<{ empresas: Opcao[]; empresaInicial: string }>();
const { apiUrl } = useApi();
const empresaId = ref(props.empresaInicial);
const previa = ref<PreviaVinculo | null>(null);
const confirmacao = ref("");
const conferindo = ref(false);
const gravando = ref(false);
const erro = ref("");
const sucesso = ref("");
watch(empresaId, () => {
  previa.value = null;
  confirmacao.value = "";
});
const motivos = computed(() => Object.entries(previa.value?.motivos ?? {}).filter(([, n]) => n > 0));
const fraseOk = computed(() => confirmacao.value.trim().toUpperCase() === previa.value?.confirmacao);

async function pedir<T>(rota: string, corpo?: object): Promise<T> {
  const resposta = await fetch(`${apiUrl}${rota}`, {
    method: corpo ? "POST" : "GET",
    credentials: "include",
    ...(corpo ? { headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) } : {})
  });
  const conteudo = (await resposta.json().catch(() => null)) as { data?: T; title?: string } | null;
  if (!resposta.ok) throw new Error(conteudo?.title ?? "Não foi possível concluir a ação.");
  return conteudo?.data as T;
}

async function conferir() {
  conferindo.value = true;
  erro.value = "";
  sucesso.value = "";
  try {
    previa.value = await pedir<PreviaVinculo>(
      `/api/produtos/vinculo-base/previa?empresaId=${encodeURIComponent(empresaId.value)}`
    );
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não consegui conferir.";
  } finally {
    conferindo.value = false;
  }
}

async function ligar() {
  if (!previa.value || !fraseOk.value) return;
  gravando.value = true;
  erro.value = "";
  try {
    const feito = await pedir<{ ligados: number }>("/api/produtos/vinculo-base", {
      empresaId: empresaId.value,
      confirmacao: confirmacao.value,
      hashPlano: previa.value.hashPlano
    });
    sucesso.value = `${feito.ligados} produto(s) de ${previa.value.loja} ligados à BASE.`;
    previa.value = null;
    confirmacao.value = "";
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não consegui ligar.";
  } finally {
    gravando.value = false;
  }
}
</script>

<template>
  <v-card variant="outlined" class="vinculo">
    <v-card-title class="text-subtitle-1">Ligar os produtos da loja à BASE</v-card-title>
    <v-card-text class="vinculo__corpo">
      <p>
        Passo da virada: o produto da loja que já existe no ERP passa a apontar para o produto da BASE com o
        <strong>mesmo código interno</strong>, como as cópias do app. Só o inequívoco é ligado; nada mais muda no
        produto.
      </p>
      <div class="vinculo__acoes">
        <v-select v-model="empresaId" :items="empresas" item-title="nome" item-value="id" label="Loja" hide-details />
        <v-btn variant="tonal" prepend-icon="mdi-clipboard-check-outline" :loading="conferindo" @click="conferir">
          Conferir sem gravar
        </v-btn>
      </div>
      <v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>
      <v-alert v-if="sucesso" type="success" variant="tonal">{{ sucesso }}</v-alert>
      <template v-if="previa">
        <p>
          {{ previa.loja }}: <strong class="cx-num">{{ previa.ligar }}</strong> serão ligados ·
          {{ previa.jaLigados }} já ligados · {{ previa.total }} produtos na loja
        </p>
        <ul v-if="motivos.length" class="vinculo__lista">
          <li v-for="[motivo, n] in motivos" :key="motivo">{{ n }} · {{ MOTIVO[motivo] ?? motivo }}</li>
        </ul>
        <ul v-if="previa.amostra.length" class="vinculo__lista">
          <li v-for="item in previa.amostra.slice(0, 8)" :key="item.produtoId">
            {{ item.codigoInterno }} · {{ item.nome }} → {{ item.nomeNaBase }}
          </li>
        </ul>
        <div class="vinculo__acoes">
          <v-text-field v-model="confirmacao" :label="`Digite: ${previa.confirmacao}`" hide-details />
          <v-btn
            color="primary"
            prepend-icon="mdi-link-variant"
            :disabled="!fraseOk || previa.ligar === 0"
            :loading="gravando"
            @click="ligar"
          >
            Ligar {{ previa.ligar }}
          </v-btn>
        </div>
      </template>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.vinculo__corpo {
  display: grid;
  gap: var(--cx-sp-3);
}
.vinculo__corpo p {
  margin: 0;
}
.vinculo__acoes {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--cx-sp-3);
  align-items: center;
}
.vinculo__lista {
  margin: 0;
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
  overflow-wrap: anywhere;
}
@media (max-width: 768px) {
  .vinculo__acoes {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
