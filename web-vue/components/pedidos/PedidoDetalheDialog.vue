<script setup lang="ts">
/**
 * O pedido de um fornecedor (doc 58 §5 e §6): o pedido da cotação nasce Comprado; o fornecedor pode ajustar a
 * quantidade ao estoque dele (aparece no histórico). Daqui se confere o recebimento ou se cancela. A trilha no topo
 * mostra onde o pedido está; a coluna "Devolvido" só aparece quando houve devolução.
 */
import type { PedidoDto, PedidoStatus } from "@padaria/shared";
import ComprasSituacao from "~/components/compras/base/ComprasSituacao.vue";
import { formatarQuantidade } from "~/utils/formatacao";
import { pedidoEhLegado, rotuloDoTipoDePedido, rotuloStatusPedido, tomStatusPedido } from "~/utils/pedido-origem";

const aberto = defineModel<boolean>({ default: false });
const props = defineProps<{
  pedido: PedidoDto | null;
  podeEditar: boolean;
  podeReceber: boolean;
  transicionando: boolean;
}>();
const emit = defineEmits<{
  situacao: [status: "cancelado"];
  receber: [];
}>();

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const etapasLegado: PedidoStatus[] = ["a_fazer", "enviado", "retornado", "confirmado", "recebido_parcial", "recebido"];
const etapasRodada: PedidoStatus[] = ["confirmado", "recebido_parcial", "recebido"];
const etapas = computed(() => (props.pedido && pedidoEhLegado(props.pedido.tipo) ? etapasLegado : etapasRodada));
const historico = computed(() => props.pedido?.status === "rascunho" || props.pedido?.status === "aprovado");
const legadoAberto = computed(
  () =>
    Boolean(props.pedido) &&
    pedidoEhLegado(props.pedido!.tipo) &&
    ["a_fazer", "enviado", "retornado"].includes(props.pedido!.status)
);
const itens = computed(() => props.pedido?.itens ?? []);
const temDevolucao = computed(() => itens.value.some((item) => Number(item.quantidadeDevolvida) > 0));
const podeConferir = computed(
  () => props.podeReceber && ["confirmado", "recebido_parcial"].includes(props.pedido?.status ?? "")
);
const podeCancelar = computed(
  () =>
    props.podeEditar && !["recebido", "cancelado", "rascunho", "aprovado"].includes(props.pedido?.status ?? "cancelado")
);

function etapaFeita(etapa: PedidoStatus) {
  if (!props.pedido || props.pedido.status === "cancelado") return false;
  return etapas.value.indexOf(etapa) <= etapas.value.indexOf(props.pedido.status);
}
</script>

<template>
  <v-dialog v-model="aberto" max-width="860" scrollable :fullscreen="$vuetify.display.xs">
    <v-card v-if="pedido" class="pedido-detalhe">
      <header class="pedido-detalhe__topo">
        <div class="pedido-detalhe__titulos">
          <h2 class="pedido-detalhe__titulo">{{ pedido.fornecedorNome ?? "Pedido histórico" }}</h2>
          <p class="pedido-detalhe__subtitulo">
            {{ pedido.totalItens }} item(ns) · {{ rotuloDoTipoDePedido(pedido.tipo) }} · comprado em
            {{ DATA_HORA.format(new Date(pedido.aprovadoEm ?? pedido.criadoEm)) }}
          </p>
        </div>
        <ComprasSituacao
          :rotulo="rotuloStatusPedido(pedido.status)"
          :tom="tomStatusPedido(pedido.status)"
          data-campo="situacao-pedido"
        />
        <v-btn icon="mdi-close" variant="text" size="small" aria-label="Fechar" @click="aberto = false" />
      </header>

      <v-card-text class="pedido-detalhe__corpo">
        <v-alert v-if="historico" type="warning" variant="tonal" density="compact">
          Pedido histórico: leitura preservada; não entra no novo fluxo sem migração de dados aprovada.
        </v-alert>
        <v-alert v-else-if="legadoAberto" type="info" variant="tonal" density="compact" data-legado="pedido">
          Pedido do fluxo antigo: não é mais editado, enviado nem confirmado. Só pode ser cancelado. Para comprar de
          novo, use o Pedido urgente.
        </v-alert>

        <ol v-if="!historico && pedido.status !== 'cancelado'" class="trilha" aria-label="Etapas do pedido">
          <li
            v-for="etapa in etapas"
            :key="etapa"
            class="trilha__etapa"
            :class="{ 'trilha__etapa--feita': etapaFeita(etapa), 'trilha__etapa--atual': pedido.status === etapa }"
          >
            <span class="trilha__ponto" aria-hidden="true" />{{ rotuloStatusPedido(etapa) }}
          </li>
        </ol>

        <div class="pedido-detalhe__tabela">
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th class="numero">Pedido</th>
                <th class="numero">Recebido</th>
                <th v-if="temDevolucao" class="numero">Devolvido</th>
                <th class="numero">Falta</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in itens" :key="item.id">
                <td class="produto">{{ item.descricaoProduto }}</td>
                <td class="numero">{{ formatarQuantidade(item.quantidade) }}</td>
                <td class="numero">{{ formatarQuantidade(item.quantidadeRecebida) }}</td>
                <td v-if="temDevolucao" class="numero">{{ formatarQuantidade(item.quantidadeDevolvida) }}</td>
                <td class="numero" :class="{ 'numero--falta': Number(item.quantidadePendente) > 0 }">
                  {{ formatarQuantidade(item.quantidadePendente) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <section v-if="pedido.eventos?.length" class="historico" data-secao="historico-pedido">
          <h3 class="historico__titulo">Histórico</h3>
          <ul class="historico__lista">
            <li v-for="evento in pedido.eventos" :key="evento.id" class="historico__item" data-evento="pedido">
              <span class="historico__quando">{{ DATA_HORA.format(new Date(evento.criadoEm)) }}</span>
              <span class="historico__o-que">
                <strong>{{ rotuloStatusPedido(evento.status) }}</strong> · {{ evento.criadoPorNome }}
                <span v-if="evento.observacao" class="historico__obs">{{ evento.observacao }}</span>
              </span>
            </li>
          </ul>
        </section>
      </v-card-text>

      <footer class="pedido-detalhe__acoes">
        <v-btn
          v-if="podeCancelar"
          color="error"
          variant="text"
          :loading="transicionando"
          @click="emit('situacao', 'cancelado')"
          >Cancelar pedido</v-btn
        >
        <v-spacer />
        <v-btn variant="text" @click="aberto = false">Fechar</v-btn>
        <v-btn
          v-if="podeConferir"
          color="primary"
          variant="flat"
          prepend-icon="mdi-truck-check-outline"
          @click="emit('receber')"
          >Conferir recebimento</v-btn
        >
      </footer>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.pedido-detalhe {
  border-radius: var(--cx-r-lg) !important;
}

.pedido-detalhe__topo {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-5) var(--cx-sp-4) var(--cx-sp-4) var(--cx-sp-5);
  border-bottom: 1px solid var(--cx-line-soft);
}

.pedido-detalhe__titulos {
  flex: 1;
  min-width: 0;
}

.pedido-detalhe__titulo {
  margin: 0;
  color: var(--cx-ink);
  font-size: var(--cx-fs-title);
  font-weight: 650;
  letter-spacing: var(--cx-tracking-tight);
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.pedido-detalhe__subtitulo {
  margin: var(--cx-sp-1) 0 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

.pedido-detalhe__corpo {
  display: grid;
  /* Linhas do tamanho do conteudo: num dialogo de altura limitada, a tabela e o historico nao podem ser
     espremidos (o corpo e que rola). */
  grid-auto-rows: max-content;
  align-content: start;
  gap: var(--cx-sp-5);
  padding: var(--cx-sp-5) !important;
}

.trilha {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-2) var(--cx-sp-5);
  margin: 0;
  padding: 0;
  list-style: none;
}

.trilha__etapa {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-2);
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

.trilha__ponto {
  width: 10px;
  height: 10px;
  border: 2px solid var(--cx-line);
  border-radius: 50%;
}

.trilha__etapa--feita {
  color: var(--cx-ink);
}

.trilha__etapa--feita .trilha__ponto {
  border-color: var(--cx-brand);
  background: var(--cx-brand);
}

.trilha__etapa--atual {
  font-weight: 650;
}

.pedido-detalhe__tabela {
  overflow-x: auto;
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-md);
}

.pedido-detalhe__tabela table {
  width: 100%;
  border-collapse: collapse;
}

.pedido-detalhe__tabela th,
.pedido-detalhe__tabela td {
  padding: var(--cx-sp-2) var(--cx-sp-4);
  border-top: 1px solid var(--cx-line-soft);
  text-align: left;
}

.pedido-detalhe__tabela th {
  border-top: 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
  font-weight: 600;
}

.pedido-detalhe__tabela .produto {
  min-width: 160px;
  font-weight: 600;
}

.pedido-detalhe__tabela .numero {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.numero--falta {
  color: var(--cx-attention);
  font-weight: 650;
}

.historico__titulo {
  margin: 0 0 var(--cx-sp-2);
  color: var(--cx-ink);
  font-size: var(--cx-fs-body);
  font-weight: 650;
}

.historico__lista {
  display: grid;
  gap: var(--cx-sp-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.historico__item {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: var(--cx-sp-3);
  font-size: var(--cx-fs-caption);
}

.historico__quando {
  color: var(--cx-ink-soft);
  font-variant-numeric: tabular-nums;
}

.historico__o-que {
  color: var(--cx-ink);
}

.historico__obs {
  display: block;
  color: var(--cx-ink-soft);
}

.pedido-detalhe__acoes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-3) var(--cx-sp-5);
  border-top: 1px solid var(--cx-line-soft);
}

@media (max-width: 599px) {
  .pedido-detalhe__topo,
  .pedido-detalhe__acoes {
    padding-left: var(--cx-sp-4);
    padding-right: var(--cx-sp-4);
  }

  .pedido-detalhe__topo {
    flex-wrap: wrap;
  }

  .pedido-detalhe__corpo {
    padding: var(--cx-sp-4) !important;
  }

  .historico__item {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }
}
</style>
