<script setup lang="ts">
// Bloco Discriminar itens (despesa/mercadoria). Só aparece quando a categoria discrimina (cfg). Em
// Mercadoria e a tabela rica da FOTO 3, com o desconto geral "Vale Presente" (R$/%) recalculado no
// front; o valor em R$ espelha em form.valorDesconto (SUPORTADO). Estado via provide/inject.
import { useOperacaoLancamentoBloco } from "~/components/operacoes/useOperacaoLancamento";
import CampoDinheiro from "~/components/comum/CampoDinheiro.vue";
import "~/components/operacoes/operacao-lancamento-disc.css";

const {
  cfg,
  cat,
  discriminando,
  itensDespesa,
  itensMercadoria,
  opcoesEmpresa,
  escolherProduto,
  novoItemMercadoria,
  novoItemDespesa,
  gruposPatrimonio,
  grupoItemDespesa,
  definirGrupoItemDespesa,
  grupoItemMercadoria,
  definirGrupoItemMercadoria,
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
  erroDiscriminacaoCampo,
  brn
} = useOperacaoLancamentoBloco();
</script>

<template>
  <!-- Discriminar itens (despesa/mercadoria) — a tabela rica vem na tela de Discriminação. -->
  <template v-if="cfg.discrimina">
    <button type="button" class="lc-linha" @click="discriminando = !discriminando">
      <v-icon size="17">mdi-format-list-bulleted</v-icon> Discriminar itens
      <span class="lc-flex" />
      <v-icon size="16">{{ discriminando ? "mdi-chevron-down" : "mdi-chevron-right" }}</v-icon>
    </button>
    <!-- Despesa: descrição e grupo LIVRES (FOTO 3, nota). O Grupo tem DUAS origens (§5): o cadastro
         de despesas e o de patrimônio (maquinário/manutenção), num select só com dois blocos. -->
    <div v-if="discriminando && cat === 'despesa'" class="lc-itens">
      <div
        v-for="(item, i) in itensDespesa"
        :key="`d-${i}`"
        class="lc-item"
        :class="{ 'disc-linha-erro': erroDiscriminacaoLinha === i + 1 }"
        :data-linha-discriminacao="i + 1"
      >
        <input v-model="item.descricao" class="lc-input" placeholder="Descrição (livre)" />
        <select
          :value="grupoItemDespesa(item)"
          class="lc-input lc-item-grupo"
          @change="definirGrupoItemDespesa(item, ($event.target as HTMLSelectElement).value)"
        >
          <option value="">Grupo</option>
          <optgroup label="Despesas">
            <option v-for="g in opcoesEmpresa.gruposDespesas" :key="g.id" :value="g.id">{{ g.nome }}</option>
          </optgroup>
          <optgroup v-if="gruposPatrimonio.length" label="Patrimônio">
            <option v-for="g in gruposPatrimonio" :key="g.id" :value="`pat:${g.id}`">
              {{ g.sig ? `${g.sig} — ${g.nome}` : g.nome }}
            </option>
          </optgroup>
        </select>
        <CampoDinheiro v-model="item.valor" class="lc-input lc-item-valor" placeholder="R$" />
        <select v-model="item.descontoTotalTipo" class="lc-input">
          <option value="">Sem desc.</option>
          <option value="valor">R$</option>
          <option value="percentual">%</option>
        </select>
        <CampoDinheiro v-model="item.descontoTotalValor" :casas="4" class="lc-input" placeholder="Desc. total" />
        <v-icon size="18" class="lc-item-del" @click="itensDespesa.length > 1 && itensDespesa.splice(i, 1)"
          >mdi-close</v-icon
        >
      </div>
      <button type="button" class="lc-add" @click="novoItemDespesa">
        <v-icon size="15">mdi-plus</v-icon> Adicionar item
      </button>
    </div>

    <!-- Mercadoria: tabela de Discriminação (FOTO 3). Itens do cadastro de produto; colunas
         c/Desc e % recalculadas no front a partir do Vale Presente geral. -->
    <div v-if="discriminando && cat === 'mercadoria'" class="disc">
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
              v-for="(item, i) in itensMercadoria"
              :key="`m-${i}`"
              :class="{ 'disc-linha-erro': erroDiscriminacaoLinha === i + 1 }"
              :data-linha-discriminacao="i + 1"
            >
              <!-- Quantidade NAO e dinheiro: a coluna e `scale 3` e o campo de dinheiro exibe no
                   minimo 2 casas. Passar por aqui mostraria "1,00" para uma unidade e, pior,
                   arredondaria 1,005 para 1,01 — perda silenciosa do que a pessoa digitou. Fica
                   como esta nesta rodada; a virgula do teclado brasileiro aqui e problema real e
                   esta relatado. -->
              <td><input v-model="item.quantidade" type="number" class="disc-in disc-qtd" /></td>
              <td>
                <select
                  :value="item.produtoId"
                  class="disc-in"
                  @change="escolherProduto(item, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="">— livre —</option>
                  <option v-for="p in opcoesEmpresa.produtos" :key="p.id" :value="p.id">{{ p.descricao }}</option>
                </select>
                <input v-model="item.descricao" class="disc-in disc-desc" placeholder="Descrição" />
              </td>
              <!-- Grupo (§5): duas origens — o cadastro de MERCADORIAS e o de PATRIMÔNIO, quando o
                   item é maquinário/manutenção. Cada origem grava na sua coluna (são FKs de tabelas
                   diferentes); o valor do <option> carrega qual delas é. -->
              <td>
                <select
                  :value="grupoItemMercadoria(item)"
                  class="disc-in"
                  @change="definirGrupoItemMercadoria(item, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="">—</option>
                  <optgroup label="Mercadorias">
                    <option v-for="g in opcoesEmpresa.gruposMercadorias" :key="g.id" :value="g.id">
                      {{ g.nome }}
                    </option>
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
                <select v-model="item.descontoTipo" class="disc-in">
                  <option value="">—</option>
                  <option value="valor">R$</option>
                  <option value="percentual">%</option>
                </select>
                <CampoDinheiro v-model="item.descontoValor" :casas="4" class="disc-in disc-num" placeholder="0,00" />
                {{ brn(unitComDesc(item)) }}
              </td>
              <td class="disc-calc">{{ brn(totalLinha(item)) }}</td>
              <td class="disc-calc">
                <select v-model="item.descontoTotalTipo" class="disc-in">
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
              <td>
                <v-icon
                  size="18"
                  class="lc-item-del"
                  @click="itensMercadoria.length > 1 && itensMercadoria.splice(i, 1)"
                  >mdi-close</v-icon
                >
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
        <button type="button" class="lc-add" @click="novoItemMercadoria">
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
