<script setup lang="ts">
/** De-para do SIA por loja — igual a tela `produtos/depara-sia` do app oficial. So o administrador. */
import type { AuthSession } from "@padaria/shared";
import AppShell from "~/components/app/AppShell.vue";
import type { CaixaStatus, Opcao } from "~/types/padaria";
import { useDeParaSia } from "~/composables/useDeParaSia";

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
const deParaSia = useDeParaSia(empresaId);
const { arquivo, resumo, confirmacao, conferindo, gravando, erro, sucesso, problemas, podeGravar } = deParaSia;
const numero = (valor: number) => valor.toLocaleString("pt-BR");

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
    <main class="depara">
      <header class="depara__cabecalho">
        <div>
          <h1>De-para do SIA</h1>
          <p>A régua da numeração da rede. É daqui que sai o código de cada produto no PDV e o fiscal de LI e HORA.</p>
        </div>
        <v-btn variant="outlined" prepend-icon="mdi-arrow-left" to="/produtos/manutencao">Voltar à manutenção</v-btn>
      </header>

      <v-alert v-if="acessoNegado" type="error" variant="tonal">{{ acessoNegado }}</v-alert>
      <template v-else>
        <v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>
        <v-alert v-if="sucesso" type="success" variant="tonal">{{ sucesso }}</v-alert>

        <v-card variant="outlined" class="pa-4">
          <p class="depara__texto">
            Exporte o catálogo no <strong>SIA Supervisor</strong> da loja e envie aqui em <code>.xlsx</code> ou
            <code>.csv</code> (o <code>.xls</code> antigo: abra no Excel e salve como <code>.xlsx</code>). Cada loja tem
            a sua exportação — a da Lisboa não serve para a TNP.
          </p>
          <div class="depara__envio">
            <v-select
              v-model="empresaId"
              :items="empresas"
              item-title="nome"
              item-value="id"
              label="Loja"
              hide-details
            />
            <v-file-input
              v-model="arquivo"
              label="Exportação do SIA"
              accept=".xlsx,.csv"
              prepend-icon=""
              prepend-inner-icon="mdi-file-upload-outline"
              hide-details
            />
            <v-btn
              color="primary"
              variant="tonal"
              prepend-icon="mdi-clipboard-check-outline"
              :disabled="!arquivo"
              :loading="conferindo"
              @click="deParaSia.conferir"
            >
              Conferir
            </v-btn>
          </div>
        </v-card>

        <template v-if="resumo">
          <div class="depara__numeros">
            <v-card variant="outlined" class="pa-4">
              <strong class="cx-num">{{ numero(resumo.linhas) }}</strong>
              <span
                >Do catálogo<template v-if="resumo.entrega">
                  · {{ numero(resumo.entrega) }} de entrega fora</template
                ></span
              >
            </v-card>
            <v-card variant="outlined" class="pa-4">
              <strong class="cx-num">{{ numero(resumo.atuais) }}</strong>
              <span>Já cadastradas em {{ resumo.loja }}</span>
            </v-card>
            <v-card variant="outlined" class="pa-4">
              <strong class="cx-num">{{ numero(resumo.semBarras) }}</strong>
              <span>Sem barras — ficam de fora</span>
            </v-card>
            <v-card variant="outlined" class="pa-4">
              <strong class="cx-num">{{ resumo.faixa ? `${resumo.faixa.min}–${resumo.faixa.max}` : "—" }}</strong>
              <span>Faixa do catálogo</span>
            </v-card>
          </div>

          <v-alert v-if="problemas" type="error" variant="tonal">
            <strong>{{ problemas }} problema(s) impedem a gravação</strong>
            <div v-if="resumo.barrasAmbiguas.length">
              Código de barras apontando para mais de um produto — um sobrescreveria o outro no PDV:
              <ul>
                <li v-for="ambigua in resumo.barrasAmbiguas" :key="ambigua.chave">
                  <code>{{ ambigua.chave }}</code> → {{ ambigua.coditens.join(", ") }}
                </li>
              </ul>
            </div>
            <div v-if="resumo.coditensRepetidos.length">
              Coditem repetido na exportação: {{ resumo.coditensRepetidos.join(", ") }}
            </div>
            <div v-if="resumo.semDadosBalanca">
              {{ resumo.semDadosBalanca }} produto(s) sem Pesável S/N ou, quando S, sem Tecla/Validade. Exporte um
              cadastro atual do SIA com esses campos antes de substituir o de-para.
            </div>
          </v-alert>
          <v-alert v-else type="warning" variant="tonal">
            Gravar <strong>substitui o de-para de {{ resumo.loja }} inteiro</strong> — não mescla. A exportação é a
            verdade daquele momento: o que não está nela sai daqui.
            <div v-if="resumo.teclaAssumida">
              <strong>{{ resumo.teclaAssumida }} pesável(is)</strong> vieram sem tecla no arquivo e recebem
              <code>000</code>, a tecla confirmada com o consultor. A validade de cada um vem do próprio arquivo.
            </div>
          </v-alert>

          <v-card v-if="!problemas" variant="outlined" class="pa-3">
            <div class="depara__gravar">
              <v-text-field v-model="confirmacao" :label="`Digite: ${resumo.confirmacao}`" hide-details />
              <v-btn
                color="primary"
                prepend-icon="mdi-swap-horizontal"
                :disabled="!podeGravar"
                :loading="gravando"
                @click="deParaSia.gravar"
              >
                Substituir o de-para de {{ resumo.loja }}
              </v-btn>
            </div>
          </v-card>
        </template>
      </template>
    </main>
  </AppShell>
</template>

<style scoped>
.depara {
  display: grid;
  gap: var(--cx-sp-4);
  max-width: 960px;
  min-width: 0;
  padding: var(--cx-sp-4);
}
.depara__cabecalho {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-3);
}
.depara__cabecalho h1 {
  font-size: var(--cx-fs-h2);
  font-weight: 700;
  color: var(--cx-ink);
}
.depara__cabecalho p,
.depara__texto {
  margin: 0;
  color: var(--cx-ink-soft);
}
.depara__envio {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) auto;
  gap: var(--cx-sp-3);
  align-items: center;
  margin-top: var(--cx-sp-3);
}
.depara__numeros {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--cx-sp-3);
}
.depara__numeros .v-card {
  display: grid;
  gap: var(--cx-sp-1);
}
.depara__numeros strong {
  font-size: var(--cx-fs-h2);
}
.depara__numeros span {
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}
.depara__gravar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-3);
  align-items: center;
}
.depara__gravar .v-text-field {
  flex: 1 1 320px;
}
@media (max-width: 768px) {
  .depara__envio,
  .depara__numeros {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
