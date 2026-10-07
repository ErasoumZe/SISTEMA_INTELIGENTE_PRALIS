<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { DetalheCaixaResponse, LinhaHistoricoCaixa } from "@padaria/shared";
import type { LancamentoCaixa } from "@padaria/shared";
import { dinheiro, mensagemErro } from "~/utils/domain";
import { formatarDataHora, formatarDataSomenteDia } from "~/utils/formatacao";

const props = defineProps<{ caixa: LinhaHistoricoCaixa; empresaId: string }>();

const { apiGet, apiUrl } = useApi();

const detalhe = ref<DetalheCaixaResponse | null>(null);
const carregando = ref(false);
const erro = ref("");
const anexos = ref<
  Array<{
    id: string;
    tipo: "folha_fechamento" | "comprovante_cartao" | "relatorio_vendas_creare";
    nomeOriginal: string;
  }>
>([]);
const conferencias = ref<
  Array<{
    id: string;
    etapa: "abertura" | "retorno_sangria";
    resultado: "convergente" | "divergente";
    valorEspecieDeclarado: number;
    valorMoedasDeclarado: number;
    valorEspecieContado: number;
    valorMoedasContado: number;
    observacao: string | null;
    conferidoEm: string;
  }>
>([]);

async function carregar() {
  carregando.value = true;
  erro.value = "";
  try {
    const [detalheCarregado, anexosCarregados, conferenciasCarregadas] = await Promise.all([
      apiGet<DetalheCaixaResponse>(`/api/caixa/${props.caixa.id}/detalhe`),
      apiGet<
        Array<{
          id: string;
          tipo: "folha_fechamento" | "comprovante_cartao" | "relatorio_vendas_creare";
          nomeOriginal: string;
        }>
      >(`/api/caixa/${props.caixa.id}/anexos`),
      apiGet<typeof conferencias.value>(`/api/caixa/${props.caixa.id}/conferencias-fisicas`)
    ]);
    detalhe.value = detalheCarregado;
    anexos.value = anexosCarregados ?? [];
    conferencias.value = conferenciasCarregadas ?? [];
  } catch (error) {
    erro.value = mensagemErro(error);
  } finally {
    carregando.value = false;
  }
}

// Venda integrada tem hora real (dataHora): mostra data e hora de verdade. Sem ela, so a data
// CONTABIL (date-only) — que nao pode passar por Date, sob pena de voltar um dia e inventar hora.
function dataDoLancamento(item: LancamentoCaixa) {
  return item.dataHora ? formatarDataHora(item.dataHora) : formatarDataSomenteDia(item.data);
}

function horarioAuditado(valor: { dataHoraAbertura: string | null; dataHoraFechamento: string | null }) {
  const abertura = valor.dataHoraAbertura ? formatarDataHora(valor.dataHoraAbertura) : "--";
  const fechamento = valor.dataHoraFechamento ? formatarDataHora(valor.dataHoraFechamento) : "--";
  return `${abertura} -> ${fechamento}`;
}

onMounted(carregar);
</script>

<template>
  <div>
    <v-progress-linear v-if="carregando" indeterminate />
    <v-alert v-else-if="erro" type="error" variant="tonal" density="compact">{{ erro }}</v-alert>

    <template v-else-if="detalhe">
      <v-alert v-if="caixa.fechadoPorNome" type="info" variant="tonal" density="compact" class="mb-4">
        Fechamento executado por <strong>{{ caixa.fechadoPorNome }}</strong
        >.
      </v-alert>

      <v-card variant="tonal" class="mb-4">
        <v-card-text class="py-3">
          <div class="text-subtitle-2 mb-2">Lacres do caixa</div>
          <div class="d-flex flex-wrap ga-4 text-body-2">
            <span><strong>Abertura:</strong> {{ caixa.lacreAbertura || "Sem lacre" }}</span>
            <span><strong>Fechamento:</strong> {{ caixa.lacreFechamento || "Não registrado" }}</span>
          </div>
        </v-card-text>
      </v-card>

      <v-card variant="tonal" class="mb-4">
        <v-card-text class="py-3">
          <div class="text-subtitle-2 mb-2">Responsáveis declarados</div>
          <div class="d-flex flex-column ga-2 text-body-2">
            <div>
              <strong>Abertura:</strong>
              Caixa {{ caixa.caixaResponsavelNomeAbertura || "Não registrado" }} · Supervisor
              {{ caixa.supervisorResponsavelNomeAbertura || "Não registrado" }}.
            </div>
            <div>
              <strong>Fechamento:</strong>
              Caixa {{ caixa.caixaResponsavelNomeFechamento || "Ainda aberto / não registrado" }} · Supervisor
              {{ caixa.supervisorResponsavelNomeFechamento || "Ainda aberto / não registrado" }}.
            </div>
          </div>
        </v-card-text>
      </v-card>

      <v-card variant="tonal" class="mb-4">
        <v-card-text class="py-3">
          <div class="text-subtitle-2 mb-2">Conferências físicas</div>
          <p v-if="!conferencias.length" class="text-body-2 text-medium-emphasis mb-0">
            Nenhuma conferência física registrada.
          </p>
          <div v-for="conferencia in conferencias" :key="conferencia.id" class="text-body-2 mb-2">
            <strong>{{ conferencia.etapa === "abertura" ? "Abertura do malote" : "Retorno / sangria" }}</strong>
            — {{ conferencia.resultado }} em {{ formatarDataHora(conferencia.conferidoEm) }}.<br />
            Declarado: dinheiro {{ dinheiro(conferencia.valorEspecieDeclarado) }}, moedas
            {{ dinheiro(conferencia.valorMoedasDeclarado) }}. Contado: dinheiro
            {{ dinheiro(conferencia.valorEspecieContado) }}, moedas {{ dinheiro(conferencia.valorMoedasContado) }}.
            <template v-if="conferencia.observacao"> Motivo: {{ conferencia.observacao }}</template>
          </div>
        </v-card-text>
      </v-card>

      <v-card variant="tonal" class="mb-4">
        <v-card-text class="py-3">
          <div class="text-subtitle-2 mb-2">Provas do fechamento</div>
          <p v-if="!anexos.length" class="text-body-2 text-medium-emphasis mb-0">Nenhum anexo foi registrado.</p>
          <div v-else class="d-flex flex-column ga-2">
            <a
              v-for="anexo in anexos"
              :key="anexo.id"
              :href="`${apiUrl}/api/caixa/${caixa.id}/anexos/${anexo.id}`"
              target="_blank"
              rel="noopener"
            >
              {{
                anexo.tipo === "folha_fechamento"
                  ? "Folha de fechamento"
                  : anexo.tipo === "relatorio_vendas_creare"
                    ? "Folha CREARE"
                    : "Comprovante de cartão"
              }}
              —
              {{ anexo.nomeOriginal }}
            </a>
          </div>
        </v-card-text>
      </v-card>

      <v-alert
        v-if="detalhe.alteracoesPosFechamento.length"
        type="warning"
        variant="tonal"
        density="compact"
        class="mb-4"
      >
        <div class="font-weight-bold mb-2">Alterado após o fechamento</div>
        <div v-for="alteracao in detalhe.alteracoesPosFechamento" :key="alteracao.id" class="text-body-2 mb-1">
          {{ formatarDataHora(alteracao.alteradoEm) }} — venda
          <strong>{{ alteracao.identificadorExterno || alteracao.vendaId }}</strong>
          ({{ alteracao.dataVenda ? formatarDataHora(alteracao.dataVenda) : "horário não informado" }},
          {{ dinheiro(alteracao.valor) }}).
        </div>
      </v-alert>

      <div class="text-subtitle-2 mb-2">Vendas canceladas</div>
      <v-expansion-panels variant="accordion" class="mb-4">
        <v-expansion-panel :disabled="!detalhe.vendasCanceladas.length">
          <v-expansion-panel-title>
            <div class="d-flex align-center ga-3 flex-grow-1">
              <span>Auditoria — não entram nos totais</span>
              <v-chip size="x-small" variant="tonal">{{ detalhe.vendasCanceladas.length }}</v-chip>
            </div>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <div v-for="venda in detalhe.vendasCanceladas" :key="venda.id" class="mb-4">
              <div class="d-flex flex-wrap align-center justify-space-between ga-2 mb-2">
                <div>
                  <strong>{{ venda.descricao }}</strong>
                  <span class="text-caption text-medium-emphasis ml-2">
                    {{ venda.dataHora ? formatarDataHora(venda.dataHora) : formatarDataSomenteDia(venda.data) }}
                  </span>
                  <span v-if="venda.identificadorExterno" class="text-caption text-medium-emphasis ml-2">
                    · {{ venda.identificadorExterno }}
                  </span>
                </div>
                <strong>{{ dinheiro(venda.valor) }}</strong>
              </div>
              <div v-if="venda.produtos.length" class="responsive-table-shell">
                <v-table density="compact">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th class="text-end">Qtd.</th>
                      <th class="text-end">Unitário</th>
                      <th class="text-end">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="produto in venda.produtos" :key="produto.id">
                      <td>
                        {{ produto.descricao
                        }}<v-chip v-if="produto.cancelado" size="x-small" variant="tonal" class="ml-2"
                          >Cancelado</v-chip
                        >
                      </td>
                      <td class="text-end">{{ produto.quantidade }}</td>
                      <td class="text-end">{{ dinheiro(produto.valorUnitario) }}</td>
                      <td class="text-end">{{ dinheiro(produto.valorTotal) }}</td>
                    </tr>
                  </tbody>
                </v-table>
              </div>
              <p v-else class="text-body-2 text-medium-emphasis mb-0">Produtos não registrados.</p>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <!-- Lancamentos por categoria. Vem do proprio endpoint de detalhe (caixas_gerenciar): as
           rotas operacionais aplicam o escopo "somente caixa aberto" e trocariam o caixa pedido. -->
      <div class="text-subtitle-2 mb-2">Lançamentos deste caixa</div>
      <v-expansion-panels variant="accordion" class="mb-4">
        <v-expansion-panel v-for="grupo in detalhe.lancamentos" :key="grupo.categoria">
          <v-expansion-panel-title :disabled="!grupo.itens.length">
            <div class="d-flex align-center ga-3 flex-grow-1">
              <span>{{ grupo.titulo }}</span>
              <v-chip size="x-small" variant="tonal">{{ grupo.itens.length }}</v-chip>
              <v-spacer />
              <strong>{{ dinheiro(grupo.total) }}</strong>
            </div>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <div class="responsive-table-shell">
              <v-table density="compact">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th class="text-end">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in grupo.itens" :key="item.id">
                    <td>{{ dataDoLancamento(item) }}</td>
                    <td>
                      {{ item.descricao || "--" }}
                      <v-chip v-if="item.sentido" size="x-small" variant="tonal" class="ml-2">
                        {{ item.sentido === "entrada" ? "Entrada" : "Saida" }}
                      </v-chip>
                    </td>
                    <td class="text-end">{{ dinheiro(item.valor) }}</td>
                  </tr>
                </tbody>
              </v-table>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <!-- Auditoria de horario: quem mudou, quando, por que e quem autorizou. -->
      <div class="text-subtitle-2 mb-2">Alteracoes de horario</div>
      <p v-if="!detalhe.edicoes.length" class="text-body-2 text-medium-emphasis mb-4">
        Nenhuma alteracao de horario neste caixa.
      </p>
      <div v-else class="responsive-table-shell mb-4">
        <v-table density="compact">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Quem alterou</th>
              <th>Autorizador</th>
              <th>Motivo</th>
              <th>De</th>
              <th>Para</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="edicao in detalhe.edicoes" :key="edicao.id">
              <td>{{ formatarDataHora(edicao.editadoEm) }}</td>
              <td>{{ edicao.editadoPorNome || "--" }}</td>
              <td>
                {{ edicao.autorizadorNome || "--" }}
                <v-chip v-if="edicao.porToken" size="x-small" variant="tonal" class="ml-2">por token</v-chip>
              </td>
              <td>{{ edicao.observacao || "--" }}</td>
              <td>{{ horarioAuditado(edicao.valoresAntigos) }}</td>
              <td>{{ horarioAuditado(edicao.valoresNovos) }}</td>
            </tr>
          </tbody>
        </v-table>
      </div>

      <!-- Acerto de saldo: a diferenca vira despesa e debito do colaborador. -->
      <div class="text-subtitle-2 mb-2">Acerto de saldo</div>
      <p v-if="!detalhe.ajuste" class="text-body-2 text-medium-emphasis">Este caixa não teve acerto de diferença.</p>
      <v-alert v-else type="warning" variant="tonal" density="compact">
        Diferença de <strong>{{ dinheiro(detalhe.ajuste.valorDiferenca) }}</strong> atribuída a
        <strong>{{ detalhe.ajuste.colaboradorNome || "colaborador do caixa" }}</strong>
        em {{ formatarDataHora(detalhe.ajuste.criadoEm) }}.
        <template v-if="detalhe.ajuste.observacao"> Motivo: {{ detalhe.ajuste.observacao }}</template>
      </v-alert>
    </template>
  </div>
</template>
