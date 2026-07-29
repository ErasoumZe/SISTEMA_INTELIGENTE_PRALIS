<script setup lang="ts">
// Bloco Discriminar itens (despesa/mercadoria). Só aparece quando a categoria discrimina (cfg). Em
// Mercadoria e a tabela rica da FOTO 3, com o desconto geral "Vale Presente" (R$/%) recalculado no
// front; o valor em R$ espelha em form.valorDesconto (SUPORTADO). Estado via provide/inject.
import { useOperacaoLancamentoBloco } from "~/components/operacoes/useOperacaoLancamento";
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
  unitComDesc,
  totalLinha,
  totalLinhaComDesc,
  pctEfetivo,
  totalGeralBruto,
  totalGeralComDesc,
  descontoValorReais,
  modoDesconto,
  descontoInput,
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
    <!-- Despesa: descrição e grupo LIVRES (FOTO 3, nota). -->
    <div v-if="discriminando && cat === 'despesa'" class="lc-itens">
      <div v-for="(item, i) in itensDespesa" :key="`d-${i}`" class="lc-item">
        <input v-model="item.descricao" class="lc-input" placeholder="Descrição (livre)" />
        <select v-model="item.grupoDespesaId" class="lc-input lc-item-grupo">
          <option value="">Grupo</option>
          <option v-for="g in opcoesEmpresa.gruposDespesas" :key="g.id" :value="g.id">{{ g.nome }}</option>
        </select>
        <input v-model="item.valor" type="number" class="lc-input lc-item-valor" placeholder="R$" />
        <v-icon size="18" class="lc-item-del" @click="itensDespesa.length > 1 && itensDespesa.splice(i, 1)"
          >mdi-close</v-icon
        >
      </div>
      <button type="button" class="lc-add" @click="itensDespesa.push({ descricao: '', valor: '', grupoDespesaId: '' })">
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
            <tr v-for="(item, i) in itensMercadoria" :key="`m-${i}`">
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
              <td>
                <select v-model="item.grupoMercadoriaId" class="disc-in">
                  <option value="">—</option>
                  <option v-for="g in opcoesEmpresa.gruposMercadorias" :key="g.id" :value="g.id">
                    {{ g.nome }}
                  </option>
                </select>
              </td>
              <td><input v-model="item.valorUnitario" type="number" class="disc-in disc-num" /></td>
              <td class="disc-calc">{{ brn(unitComDesc(item)) }}</td>
              <td class="disc-calc">{{ brn(totalLinha(item)) }}</td>
              <td class="disc-calc">{{ brn(totalLinhaComDesc(item)) }}</td>
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
            <input v-model="descontoInput" type="number" class="disc-in disc-num" placeholder="0" />
            <span class="disc-vale-res">= R$ {{ brn(descontoValorReais) }}</span>
          </div>
        </div>
      </div>
    </div>
  </template>
</template>
