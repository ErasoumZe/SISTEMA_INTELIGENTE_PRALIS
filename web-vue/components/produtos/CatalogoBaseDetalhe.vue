<script setup lang="ts">
/** "Ver cadastro" do catalogo BASE: os dados oficiais, campo a campo, com rotulos em portugues. */
type ProdutoBase = {
  id: string;
  idOrigem: string;
  codigoInterno: string | null;
  codigoBarras: string | null;
  nome: string;
  dadosOficiais: Record<string, unknown>;
};

defineProps<{ produto: ProdutoBase | null }>();
const emit = defineEmits<{ fechar: [] }>();

const rotulosOficiais: Record<string, string> = {
  nome: "Nome oficial",
  quantidade: "Quantidade informada pela origem (não é saldo do ERP)",
  medidabase: "Medida base",
  pesavel: "Produto pesável",
  teclabalanca: "Tecla de balança",
  validadebalanca: "Validade na balança",
  codigobarras: "Código de barras (EAN)",
  codigointerno: "Código interno Pralis",
  marca: "Marca",
  embalagem: "Embalagem",
  cde: "CDe",
  qtcad: "Quantidade por embalagem",
  medidacompra: "Medida de compra",
  compraaproximada: "Compra aproximada",
  fotourl: "Foto do produto",
  grupo: "Grupo",
  grupoid: "Identificador do grupo",
  tipo: "Tipo de produto",
  status: "Situação",
  habilitarajuda: "Ajuda no cadastro",
  estoquemin: "Estoque mínimo de origem",
  estoquemax: "Estoque máximo de origem",
  setorestoque: "Setor de estoque",
  custo: "Custo de origem",
  margempontual: "Margem pontual de origem",
  vvendapontual: "Preço de venda pontual de origem",
  auto: "Preço automático",
  setorvenda1: "Setor de venda 1",
  areavenda: "Área de venda",
  setorvenda2: "Setor de venda 2",
  localvenda1: "Local de venda 1",
  localvenda2: "Local de venda 2",
  fiscal: "Dados fiscais oficiais",
  transformacao: "Transformação",
  promocoes: "Promoções da origem",
  loja: "Catálogo de origem",
  baseproductid: "Referência da BASE na origem",
  createdbyname: "Incluído por",
  createdat: "Data de cadastro na origem",
  importado: "Importado para loja na origem"
};

function rotuloOficial(campo: string) {
  const chave = campo
    .replace(/([a-z0-9])([A-Z])/gu, "$1$2")
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, "");
  return rotulosOficiais[chave] ?? campo.replace(/([a-z0-9])([A-Z])/gu, "$1 $2");
}

function valorOficial(valor: unknown) {
  if (valor == null || valor === "") return "—";
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (typeof valor === "object") return JSON.stringify(valor, null, 2);
  return String(valor);
}
</script>

<template>
  <v-dialog :model-value="Boolean(produto)" max-width="900" @update:model-value="(aberto) => !aberto && emit('fechar')">
    <v-card v-if="produto" rounded="lg">
      <v-card-title>{{ produto.nome }}</v-card-title>
      <v-card-subtitle>
        Código {{ produto.codigoInterno || "—" }} · EAN {{ produto.codigoBarras || "—" }} · origem
        {{ produto.idOrigem }}
      </v-card-subtitle>
      <v-card-text>
        <v-img
          v-if="typeof produto.dadosOficiais['foto_url'] === 'string' && produto.dadosOficiais['foto_url']"
          :src="produto.dadosOficiais['foto_url']"
          :alt="`Foto de ${produto.nome}`"
          max-height="220"
          class="mb-4"
          contain
        />
        <div class="catalogo-base__detalhes">
          <div v-for="[campo, valor] in Object.entries(produto.dadosOficiais)" :key="campo">
            <strong>{{ rotuloOficial(campo) }}</strong>
            <pre>{{ valorOficial(valor) }}</pre>
          </div>
        </div>
      </v-card-text>
      <v-card-actions><v-spacer /><v-btn variant="text" @click="emit('fechar')">Fechar</v-btn></v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.catalogo-base__detalhes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  max-height: 65vh;
  overflow: auto;
}
.catalogo-base__detalhes > div {
  display: grid;
  gap: 4px;
  min-width: 0;
  overflow-wrap: anywhere;
  padding: 10px;
  border-radius: 8px;
  background: rgb(var(--v-theme-surface-variant));
}
.catalogo-base__detalhes strong {
  font-size: 0.8rem;
}
.catalogo-base__detalhes pre {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  font: inherit;
}
@media (max-width: 600px) {
  .catalogo-base__detalhes {
    grid-template-columns: 1fr;
  }
}
</style>
