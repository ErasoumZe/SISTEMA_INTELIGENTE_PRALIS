<script setup lang="ts">
/**
 * Cartao "Revenda ou transformacao" — ordem e rotulos do paralelo (P:945-1071): tipo, grupo, e a
 * operacao (onde guarda, quanto guarda, onde vende e o preco). O grupo e escolha da BASE: na copia
 * da loja ele aparece travado. Dinheiro usa o `CampoDinheiro` (mascara R$, virgula do teclado).
 */
import CampoDinheiro from "~/components/comum/CampoDinheiro.vue";
import ProdutoCartao from "~/components/produtos/ProdutoCartao.vue";
import ProdutoEstoqueDaLoja from "~/components/produtos/ProdutoEstoqueDaLoja.vue";
import ProdutoTransformacao from "~/components/produtos/ProdutoTransformacao.vue";
import type { ProdutoForm } from "~/composables/produto-formulario-mapa";
import { AREAS_VENDA_TNP, SETORES_ESTOQUE, opcoesComAtual } from "~/utils/produto-listas";
import { limitarMargem } from "~/utils/produto-numeros";

const props = defineProps<{
  form: ProdutoForm;
  /** Grupos locais que tem regra fiscal (mais o grupo que o produto ja tem). */
  grupos: Array<{ id: string; nome: string }>;
  grupoObrigatorio: boolean;
  erros: Record<string, string>;
  precoPreview: number;
  validacaoQtdPreview: string;
  /** Margem padrao do grupo escolhido, em % (null = o grupo nao tem). */
  margemDoGrupoPct: string | null;
  /** Cadastro da BASE: esconde o que a BASE nao grava (decisao D4). */
  naBase: boolean;
  /** Area de venda so existe no cadastro da TNP (oficial). */
  mostrarAreaVenda: boolean;
  somenteLeitura: boolean;
  /** Copia da loja: tipo e grupo vem da BASE e ficam em leitura (oficial). */
  herdadoTravado: boolean;
  dica: (campo: string) => string | undefined;
}>();

const travado = computed(() => props.somenteLeitura || props.herdadoTravado);
const setores = computed(() => opcoesComAtual(SETORES_ESTOQUE, props.form.setorEstoque));
const precoCalculado = computed(() => `R$ ${props.precoPreview.toFixed(2).replace(".", ",")}`);
const dicaDaMargem = computed(() =>
  props.margemDoGrupoPct != null
    ? `Padrão do grupo: ${props.margemDoGrupoPct}% — vazio usa esse valor, 0 vende pelo custo`
    : "Ex.: 70 = 70%. Vazio = sem margem própria."
);
</script>

<template>
  <ProdutoCartao
    titulo="Revenda ou transformação"
    subtitulo="Classificação e operação do produto"
    icone="mdi-shape-outline"
  >
    <v-btn-toggle
      v-model="form.tipo"
      :disabled="travado"
      mandatory
      color="primary"
      divided
      variant="outlined"
      class="mb-2"
    >
      <v-btn value="revenda">Revenda</v-btn>
      <v-btn value="transformacao">Transformação</v-btn>
    </v-btn-toggle>

    <v-row dense>
      <v-col cols="12">
        <v-autocomplete
          v-model="form.grupoMercadoriaId"
          :items="grupos"
          item-title="nome"
          item-value="id"
          label="Grupo de mercadorias *"
          placeholder="Digite parte do nome, ex.: LEITE"
          :no-data-text="grupos.length ? 'Nenhum grupo encontrado' : 'Nenhum grupo fiscal disponível'"
          :clearable="!grupoObrigatorio && !travado"
          data-campo="grupoMercadoriaId"
          :error-messages="erros['grupoMercadoriaId']"
          :hint="dica('grupoMercadoria')"
          :readonly="travado"
        />
      </v-col>
    </v-row>

    <div class="cartao__subtitulo">
      <strong>{{ naBase ? "Operação" : "Desta loja" }}</strong
      ><span>Estoque, pontos de venda e preço</span>
    </div>
    <v-row dense>
      <v-col cols="12" sm="6">
        <v-select
          v-model="form.setorEstoque"
          :items="setores"
          label="Setor de estoque"
          clearable
          :hint="dica('setorEstoque')"
          :disabled="somenteLeitura"
        />
      </v-col>
      <v-col cols="6" sm="3">
        <v-text-field
          v-model="form.estoqueMin"
          type="number"
          min="0"
          label="Estoque mín."
          data-campo="estoqueMin"
          :error-messages="erros['estoqueMin']"
          :hint="dica('estoqueMin')"
          :disabled="somenteLeitura"
        />
      </v-col>
      <v-col cols="6" sm="3">
        <v-text-field
          v-model="form.estoqueMax"
          type="number"
          min="0"
          label="Estoque máx."
          data-campo="estoqueMax"
          :error-messages="erros['estoqueMax']"
          :hint="dica('estoqueMax')"
          :disabled="somenteLeitura"
        />
      </v-col>
      <v-col cols="12" sm="6">
        <v-text-field
          v-model="form.localVenda1"
          label="Local de venda primário"
          clearable
          :hint="dica('localVenda1')"
          :disabled="somenteLeitura"
        />
      </v-col>
      <v-col cols="12" sm="6">
        <v-text-field
          v-model="form.localVenda2"
          label="Local de venda secundário"
          clearable
          :hint="dica('localVenda2')"
          :disabled="somenteLeitura"
        />
      </v-col>
      <v-col cols="12" sm="6">
        <v-text-field
          v-model="form.setorVenda1"
          label="Setor de venda primário"
          clearable
          :hint="dica('setorVenda1')"
          :disabled="somenteLeitura"
        />
      </v-col>
      <v-col cols="12" sm="6">
        <v-text-field
          v-model="form.setorVenda2"
          label="Setor de venda secundário"
          clearable
          :hint="dica('setorVenda2')"
          :disabled="somenteLeitura"
        />
      </v-col>
      <v-col v-if="mostrarAreaVenda" cols="12" sm="6">
        <v-select
          v-model="form.areaVenda"
          :items="AREAS_VENDA_TNP"
          label="Área da loja (Relatório Gerentes)"
          clearable
          :disabled="somenteLeitura"
        />
      </v-col>
      <v-col cols="6" sm="3">
        <CampoDinheiro v-model="form.custo" label="Custo" :disabled="somenteLeitura" />
      </v-col>
      <v-col cols="6" sm="3">
        <v-text-field
          v-model="form.margemPercentual"
          type="number"
          min="0"
          max="1000"
          label="Margem"
          suffix="%"
          data-campo="margemPercentual"
          :hint="dicaDaMargem"
          persistent-hint
          :disabled="somenteLeitura"
          @blur="form.margemPercentual = limitarMargem(form.margemPercentual)"
        />
      </v-col>
      <v-col cols="12" sm="6" class="d-flex align-center">
        <v-switch
          v-model="form.auto"
          label="Calcular venda automático"
          color="primary"
          inset
          hide-details
          :disabled="somenteLeitura"
        />
      </v-col>
      <v-col cols="12" sm="6">
        <CampoDinheiro v-model="form.precoVenda" label="V. Venda pontual" :disabled="form.auto || somenteLeitura" />
      </v-col>
      <v-col cols="12">
        <v-text-field
          :model-value="precoCalculado"
          label="V. Venda (calculado)"
          readonly
          class="cx-num cartao__previa"
          hint="O servidor recalcula ao salvar: prévia e valor gravado nunca divergem."
          persistent-hint
        />
      </v-col>
    </v-row>

    <ProdutoEstoqueDaLoja v-if="!naBase" :form="form" :somente-leitura="somenteLeitura" :dica="dica" />

    <ProdutoTransformacao
      v-if="form.tipo === 'transformacao'"
      :form="form"
      :validacao-qtd-preview="validacaoQtdPreview"
      :somente-leitura="somenteLeitura"
      :dica="dica"
    />
  </ProdutoCartao>
</template>
