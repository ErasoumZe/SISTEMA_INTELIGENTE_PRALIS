<script setup lang="ts">
/**
 * "A fazer" sem fornecedor (doc 57 §2): itens de uma cotação aberta que nenhum fornecedor recebeu. O comprador
 * marca os itens, escolhe o fornecedor e o sistema manda pelo WhatsApp; o vínculo vai para o catálogo e a
 * próxima data já sai sozinha. Decisões pendentes (cotação fechada sem vencedor) abrem a fila de decisão.
 */
import { podeConvidar, type DecisaoPendenteDto, type ItemSemFornecedorDto } from "@padaria/shared";
import type { Opcao } from "~/types/padaria";
import { mensagemErro } from "~/utils/domain";
import { formatarQuantidade } from "~/utils/formatacao";

const props = defineProps<{
  empresaId: string;
  itens: ItemSemFornecedorDto[];
  decisoes: DecisaoPendenteDto[];
  fornecedores: Opcao[];
  podeEditar: boolean;
}>();
const emit = defineEmits<{ convidado: [nome: string]; decidir: [decisao: DecisaoPendenteDto] }>();
const { apiPost } = useApi();

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const marcados = ref<Record<string, boolean>>({});
const fornecedorPorRodada = ref<Record<string, string>>({});
const enviando = ref<string | null>(null);
const erro = ref("");

const rodadas = computed(() => {
  const grupos = new Map<
    string,
    { rodadaId: string; numero: number; expiraEm: string; itens: ItemSemFornecedorDto[] }
  >();
  for (const item of props.itens) {
    const grupo = grupos.get(item.rodadaId) ?? {
      rodadaId: item.rodadaId,
      numero: item.rodadaNumero,
      expiraEm: item.expiraEm,
      itens: []
    };
    grupo.itens.push(item);
    grupos.set(item.rodadaId, grupo);
  }
  return [...grupos.values()];
});
const opcoesFornecedor = computed(() =>
  props.fornecedores.map((fornecedor) => {
    const motivo = podeConvidar({ situacao: fornecedor.situacao ?? null, whatsapp: fornecedor.whatsapp ?? null });
    return {
      value: fornecedor.id,
      title: motivo ? `${fornecedor.nome ?? "Fornecedor"} — ${motivo}` : (fornecedor.nome ?? "Fornecedor"),
      props: { disabled: Boolean(motivo) }
    };
  })
);
const selecionados = (rodadaId: string) =>
  props.itens.filter((item) => item.rodadaId === rodadaId && marcados.value[item.rodadaItemId]);

async function enviar(rodadaId: string) {
  const fornecedorId = fornecedorPorRodada.value[rodadaId];
  const itens = selecionados(rodadaId);
  if (!fornecedorId || !itens.length) return;
  enviando.value = rodadaId;
  erro.value = "";
  try {
    await apiPost(`/api/compras/rodadas/${rodadaId}/convidar`, {
      empresaId: props.empresaId,
      fornecedorId,
      rodadaItemIds: itens.map((item) => item.rodadaItemId)
    });
    for (const item of itens) delete marcados.value[item.rodadaItemId];
    emit("convidado", props.fornecedores.find((fornecedor) => fornecedor.id === fornecedorId)?.nome ?? "Fornecedor");
  } catch (causa) {
    erro.value = mensagemErro(causa);
  } finally {
    enviando.value = null;
  }
}
</script>

<template>
  <div class="d-grid ga-4" data-secao="a-fazer">
    <v-alert v-if="erro" type="error" variant="tonal" density="compact">{{ erro }}</v-alert>
    <section v-for="rodada in rodadas" :key="rodada.rodadaId" class="a-fazer" data-bloco="rodada-sem-fornecedor">
      <header class="a-fazer__topo">
        <strong>Cotação #{{ rodada.numero }}</strong>
        <span class="text-caption text-medium-emphasis"
          >Fecha em {{ DATA_HORA.format(new Date(rodada.expiraEm)) }}</span
        >
      </header>
      <v-checkbox
        v-for="item in rodada.itens"
        :key="item.rodadaItemId"
        v-model="marcados[item.rodadaItemId]"
        :disabled="!podeEditar"
        density="compact"
        hide-details
        :label="`${item.descricaoProduto} · ${formatarQuantidade(item.quantidade)}`"
      />
      <div v-if="podeEditar" class="a-fazer__envio">
        <v-autocomplete
          v-model="fornecedorPorRodada[rodada.rodadaId]"
          :items="opcoesFornecedor"
          label="Fornecedor"
          density="compact"
          hide-details
          data-campo="fornecedor-a-fazer"
        />
        <v-btn
          color="primary"
          prepend-icon="mdi-whatsapp"
          :disabled="!fornecedorPorRodada[rodada.rodadaId] || !selecionados(rodada.rodadaId).length"
          :loading="enviando === rodada.rodadaId"
          @click="enviar(rodada.rodadaId)"
          >Enviar {{ selecionados(rodada.rodadaId).length || "" }} item(ns)</v-btn
        >
      </div>
    </section>

    <section v-if="decisoes.length" class="d-grid ga-2" data-bloco="decisoes-pendentes">
      <h3 class="text-subtitle-2">Cotações fechadas esperando sua decisão</h3>
      <div v-for="decisao in decisoes" :key="decisao.solicitacaoId" class="a-fazer a-fazer--linha">
        <span
          ><strong>Cotação #{{ decisao.rodadaNumero }}</strong>
          <span class="text-caption text-medium-emphasis"> · {{ decisao.observacao ?? "Sem observação" }}</span></span
        >
        <v-btn size="small" variant="tonal" color="warning" @click="emit('decidir', decisao)">Decidir</v-btn>
      </div>
    </section>
  </div>
</template>

<style scoped>
.a-fazer {
  display: grid;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-3);
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface-raised);
}

.a-fazer--linha {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
}

.a-fazer__topo {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--cx-sp-2);
}

.a-fazer__envio {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--cx-sp-2);
  align-items: center;
}

@media (max-width: 599px) {
  .a-fazer__envio {
    grid-template-columns: 1fr;
  }
}
</style>
