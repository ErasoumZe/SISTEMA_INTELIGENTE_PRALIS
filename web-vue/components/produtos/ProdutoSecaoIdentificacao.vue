<script setup lang="ts">
/** Identificacao + "Como se compra". As duas previas usam a funcao de dominio, nunca copia local. */
import ProdutoFoto from "~/components/produtos/ProdutoFoto.vue";
import ProdutoScanner from "~/components/produtos/ProdutoScanner.vue";
import type { ProdutoForm } from "~/composables/produto-formulario-mapa";

const props = defineProps<{
  form: ProdutoForm;
  produtoId: string | null;
  unidades: Array<{ id: string; sigla: string; nome: string }>;
  grupos: Array<{ id: string; nome: string }>;
  erros: Record<string, string>;
  grupoObrigatorio: boolean;
  descricaoPreview: string;
  comoSeCompraPreview: string;
  somenteLeitura: boolean;
  /** Copia da loja: o que veio da BASE so o administrador altera, la na BASE (oficial). */
  herdadoTravado: boolean;
  /** Onde a foto vive: "/api/produtos" (loja) ou "/api/produtos/base" (base geral). */
  rotaFoto: string;
  /** Area de venda so existe no cadastro da TNP (oficial). */
  mostrarAreaVenda: boolean;
  dica: (campo: string) => string | undefined;
}>();
const emit = defineEmits<{ "foto-escolhida": [arquivo: File | null] }>();

/** Campos herdados da BASE: travados na copia da loja, alem do modo somente leitura. */
const travado = computed(() => props.somenteLeitura || props.herdadoTravado);

const scannerAberto = ref(false);
const siglas = computed(() => props.unidades.map((unidade) => unidade.sigla));
</script>

<template>
  <section class="secao">
    <h2 class="secao__titulo">Identificação</h2>

    <div class="secao__grade">
      <div class="secao__coluna-foto">
        <v-select
          v-model="form.status"
          :items="[
            { value: 'ativo', title: 'Ativo' },
            { value: 'inativo', title: 'Inativo' }
          ]"
          label="Status"
          :hint="dica('status')"
          :persistent-hint="Boolean(dica('status'))"
          :disabled="somenteLeitura"
        />
        <ProdutoFoto
          :rota="rotaFoto"
          :produto-id="produtoId"
          :foto-url="form.fotoUrl"
          :somente-leitura="travado"
          @arquivo-escolhido="emit('foto-escolhida', $event)"
          @alterada="form.fotoUrl = $event"
        />
      </div>

      <div class="secao__campos">
        <v-text-field
          :model-value="form.codigoInterno || '—'"
          label="Código interno"
          readonly
          class="cx-num"
          hint="Gerado pelo sistema, sequencial no catálogo oficial."
          persistent-hint
        />
        <v-text-field v-model="form.codigo" label="Código externo" :hint="dica('codigo')" :disabled="somenteLeitura" />

        <v-text-field
          v-model="form.codigoBarras"
          label="Código de barras (EAN)"
          :hint="dica('codigoBarras')"
          :disabled="travado"
          append-inner-icon="mdi-barcode-scan"
          class="cx-num"
          @click:append-inner="scannerAberto = true"
        />
        <v-text-field v-model="form.marca" label="Marca" :hint="dica('marca')" :disabled="travado" />
        <v-checkbox v-model="form.habilitarAjuda" label="Habilitar ajuda" :disabled="travado" />

        <v-text-field
          v-model="form.nomeCatalogo"
          label="Nome do produto *"
          data-campo="nomeCatalogo"
          :error-messages="erros['nomeCatalogo']"
          :hint="dica('nomeCatalogo')"
          :disabled="travado"
          class="secao__campo-largo"
        />

        <v-text-field
          v-model="form.quantidadeIndividual"
          type="number"
          min="0"
          label="Gramatura *"
          data-campo="quantidadeIndividual"
          :error-messages="erros['quantidadeIndividual']"
          :hint="dica('quantidadeIndividual')"
          :disabled="travado"
        />
        <v-select
          v-model="form.unidadeIndividualId"
          :items="unidades"
          item-title="sigla"
          item-value="id"
          label="Medida base *"
          data-campo="unidadeIndividualId"
          :error-messages="erros['unidadeIndividualId']"
          :hint="dica('unidadeIndividual')"
          :disabled="travado"
        />

        <v-select
          v-model="form.pesavel"
          :items="[
            { title: 'Não informado — conferir no SIA', value: null },
            { title: 'Não', value: false },
            { title: 'Sim', value: true }
          ]"
          label="Vai para balança? *"
          data-campo="pesavel"
          :error-messages="erros['pesavel']"
          :hint="
            form.pesavel === null
              ? 'Para produtos existentes, confira o cadastro SIA. KG não define este campo.'
              : dica('pesavel')
          "
          :disabled="travado"
          class="secao__campo-largo"
        />

        <template v-if="form.pesavel === true">
          <!-- Oficial: a tecla e fixa (000, confirmada para a TNP); o servidor grava o valor fixo. -->
          <v-text-field
            model-value="000"
            label="Tecla da balança"
            readonly
            persistent-hint
            hint="Valor fixo 000 confirmado para a TNP."
          />
          <v-text-field
            v-model="form.validadeBalanca"
            type="number"
            min="0"
            max="999"
            label="Validade na balança (dias) *"
            data-campo="validadeBalanca"
            :error-messages="erros['validadeBalanca']"
            :disabled="travado"
            @wheel.prevent
          />
        </template>
        <v-text-field v-model="form.grupoIdExterno" label="Grupo oficial (ID externo)" :disabled="travado" />
        <v-select
          v-if="mostrarAreaVenda"
          v-model="form.areaVenda"
          :items="[
            { value: 'caixa', title: 'Caixa' },
            { value: 'vitrine', title: 'Vitrine' },
            { value: 'copa', title: 'Copa' },
            { value: 'chapa', title: 'Chapa' },
            { value: 'mesas', title: 'Mesas' },
            { value: 'vasca_paes', title: 'Vasca de pães' },
            { value: 'vitrine_paes', title: 'Vitrine de pães' },
            { value: 'paes_empacotados', title: 'Pães empacotados' },
            { value: 'mesa_paes', title: 'Mesa de pães' },
            { value: 'frios', title: 'Frios' },
            { value: 'bebidas', title: 'Bebidas' },
            { value: 'laticinios', title: 'Laticínios' },
            { value: 'mercearia', title: 'Mercearia' },
            { value: 'estoque_bebidas', title: 'Estoque de bebidas' },
            { value: 'biscoitos', title: 'Biscoitos' },
            { value: 'dml_limpeza', title: 'DML / limpeza' }
          ]"
          label="Área de venda"
          clearable
          :disabled="somenteLeitura"
        />

        <v-select
          v-model="form.grupoMercadoriaId"
          :items="grupos"
          item-title="nome"
          item-value="id"
          :label="grupoObrigatorio ? 'Grupo de mercadoria *' : 'Grupo de mercadoria'"
          :clearable="!grupoObrigatorio"
          data-campo="grupoMercadoriaId"
          :error-messages="erros['grupoMercadoriaId']"
          :hint="dica('grupoMercadoria')"
          :disabled="travado"
        />
        <v-select
          v-model="form.tipo"
          :items="[
            { value: 'revenda', title: 'Revenda' },
            { value: 'transformacao', title: 'Transformação' }
          ]"
          label="Tipo"
          :hint="dica('tipo')"
          :disabled="travado"
        />

        <v-text-field
          :model-value="descricaoPreview"
          label="Descrição (automática)"
          readonly
          class="secao__campo-largo secao__previa"
          hint="Nome + gramatura + medida base. A descrição é montada automaticamente."
          persistent-hint
        />
      </div>
    </div>

    <h3 class="secao__subtitulo">Como se compra</h3>
    <div class="secao__grade-compra">
      <v-select
        v-model="form.embalagem"
        :items="siglas"
        label="Embalagem"
        clearable
        :hint="dica('embalagem')"
        :disabled="travado"
      />
      <v-select v-model="form.cDe" :items="['C/', 'DE']" label="C/ ou DE" :hint="dica('cDe')" :disabled="travado" />
      <v-text-field
        v-model="form.quantidadeCaixa"
        type="number"
        min="1"
        label="Qtd. por embalagem"
        :hint="dica('quantidadeCaixa')"
        :disabled="travado"
      />
      <v-select
        v-model="form.medidaCompra"
        :items="siglas"
        label="Medida de compra"
        clearable
        :hint="dica('medidaCompra')"
        :disabled="travado"
      />
      <v-text-field
        :model-value="comoSeCompraPreview"
        label="Como se compra (prévia)"
        readonly
        placeholder="Preencha a embalagem para gerar"
        class="secao__campo-largo secao__previa"
      />
      <v-checkbox v-model="form.compraAproximada" label="Quantidade de compra aproximada" :disabled="travado" />
    </div>

    <ProdutoScanner v-model:aberto="scannerAberto" @lido="form.codigoBarras = $event" />
  </section>
</template>

<style scoped>
.secao {
  display: grid;
  gap: var(--cx-sp-4);
  padding: var(--cx-sp-5);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface);
  box-shadow: var(--cx-e-1);
}
.secao__titulo {
  font-size: var(--cx-fs-title);
  font-weight: 700;
  color: var(--cx-ink);
}
.secao__subtitulo {
  padding-top: var(--cx-sp-2);
  border-top: 1px solid var(--cx-line-soft);
  font-size: var(--cx-fs-lead);
  font-weight: 600;
  color: var(--cx-ink);
}
.secao__grade {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  gap: var(--cx-sp-5);
  min-width: 0;
}
.secao__coluna-foto {
  display: grid;
  gap: var(--cx-sp-3);
  align-content: start;
}
.secao__campos,
.secao__grade-compra {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cx-sp-3);
  min-width: 0;
}
.secao__campo-largo {
  grid-column: 1 / -1;
}
.secao__previa :deep(.v-field) {
  background: var(--cx-surface-sunken);
}

@media (max-width: 900px) {
  .secao__grade {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 600px) {
  .secao__campos,
  .secao__grade-compra {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
