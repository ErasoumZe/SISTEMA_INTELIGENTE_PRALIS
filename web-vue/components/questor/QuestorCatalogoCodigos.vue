<script setup lang="ts">
import {
  codigoQuestorPayloadSchema,
  tabelasCodigoQuestor,
  type CodigoQuestorDto,
  type CodigoQuestorPayload,
  type TabelaCodigoQuestor
} from "@padaria/shared";
import QuestorApiStatus from "~/components/questor/QuestorApiStatus.vue";

const { apiGet, apiPost, apiPatch } = useApi();
const linhas = ref<CodigoQuestorDto[]>([]);
const tabela = ref<TabelaCodigoQuestor>(tabelasCodigoQuestor[0]!);
const incluirInativos = ref(false);
const carregando = ref(false);
const salvando = ref(false);
const erro = ref<unknown>(null);
const mensagem = ref("");
const novo = reactive<CodigoQuestorPayload>({ tabela: tabela.value, codigo: "", descricao: "", ativo: true });

async function carregar() {
  carregando.value = true;
  erro.value = null;
  try {
    linhas.value = await apiGet<CodigoQuestorDto[]>(
      `/api/conplus/questor/codigos?tabela=${encodeURIComponent(tabela.value)}&incluirInativos=${incluirInativos.value}`
    );
  } catch (falha) {
    erro.value = falha;
  } finally {
    carregando.value = false;
  }
}

async function adicionar() {
  const resultado = codigoQuestorPayloadSchema.safeParse({ ...novo, tabela: tabela.value });
  if (!resultado.success) {
    erro.value = new Error(resultado.error.issues[0]?.message ?? "Código inválido.");
    return;
  }
  salvando.value = true;
  erro.value = null;
  mensagem.value = "";
  try {
    linhas.value = [...linhas.value, await apiPost<CodigoQuestorDto>("/api/conplus/questor/codigos", resultado.data)];
    novo.codigo = "";
    novo.descricao = "";
    mensagem.value = "Código cadastrado.";
  } catch (falha) {
    erro.value = falha;
  } finally {
    salvando.value = false;
  }
}

async function alternar(linha: CodigoQuestorDto) {
  try {
    const atualizada = await apiPatch<CodigoQuestorDto>(`/api/conplus/questor/codigos/${linha.id}`, {
      ativo: !linha.ativo
    });
    linhas.value = linhas.value.map((item) => (item.id === linha.id ? atualizada : item));
  } catch (falha) {
    erro.value = falha;
  }
}

watch([tabela, incluirInativos], () => {
  novo.tabela = tabela.value;
  void carregar();
});
onMounted(() => void carregar());
</script>

<template>
  <section class="questor-card" aria-labelledby="questor-catalogo-titulo">
    <div class="questor-card__cabecalho">
      <div>
        <p class="questor-card__eyebrow">E2 · catálogo oficial</p>
        <h2 id="questor-catalogo-titulo">Códigos Questor</h2>
        <p>Códigos são cadastrados por empresa e nunca são apagados; desative os incorretos.</p>
      </div>
      <v-switch v-model="incluirInativos" label="Incluir inativos" hide-details />
    </div>
    <QuestorApiStatus v-if="erro" :erro="erro" class="mb-4" />
    <v-progress-linear v-if="carregando" indeterminate color="primary" />
    <v-row dense class="mb-2"
      ><v-col cols="12" md="4"><v-select v-model="tabela" :items="tabelasCodigoQuestor" label="Tabela" /></v-col
      ><v-col cols="12" md="3"><v-text-field v-model="novo.codigo" label="Código oficial" /></v-col
      ><v-col cols="12" md="4"><v-text-field v-model="novo.descricao" label="Descrição" /></v-col
      ><v-col cols="12" md="1" class="d-flex align-center"
        ><v-btn
          icon="mdi-plus"
          color="primary"
          :loading="salvando"
          aria-label="Adicionar código"
          @click="adicionar" /></v-col
    ></v-row>
    <v-alert v-if="mensagem" type="success" variant="tonal" density="compact" class="mb-3">{{ mensagem }}</v-alert>
    <div class="responsive-table-shell">
      <v-table density="comfortable"
        ><thead>
          <tr>
            <th>Código</th>
            <th>Descrição</th>
            <th>Situação</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="linha in linhas" :key="linha.id">
            <td>{{ linha.codigo }}</td>
            <td>{{ linha.descricao }}</td>
            <td>{{ linha.ativo ? "Ativo" : "Inativo" }}</td>
            <td class="text-end">
              <v-btn variant="text" size="small" @click="alternar(linha)">{{
                linha.ativo ? "Desativar" : "Reativar"
              }}</v-btn>
            </td>
          </tr>
          <tr v-if="!linhas.length && !carregando">
            <td colspan="4" class="text-center">Nenhum código carregado.</td>
          </tr>
        </tbody></v-table
      >
    </div>
  </section>
</template>

<style scoped>
.questor-card {
  display: grid;
  gap: var(--cx-sp-4);
  padding: var(--cx-sp-5);
  border: 1px solid var(--cx-border);
  border-radius: var(--cx-radius-lg);
  background: var(--cx-surface);
}
.questor-card__cabecalho {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cx-sp-4);
}
.questor-card__eyebrow {
  margin: 0 0 var(--cx-sp-1);
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.questor-card__cabecalho h2 {
  margin: 0;
}
.questor-card__cabecalho p {
  margin: var(--cx-sp-2) 0 0;
  color: var(--cx-ink-soft);
}
@media (max-width: 600px) {
  .questor-card__cabecalho {
    flex-direction: column;
  }
}
</style>
