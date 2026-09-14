<script setup lang="ts">
// Bloco Discriminar itens. UMA tabela para despesa E mercadoria (E6, decisao do Jose 04/08/2026).
// Antes eram duas telas diferentes: a mercadoria tinha a tabela rica da FOTO 3 e a despesa, cinco
// caixinhas soltas sem quantidade nem valor unitario. Agora as duas usam as mesmas 8 colunas.
//
// O que muda entre elas e so a ORIGEM do item (`origensDoItem`): mercadoria vem de Produtos;
// despesa vem de Patrimonio e Colaboradores. Escolher o item preenche descricao e grupo — por isso
// a descricao livre saiu. Retirada NAO discrimina (R-050) e nem chega aqui (cfg.discrimina).
import { useOperacaoLancamentoBloco } from "~/components/operacoes/useOperacaoLancamento";
import CampoDinheiro from "~/components/comum/CampoDinheiro.vue";
import OperacaoLancamentoIa from "~/components/operacoes/OperacaoLancamentoIa.vue";
import "~/components/operacoes/operacao-lancamento-disc.css";

const {
  cfg,
  discriminando,
  itensDaDiscriminacao,
  origensDoItem,
  rotuloDaOpcao,
  itemVinculado,
  escolherItemVinculado,
  grupoDoItem,
  definirGrupoDoItem,
  gruposDoItem,
  gruposPatrimonio,
  novoItemDaDiscriminacao,
  removerItemDaDiscriminacao,
  unitComDesc,
  totalLinha,
  totalLinhaComDesc,
  pctEfetivo,
  totalGeralBruto,
  totalGeralComDesc,
  descontoValorReais,
  modoDesconto,
  descontoInput,
  erroDiscriminacaoLinha,
  brn
} = useOperacaoLancamentoBloco();
</script>

<template>
  <template v-if="cfg.discrimina">
    <button type="button" class="lc-linha" @click="discriminando = !discriminando">
      <v-icon size="17">mdi-format-list-bulleted</v-icon> Discriminar itens
      <span class="lc-flex" />
      <v-icon size="16">{{ discriminando ? "mdi-chevron-down" : "mdi-chevron-right" }}</v-icon>
    </button>

    <div v-if="discriminando" class="disc">
      <OperacaoLancamentoIa />
      <div class="disc-scroll">
        <table class="disc-tabela">
          <thead>
            <tr>
              <th>Quant</th>
              <th>Descrição</th>
              <th>Grupo</th>
              <th>V.Unit</th>
              <th>V.Unit c/Desc</th>
              <th>V.Total</th>
              <th>V.Total c/Desc</th>
              <th>%</th>
              <th aria-label="remover" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(item, i) in itensDaDiscriminacao"
              :key="`item-${i}`"
              :class="{ 'disc-linha-erro': erroDiscriminacaoLinha === i + 1 }"
              :data-linha-discriminacao="i + 1"
            >
              <!-- Quantidade NAO e dinheiro: a coluna e `scale 3` e o campo de dinheiro exibe no
                   minimo 2 casas. Passar por aqui mostraria "1,00" para uma unidade e, pior,
                   arredondaria 1,005 para 1,01 — perda silenciosa do que a pessoa digitou. -->
              <td><input v-model="item.quantidade" type="number" class="disc-in disc-qtd" /></td>

              <!-- ITEM: vem do cadastro, sempre. O "— livre —" saiu (E6). Registro ANTIGO nao tem
                   vinculo: o select fica vazio e a `descricao` gravada continua visivel logo
                   abaixo, para o historico nao sumir da tela. -->
              <td>
                <select
                  :value="itemVinculado(item)"
                  class="disc-in"
                  aria-label="Item"
                  data-campo-discriminacao="item"
                  @change="escolherItemVinculado(item, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="">—</option>
                  <optgroup v-for="origem in origensDoItem" :key="origem.prefixo" :label="origem.rotulo">
                    <option v-for="o in origem.opcoes" :key="o.id" :value="`${origem.prefixo}:${o.id}`">
                      {{ rotuloDaOpcao(o) }}
                    </option>
                  </optgroup>
                </select>
                <span v-if="!itemVinculado(item) && item.descricao" class="disc-desc-legada">
                  {{ item.descricao }}
                </span>
              </td>

              <!-- Grupo (§5): duas origens — o cadastro da categoria e o de PATRIMONIO. Cada uma
                   grava na sua coluna (sao FKs de tabelas diferentes); o prefixo do <option> diz
                   qual. Vem preenchido quando o item escolhido e de patrimonio. -->
              <td>
                <select
                  :value="grupoDoItem(item)"
                  class="disc-in"
                  aria-label="Grupo do item"
                  @change="definirGrupoDoItem(item, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="">—</option>
                  <optgroup :label="cfg.token === 'mercadorias' ? 'Mercadorias' : 'Despesas'">
                    <option v-for="g in gruposDoItem" :key="g.id" :value="g.id">{{ g.nome }}</option>
                  </optgroup>
                  <optgroup v-if="gruposPatrimonio.length" label="Patrimônio">
                    <option v-for="g in gruposPatrimonio" :key="g.id" :value="`pat:${g.id}`">
                      {{ g.sig ? `${g.sig} — ${g.nome}` : g.nome }}
                    </option>
                  </optgroup>
                </select>
              </td>

              <td><CampoDinheiro v-model="item.valorUnitario" :casas="4" class="disc-in disc-num" /></td>
              <td class="disc-calc">
                <select v-model="item.descontoTipo" class="disc-in" aria-label="Tipo de desconto no unitário">
                  <option value="">—</option>
                  <option value="valor">R$</option>
                  <option value="percentual">%</option>
                </select>
                <CampoDinheiro v-model="item.descontoValor" :casas="4" class="disc-in disc-num" placeholder="0,00" />
                {{ brn(unitComDesc(item)) }}
              </td>
              <td class="disc-calc">{{ brn(totalLinha(item)) }}</td>
              <td class="disc-calc">
                <select v-model="item.descontoTotalTipo" class="disc-in" aria-label="Tipo de desconto no total">
                  <option value="">—</option>
                  <option value="valor">R$</option>
                  <option value="percentual">%</option>
                </select>
                <CampoDinheiro
                  v-model="item.descontoTotalValor"
                  :casas="4"
                  class="disc-in disc-num"
                  placeholder="0,00"
                  data-campo-discriminacao="valorTotal"
                />
                {{ brn(totalLinhaComDesc(item)) }}
              </td>
              <td class="disc-calc">{{ brn(pctEfetivo) }}%</td>
              <td class="disc-acao">
                <button
                  type="button"
                  class="lc-item-del"
                  :aria-label="`Remover item ${i + 1}`"
                  :disabled="itensDaDiscriminacao.length === 1"
                  @click="removerItemDaDiscriminacao(i)"
                >
                  <v-icon size="18">mdi-close</v-icon>
                </button>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colspan="5" class="disc-foot-lbl">V. Total geral</td>
              <td class="disc-calc disc-foot">{{ brn(totalGeralBruto) }}</td>
              <td class="disc-calc disc-foot">{{ brn(totalGeralComDesc) }}</td>
              <td class="disc-calc disc-foot">{{ brn(pctEfetivo) }}%</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="disc-rodape">
        <button type="button" class="lc-add" @click="novoItemDaDiscriminacao">
          <v-icon size="15">mdi-plus</v-icon> Adicionar item
        </button>
        <div class="disc-vale">
          <span class="lc-campo-lbl">Vale Presente / Desconto</span>
          <div class="disc-vale-row">
            <div class="disc-modo">
              <button
                type="button"
                class="disc-modo-btn"
                :class="{ ativo: modoDesconto === 'valor' }"
                @click="modoDesconto = 'valor'"
              >
                R$
              </button>
              <button
                type="button"
                class="disc-modo-btn"
                :class="{ ativo: modoDesconto === 'percentual' }"
                @click="modoDesconto = 'percentual'"
              >
                %
              </button>
            </div>
            <CampoDinheiro v-model="descontoInput" :casas="4" class="disc-in disc-num" placeholder="0,00" />
            <span class="disc-vale-res">= R$ {{ brn(descontoValorReais) }}</span>
          </div>
        </div>
      </div>
    </div>
  </template>
</template>

<style scoped>
/* Descricao de item ANTIGO, que nao tem vinculo com o cadastro. Fica visivel abaixo do select para
   o historico nao desaparecer da tela quando o registro for reaberto. */
.disc-desc-legada {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  font-style: italic;
  color: #64748b;
}
</style>
