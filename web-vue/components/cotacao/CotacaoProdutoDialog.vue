<script setup lang="ts">
/**
 * A cotação de um produto (doc 58 §4): cada fornecedor que recebeu, separado por situação. "Com aumento" pede a
 * decisão do comprador — aceitar o preço uma vez ou aceitar e reajustar a referência —, mesmo com a cotação aberta.
 * As ações da cotação inteira (encerrar, Pedido urgente com o que sobrou) ficam no botão de cada cotação.
 */
import { ROTULO_COLUNA_COTACAO, type OfertaDoProdutoDto } from "@padaria/shared";
import ProdutoBolinhas from "~/components/compras/ProdutoBolinhas.vue";
import CotacaoOfertaLinha from "~/components/cotacao/CotacaoOfertaLinha.vue";
import { useCotacaoProduto } from "~/composables/useCotacaoProduto";
import {
  COR_SITUACAO,
  TITULO_DA_SITUACAO,
  cotacoesDoProduto,
  itensComprados,
  ofertasPorSituacao,
  podeAceitarOferta,
  podeContraproporOferta
} from "~/utils/cotacao-produto";
import { formatarValorDecisao } from "~/utils/decisao-compras";

const aberto = defineModel<boolean>({ required: true });
const props = defineProps<{
  empresaId: string;
  produtoId: string | null;
  bolinhas: { maisVende: boolean; maisCompra: boolean; maisLucro: boolean } | null;
  podeEditar: boolean;
  podeExcecao: boolean;
}>();
const emit = defineEmits<{ mudou: []; acoes: [rodadaId: string] }>();

const empresaIdRef = computed(() => props.empresaId);
const { cotacao, carregando, processando, erro, carregar, aceitar, contrapropor } = useCotacaoProduto(empresaIdRef);
const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

const ofertas = computed(() => cotacao.value?.ofertas ?? []);
const comprados = computed(() => itensComprados(ofertas.value));
const grupos = computed(() => ofertasPorSituacao(ofertas.value));
const cotacoes = computed(() => cotacoesDoProduto(ofertas.value));
const temAumento = computed(() => ofertas.value.some((oferta) => oferta.situacao === "com_aumento"));

watch(
  () => [aberto.value, props.produtoId] as const,
  ([visivel, produtoId]) => {
    if (visivel && produtoId) void carregar(produtoId);
  },
  { immediate: true }
);

async function aposAcao(ok: boolean, mensagem: string) {
  if (!props.produtoId) return;
  if (ok) emit("mudou");
  // Em conflito (item ja comprado, proposta superada) a tela esta velha: recarrega e mantem o erro.
  await carregar(props.produtoId, !ok);
  if (ok) sucesso.value = mensagem;
}
const sucesso = ref("");
watch(aberto, () => (sucesso.value = ""));

async function aoAceitar(oferta: OfertaDoProdutoDto, reajustar: boolean) {
  sucesso.value = "";
  await aposAcao(
    await aceitar(oferta, reajustar),
    reajustar
      ? `Comprado de ${oferta.fornecedorNome}. A referência foi reajustada.`
      : `Comprado de ${oferta.fornecedorNome}. A referência continua a mesma.`
  );
}
async function aoContrapropor(oferta: OfertaDoProdutoDto, valor: number) {
  sucesso.value = "";
  await aposAcao(await contrapropor(oferta, valor), `Contraproposta enviada para ${oferta.fornecedorNome}.`);
}
</script>

<template>
  <v-dialog v-model="aberto" max-width="860" scrollable>
    <v-card data-dialogo="cotacao-produto">
      <v-card-title class="d-flex flex-wrap align-center ga-2">
        <ProdutoBolinhas v-if="bolinhas" v-bind="bolinhas" />
        <span>{{ cotacao?.descricao ?? "Cotação do produto" }}</span>
      </v-card-title>
      <v-card-subtitle v-if="cotacao">
        Referência
        {{
          cotacao.referencia === null
            ? "não cadastrada"
            : `${formatarValorDecisao(cotacao.referencia)}/${cotacao.unidade ?? "un"}`
        }}
      </v-card-subtitle>
      <v-card-text class="d-grid ga-3">
        <v-alert v-if="erro" type="error" variant="tonal" density="compact">{{ erro }}</v-alert>
        <v-alert v-if="sucesso" type="success" variant="tonal" density="compact" data-estado="aceite-feito">{{
          sucesso
        }}</v-alert>
        <v-progress-linear v-if="carregando" indeterminate />
        <v-alert v-if="temAumento && !podeExcecao" type="warning" variant="tonal" density="compact">
          Aceitar preço acima da referência exige a permissão de exceção. Você vê as ofertas, mas não pode aceitá-las.
        </v-alert>

        <section v-for="grupo in grupos" :key="grupo.situacao" class="grupo" :data-grupo="grupo.situacao">
          <div class="grupo__topo">
            <v-chip size="small" variant="tonal" label :color="COR_SITUACAO[grupo.situacao]">{{
              ROTULO_COLUNA_COTACAO[grupo.situacao]
            }}</v-chip>
            <span class="text-caption text-medium-emphasis">{{ TITULO_DA_SITUACAO[grupo.situacao] }}</span>
          </div>
          <CotacaoOfertaLinha
            v-for="oferta in grupo.ofertas"
            :key="`${oferta.rodadaItemId}:${oferta.fornecedorId}`"
            :oferta="oferta"
            :unidade="cotacao?.unidade ?? null"
            :pode-aceitar="podeExcecao && podeAceitarOferta(oferta, comprados)"
            :pode-contrapropor="podeEditar && podeContraproporOferta(oferta, comprados)"
            :processando="processando"
            @aceitar="aoAceitar"
            @contrapropor="aoContrapropor"
          />
        </section>
        <p v-if="cotacao && !grupos.length" class="text-body-2 text-medium-emphasis">
          Este produto não está mais em cotação.
        </p>
      </v-card-text>
      <v-card-actions class="flex-wrap ga-2">
        <v-btn
          v-for="item in cotacoes"
          :key="item.rodadaId"
          variant="text"
          prepend-icon="mdi-gavel"
          data-acao="acoes-cotacao"
          @click="emit('acoes', item.rodadaId)"
          >Cotação nº {{ item.rodadaNumero }} ·
          {{ item.rodadaAberta ? `fecha ${DATA_HORA.format(new Date(item.expiraEm))}` : "fechada" }}</v-btn
        >
        <v-spacer />
        <v-btn variant="text" @click="aberto = false">Fechar</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.grupo {
  display: grid;
  gap: var(--cx-sp-1);
  padding: var(--cx-sp-3);
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface-raised);
}

.grupo__topo {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--cx-sp-2);
}
</style>
