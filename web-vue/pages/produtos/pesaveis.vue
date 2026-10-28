<script setup lang="ts">
/** Pesaveis da loja — os tres cards de pesavel da `manutencao` do app oficial. So o administrador. */
import type { AuthSession } from "@padaria/shared";
import AppShell from "~/components/app/AppShell.vue";
import PesaveisExportacao from "~/components/produtos/PesaveisExportacao.vue";
import PesaveisClassificar from "~/components/produtos/PesaveisClassificar.vue";
import PesaveisPadronizar from "~/components/produtos/PesaveisPadronizar.vue";
import type { CaixaStatus, Opcao } from "~/types/padaria";

const router = useRouter();
const { carregarSessao } = useApi();
const sessao = ref<AuthSession | null>(null);
const empresas = ref<Opcao[]>([]);
const caixaStatus = ref<CaixaStatus | null>(null);
const carregando = ref(true);
const acessoNegado = ref("");
const empresaId = ref("");
const { telasPermitidas, telasDesabilitadasMenu, motivosTelasDesabilitadas } = usePermissoes(
  computed(() => sessao.value?.perfil?.permissoes ?? []),
  () => Boolean(caixaStatus.value?.caixaAberto)
);

onMounted(async () => {
  try {
    sessao.value = await carregarSessao();
    if (!sessao.value) {
      await router.push("/login");
      return;
    }
    if (sessao.value.perfil?.role !== "usuario_admin") {
      acessoNegado.value = "Esta página é só do administrador.";
      return;
    }
    empresas.value = sessao.value.empresas ?? [];
    empresaId.value = sessao.value.perfil?.empresaId ?? empresas.value[0]?.id ?? "";
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
    @selecionar-empresa="empresaId = $event"
  >
    <main class="pesaveis">
      <header class="pesaveis__cabecalho">
        <div>
          <h1>Pesáveis da loja</h1>
          <p>Pesável, tecla e validade de balança no produto e no de-para do SIA. Toda ação confere antes de gravar.</p>
        </div>
        <v-btn variant="outlined" prepend-icon="mdi-arrow-left" to="/produtos/manutencao">Voltar à manutenção</v-btn>
      </header>

      <v-alert v-if="acessoNegado" type="error" variant="tonal">{{ acessoNegado }}</v-alert>
      <template v-else>
        <v-select
          v-model="empresaId"
          :items="empresas"
          item-title="nome"
          item-value="id"
          label="Loja"
          hide-details
          class="pesaveis__loja"
        />
        <PesaveisExportacao :empresa-id="empresaId" />
        <PesaveisClassificar :empresa-id="empresaId" />
        <PesaveisPadronizar :empresa-id="empresaId" />
      </template>
    </main>
  </AppShell>
</template>

<style scoped>
.pesaveis {
  display: grid;
  gap: var(--cx-sp-4);
  max-width: 960px;
  min-width: 0;
  padding: var(--cx-sp-4);
}
.pesaveis__cabecalho {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-3);
}
.pesaveis__cabecalho h1 {
  font-size: var(--cx-fs-h2);
  font-weight: 700;
  color: var(--cx-ink);
}
.pesaveis__cabecalho p {
  margin: 0;
  color: var(--cx-ink-soft);
}
.pesaveis__loja {
  max-width: 360px;
}
</style>
