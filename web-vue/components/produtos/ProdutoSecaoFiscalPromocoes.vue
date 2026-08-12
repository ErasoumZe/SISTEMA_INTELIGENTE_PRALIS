<script setup lang="ts">
/**
 * Fiscal, Promocoes e Conversoes.
 *
 * FISCAL continua sendo cadastro MANUAL. A planilha do Rodrigo nunca preenche estes campos
 * (R-145: o dado fiscal dela esta errado e causa pagamento de imposto a maior). Nao ha calculo
 * tributario aqui — os campos so sao guardados.
 */
import { promocaoVazia, type ProdutoForm } from "~/composables/useProdutoFormulario";

const props = defineProps<{
  form: ProdutoForm;
  unidades: Array<{ id: string; sigla: string; nome: string }>;
  erros: Record<string, string>;
  errosDePromocao: string[];
  somenteLeitura: boolean;
  dica: (campo: string) => string | undefined;
}>();

const DIAS = ["SEG", "TER", "QUA", "QUI", "SEX", "SAB", "DOM"];
const ehRevenda = computed(() => props.form.tipo === "revenda");

function adicionarPromocao() {
  props.form.promocoes.push(promocaoVazia());
}
function removerPromocao(indice: number) {
  props.form.promocoes.splice(indice, 1);
}
function adicionarConversao() {
  props.form.conversoes.push({ unidadeMedidaId: "", quantidade: "1", unidadesIndividuais: "1" });
}
function removerConversao(indice: number) {
  props.form.conversoes.splice(indice, 1);
}
</script>

<template>
  <section class="secao">
    <h2 class="secao__titulo">Fiscal</h2>
    <p class="secao__nota">
      Cadastro manual. Dado fiscal <strong>nunca</strong> vem da planilha (R-145) e não há cálculo tributário aqui.
    </p>
    <div class="secao__grade">
      <v-text-field v-model="form.fiscal.ncm" label="NCM" :hint="dica('ncm')" :disabled="somenteLeitura" />
      <v-text-field v-model="form.fiscal.cest" label="Código CEST" :hint="dica('cest')" :disabled="somenteLeitura" />
      <v-text-field
        v-model="form.fiscal.categoriaFiscal"
        label="Categoria fiscal"
        :hint="dica('categoriaFiscal')"
        :disabled="somenteLeitura"
      />
      <v-text-field
        v-model="form.fiscal.cstPisCofins"
        label="CST PIS/COFINS"
        :hint="dica('cstPisCofins')"
        :disabled="somenteLeitura"
      />
      <v-text-field
        v-model="form.fiscal.aliquotaCheia"
        type="number"
        min="0"
        label="Alíquota cheia %"
        :disabled="somenteLeitura"
      />
      <v-text-field
        v-model="form.fiscal.aliquotaFcp"
        type="number"
        min="0"
        label="Alíquota FCP %"
        :disabled="somenteLeitura"
      />
      <v-text-field
        v-model="form.fiscal.aliquotaPis"
        type="number"
        min="0"
        label="Alíquota PIS %"
        :disabled="somenteLeitura"
      />
      <v-text-field
        v-model="form.fiscal.aliquotaCofins"
        type="number"
        min="0"
        label="Alíquota COFINS %"
        :disabled="somenteLeitura"
      />
      <v-text-field
        v-model="form.fiscal.reducaoIcms"
        type="number"
        min="0"
        label="Redução ICMS %"
        :disabled="somenteLeitura"
      />
      <v-text-field v-model="form.fiscal.icms" type="number" min="0" label="ICMS %" :disabled="somenteLeitura" />
    </div>
  </section>

  <section v-if="ehRevenda" class="secao">
    <div class="secao__cabecalho">
      <h2 class="secao__titulo">Promoções</h2>
      <v-btn v-if="!somenteLeitura" size="small" variant="tonal" prepend-icon="mdi-plus" @click="adicionarPromocao">
        Adicionar
      </v-btn>
    </div>
    <p class="secao__nota">
      Duas promoções do mesmo produto não podem se sobrepor. Promoção que vira a meia-noite precisa ser dividida em duas
      (ex.: 22:00–23:59 e 00:00–02:00).
    </p>

    <v-alert v-if="errosDePromocao.length" type="warning" variant="tonal" density="compact">
      <ul class="secao__erros">
        <li v-for="mensagem in errosDePromocao" :key="mensagem">{{ mensagem }}</li>
      </ul>
    </v-alert>

    <div v-for="(promo, indice) in form.promocoes" :key="`promo-${indice}`" class="secao__linha">
      <div class="secao__grade">
        <v-select
          v-model="promo.tipo"
          :items="[
            { value: 'desconto', title: 'Desconto %' },
            { value: 'valor', title: 'Valor fixo' }
          ]"
          label="Tipo"
          :disabled="somenteLeitura"
        />
        <v-text-field
          v-if="promo.tipo === 'valor'"
          v-model="promo.valor"
          type="number"
          min="0"
          label="Valor promocional (R$)"
          :disabled="somenteLeitura"
        />
        <v-text-field
          v-else
          v-model="promo.descontoPercentual"
          type="number"
          min="0"
          max="100"
          label="Desconto %"
          :disabled="somenteLeitura"
        />
        <v-text-field v-model="promo.horaInicio" type="time" label="Início" :disabled="somenteLeitura" />
        <v-text-field v-model="promo.horaFim" type="time" label="Término" :disabled="somenteLeitura" />
        <v-text-field v-model="promo.validaAte" type="date" label="Válida até" :disabled="somenteLeitura" />
      </div>
      <div class="secao__dias">
        <v-checkbox
          v-for="(dia, posicao) in DIAS"
          :key="dia"
          v-model="promo.dias[posicao]"
          :label="dia"
          density="compact"
          hide-details
          color="primary"
          :disabled="somenteLeitura"
        />
        <v-spacer />
        <v-btn
          v-if="!somenteLeitura"
          size="small"
          variant="text"
          prepend-icon="mdi-delete-outline"
          @click="removerPromocao(indice)"
        >
          Remover
        </v-btn>
      </div>
    </div>
    <p v-if="!form.promocoes.length" class="secao__vazio">Sem promoção cadastrada.</p>
  </section>

  <section class="secao">
    <div class="secao__cabecalho">
      <h2 class="secao__titulo">Conversões de unidade</h2>
      <v-btn v-if="!somenteLeitura" size="small" variant="tonal" prepend-icon="mdi-plus" @click="adicionarConversao">
        Adicionar
      </v-btn>
    </div>
    <v-alert v-if="erros['conversoes']" type="warning" variant="tonal" density="compact">
      {{ erros["conversoes"] }}
    </v-alert>

    <div v-for="(conversao, indice) in form.conversoes" :key="`conv-${indice}`" class="secao__grade">
      <v-select
        v-model="conversao.unidadeMedidaId"
        :items="unidades"
        item-title="sigla"
        item-value="id"
        label="Unidade"
        :hint="dica('conversoes')"
        :disabled="somenteLeitura"
      />
      <v-text-field
        v-model="conversao.quantidade"
        type="number"
        min="0"
        label="Quantidade"
        :disabled="somenteLeitura"
      />
      <v-text-field
        v-model="conversao.unidadesIndividuais"
        type="number"
        min="0"
        label="Unidades individuais"
        :disabled="somenteLeitura"
      />
      <v-btn
        v-if="!somenteLeitura"
        size="small"
        variant="text"
        prepend-icon="mdi-delete-outline"
        @click="removerConversao(indice)"
      >
        Remover
      </v-btn>
    </div>
    <p v-if="!form.conversoes.length" class="secao__vazio">Sem conversão cadastrada.</p>
  </section>
</template>

<style scoped>
.secao {
  display: grid;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-5);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface);
  box-shadow: var(--cx-e-1);
}
.secao__cabecalho {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-2);
}
.secao__titulo {
  font-size: var(--cx-fs-title);
  font-weight: 700;
  color: var(--cx-ink);
}
.secao__nota,
.secao__vazio {
  margin: 0;
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}
.secao__grade {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--cx-sp-3);
  align-items: center;
  min-width: 0;
}
.secao__linha {
  display: grid;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-3);
  border-radius: var(--cx-r-md);
  background: var(--cx-surface-sunken);
}
.secao__dias {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cx-sp-2);
}
.secao__erros {
  margin: 0;
  padding-left: var(--cx-sp-4);
}
</style>
