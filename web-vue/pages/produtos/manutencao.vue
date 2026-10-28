<script setup lang="ts">
import type { AuthSession } from "@padaria/shared";
import AppShell from "~/components/app/AppShell.vue";
import ProdutoPanoramaFiscal from "~/components/produtos/ProdutoPanoramaFiscal.vue";
import type { CaixaStatus, Opcao } from "~/types/padaria";

const router = useRouter();
const { carregarSessao } = useApi();
const sessao = ref<AuthSession | null>(null);
const empresas = ref<Opcao[]>([]);
const caixaStatus = ref<CaixaStatus | null>(null);
const carregando = ref(true);
const erro = ref("");
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
      erro.value = "A manutenção do catálogo é exclusiva para administradores.";
      return;
    }
    empresas.value = sessao.value.empresas ?? [];
  } catch {
    erro.value = "Não foi possível carregar a sessão. Atualize a página e tente novamente.";
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
    :empresa-id="sessao.perfil?.empresaId ?? ''"
    :caixa-status="caixaStatus"
    :telas-desabilitadas="telasDesabilitadasMenu"
    :motivos-telas-desabilitadas="motivosTelasDesabilitadas"
    :carregando-empresa="false"
  >
    <main class="pa-4 pa-md-6">
      <header class="d-flex flex-wrap align-center justify-space-between ga-4 mb-5">
        <div>
          <h1 class="text-h5">Manutenção do catálogo</h1>
          <p class="text-body-2 text-medium-emphasis">
            Backups, de-para do SIA, pesáveis e carga fiscal. Só grava quando você confirma cada ação.
          </p>
        </div>
        <v-btn variant="outlined" prepend-icon="mdi-arrow-left" to="/produtos">Voltar aos produtos</v-btn>
      </header>

      <v-alert v-if="erro" type="error" variant="tonal" class="mb-4">{{ erro }}</v-alert>
      <template v-else>
        <v-row class="mb-1">
          <v-col cols="12" md="6">
            <v-card variant="outlined" height="100%">
              <v-card-title class="text-subtitle-1">Exportação de reconciliação</v-card-title>
              <v-card-text>
                Baixa os produtos do escopo permitido em CSV para conferência e cruzamento de códigos.
              </v-card-text>
              <v-card-actions>
                <v-btn
                  variant="tonal"
                  prepend-icon="mdi-file-delimited-outline"
                  href="/api/produtos/export.csv"
                  download="produtos-pralis.csv"
                >
                  Exportar CSV
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-col>
          <v-col cols="12" md="6">
            <v-card variant="outlined" height="100%">
              <v-card-title class="text-subtitle-1">Backup do catálogo</v-card-title>
              <v-card-text>
                XLSX com produtos, fiscal, promoções e conversões. O arquivo registra o saldo como fotografia e não cria
                movimento.
              </v-card-text>
              <v-card-actions>
                <v-btn
                  variant="tonal"
                  prepend-icon="mdi-database-export-outline"
                  href="/api/produtos/backup.xlsx"
                  download="backup-produtos-pralis.xlsx"
                >
                  Baixar backup XLSX
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-col>
          <v-col cols="12" md="6">
            <v-card variant="outlined" height="100%">
              <v-card-title class="text-subtitle-1">De-para do SIA</v-card-title>
              <v-card-text>
                Importa a exportação do SIA de cada loja: a régua do código no PDV e o fiscal de LI e HORA.
              </v-card-text>
              <v-card-actions>
                <v-btn variant="tonal" prepend-icon="mdi-swap-horizontal" to="/produtos/depara-sia"
                  >Abrir de-para</v-btn
                >
              </v-card-actions>
            </v-card>
          </v-col>
          <v-col cols="12" md="6">
            <v-card variant="outlined" height="100%">
              <v-card-title class="text-subtitle-1">Pesáveis da loja</v-card-title>
              <v-card-text>
                Pesável, tecla e validade de balança pela exportação do SIA, para quem não tem valor ou para todos os
                ativos.
              </v-card-text>
              <v-card-actions>
                <v-btn variant="tonal" prepend-icon="mdi-scale" to="/produtos/pesaveis">Abrir pesáveis</v-btn>
              </v-card-actions>
            </v-card>
          </v-col>
        </v-row>

        <ProdutoPanoramaFiscal />
      </template>
    </main>
  </AppShell>
</template>
