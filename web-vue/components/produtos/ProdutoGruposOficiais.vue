<script setup lang="ts">
/**
 * Fase B1 da virada (R-222): cria na loja os grupos oficiais da planilha e as unidades que os produtos da BASE
 * usam e ela ainda não tem. Só o que falta; prévia sem gravar; criar exige a frase e o hash da prévia.
 */
import type { Opcao } from "~/types/padaria";

interface PreviaGrupos {
  loja: string;
  grupos: Array<{ nome: string; id: string }>;
  gruposJaExistentes: number;
  unidades: Array<{ sigla: string; nome: string }>;
  unidadesJaExistentes: number;
  hashPlano: string;
  confirmacao: string;
}

const props = defineProps<{ empresas: Opcao[]; empresaInicial: string }>();
const { apiUrl } = useApi();
const empresaId = ref(props.empresaInicial);
const previa = ref<PreviaGrupos | null>(null);
const confirmacao = ref("");
const conferindo = ref(false);
const gravando = ref(false);
const erro = ref("");
const sucesso = ref("");
watch(empresaId, () => {
  previa.value = null;
  confirmacao.value = "";
});
const fraseOk = computed(() => confirmacao.value.trim().toUpperCase() === previa.value?.confirmacao);
const nadaACriar = computed(() => !previa.value?.grupos.length && !previa.value?.unidades.length);

async function pedir<T>(rota: string, corpo?: object): Promise<T> {
  const resposta = await fetch(`${apiUrl}${rota}`, {
    method: corpo ? "POST" : "GET",
    credentials: "include",
    ...(corpo ? { headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) } : {})
  });
  const conteudo = (await resposta.json().catch(() => null)) as { data?: T; title?: string } | null;
  if (!resposta.ok) throw new Error(conteudo?.title ?? "Não foi possível concluir a ação.");
  return conteudo?.data as T;
}

async function conferir() {
  conferindo.value = true;
  erro.value = "";
  sucesso.value = "";
  try {
    previa.value = await pedir<PreviaGrupos>(
      `/api/produtos/grupos-oficiais/previa?empresaId=${encodeURIComponent(empresaId.value)}`
    );
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não consegui conferir.";
  } finally {
    conferindo.value = false;
  }
}

async function criar() {
  if (!previa.value || !fraseOk.value) return;
  gravando.value = true;
  erro.value = "";
  try {
    const feito = await pedir<{ gruposCriados: number; unidadesCriadas: number }>("/api/produtos/grupos-oficiais", {
      empresaId: empresaId.value,
      confirmacao: confirmacao.value,
      hashPlano: previa.value.hashPlano
    });
    sucesso.value = `${feito.gruposCriados} grupo(s) e ${feito.unidadesCriadas} unidade(s) criados em ${previa.value.loja}.`;
    previa.value = null;
    confirmacao.value = "";
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não consegui criar.";
  } finally {
    gravando.value = false;
  }
}
</script>

<template>
  <v-card variant="outlined" class="grupos-oficiais">
    <v-card-title class="text-subtitle-1">Grupos e unidades da planilha</v-card-title>
    <v-card-text class="grupos-oficiais__corpo">
      <p>
        Passo da virada: cria na loja os <strong>grupos oficiais</strong> da planilha e as unidades que os produtos da
        BASE usam. Só cria o que falta; nada é alterado nem apagado.
      </p>
      <div class="grupos-oficiais__acoes">
        <v-select v-model="empresaId" :items="empresas" item-title="nome" item-value="id" label="Loja" hide-details />
        <v-btn variant="tonal" prepend-icon="mdi-clipboard-check-outline" :loading="conferindo" @click="conferir">
          Conferir sem gravar
        </v-btn>
      </div>
      <v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>
      <v-alert v-if="sucesso" type="success" variant="tonal">{{ sucesso }}</v-alert>
      <template v-if="previa">
        <p>
          {{ previa.loja }}: <strong class="cx-num">{{ previa.grupos.length }}</strong> grupo(s) a criar ·
          {{ previa.gruposJaExistentes }} já existem · <strong class="cx-num">{{ previa.unidades.length }}</strong>
          unidade(s) a criar
        </p>
        <ul v-if="previa.unidades.length" class="grupos-oficiais__lista">
          <li v-for="unidade in previa.unidades" :key="unidade.sigla">{{ unidade.sigla }} · {{ unidade.nome }}</li>
        </ul>
        <ul v-if="previa.grupos.length" class="grupos-oficiais__lista grupos-oficiais__lista--colunas">
          <li v-for="grupo in previa.grupos" :key="grupo.id">{{ grupo.id }} · {{ grupo.nome }}</li>
        </ul>
        <div v-if="!nadaACriar" class="grupos-oficiais__acoes">
          <v-text-field v-model="confirmacao" :label="`Digite: ${previa.confirmacao}`" hide-details />
          <v-btn color="primary" prepend-icon="mdi-plus" :disabled="!fraseOk" :loading="gravando" @click="criar">
            Criar
          </v-btn>
        </div>
        <p v-else>A loja já tem todos os grupos e unidades.</p>
      </template>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.grupos-oficiais__corpo {
  display: grid;
  gap: var(--cx-sp-3);
}
.grupos-oficiais__corpo p {
  margin: 0;
}
.grupos-oficiais__acoes {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--cx-sp-3);
  align-items: center;
}
.grupos-oficiais__lista {
  margin: 0;
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
  overflow-wrap: anywhere;
}
.grupos-oficiais__lista--colunas {
  columns: 2;
  column-gap: var(--cx-sp-4);
}
@media (max-width: 768px) {
  .grupos-oficiais__acoes {
    grid-template-columns: minmax(0, 1fr);
  }
  .grupos-oficiais__lista--colunas {
    columns: 1;
  }
}
</style>
