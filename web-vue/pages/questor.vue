<script setup lang="ts">
import type { AuthSession } from "@padaria/shared";
import { temPermissao } from "@padaria/shared";
import AppShell from "~/components/app/AppShell.vue";
import QuestorConfiguracaoEmpresa from "~/components/questor/QuestorConfiguracaoEmpresa.vue";
import QuestorCatalogoCodigos from "~/components/questor/QuestorCatalogoCodigos.vue";
import QuestorContratosColaboradores from "~/components/questor/QuestorContratosColaboradores.vue";
import { usePermissoes } from "~/composables/usePermissoes";
import type { Opcao } from "~/types/padaria";
import { mensagemErro } from "~/utils/domain";

const { carregarSessao } = useApi();
const router = useRouter();
const sessao = ref<AuthSession | null>(null);
const carregando = ref(true);
const erro = ref("");
const permissoesAtuais = computed(() => sessao.value?.perfil?.permissoes ?? []);
const { telasPermitidas, telasDesabilitadasMenu, motivosTelasDesabilitadas } = usePermissoes(
  permissoesAtuais,
  () => false
);
const empresas = computed<Opcao[]>(() =>
  (sessao.value?.empresas ?? []).map((empresa) => ({ id: empresa.id, nome: empresa.nome }))
);
const empresaId = computed(() => sessao.value?.perfil?.empresaId ?? empresas.value[0]?.id ?? "");

onMounted(async () => {
  try {
    sessao.value = await carregarSessao();
    if (!sessao.value) {
      await router.push("/login");
      return;
    }
    if (!temPermissao(permissoesAtuais.value, "conplus_questor_configurar"))
      erro.value = "Sem permissão para consultar as configurações Questor.";
  } catch (falha) {
    erro.value = mensagemErro(falha);
  } finally {
    carregando.value = false;
  }
});
</script>

<template>
  <v-progress-linear v-if="carregando" indeterminate color="primary" />
  <AppShell
    v-else-if="sessao"
    :sessao="sessao"
    :telas="telasPermitidas"
    tela-ativa="departamento_pessoal"
    :empresas="empresas"
    :empresa-id="empresaId"
    :caixa-status="null"
    :telas-desabilitadas="telasDesabilitadasMenu"
    :motivos-telas-desabilitadas="motivosTelasDesabilitadas"
    :carregando-empresa="false"
  >
    <v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>
    <main v-else class="questor-page">
      <header>
        <p class="questor-page__eyebrow">Departamento pessoal · Conplus</p>
        <h1>Configuração Questor</h1>
        <p>
          Parâmetros por empresa, catálogo oficial e código de contrato de cada colaborador para preparar a integração.
          Exportação TXT não está disponível nesta tela.
        </p>
      </header>
      <QuestorConfiguracaoEmpresa /><QuestorCatalogoCodigos /><QuestorContratosColaboradores />
    </main>
  </AppShell>
</template>

<style scoped>
.questor-page {
  display: grid;
  gap: var(--cx-sp-5);
  max-width: 1180px;
  margin: 0 auto;
  padding-bottom: var(--cx-sp-8);
}
.questor-page header {
  display: grid;
  gap: var(--cx-sp-2);
}
.questor-page h1 {
  margin: 0;
}
.questor-page header p {
  margin: 0;
  color: var(--cx-ink-soft);
}
.questor-page__eyebrow {
  font-size: var(--cx-fs-caption);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
</style>
