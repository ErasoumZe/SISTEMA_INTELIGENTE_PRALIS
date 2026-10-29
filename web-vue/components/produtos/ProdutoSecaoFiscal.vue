<script setup lang="ts">
/**
 * Cartao "Fiscal" da LOJA — os 8 campos do paralelo (P:1073-1132). O fiscal e puxado pelo grupo
 * (regra da planilha) e o servidor reclassifica ao salvar. Os demais campos fiscais nao aparecem, mas
 * continuam no payload com o valor que vieram: esconder nao pode apagar dado.
 *
 * Sem endpoint de classificacao ao vivo, "NCM achado pela regra" e a origem GRAVADA (planilha por
 * produto ou PLU da balanca) — vale a ultima gravacao, nao a tela antes de salvar.
 */
import type { RegraFiscalGrupo } from "@padaria/shared";
import ProdutoCartao from "~/components/produtos/ProdutoCartao.vue";
import type { ProdutoForm } from "~/composables/produto-formulario-mapa";
import {
  estadoFiscalNaTela,
  ncmAchadoPelaRegra,
  percentualFiscal,
  rotuloDaOrigemFiscal
} from "~/utils/produto-fiscal-tela";

const props = defineProps<{
  form: ProdutoForm;
  /** Regra fiscal do grupo escolhido (planilha oficial). */
  regraDoGrupo: RegraFiscalGrupo | null;
  ehAdmin: boolean;
  /** Administrador e a tela nao esta em leitura: digita NCM, CEST e categoria (ONLY_ADMIN_FISCAL). */
  fiscalEditavel: boolean;
  /** O grupo mudou desde que o produto foi aberto: a fonte gravada deixa de valer ate salvar. */
  grupoMudou: boolean;
  dica: (campo: string) => string | undefined;
}>();

const estado = computed(() => estadoFiscalNaTela(props.form.fiscal.estado, props.form.fiscal.motivo));
const ncmTravado = computed(() => !props.fiscalEditavel || ncmAchadoPelaRegra(props.form.fiscal.origemFiscal));
const fonte = computed(() => (props.grupoMudou ? "" : rotuloDaOrigemFiscal(props.form.fiscal.origemFiscal)));
</script>

<template>
  <ProdutoCartao titulo="Fiscal" subtitulo="Classificação e situação da fonte fiscal" icone="mdi-receipt-text-outline">
    <template #cabecalho>
      <v-chip v-if="estado" size="small" label :color="estado.cor" :prepend-icon="estado.icone">
        {{ estado.rotulo }}
      </v-chip>
    </template>

    <v-alert v-if="estado && estado.motivo" :type="estado.tipo" variant="tonal" density="compact">
      {{ estado.motivo }}
      <template v-if="estado.quemResolve">
        <br />
        <strong>{{ estado.quemResolve }}</strong>
      </template>
    </v-alert>
    <v-alert v-if="!ehAdmin" type="info" variant="tonal" density="compact">
      Os dados fiscais são definidos pelo administrador e calculados a partir do grupo. Trocar o grupo aqui recalcula os
      impostos automaticamente.
    </v-alert>
    <v-alert v-if="regraDoGrupo" type="info" variant="tonal" density="compact">
      Regra automática: {{ regraDoGrupo.tributacaoSimples }} · CST {{ regraDoGrupo.cstPisCofins }} · Simples
      {{ percentualFiscal(regraDoGrupo.aliquotaSimples) }} · ICMS RE {{ percentualFiscal(regraDoGrupo.icmsRe) }}
      <div v-if="regraDoGrupo.baseFiscal" class="text-caption mt-1">{{ regraDoGrupo.baseFiscal }}</div>
      <div v-if="fonte" class="text-caption mt-1">Fonte: {{ fonte }}</div>
    </v-alert>

    <v-row dense>
      <v-col cols="12" sm="6">
        <v-text-field
          v-model="form.fiscal.ncm"
          label="NCM (automático quando encontrado)"
          :readonly="ncmTravado"
          :class="{ cartao__previa: ncmTravado }"
          :hint="dica('ncm')"
        />
      </v-col>
      <v-col cols="12" sm="6">
        <v-text-field
          v-model="form.fiscal.cest"
          label="Código CEST"
          :readonly="!fiscalEditavel"
          :class="{ cartao__previa: !fiscalEditavel }"
          :hint="dica('cest')"
        />
      </v-col>
      <v-col cols="12" sm="6">
        <v-text-field
          v-model="form.fiscal.categoriaFiscal"
          label="Categoria"
          :readonly="!fiscalEditavel"
          :class="{ cartao__previa: !fiscalEditavel }"
          :hint="dica('categoriaFiscal')"
        />
      </v-col>
      <v-col cols="12" sm="6">
        <v-text-field
          :model-value="regraDoGrupo?.cstPisCofins ?? form.fiscal.cstPisCofins"
          label="CST PIS/COFINS (automático)"
          readonly
          class="cartao__previa"
        />
      </v-col>
      <v-col cols="6" sm="4">
        <v-text-field
          :model-value="form.fiscal.cstReforma || '—'"
          label="CST reforma"
          readonly
          class="cartao__previa"
        />
      </v-col>
      <v-col cols="6" sm="4">
        <v-text-field :model-value="form.fiscal.cClassTrib || '—'" label="cClassTrib" readonly class="cartao__previa" />
      </v-col>
      <v-col cols="6" sm="4">
        <v-text-field :model-value="form.fiscal.aliquotaIbs" label="IBS %" readonly class="cartao__previa" />
      </v-col>
      <v-col cols="6" sm="4">
        <v-text-field :model-value="form.fiscal.aliquotaCbs" label="CBS %" readonly class="cartao__previa" />
      </v-col>
    </v-row>
  </ProdutoCartao>
</template>
