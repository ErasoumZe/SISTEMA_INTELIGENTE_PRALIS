<script setup lang="ts">
/**
 * Cartao "Fiscal" da LOJA — os 8 campos do paralelo (P:1073-1132). O fiscal e puxado pelo grupo
 * (regra da planilha) e o servidor reclassifica ao salvar. Os demais campos fiscais nao aparecem, mas
 * continuam no payload com o valor que vieram: esconder nao pode apagar dado.
 *
 * Classificacao AO VIVO (F3): `classificacao` e o que a gravacao aplicaria com o grupo, o EAN e o nome da
 * tela (`/api/produtos/fiscal/classificar`), como o `automaticFiscal` do paralelo. O NCM trava quando a
 * regra o acha. Sem ela (consultando, ou sem grupo) vale a regra do grupo e o fiscal gravado.
 */
import type { ClassificacaoFiscal, RegraFiscalGrupo } from "@padaria/shared";
import ProdutoCartao from "~/components/produtos/ProdutoCartao.vue";
import type { ProdutoForm } from "~/composables/produto-formulario-mapa";
import { estadoFiscalNaTela, percentualFiscal, rotuloDaOrigemFiscal } from "~/utils/produto-fiscal-tela";

const props = defineProps<{
  form: ProdutoForm;
  /** Regra fiscal do grupo escolhido (planilha oficial). */
  regraDoGrupo: RegraFiscalGrupo | null;
  /** Classificacao ao vivo do servidor (`null` enquanto consulta ou sem grupo). */
  classificacao: ClassificacaoFiscal | null;
  classificando: boolean;
  ehAdmin: boolean;
  /** Administrador e a tela nao esta em leitura: digita NCM, CEST e categoria (ONLY_ADMIN_FISCAL). */
  fiscalEditavel: boolean;
  dica: (campo: string) => string | undefined;
}>();

const estado = computed(() => estadoFiscalNaTela(props.form.fiscal.estado, props.form.fiscal.motivo));
/** O que a regra aplicaria: a classificacao ao vivo, ou a regra do grupo enquanto ela nao chega. */
const automatico = computed(() => props.classificacao ?? props.regraDoGrupo);
const ncmDaRegra = computed(() => props.classificacao?.ncm ?? null);
const ncmTravado = computed(() => !props.fiscalEditavel || Boolean(ncmDaRegra.value));
const fonte = computed(() => (props.classificacao ? rotuloDaOrigemFiscal(props.classificacao.origem) : ""));
/** So o NCM digitado vai para o formulario; o achado pela regra e mostrado (o servidor grava ao salvar). */
function digitarNcm(valor: string) {
  if (!ncmTravado.value) props.form.fiscal.ncm = valor;
}
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
    <v-alert v-if="automatico" type="info" variant="tonal" density="compact">
      Regra automática: {{ automatico.tributacaoSimples }} · CST {{ automatico.cstPisCofins }} · Simples
      {{ percentualFiscal(automatico.aliquotaSimples) }} · ICMS RE {{ percentualFiscal(automatico.icmsRe) }}
      <div v-if="automatico.baseFiscal" class="text-caption mt-1">{{ automatico.baseFiscal }}</div>
      <div v-if="fonte" class="text-caption mt-1">Fonte: {{ fonte }}</div>
    </v-alert>

    <v-row dense>
      <v-col cols="12" sm="6">
        <v-text-field
          :model-value="ncmDaRegra ?? form.fiscal.ncm"
          label="NCM (automático quando encontrado)"
          :loading="classificando"
          :readonly="ncmTravado"
          :class="{ cartao__previa: ncmTravado }"
          :hint="dica('ncm')"
          @update:model-value="digitarNcm"
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
          :model-value="automatico?.cstPisCofins ?? form.fiscal.cstPisCofins"
          label="CST PIS/COFINS (automático)"
          readonly
          class="cartao__previa"
        />
      </v-col>
      <v-col cols="6" sm="4">
        <v-text-field
          :model-value="classificacao?.cstReforma || form.fiscal.cstReforma || '—'"
          label="CST reforma"
          readonly
          class="cartao__previa"
        />
      </v-col>
      <v-col cols="6" sm="4">
        <v-text-field
          :model-value="classificacao?.cClassTrib || form.fiscal.cClassTrib || '—'"
          label="cClassTrib"
          readonly
          class="cartao__previa"
        />
      </v-col>
      <v-col cols="6" sm="4">
        <v-text-field
          :model-value="classificacao?.aliquotaIbs ?? form.fiscal.aliquotaIbs"
          label="IBS %"
          readonly
          class="cartao__previa"
        />
      </v-col>
      <v-col cols="6" sm="4">
        <v-text-field
          :model-value="classificacao?.aliquotaCbs ?? form.fiscal.aliquotaCbs"
          label="CBS %"
          readonly
          class="cartao__previa"
        />
      </v-col>
    </v-row>
  </ProdutoCartao>
</template>
