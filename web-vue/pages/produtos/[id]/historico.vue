<script setup lang="ts">
import type { AuthSession } from "@padaria/shared";
import type { CaixaStatus, Opcao } from "~/types/padaria";
import AppShell from "~/components/app/AppShell.vue";
import { usePermissoes } from "~/composables/usePermissoes";
import { mensagemErro } from "~/utils/domain";

interface AlteracaoNome {
  id: string;
  nomeAnterior: string;
  nomeNovo: string;
  alteradoPor: string | null;
  alteradoEm: string;
}

const route = useRoute();
const router = useRouter();
const { apiGet, carregarSessao } = useApi();
const produtoId = computed(() => String(route.params.id ?? ""));
const sessao = ref<AuthSession | null>(null);
const empresas = ref<Opcao[]>([]);
const empresaId = ref("");
const caixaStatus = ref<CaixaStatus | null>(null);
const alteracoes = ref<AlteracaoNome[]>([]);
const carregando = ref(true);
const erro = ref("");
const permissoes = computed(() => sessao.value?.perfil?.permissoes ?? []);
const { telasPermitidas, telasDesabilitadasMenu, motivosTelasDesabilitadas } = usePermissoes(permissoes, () =>
  Boolean(caixaStatus.value?.caixaAberto)
);

async function trocarEmpresa(id: string) {
  empresaId.value = id;
  await carregar();
}

async function carregar() {
  carregando.value = true;
  erro.value = "";
  try {
    alteracoes.value = await apiGet<AlteracaoNome[]>(
      `/api/produtos/${encodeURIComponent(produtoId.value)}/historico-nomes?empresaId=${encodeURIComponent(empresaId.value)}`
    );
  } catch (errorApi) {
    erro.value = mensagemErro(errorApi);
  } finally {
    carregando.value = false;
  }
}

onMounted(async () => {
  try {
    sessao.value = await carregarSessao();
    if (!sessao.value) {
      await router.push("/login");
      return;
    }
    if (sessao.value.perfil?.role !== "usuario_admin") {
      erro.value = "Sem permissão para consultar o histórico de nomes.";
      return;
    }
    empresas.value = sessao.value.empresas?.length ? sessao.value.empresas : await apiGet<Opcao[]>("/api/empresas");
    const empresaDaRota = typeof route.query.empresaId === "string" ? route.query.empresaId : "";
    empresaId.value = empresas.value.some((empresa) => empresa.id === empresaDaRota)
      ? empresaDaRota
      : (sessao.value.perfil?.empresaId ?? sessao.value.perfil?.empresaIds?.[0] ?? empresas.value[0]?.id ?? "");
    await carregar();
  } catch (errorApi) {
    erro.value = mensagemErro(errorApi);
  } finally {
    carregando.value = false;
  }
});
</script>

<template>
  <v-progress-linear v-if="carregando" indeterminate />
  <AppShell
    v-else-if="sessao"
    :sessao="sessao"
    :telas="telasPermitidas"
    tela-ativa="produtos"
    :empresas="empresas"
    :empresa-id="empresaId"
    :caixa-status="caixaStatus"
    :telas-desabilitadas="telasDesabilitadasMenu"
    :motivos-telas-desabilitadas="motivosTelasDesabilitadas"
    :carregando-empresa="false"
    @selecionar-empresa="trocarEmpresa"
  >
    <main class="historico-nomes">
      <header class="historico-nomes__header">
        <v-btn icon="mdi-arrow-left" variant="text" aria-label="Voltar para o produto" :to="`/produtos/${produtoId}`" />
        <div>
          <h1>Histórico de nomes</h1>
          <p>Alterações registradas para este produto</p>
        </div>
      </header>

      <v-alert v-if="erro" type="error" variant="tonal">
        <div class="d-flex flex-wrap align-center ga-3">
          <span>{{ erro }}</span>
          <v-btn size="small" variant="flat" color="error" @click="carregar">Tentar novamente</v-btn>
        </div>
      </v-alert>
      <v-card v-else-if="!alteracoes.length" variant="outlined" class="pa-6">
        Nenhuma alteração de nome registrada.
      </v-card>
      <v-table v-else class="historico-nomes__tabela">
        <thead>
          <tr>
            <th>Data</th>
            <th>Nome anterior</th>
            <th>Novo nome</th>
            <th>Alterado por</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in alteracoes" :key="item.id">
            <td>{{ new Date(item.alteradoEm).toLocaleString("pt-BR") }}</td>
            <td>{{ item.nomeAnterior }}</td>
            <td>{{ item.nomeNovo }}</td>
            <td>{{ item.alteradoPor || "Usuário removido" }}</td>
          </tr>
        </tbody>
      </v-table>
      <div v-if="alteracoes.length" class="historico-nomes__mobile">
        <v-card v-for="item in alteracoes" :key="item.id" variant="outlined" class="pa-4">
          <dl>
            <dt>Data</dt>
            <dd>{{ new Date(item.alteradoEm).toLocaleString("pt-BR") }}</dd>
            <dt>Nome anterior</dt>
            <dd>{{ item.nomeAnterior }}</dd>
            <dt>Novo nome</dt>
            <dd>{{ item.nomeNovo }}</dd>
            <dt>Alterado por</dt>
            <dd>{{ item.alteradoPor || "Usuário removido" }}</dd>
          </dl>
        </v-card>
      </div>
      <p v-if="alteracoes.length === 200" class="historico-nomes__limite">Exibindo as 200 alterações mais recentes.</p>
    </main>
  </AppShell>
</template>

<style scoped>
.historico-nomes {
  display: grid;
  gap: 20px;
  min-width: 0;
  max-width: 100%;
}
.historico-nomes__header {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.historico-nomes__header h1 {
  font-size: 1.5rem;
}
.historico-nomes__header p,
.historico-nomes__limite {
  color: rgb(var(--v-theme-on-surface-variant));
}
.historico-nomes__mobile {
  display: none;
  gap: 12px;
}
.historico-nomes__mobile dl {
  display: grid;
  grid-template-columns: minmax(100px, 0.4fr) minmax(0, 1fr);
  gap: 8px 12px;
}
.historico-nomes__mobile dt {
  font-weight: 600;
}
.historico-nomes__mobile dd {
  min-width: 0;
  overflow-wrap: anywhere;
}
@media (max-width: 600px) {
  .historico-nomes__tabela {
    display: none;
  }
  .historico-nomes__mobile {
    display: grid;
  }
}
</style>
