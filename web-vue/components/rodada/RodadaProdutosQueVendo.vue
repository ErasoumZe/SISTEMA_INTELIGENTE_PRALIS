<script setup lang="ts">
/**
 * Doc 57 §5.1: a lista do que a padaria compra. O fornecedor marca o que ele também vende e, a partir da
 * próxima cotação, recebe esses produtos. Só acrescenta: o que já está marcado não sai por aqui.
 */
import type { ProdutoParaFornecedorDto } from "@padaria/shared";
import type { RequisitarRodada } from "~/composables/useRodadaFornecedor";

const props = defineProps<{ requisitar: RequisitarRodada }>();

const produtos = ref<ProdutoParaFornecedorDto[]>([]);
const marcados = ref<string[]>([]);
const busca = ref("");
const aberto = ref(false);
const carregando = ref(false);
const salvando = ref(false);
const erro = ref("");
const sucesso = ref("");

const filtrados = computed(() => {
  const termo = busca.value.trim().toLocaleLowerCase("pt-BR");
  const lista = termo
    ? produtos.value.filter((produto) =>
        `${produto.descricao} ${produto.grupo ?? ""}`.toLocaleLowerCase("pt-BR").includes(termo)
      )
    : produtos.value;
  return lista.slice(0, 200);
});
const jaVende = computed(() => produtos.value.filter((produto) => produto.jaVende).length);

async function carregar() {
  carregando.value = true;
  erro.value = "";
  try {
    produtos.value = await props.requisitar<ProdutoParaFornecedorDto[]>("/api/rodada/produtos");
  } catch (causa) {
    erro.value = causa instanceof Error ? causa.message : "Não foi possível carregar a lista.";
  } finally {
    carregando.value = false;
  }
}
async function abrir() {
  aberto.value = !aberto.value;
  if (aberto.value && !produtos.value.length) await carregar();
}
async function salvar() {
  if (!marcados.value.length) return;
  salvando.value = true;
  erro.value = "";
  sucesso.value = "";
  try {
    await props.requisitar("/api/rodada/produtos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ produtoIds: marcados.value })
    });
    sucesso.value = `${marcados.value.length} produto(s) a mais. Você recebe a cotação deles a partir da próxima.`;
    marcados.value = [];
    await carregar();
  } catch (causa) {
    erro.value = causa instanceof Error ? causa.message : "Não foi possível salvar.";
  } finally {
    salvando.value = false;
  }
}
</script>

<template>
  <section class="vendo" data-secao="produtos-que-vendo" aria-labelledby="titulo-vendo">
    <header class="vendo__topo">
      <div>
        <h2 id="titulo-vendo" class="vendo__titulo">Você vende outros produtos que compramos?</h2>
        <p class="vendo__texto">Marque na lista e passe a receber a cotação deles também.</p>
      </div>
      <v-btn
        variant="tonal"
        color="primary"
        :append-icon="aberto ? 'mdi-chevron-up' : 'mdi-chevron-down'"
        @click="abrir"
        >{{ aberto ? "Fechar lista" : "Ver lista" }}</v-btn
      >
    </header>
    <template v-if="aberto">
      <v-alert v-if="erro" type="error" variant="tonal" density="compact">{{ erro }}</v-alert>
      <v-alert v-if="sucesso" type="success" variant="tonal" density="compact">{{ sucesso }}</v-alert>
      <v-progress-linear v-if="carregando" indeterminate />
      <v-text-field
        v-model="busca"
        prepend-inner-icon="mdi-magnify"
        label="Buscar produto"
        density="comfortable"
        hide-details
        clearable
      />
      <p class="text-caption text-medium-emphasis">
        {{ jaVende }} produto(s) já são seus. Mostrando {{ filtrados.length }} de {{ produtos.length }}.
      </p>
      <div class="vendo__lista">
        <template v-for="produto in filtrados" :key="produto.produtoId">
          <v-checkbox v-if="produto.jaVende" :model-value="true" disabled density="compact" hide-details>
            <template #label>
              <span
                >{{ produto.descricao }}
                <v-chip size="x-small" label variant="tonal" color="success" class="ml-1">Já é seu</v-chip></span
              >
            </template>
          </v-checkbox>
          <v-checkbox v-else v-model="marcados" :value="produto.produtoId" density="compact" hide-details>
            <template #label>
              <span
                >{{ produto.descricao }}
                <span v-if="produto.grupo" class="text-caption text-medium-emphasis">· {{ produto.grupo }}</span></span
              >
            </template>
          </v-checkbox>
        </template>
      </div>
      <v-btn color="primary" variant="flat" :disabled="!marcados.length" :loading="salvando" @click="salvar"
        >Salvar {{ marcados.length || "" }} produto(s)</v-btn
      >
    </template>
  </section>
</template>

<style scoped>
.vendo {
  display: grid;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-4);
  border: 1px dashed var(--cx-line);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface);
}

.vendo__topo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-3);
}

.vendo__titulo {
  margin: 0;
  font-size: 1.0625rem;
  font-weight: 650;
}

.vendo__texto {
  margin: var(--cx-sp-1) 0 0;
  color: var(--cx-ink-soft);
}

.vendo__lista {
  display: grid;
  max-height: 420px;
  overflow-y: auto;
}
</style>
