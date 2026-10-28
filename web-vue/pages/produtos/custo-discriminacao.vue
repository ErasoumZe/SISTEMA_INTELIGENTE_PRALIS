<script setup lang="ts">
/**
 * Custo da discriminacao — igual a tela `produtos/custo-discriminacao` do app oficial (DB-05). So o
 * administrador: custo alimenta o preco de venda calculado. No ERP grava so nos produtos da TNP.
 */
import type { AuthSession } from "@padaria/shared";
import AppShell from "~/components/app/AppShell.vue";
import { AVISO_MER, MOTIVO_SEM_CUSTO, useCustoMer, type MotivoSemCusto } from "~/composables/useCustoMer";
import type { CaixaStatus, Opcao } from "~/types/padaria";

const router = useRouter();
const { carregarSessao } = useApi();
const sessao = ref<AuthSession | null>(null);
const empresas = ref<Opcao[]>([]);
const caixaStatus = ref<CaixaStatus | null>(null);
const iniciando = ref(true);
const acessoNegado = ref("");
const { telasPermitidas, telasDesabilitadasMenu, motivosTelasDesabilitadas } = usePermissoes(
  computed(() => sessao.value?.perfil?.permissoes ?? []),
  () => Boolean(caixaStatus.value?.caixaAberto)
);
const custo = useCustoMer();
const { dados, carregando, aplicando, erro, aviso, confirmacao, fraseOk } = custo;
const motivos = computed(
  () => Object.entries(dados.value?.semCusto ?? {}).filter(([, n]) => n > 0) as Array<[MotivoSemCusto, number]>
);
const numero = (valor: number) => valor.toLocaleString("pt-BR");
const reais = (valor: number | null) =>
  valor === null ? "—" : valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

onMounted(async () => {
  try {
    sessao.value = await carregarSessao();
    if (!sessao.value) {
      await router.push("/login");
      return;
    }
    if (sessao.value.perfil?.role !== "usuario_admin") {
      acessoNegado.value = "Esta tela é restrita ao administrador: custo alimenta o preço de venda calculado.";
      return;
    }
    empresas.value = sessao.value.empresas ?? [];
    await custo.carregar();
  } finally {
    iniciando.value = false;
  }
});
</script>

<template>
  <v-progress-linear v-if="iniciando" indeterminate />
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
    <main class="custo">
      <header class="custo__cabecalho">
        <div>
          <h1>Custo da discriminação</h1>
          <p>
            Traz para cada produto <strong>da TNP</strong> o valor da <strong>compra mais recente</strong> na base de
            discriminação de mercadorias.
          </p>
        </div>
        <div class="d-flex flex-wrap ga-2">
          <v-btn variant="tonal" prepend-icon="mdi-refresh" :loading="carregando" @click="custo.carregar"
            >Recarregar</v-btn
          >
          <v-btn variant="outlined" prepend-icon="mdi-arrow-left" to="/produtos/manutencao">Voltar à manutenção</v-btn>
        </div>
      </header>

      <v-alert v-if="acessoNegado" type="warning" variant="tonal">{{ acessoNegado }}</v-alert>
      <v-alert v-else-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>
      <template v-else-if="dados">
        <v-alert v-if="aviso" :type="aviso.tipo" variant="tonal" closable @click:close="aviso = null">
          {{ aviso.texto }}
        </v-alert>
        <v-alert v-if="dados.estado !== 'ok'" type="error" variant="tonal">
          {{ AVISO_MER[dados.estado] }}
          <div v-if="dados.erro" class="text-medium-emphasis mt-1">{{ dados.erro }}</div>
        </v-alert>

        <template v-else>
          <v-alert v-if="dados.truncada" type="warning" variant="tonal">
            A leitura chegou ao fim da janela configurada — pode haver lançamento além dela, e o mais recente pode estar
            justamente lá. Aumente <code>GOOGLE_PRODUTOS_MER_LINHA_FINAL</code> antes de gravar.
          </v-alert>
          <v-card variant="outlined" class="pa-3 custo__leitura">
            {{ numero(dados.lancamentos) }} lançamentos lidos
            <span v-if="dados.linhaCabecalho">· cabeçalho encontrado na linha {{ dados.linhaCabecalho }}</span>
            <span v-if="dados.lancamentosDescartados">
              · {{ numero(dados.lancamentosDescartados) }} linhas sem produto ou sem valor</span
            >
          </v-card>

          <div class="custo__numeros">
            <v-card variant="outlined" class="pa-4">
              <strong class="cx-num">{{ numero(dados.comCusto) }}</strong>
              <span>Produtos que receberiam custo</span>
            </v-card>
            <v-card variant="outlined" class="pa-4">
              <strong class="cx-num">{{ numero(dados.semCusto["ja-esta-certo"] ?? 0) }}</strong>
              <span>Já estão certos</span>
            </v-card>
            <v-card variant="outlined" class="pa-4">
              <strong class="cx-num">{{ dados.loteMaximo }}</strong>
              <span>Por vez</span>
            </v-card>
          </div>

          <v-card v-if="motivos.length" variant="outlined">
            <v-card-title class="text-subtitle-1">Quem não recebe custo, e por quê</v-card-title>
            <v-list density="compact">
              <v-list-item v-for="[motivo, n] in motivos" :key="motivo">
                <template #prepend>
                  <v-chip size="small" variant="tonal" class="mr-3">{{ numero(n) }}</v-chip>
                </template>
                <v-list-item-title class="text-body-2">{{ MOTIVO_SEM_CUSTO[motivo] }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-card>

          <v-card v-if="dados.amostra.length" variant="outlined">
            <v-card-title class="text-subtitle-1">
              Amostra do que mudaria ({{ dados.amostra.length }} de {{ dados.comCusto }})
            </v-card-title>
            <v-list density="compact" lines="two">
              <v-list-item v-for="p in dados.amostra" :key="p.productId">
                <v-list-item-title class="text-body-2 d-flex flex-wrap align-center ga-2">
                  <span class="font-weight-medium">{{ p.nome }}</span>
                  <span class="text-medium-emphasis cx-num">{{ reais(p.custoAtual) }}</span>
                  <v-icon size="small" icon="mdi-arrow-right" />
                  <strong class="cx-num">{{ reais(p.custoNovo) }}</strong>
                  <v-chip v-if="p.qtCad > 1" size="x-small" variant="tonal">
                    {{ reais(p.custoUnitario) }} × {{ p.qtCad }}
                  </v-chip>
                </v-list-item-title>
                <v-list-item-subtitle>{{ p.fonte }}</v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </v-card>

          <v-alert type="info" variant="tonal" density="compact">
            O campo <strong>Custo</strong> do cadastro é o da <strong>embalagem</strong> — o sistema divide pela
            quantidade da embalagem para achar o unitário. A nota traz o <strong>unitário</strong>, então ele é
            multiplicado pela embalagem antes de gravar. Isto grava <strong>custo</strong>, não preço.
          </v-alert>

          <v-card variant="outlined" class="pa-3">
            <div class="custo__confirmar">
              <v-text-field v-model="confirmacao" :label="`Digite: ${dados.confirmacao}`" hide-details />
              <v-btn
                color="primary"
                prepend-icon="mdi-content-save-outline"
                :disabled="!fraseOk || dados.comCusto === 0"
                :loading="aplicando"
                @click="custo.aplicar"
              >
                Gravar {{ Math.min(dados.comCusto, dados.loteMaximo) }} custo(s)
              </v-btn>
            </div>
          </v-card>
        </template>
      </template>
      <v-skeleton-loader v-else-if="carregando" type="card" />
    </main>
  </AppShell>
</template>

<style scoped>
.custo {
  display: grid;
  gap: var(--cx-sp-4);
  max-width: 1100px;
  min-width: 0;
  padding: var(--cx-sp-4);
}
.custo__cabecalho {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-3);
}
.custo__cabecalho h1 {
  font-size: var(--cx-fs-h2);
  font-weight: 700;
  color: var(--cx-ink);
}
.custo__cabecalho p,
.custo__leitura {
  margin: 0;
  color: var(--cx-ink-soft);
}
.custo__numeros {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--cx-sp-3);
}
.custo__numeros .v-card {
  display: grid;
  gap: var(--cx-sp-1);
}
.custo__numeros strong {
  font-size: var(--cx-fs-h2);
}
.custo__numeros span {
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}
.custo__confirmar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-3);
  align-items: center;
}
.custo__confirmar .v-text-field {
  flex: 1 1 320px;
  max-width: 480px;
}
@media (max-width: 768px) {
  .custo__numeros {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
