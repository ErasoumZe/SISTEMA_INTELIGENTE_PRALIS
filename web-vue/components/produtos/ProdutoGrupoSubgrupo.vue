<script setup lang="ts">
/**
 * Grupo e Subgrupo de mercadoria (13/11/2026, igual ao S2). O produto continua guardando UM registro de grupo
 * (`grupoMercadoriaId`, ex.: "MER BEBIDAS - SUCOS"); aqui ele aparece dividido em Grupo (BEBIDAS) e Subgrupo
 * (SUCOS). Grupo que não tem subgrupo (ex.: "Insumos") é escolhido direto no primeiro campo.
 */
import { arvoreGruposMercadoria, grupoDoRegistro } from "@padaria/shared";

const props = defineProps<{
  grupos: Array<{ id: string; nome: string }>;
  obrigatorio: boolean;
  travado?: boolean;
  erro?: string | string[] | undefined;
  dica?: string | undefined;
}>();
const grupoMercadoriaId = defineModel<string | null>({ default: null });
/** Chave do Grupo escolhido: quem usa lê para saber se falta o Subgrupo e zera junto ao limpar o formulário. */
const chaveGrupo = defineModel<string | null>("grupo", { default: null });

const arvore = computed(() => arvoreGruposMercadoria(props.grupos));

// O registro pode chegar depois (edição) ou mudar por fora (cópia da BASE): o grupo acompanha.
watch(
  [grupoMercadoriaId, arvore],
  ([id]) => {
    const dono = grupoDoRegistro(arvore.value, id);
    if (dono) chaveGrupo.value = dono.chave;
  },
  { immediate: true }
);

const grupoEscolhido = computed(() => arvore.value.find((item) => item.chave === chaveGrupo.value) ?? null);
const opcoesGrupo = computed(() => arvore.value.map((item) => ({ value: item.chave, title: item.grupo })));
const opcoesSubgrupo = computed(() =>
  (grupoEscolhido.value?.subgrupos ?? []).map((sub) => ({ value: sub.id, title: sub.subgrupo || "(sem subgrupo)" }))
);
/** Grupo que é um registro só, sem subgrupo: o próprio grupo já é a escolha. */
const semSubgrupo = computed(
  () => grupoEscolhido.value?.subgrupos.length === 1 && !grupoEscolhido.value.subgrupos[0]!.subgrupo
);

function escolherGrupo(chave: string | null) {
  chaveGrupo.value = chave;
  const grupo = arvore.value.find((item) => item.chave === chave);
  if (!grupo) {
    grupoMercadoriaId.value = null;
    return;
  }
  if (grupo.subgrupos.some((sub) => sub.id === grupoMercadoriaId.value)) return;
  const unico = grupo.subgrupos.length === 1 ? grupo.subgrupos[0]! : null;
  grupoMercadoriaId.value = unico ? unico.id : null;
}

const semOpcoes = computed(() => (props.grupos.length ? "Nenhum grupo encontrado" : "Nenhum grupo fiscal disponível"));
</script>

<template>
  <v-row dense>
    <v-col cols="12" sm="6">
      <v-autocomplete
        :model-value="chaveGrupo"
        :items="opcoesGrupo"
        :label="obrigatorio ? 'Grupo *' : 'Grupo'"
        placeholder="Ex.: BEBIDAS"
        :no-data-text="semOpcoes"
        :clearable="!obrigatorio && !travado"
        :hint="dica"
        :readonly="travado"
        data-campo="grupoMercadoria"
        @update:model-value="escolherGrupo"
      />
    </v-col>
    <v-col cols="12" sm="6">
      <v-autocomplete
        v-model="grupoMercadoriaId"
        :items="opcoesSubgrupo"
        :label="obrigatorio && !semSubgrupo ? 'Subgrupo *' : 'Subgrupo'"
        :placeholder="grupoEscolhido ? 'Ex.: SUCOS' : 'Escolha o grupo primeiro'"
        no-data-text="Escolha o grupo primeiro"
        :disabled="!grupoEscolhido || semSubgrupo"
        :readonly="travado"
        data-campo="grupoMercadoriaId"
        :error-messages="erro"
      />
    </v-col>
  </v-row>
</template>
