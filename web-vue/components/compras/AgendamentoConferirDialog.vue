<script setup lang="ts">
import { podeConvidar, type EnvioOcorrenciaDto, type ProdutoAgendamentoDto, type RodadaDto } from "@padaria/shared";
import type { Opcao } from "~/types/padaria";
import { mensagemErro } from "~/utils/domain";

// Conferir e enviar o pedido do dia (doc 56 §4): o comprador ajusta quantidades, acrescenta produtos e
// confirma para quais fornecedores cada produto vai. Já vêm marcados os fornecedores com vínculo aprovado
// no catálogo (decisão 3); produto sem fornecedor pede escolha (decisão 4). Enviar abre a rodada e devolve
// os links do WhatsApp.
const aberto = defineModel<boolean>({ required: true });
const props = defineProps<{
  empresaId: string;
  ocorrenciaId: string | null;
  produtos: ProdutoAgendamentoDto[];
  fornecedores: Opcao[];
}>();
const emit = defineEmits<{ enviado: [rodada: RodadaDto] }>();

type Linha = {
  produtoId: string;
  descricao: string;
  quantidade: string;
  sugeridos: EnvioOcorrenciaDto["itens"][number]["fornecedores"];
  escolhidos: string[];
};

const { apiGet, apiPost } = useApi();
const linhas = ref<Linha[]>([]);
const prazoHoras = ref(0);
const carregando = ref(false);
const enviando = ref(false);
const erro = ref("");
const produtoNovo = ref<string | null>(null);

const motivo = (fornecedor: { situacao: string | null; whatsapp: string | null }) =>
  podeConvidar({
    situacao: (fornecedor.situacao as "ativo" | "inativo" | null) ?? null,
    whatsapp: fornecedor.whatsapp
  });
const nomeDoFornecedor = (id: string) =>
  props.fornecedores.find((fornecedor) => fornecedor.id === id)?.nome ?? "Fornecedor";
const convidaveis = computed(() =>
  props.fornecedores.filter(
    (fornecedor) => !motivo({ situacao: fornecedor.situacao ?? null, whatsapp: fornecedor.whatsapp ?? null })
  )
);
const paraAcrescentar = computed(() => {
  const ja = new Set(linhas.value.map((linha) => linha.produtoId));
  return props.produtos.filter((produto) => !ja.has(produto.id));
});

async function carregar() {
  if (!props.ocorrenciaId) return;
  carregando.value = true;
  erro.value = "";
  linhas.value = [];
  try {
    const envio = await apiGet<EnvioOcorrenciaDto>(
      `/api/compras/agendamentos/ocorrencias/${props.ocorrenciaId}/envio?empresaId=${encodeURIComponent(props.empresaId)}`
    );
    prazoHoras.value = envio.prazoRespostaHoras;
    linhas.value = envio.itens.map((item) => ({
      produtoId: item.produtoId,
      descricao: item.descricao,
      quantidade: item.quantidade ? String(Number(item.quantidade)) : "",
      sugeridos: item.fornecedores,
      escolhidos: item.fornecedores
        .filter((fornecedor) => !motivo(fornecedor))
        .map((fornecedor) => fornecedor.fornecedorId)
    }));
  } catch (causa) {
    erro.value = mensagemErro(causa);
  } finally {
    carregando.value = false;
  }
}
watch(aberto, (valor) => valor && carregar());

function acrescentar() {
  const produto = props.produtos.find((item) => item.id === produtoNovo.value);
  if (!produto) return;
  linhas.value.push({
    produtoId: produto.id,
    descricao: produto.descricao,
    quantidade: "",
    sugeridos: [],
    escolhidos: []
  });
  produtoNovo.value = null;
}
function alternar(linha: Linha, fornecedorId: string) {
  linha.escolhidos = linha.escolhidos.includes(fornecedorId)
    ? linha.escolhidos.filter((id) => id !== fornecedorId)
    : [...linha.escolhidos, fornecedorId];
}

/** Só os produtos com quantidade vão; cada um precisa de ao menos um fornecedor. */
const pendencia = computed(() => {
  const comQuantidade = linhas.value.filter((linha) => Number(linha.quantidade) > 0);
  if (!comQuantidade.length) return "Informe a quantidade de ao menos um produto.";
  const sem = comQuantidade.find((linha) => !linha.escolhidos.length);
  return sem ? `Escolha um fornecedor para “${sem.descricao}”.` : "";
});

async function enviar() {
  if (pendencia.value || !props.ocorrenciaId) return;
  enviando.value = true;
  erro.value = "";
  const comQuantidade = linhas.value.filter((linha) => Number(linha.quantidade) > 0);
  const porFornecedor = new Map<string, string[]>();
  for (const linha of comQuantidade)
    for (const fornecedorId of linha.escolhidos)
      porFornecedor.set(fornecedorId, [...(porFornecedor.get(fornecedorId) ?? []), linha.produtoId]);
  try {
    const rodada = await apiPost<RodadaDto>(`/api/compras/agendamentos/ocorrencias/${props.ocorrenciaId}/enviar`, {
      empresaId: props.empresaId,
      itens: comQuantidade.map((linha) => ({ produtoId: linha.produtoId, quantidade: Number(linha.quantidade) })),
      convites: [...porFornecedor].map(([fornecedorId, produtoIds]) => ({ fornecedorId, produtoIds }))
    });
    aberto.value = false;
    emit("enviado", rodada);
  } catch (causa) {
    erro.value = mensagemErro(causa);
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <v-dialog v-model="aberto" max-width="980" scrollable>
    <v-card>
      <v-card-title class="d-flex align-center ga-2">
        <v-icon icon="mdi-clipboard-check-outline" color="primary" />
        Conferir e enviar o pedido
      </v-card-title>
      <v-card-subtitle class="text-wrap">
        Cada fornecedor recebe só os produtos marcados para ele. O prazo de resposta é de {{ prazoHoras }} hora(s).
      </v-card-subtitle>
      <v-card-text class="d-grid ga-3">
        <v-alert v-if="erro" type="error" variant="tonal" density="compact">{{ erro }}</v-alert>
        <v-progress-linear v-if="carregando" indeterminate />
        <div v-for="linha in linhas" :key="linha.produtoId" class="item" :data-item="linha.produtoId">
          <div class="item__produto">
            <strong>{{ linha.descricao }}</strong>
            <v-text-field
              v-model="linha.quantidade"
              type="number"
              min="0"
              label="Quantidade"
              density="compact"
              hide-details
              class="item__quantidade"
            />
          </div>
          <div class="d-flex flex-wrap ga-2 align-center">
            <v-chip
              v-for="fornecedor in linha.sugeridos"
              :key="fornecedor.fornecedorId"
              :disabled="Boolean(motivo(fornecedor))"
              :title="motivo(fornecedor) || undefined"
              :color="linha.escolhidos.includes(fornecedor.fornecedorId) ? 'primary' : undefined"
              :variant="linha.escolhidos.includes(fornecedor.fornecedorId) ? 'flat' : 'outlined'"
              filter
              :model-value="linha.escolhidos.includes(fornecedor.fornecedorId)"
              @click="alternar(linha, fornecedor.fornecedorId)"
              >{{ fornecedor.nome }}</v-chip
            >
            <v-chip
              v-for="id in linha.escolhidos.filter((id) => !linha.sugeridos.some((item) => item.fornecedorId === id))"
              :key="id"
              color="primary"
              closable
              @click:close="alternar(linha, id)"
              >{{ nomeDoFornecedor(id) }}</v-chip
            >
            <v-autocomplete
              :items="convidaveis"
              item-title="nome"
              item-value="id"
              :label="linha.sugeridos.length ? 'Outro fornecedor' : 'Escolha o fornecedor'"
              density="compact"
              hide-details
              class="item__fornecedor"
              :model-value="null"
              @update:model-value="(id: string | null) => id && !linha.escolhidos.includes(id) && alternar(linha, id)"
            />
          </div>
        </div>
        <div class="d-flex ga-3 align-center flex-wrap">
          <v-autocomplete
            v-model="produtoNovo"
            :items="paraAcrescentar"
            item-title="descricao"
            item-value="id"
            label="Acrescentar produto"
            density="compact"
            hide-details
            class="item__fornecedor"
          />
          <v-btn variant="tonal" prepend-icon="mdi-plus" :disabled="!produtoNovo" @click="acrescentar"
            >Acrescentar</v-btn
          >
        </div>
      </v-card-text>
      <v-card-actions class="flex-wrap">
        <span v-if="pendencia && linhas.length" class="text-caption text-medium-emphasis px-2">{{ pendencia }}</span>
        <v-spacer />
        <v-btn variant="text" @click="aberto = false">Voltar</v-btn>
        <v-btn
          color="primary"
          prepend-icon="mdi-whatsapp"
          :disabled="Boolean(pendencia)"
          :loading="enviando"
          @click="enviar"
          >Enviar aos fornecedores</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.item {
  display: grid;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid var(--cx-line-soft);
}
.item__produto {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  overflow-wrap: anywhere;
}
.item__quantidade {
  flex: 0 1 140px;
  min-width: 110px;
}
.item__fornecedor {
  flex: 1 1 220px;
  min-width: 0;
  max-width: 320px;
}
</style>
