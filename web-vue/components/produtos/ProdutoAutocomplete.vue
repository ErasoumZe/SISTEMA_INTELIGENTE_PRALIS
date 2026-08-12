<script setup lang="ts">
/**
 * Seletor de produto com busca REMOTA e hidratacao do item escolhido.
 *
 * Existe porque a listagem completa nunca deve virar fonte de seletor: `/api/produtos/opcoes`
 * devolve uma projecao reduzida (sem fiscal, custo, margem ou preco) e com teto de linhas. Digitar
 * refaz a consulta no servidor; o item ja gravado e hidratado por `ids`, para que a edicao de um
 * registro antigo mostre o rotulo mesmo que o produto nao caia no recorte inicial.
 */
import type { ProdutoOpcao } from "@padaria/shared";

const props = defineProps<{
  empresaId?: string | null;
  label?: string;
  densidade?: "default" | "comfortable" | "compact";
  desabilitado?: boolean;
  limpavel?: boolean;
  mensagemDeErro?: string | undefined;
}>();

const modelo = defineModel<string>({ default: "" });

const { apiGet } = useApi();

const itens = ref<ProdutoOpcao[]>([]);
const carregando = ref(false);
const termo = ref("");
let debounce: ReturnType<typeof setTimeout> | null = null;

function consulta(parametros: Record<string, string>) {
  const busca = new URLSearchParams();
  if (props.empresaId) busca.set("empresaId", props.empresaId);
  for (const [chave, valor] of Object.entries(parametros)) if (valor) busca.set(chave, valor);
  const texto = busca.toString();
  return texto ? `?${texto}` : "";
}

async function buscar(parametros: Record<string, string>) {
  carregando.value = true;
  try {
    const encontrados = await apiGet<ProdutoOpcao[]>(`/api/produtos/opcoes${consulta(parametros)}`);
    // Mantem o item selecionado na lista: sem isto o Vuetify perde o rotulo assim que a busca muda.
    const selecionado = itens.value.find((item) => item.id === modelo.value);
    const juntos =
      selecionado && !encontrados.some((item) => item.id === selecionado.id)
        ? [selecionado, ...encontrados]
        : encontrados;
    itens.value = juntos;
  } catch {
    itens.value = [];
  } finally {
    carregando.value = false;
  }
}

function aoDigitar(valor: string) {
  termo.value = valor;
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => void buscar({ busca: valor }), 300);
}

function rotulo(produto: ProdutoOpcao) {
  const codigo = produto.codigoInterno ? `${produto.codigoInterno} · ` : "";
  const marca = produto.marca ? ` (${produto.marca})` : "";
  return `${codigo}${produto.descricao}${marca}`;
}

onMounted(() => {
  // Hidrata o valor ja gravado JUNTO com o recorte inicial, numa chamada so.
  void buscar(modelo.value ? { ids: modelo.value } : {});
});

watch(
  () => props.empresaId,
  () => void buscar(modelo.value ? { ids: modelo.value } : {})
);

onBeforeUnmount(() => {
  if (debounce) clearTimeout(debounce);
});
</script>

<template>
  <v-autocomplete
    v-model="modelo"
    :items="itens"
    :item-title="rotulo"
    item-value="id"
    :label="label ?? 'Produto'"
    :density="densidade ?? 'comfortable'"
    :loading="carregando"
    :disabled="desabilitado"
    :clearable="limpavel ?? true"
    :error-messages="mensagemDeErro"
    :no-filter="true"
    prepend-inner-icon="mdi-basket"
    @update:search="aoDigitar"
  >
    <template #no-data>
      <div class="pa-3 text-body-2 text-medium-emphasis">
        {{ termo ? "Nenhum produto encontrado." : "Digite para buscar um produto." }}
      </div>
    </template>
  </v-autocomplete>
</template>
