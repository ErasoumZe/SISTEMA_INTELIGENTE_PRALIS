<script setup lang="ts">
/**
 * Cartao "Produto" — mesma ordem, rotulos e listas do cadastro paralelo (identificacao, balanca,
 * descricao automatica e "Como se compra"). As previas usam a funcao de dominio, nunca copia local.
 */
import ProdutoCartao from "~/components/produtos/ProdutoCartao.vue";
import ProdutoComoSeCompra from "~/components/produtos/ProdutoComoSeCompra.vue";
import ProdutoFoto from "~/components/produtos/ProdutoFoto.vue";
import ProdutoScanner from "~/components/produtos/ProdutoScanner.vue";
import type { ProdutoForm } from "~/composables/produto-formulario-mapa";
import { MEDIDAS_BASE, unidadesDaLista } from "~/utils/produto-listas";

const props = defineProps<{
  form: ProdutoForm;
  produtoId: string | null;
  unidades: Array<{ id: string; sigla: string; nome: string }>;
  erros: Record<string, string>;
  descricaoPreview: string;
  comoSeCompraPreview: string;
  somenteLeitura: boolean;
  /** Copia da loja: o que veio da BASE so o administrador altera, la na BASE (oficial). */
  herdadoTravado: boolean;
  /** De onde a tela mostra a foto gravada (rota + id) e o arquivo escolhido ainda nao salvo. */
  origemDaFoto: { rota: string; id: string | null };
  fotoPendente: File | null;
  /** F4: outro produto ja tem este EAN (aviso ao digitar; nao bloqueia o salvar). */
  eanRepetido: { nome: string; codigoInterno: string | null; rota: string } | null;
  dica: (campo: string) => string | undefined;
}>();
const emit = defineEmits<{ "foto-escolher": [arquivo: File]; "foto-remover": [] }>();

/*
 * So na criacao: sem EAN, o codigo interno gerado ao salvar entra no codigo de barras (o servidor da
 * BASE faz isso). Dizer ANTES de salvar evita que a pessoa invente um numero (paralelo).
 */
const AJUDA_BARRAS_NA_CRIACAO = "Sem EAN? Deixe vazio: ao salvar, o código interno gerado entra aqui.";

/** Campos herdados da BASE: travados na copia da loja, alem do modo somente leitura. */
const travado = computed(() => props.somenteLeitura || props.herdadoTravado);
const medidasBase = computed(() => unidadesDaLista(props.unidades, MEDIDAS_BASE, props.form.unidadeIndividualId));
const siglaMaiuscula = (unidade: { sigla: string }) => unidade.sigla.toUpperCase();
const scannerAberto = ref(false);
</script>

<template>
  <ProdutoCartao titulo="Produto" subtitulo="Identificação e apresentação no catálogo" icone="mdi-package-variant">
    <v-row dense>
      <v-col cols="12" sm="5">
        <!-- O status e o unico campo do cadastro geral que a loja mexe (ativo numa, inativo noutra). -->
        <v-select
          v-model="form.status"
          :items="[
            { value: 'ativo', title: 'Ativo' },
            { value: 'inativo', title: 'Inativo' }
          ]"
          label="Status"
          hide-details
          class="mb-3"
          :disabled="somenteLeitura"
        />
        <v-switch
          v-model="form.habilitarAjuda"
          label="Habilitar ajuda"
          color="primary"
          inset
          hide-details
          :disabled="travado"
        />
      </v-col>
      <v-col cols="12" sm="7">
        <!-- Decisao D1 (paralelo): a loja troca a foto mesmo de produto herdado da BASE. -->
        <ProdutoFoto
          :rota="origemDaFoto.rota"
          :produto-id="origemDaFoto.id"
          :foto-url="form.fotoUrl"
          :arquivo-pendente="fotoPendente"
          :somente-leitura="somenteLeitura"
          @escolher="emit('foto-escolher', $event)"
          @remover="emit('foto-remover')"
        />
      </v-col>

      <v-col cols="12" sm="6">
        <v-text-field
          v-model="form.codigoBarras"
          label="Código de barras"
          :hint="produtoId ? dica('codigoBarras') : AJUDA_BARRAS_NA_CRIACAO"
          :persistent-hint="!produtoId"
          :disabled="travado"
          append-inner-icon="mdi-barcode-scan"
          class="cx-num"
          @click:append-inner="scannerAberto = true"
        />
        <v-alert v-if="eanRepetido" type="warning" variant="tonal" density="compact" class="mt-1">
          Já existe <strong>{{ eanRepetido.nome }}</strong> com este código de barras neste catálogo. Confira antes de
          cadastrar de novo — <NuxtLink :to="eanRepetido.rota" target="_blank">abrir o existente</NuxtLink>.
        </v-alert>
      </v-col>
      <v-col v-if="produtoId" cols="12" sm="6">
        <v-text-field
          :model-value="form.codigoInterno || '—'"
          label="Código interno"
          readonly
          class="cx-num cartao__previa"
        />
      </v-col>
      <v-col cols="12" sm="6">
        <v-text-field v-model="form.marca" label="Marca" :hint="dica('marca')" :disabled="travado" />
      </v-col>
      <v-col cols="12">
        <v-text-field
          v-model="form.nomeCatalogo"
          label="Nome do produto *"
          data-campo="nomeCatalogo"
          :error-messages="erros['nomeCatalogo']"
          :hint="dica('nomeCatalogo')"
          :disabled="travado"
        />
      </v-col>
      <v-col cols="6">
        <v-text-field
          v-model="form.quantidadeIndividual"
          type="number"
          min="0"
          label="Gramatura"
          data-campo="quantidadeIndividual"
          :error-messages="erros['quantidadeIndividual']"
          :hint="dica('quantidadeIndividual')"
          :disabled="travado"
        />
      </v-col>
      <v-col cols="6">
        <v-select
          v-model="form.unidadeIndividualId"
          :items="medidasBase"
          :item-title="siglaMaiuscula"
          item-value="id"
          label="Medida base"
          data-campo="unidadeIndividualId"
          :error-messages="erros['unidadeIndividualId']"
          :hint="dica('unidadeIndividual')"
          :disabled="travado"
        />
      </v-col>
      <v-col cols="12" sm="6">
        <v-select
          v-model="form.pesavel"
          :items="[
            { title: 'Não', value: false },
            { title: 'Sim', value: true }
          ]"
          label="Vai para balança?"
          data-campo="pesavel"
          :error-messages="erros['pesavel']"
          hint="Novos produtos começam em Não. Para produtos já existentes, confira o cadastro SIA; a medida KG não define este campo."
          persistent-hint
          :disabled="travado"
        />
      </v-col>
      <template v-if="form.pesavel === true">
        <!-- Oficial: a tecla e fixa (000, confirmada para a TNP); o servidor grava o valor fixo. -->
        <v-col cols="6" sm="3">
          <v-text-field
            model-value="000"
            label="Tecla da balança"
            readonly
            persistent-hint
            hint="Valor fixo 000 confirmado para a TNP."
          />
        </v-col>
        <v-col cols="6" sm="3">
          <v-text-field
            v-model="form.validadeBalanca"
            type="number"
            min="0"
            max="999"
            label="Validade na balança (dias)"
            data-campo="validadeBalanca"
            :error-messages="erros['validadeBalanca']"
            persistent-hint
            hint="Informe o número de dias definido para este produto."
            :disabled="travado"
          />
        </v-col>
      </template>
      <v-col cols="12">
        <v-text-field :model-value="descricaoPreview" label="Descrição (automática)" readonly class="cartao__previa" />
      </v-col>
    </v-row>

    <ProdutoComoSeCompra :form="form" :como-se-compra-preview="comoSeCompraPreview" :travado="travado" :dica="dica" />

    <ProdutoScanner v-model:aberto="scannerAberto" @lido="form.codigoBarras = $event" />
  </ProdutoCartao>
</template>
