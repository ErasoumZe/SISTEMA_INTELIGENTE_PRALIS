<script setup lang="ts">
import {
  normalizarRazaoSocialQuestor,
  ROTAS_EXPORTACAO_QUESTOR,
  type QuestorCatalogoImportacaoDto
} from "@padaria/shared";
import { ErroApiCliente } from "~/composables/useApi";

/**
 * Importa o catálogo oficial enviado pela Conplus (`eventos_variaveis_por_empresa.csv`): o DP escolhe a
 * empresa do arquivo que corresponde à empresa atual, confere e confirma. Só eventos novos são gravados;
 * código que já existe com outros dados aparece como divergente e não é alterado.
 */
const emit = defineEmits<{ importado: [] }>();

const { apiPost } = useApi();
const conteudo = ref("");
const nomeArquivo = ref("");
const empresas = ref<readonly string[]>([]);
const empresaConfigurada = ref<string | null>(null);
const empresaConplus = ref<string | null>(null);
const resultado = ref<QuestorCatalogoImportacaoDto | null>(null);
const ocupado = ref(false);
const erro = ref("");
const aviso = ref("");

const contagem = computed(() => {
  const itens = resultado.value?.itens ?? [];
  return {
    novos: itens.filter((item) => item.situacao === "novo").length,
    iguais: itens.filter((item) => item.situacao === "igual").length,
    divergentes: itens.filter((item) => item.situacao === "divergente")
  };
});

async function chamar(corpo: { empresaConplus?: string; confirmar?: boolean }) {
  ocupado.value = true;
  erro.value = "";
  try {
    return await apiPost<QuestorCatalogoImportacaoDto>(ROTAS_EXPORTACAO_QUESTOR.eventosImportar, {
      conteudo: conteudo.value,
      ...corpo
    });
  } catch (falha) {
    erro.value = falha instanceof ErroApiCliente ? falha.message : "Não foi possível ler o catálogo.";
    return null;
  } finally {
    ocupado.value = false;
  }
}

async function escolherArquivo(valor: File | File[] | null | undefined) {
  const arquivo = Array.isArray(valor) ? valor[0] : (valor ?? undefined);
  resultado.value = null;
  empresaConplus.value = null;
  aviso.value = "";
  if (!arquivo) return;
  nomeArquivo.value = arquivo.name;
  conteudo.value = await arquivo.text();
  const lido = await chamar({});
  empresas.value = lido?.empresas ?? [];
  empresaConfigurada.value = lido?.empresaConfigurada ?? null;
  // Pré-seleciona só a empresa que bate com a configurada; o servidor confere de novo.
  const alvo = empresaConfigurada.value ? normalizarRazaoSocialQuestor(empresaConfigurada.value) : null;
  empresaConplus.value = empresas.value.find((empresa) => normalizarRazaoSocialQuestor(empresa) === alvo) ?? null;
  if (lido?.erros.length) erro.value = lido.erros.slice(0, 3).join(" · ");
  else if (lido && !lido.empresas.length) erro.value = "Nenhuma empresa encontrada no arquivo.";
}

async function conferir() {
  if (!empresaConplus.value) return;
  resultado.value = await chamar({ empresaConplus: empresaConplus.value });
}

async function confirmar() {
  if (!empresaConplus.value) return;
  const gravado = await chamar({ empresaConplus: empresaConplus.value, confirmar: true });
  if (!gravado) return;
  resultado.value = gravado;
  aviso.value = `${gravado.gravados} evento(s) novo(s) gravado(s) no catálogo desta empresa.`;
  emit("importado");
}

watch(empresaConplus, () => void conferir());
</script>

<template>
  <div class="importar">
    <strong>Importar catálogo oficial da Conplus</strong>
    <p class="muted">
      Arquivo <code>eventos_variaveis_por_empresa.csv</code> (traz a letra H/R/V de cada evento). Escolha qual empresa
      do arquivo é a empresa atual.
    </p>
    <div class="importar__linha">
      <v-file-input
        accept=".csv,text/csv"
        label="Arquivo do catálogo oficial (.csv)"
        density="compact"
        hide-details
        prepend-icon=""
        prepend-inner-icon="mdi-file-delimited-outline"
        @update:model-value="escolherArquivo"
      />
      <v-select
        v-if="empresas.length"
        v-model="empresaConplus"
        :items="[...empresas]"
        label="Empresa no arquivo"
        density="compact"
        hide-details
      />
    </div>
    <p v-if="nomeArquivo" class="muted">
      Empresa desta sessão no Questor:
      <strong>{{ empresaConfigurada ?? "não configurada (Configuração Questor → Razão social)" }}</strong
      >. Só o catálogo dela é aceito.
    </p>
    <v-alert v-if="erro" type="warning" variant="tonal" density="compact">{{ erro }}</v-alert>
    <v-alert v-if="aviso" type="success" variant="tonal" density="compact">{{ aviso }}</v-alert>
    <div v-if="resultado?.itens.length" class="importar__resultado">
      <span
        >{{ contagem.novos }} novo(s) · {{ contagem.iguais }} já cadastrado(s) ·
        {{ contagem.divergentes.length }} divergente(s)</span
      >
      <ul v-if="contagem.divergentes.length">
        <li v-for="item in contagem.divergentes" :key="item.codigo">
          {{ item.codigo }} — {{ item.descricao }}: {{ item.detalhe }} (não será alterado)
        </li>
      </ul>
      <v-btn color="primary" variant="tonal" :disabled="!contagem.novos" :loading="ocupado" @click="confirmar"
        >Gravar {{ contagem.novos }} evento(s) novo(s)</v-btn
      >
    </div>
  </div>
</template>

<style scoped>
.importar {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.importar > * {
  min-width: 0;
  padding: 12px;
  border: 1px dashed rgba(var(--v-border-color), 0.4);
  border-radius: 8px;
}
.importar__linha {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
  align-items: center;
}
.importar__resultado {
  display: grid;
  gap: 6px;
  justify-items: start;
  font-size: 0.9rem;
}
.muted {
  color: rgba(var(--v-theme-on-surface), 0.68);
  margin: 0;
}
@media (max-width: 600px) {
  .importar__linha {
    grid-template-columns: 1fr;
  }
}
</style>
