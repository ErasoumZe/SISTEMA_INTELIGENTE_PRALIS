<script setup lang="ts">
/**
 * Libera para compra toda a revenda ativa da loja (decisão do José, 13/11/2026, igual ao S2). Transformação fica
 * de fora. Prévia sem gravar; liberar exige a frase e o hash da prévia.
 */
import type { Opcao } from "~/types/padaria";

interface PreviaLiberacao {
  loja: string;
  total: number;
  amostra: Array<{ codigoInterno: string | null; descricao: string }>;
  hashPlano: string;
  confirmacao: string;
}

const props = defineProps<{ empresas: Opcao[]; empresaInicial: string }>();
const { apiUrl } = useApi();
const empresaId = ref(props.empresaInicial);
const previa = ref<PreviaLiberacao | null>(null);
const confirmacao = ref("");
const conferindo = ref(false);
const gravando = ref(false);
const erro = ref("");
const sucesso = ref("");
watch(empresaId, () => {
  previa.value = null;
  confirmacao.value = "";
});
const fraseOk = computed(() => confirmacao.value.trim().toUpperCase() === previa.value?.confirmacao);
const formatoNumero = new Intl.NumberFormat("pt-BR");

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
    previa.value = await pedir<PreviaLiberacao>(
      `/api/produtos/liberar-revenda/previa?empresaId=${encodeURIComponent(empresaId.value)}`
    );
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não consegui conferir.";
  } finally {
    conferindo.value = false;
  }
}

async function liberar() {
  if (!previa.value || !fraseOk.value) return;
  gravando.value = true;
  erro.value = "";
  try {
    const feito = await pedir<{ liberados: number }>("/api/produtos/liberar-revenda", {
      empresaId: empresaId.value,
      confirmacao: confirmacao.value,
      hashPlano: previa.value.hashPlano
    });
    sucesso.value = `${formatoNumero.format(feito.liberados)} produto(s) de revenda liberados para compra em ${previa.value.loja}.`;
    previa.value = null;
    confirmacao.value = "";
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não consegui liberar.";
  } finally {
    gravando.value = false;
  }
}
</script>

<template>
  <v-card variant="outlined" class="liberar-revenda">
    <v-card-title class="text-subtitle-1">Liberar a revenda para compra</v-card-title>
    <v-card-text class="liberar-revenda__corpo">
      <p>
        Liga o <strong>liberado para compra</strong> em todos os produtos de <strong>revenda ativos</strong> da loja.
        Transformação e inativos ficam como estão; nada é desligado.
      </p>
      <div class="liberar-revenda__acoes">
        <v-select v-model="empresaId" :items="empresas" item-title="nome" item-value="id" label="Loja" hide-details />
        <v-btn variant="tonal" prepend-icon="mdi-clipboard-check-outline" :loading="conferindo" @click="conferir">
          Conferir sem gravar
        </v-btn>
      </div>
      <v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>
      <v-alert v-if="sucesso" type="success" variant="tonal">{{ sucesso }}</v-alert>
      <template v-if="previa">
        <p>
          {{ previa.loja }}: <strong class="cx-num">{{ formatoNumero.format(previa.total) }}</strong> produto(s) de
          revenda ativos a liberar.
        </p>
        <ul v-if="previa.amostra.length" class="liberar-revenda__lista">
          <li v-for="item in previa.amostra" :key="`${item.codigoInterno}-${item.descricao}`">
            {{ item.codigoInterno ?? "—" }} · {{ item.descricao }}
          </li>
          <li v-if="previa.total > previa.amostra.length">
            e mais {{ formatoNumero.format(previa.total - previa.amostra.length) }}
          </li>
        </ul>
        <div v-if="previa.total" class="liberar-revenda__acoes">
          <v-text-field v-model="confirmacao" :label="`Digite: ${previa.confirmacao}`" hide-details />
          <v-btn
            color="primary"
            prepend-icon="mdi-cart-check"
            :disabled="!fraseOk"
            :loading="gravando"
            @click="liberar"
          >
            Liberar
          </v-btn>
        </div>
        <p v-else>Toda a revenda ativa já está liberada para compra.</p>
      </template>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.liberar-revenda__corpo {
  display: grid;
  gap: var(--cx-sp-3);
}
.liberar-revenda__corpo p {
  margin: 0;
}
.liberar-revenda__acoes {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--cx-sp-3);
  align-items: center;
}
.liberar-revenda__lista {
  margin: 0;
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
  overflow-wrap: anywhere;
  columns: 2;
  column-gap: var(--cx-sp-4);
}
@media (max-width: 768px) {
  .liberar-revenda__acoes {
    grid-template-columns: minmax(0, 1fr);
  }
  .liberar-revenda__lista {
    columns: 1;
  }
}
</style>
