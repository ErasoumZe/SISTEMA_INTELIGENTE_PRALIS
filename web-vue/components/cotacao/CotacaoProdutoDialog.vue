<script setup lang="ts">
/**
 * A cotação de um produto (doc 58 §4). Organizada pelo que o comprador faz com cada oferta: primeiro o que pede
 * decisão (aceitar — só desta vez ou reajustando a referência — ou contrapropor, mesmo com a cotação aberta),
 * depois quem ainda não respondeu, quem não tem oferta e o que já foi comprado. As ações da cotação inteira
 * (encerrar, Pedido urgente com o que sobrou) ficam no rodapé.
 */
import type { OfertaDoProdutoDto } from "@padaria/shared";
import ProdutoBolinhas from "~/components/compras/ProdutoBolinhas.vue";
import CotacaoOfertaLinha from "~/components/cotacao/CotacaoOfertaLinha.vue";
import { useCotacaoProduto } from "~/composables/useCotacaoProduto";
import {
  AJUDA_DO_GRUPO,
  TITULO_DO_GRUPO,
  cotacoesDoProduto,
  itensComprados,
  ofertasAgrupadas,
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
const grupos = computed(() => ofertasAgrupadas(ofertas.value));
const cotacoes = computed(() => cotacoesDoProduto(ofertas.value));
const unidade = computed(() => cotacao.value?.unidade ?? "un");
const temDecisao = computed(() => grupos.value.some((grupo) => grupo.grupo === "decidir"));
const prazo = computed(() => {
  const abertas = cotacoes.value.filter((item) => item.rodadaAberta);
  if (!abertas.length) return "Cotação encerrada";
  const proxima = abertas.map((item) => item.expiraEm).sort()[0]!;
  return `Fecha ${DATA_HORA.format(new Date(proxima))}`;
});

const sucesso = ref("");
watch(
  () => [aberto.value, props.produtoId] as const,
  ([visivel, produtoId]) => {
    sucesso.value = "";
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
  <v-dialog v-model="aberto" max-width="820" scrollable :fullscreen="$vuetify.display.xs">
    <v-card class="cotacao" data-dialogo="cotacao-produto">
      <header class="cotacao__topo">
        <div class="cotacao__titulos">
          <h2 class="cotacao__titulo">
            <ProdutoBolinhas v-if="bolinhas" v-bind="bolinhas" />
            {{ cotacao?.descricao ?? "Cotação do produto" }}
          </h2>
          <p v-if="cotacao" class="cotacao__resumo" data-campo="referencia">
            <span class="cotacao__referencia" :class="{ 'cotacao__referencia--sem': cotacao.referencia === null }">
              {{
                cotacao.referencia === null
                  ? "Sem referência"
                  : `Referência ${formatarValorDecisao(cotacao.referencia)}/${unidade}`
              }}
            </span>
            <span>{{ prazo }}</span>
          </p>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" aria-label="Fechar" @click="aberto = false" />
      </header>
      <v-progress-linear v-if="carregando" indeterminate height="2" />

      <v-card-text class="cotacao__corpo">
        <v-alert v-if="erro" type="error" variant="tonal" density="compact" class="mx-5 mb-3">{{ erro }}</v-alert>
        <v-alert
          v-if="sucesso"
          type="success"
          variant="tonal"
          density="compact"
          class="mx-5 mb-3"
          data-estado="aceite-feito"
          >{{ sucesso }}</v-alert
        >
        <v-alert v-if="temDecisao && !podeExcecao" type="info" variant="tonal" density="compact" class="mx-5 mb-3">
          Aceitar uma oferta que não comprou sozinha exige a permissão de exceção.
        </v-alert>

        <section v-for="grupo in grupos" :key="grupo.grupo" class="grupo" :data-grupo="grupo.grupo">
          <div class="grupo__topo">
            <h3 class="grupo__titulo">
              {{ TITULO_DO_GRUPO[grupo.grupo] }} <span class="grupo__conta">{{ grupo.ofertas.length }}</span>
            </h3>
            <p class="grupo__ajuda">{{ AJUDA_DO_GRUPO[grupo.grupo] }}</p>
          </div>
          <CotacaoOfertaLinha
            v-for="oferta in grupo.ofertas"
            :key="`${oferta.rodadaItemId}:${oferta.fornecedorId}`"
            :oferta="oferta"
            :unidade="cotacao?.unidade ?? null"
            :referencia="cotacao?.referencia ?? null"
            :mostrar-cotacao="cotacoes.length > 1"
            :pode-aceitar="podeExcecao && podeAceitarOferta(oferta, comprados)"
            :pode-contrapropor="podeEditar && podeContraproporOferta(oferta, comprados)"
            :processando="processando"
            @aceitar="aoAceitar"
            @contrapropor="aoContrapropor"
          />
        </section>
        <p v-if="cotacao && !grupos.length" class="cotacao__vazio">Este produto não está mais em cotação.</p>
      </v-card-text>

      <footer class="cotacao__rodape">
        <v-btn
          v-if="cotacoes.length === 1"
          variant="text"
          prepend-icon="mdi-cog-outline"
          data-acao="acoes-cotacao"
          @click="emit('acoes', cotacoes[0]!.rodadaId)"
          >Opções da cotação</v-btn
        >
        <v-menu v-else-if="cotacoes.length > 1" location="top start">
          <template #activator="{ props: ativador }">
            <v-btn v-bind="ativador" variant="text" prepend-icon="mdi-cog-outline" append-icon="mdi-chevron-up"
              >Opções da cotação</v-btn
            >
          </template>
          <v-list density="compact">
            <v-list-item
              v-for="item in cotacoes"
              :key="item.rodadaId"
              :title="`Cotação de ${DATA_HORA.format(new Date(item.abertaEm))}`"
              :subtitle="item.rodadaAberta ? `fecha ${DATA_HORA.format(new Date(item.expiraEm))}` : 'encerrada'"
              data-acao="acoes-cotacao"
              @click="emit('acoes', item.rodadaId)"
            />
          </v-list>
        </v-menu>
        <v-spacer />
        <v-btn variant="tonal" @click="aberto = false">Fechar</v-btn>
      </footer>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.cotacao {
  border-radius: var(--cx-r-lg) !important;
}

.cotacao__topo {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-5) var(--cx-sp-4) var(--cx-sp-4) var(--cx-sp-5);
}

.cotacao__titulos {
  display: grid;
  gap: var(--cx-sp-2);
  min-width: 0;
}

.cotacao__titulo {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-2);
  margin: 0;
  color: var(--cx-ink);
  font-size: var(--cx-fs-title);
  font-weight: 650;
  letter-spacing: var(--cx-tracking-tight);
  overflow-wrap: anywhere;
}

.cotacao__resumo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cx-sp-3);
  margin: 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

.cotacao__referencia {
  padding: 2px 10px;
  border-radius: var(--cx-r-pill);
  background: var(--cx-brand-wash);
  color: var(--cx-brand-text);
  font-weight: 600;
}

.cotacao__referencia--sem {
  background: var(--cx-surface-sunken);
  color: var(--cx-ink-soft);
}

.cotacao__corpo {
  padding: 0 0 var(--cx-sp-2) !important;
}

.grupo + .grupo {
  margin-top: var(--cx-sp-3);
}

.grupo__topo {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px var(--cx-sp-3);
  padding: var(--cx-sp-3) var(--cx-sp-5) var(--cx-sp-2);
}

.grupo__titulo {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-2);
  margin: 0;
  color: var(--cx-ink);
  font-size: var(--cx-fs-body);
  font-weight: 650;
}

.grupo__conta {
  min-width: 20px;
  padding: 0 6px;
  border-radius: var(--cx-r-pill);
  background: var(--cx-surface-sunken);
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-micro);
  line-height: 18px;
  text-align: center;
}

.grupo__ajuda {
  margin: 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

.cotacao__vazio {
  padding: var(--cx-sp-6) var(--cx-sp-5);
  color: var(--cx-ink-soft);
  text-align: center;
}

.cotacao__rodape {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-3) var(--cx-sp-5);
  border-top: 1px solid var(--cx-line-soft);
}

@media (max-width: 599px) {
  .cotacao__topo,
  .grupo__topo,
  .cotacao__rodape {
    padding-left: var(--cx-sp-4);
    padding-right: var(--cx-sp-4);
  }
}
</style>
