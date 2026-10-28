<script setup lang="ts">
/**
 * Codigo de cadastro x SIA — igual a tela `produtos/codigo-cadastro` do app oficial. So o administrador:
 * o codigo vale para a rede inteira e o TXT do PDV recusa o produto quando ele diverge do SIA.
 */
import type { AuthSession } from "@padaria/shared";
import AppShell from "~/components/app/AppShell.vue";
import CodigoCadastroItem from "~/components/produtos/CodigoCadastroItem.vue";
import { BALDES_CODIGO, useCodigoCadastro, type BaldeCodigo } from "~/composables/useCodigoCadastro";
import type { CaixaStatus, Opcao } from "~/types/padaria";

const POR_PAGINA = 50;
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
const codigo = useCodigoCadastro();
const { dados, carregando, erro, aviso, confirmacao, aplicando, decidindo, visao, busca, buscando, itens, fraseOk } =
  codigo;
const pagina = ref(1);
watch([visao, busca], () => (pagina.value = 1));
const paginas = computed(() => Math.max(1, Math.ceil(itens.value.length / POR_PAGINA)));
const visiveis = computed(() => itens.value.slice((pagina.value - 1) * POR_PAGINA, pagina.value * POR_PAGINA));
const tituloDoBalde = (balde: BaldeCodigo) => BALDES_CODIGO.find((b) => b.id === balde)?.titulo ?? balde;
const ajuda = computed(() => BALDES_CODIGO.find((b) => b.id === visao.value)?.ajuda ?? "");
const emLote = computed(() => visao.value === "exato" || visao.value === "barras-tem-codigo");
const numero = (valor: number) => valor.toLocaleString("pt-BR");

onMounted(async () => {
  try {
    sessao.value = await carregarSessao();
    if (!sessao.value) {
      await router.push("/login");
      return;
    }
    if (sessao.value.perfil?.role !== "usuario_admin") {
      acessoNegado.value = "Esta tela é restrita ao administrador: o código vale para a rede inteira.";
      return;
    }
    empresas.value = sessao.value.empresas ?? [];
    await codigo.carregar();
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
    <main class="codigo">
      <header class="codigo__cabecalho">
        <div>
          <h1>Código de cadastro</h1>
          <p>
            O código do produto passa a ser o mesmo do PDV. Enquanto eles divergem, o produto é recusado no TXT do
            CREARE.
          </p>
        </div>
        <div class="d-flex flex-wrap ga-2">
          <v-btn variant="tonal" prepend-icon="mdi-refresh" :loading="carregando" @click="codigo.carregar"
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
        <v-alert v-if="dados.paresSia === 0" type="warning" variant="tonal">
          <strong>O de-para do SIA está vazio.</strong> Sem ele não há régua de numeração: importe o de-para de cada
          loja na Manutenção antes de decidir qualquer coisa aqui.
        </v-alert>

        <v-card variant="outlined" class="pa-3 codigo__teto">
          {{ numero(dados.paresSia) }} produtos no de-para do SIA · teto da numeração
          <strong class="cx-num">{{ numero(dados.teto) }}</strong> (de {{ dados.tetoDe }}) · o próximo cunhado seria
          <strong class="cx-num">{{ numero(dados.teto + 1) }}</strong>
        </v-card>

        <div class="codigo__baldes">
          <v-card
            v-for="b in BALDES_CODIGO"
            :key="b.id"
            variant="outlined"
            class="pa-3"
            :color="visao === b.id ? 'primary' : undefined"
            role="button"
            tabindex="0"
            @click="visao = b.id"
            @keydown.enter="visao = b.id"
          >
            <strong class="cx-num">{{ numero(codigo.conta(b.id)) }}</strong>
            <span>{{ b.titulo }}</span>
          </v-card>
        </div>
        <v-alert type="info" variant="tonal" density="compact">{{ ajuda }}</v-alert>

        <v-card variant="outlined" class="pa-3">
          <p class="codigo__texto">
            Nada é gravado sem esta frase: trocar código mexe em etiqueta impressa, na planilha oficial e no que o PDV
            recebe.
          </p>
          <div class="codigo__confirmar">
            <v-text-field v-model="confirmacao" :label="`Digite: ${dados.confirmacao}`" hide-details />
            <!-- Um botao por balde de certeza, nunca os dois no mesmo clique (oficial). -->
            <v-btn
              v-if="emLote"
              :color="visao === 'exato' ? 'primary' : 'warning'"
              :disabled="!fraseOk || codigo.conta(visao) === 0"
              :loading="aplicando"
              prepend-icon="mdi-check-all"
              @click="codigo.adotarEmLote(visao as 'exato' | 'barras-tem-codigo')"
            >
              Adotar {{ Math.min(codigo.conta(visao), dados.loteMaximo) }}
              <span v-if="codigo.conta(visao) > dados.loteMaximo" class="ml-1">de {{ codigo.conta(visao) }}</span>
            </v-btn>
          </div>
        </v-card>

        <v-text-field
          v-model="busca"
          label="Buscar por nome, código de barras ou código atual"
          prepend-inner-icon="mdi-magnify"
          clearable
          hide-details
        />

        <v-card variant="outlined">
          <v-list lines="two">
            <template v-for="(item, i) in visiveis" :key="item.productId">
              <v-divider v-if="i > 0" />
              <CodigoCadastroItem
                :item="item"
                :titulo-do-balde="buscando ? tituloDoBalde(item.balde) : null"
                :frase-ok="fraseOk"
                :decidindo="decidindo === item.productId"
                @decidir="codigo.decidir(item, $event)"
              />
            </template>
            <v-list-item v-if="itens.length === 0">
              <v-list-item-title class="text-medium-emphasis">
                {{ busca ? "Nada encontrado com esse termo." : "Nenhum produto neste balde." }}
              </v-list-item-title>
            </v-list-item>
          </v-list>
        </v-card>
        <v-pagination v-if="paginas > 1" v-model="pagina" :length="paginas" total-visible="7" density="comfortable" />
      </template>
      <v-skeleton-loader v-else-if="carregando" type="card" />
    </main>
  </AppShell>
</template>

<style scoped>
.codigo {
  display: grid;
  gap: var(--cx-sp-4);
  max-width: 1200px;
  min-width: 0;
  padding: var(--cx-sp-4);
}
.codigo__cabecalho {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-3);
}
.codigo__cabecalho h1 {
  font-size: var(--cx-fs-h2);
  font-weight: 700;
  color: var(--cx-ink);
}
.codigo__cabecalho p,
.codigo__texto,
.codigo__teto {
  margin: 0;
  color: var(--cx-ink-soft);
}
.codigo__baldes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--cx-sp-2);
}
.codigo__baldes .v-card {
  display: grid;
  gap: var(--cx-sp-1);
  cursor: pointer;
}
.codigo__baldes strong {
  font-size: var(--cx-fs-title);
}
.codigo__baldes span {
  font-size: var(--cx-fs-caption);
}
.codigo__confirmar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-3);
  align-items: center;
  margin-top: var(--cx-sp-2);
}
.codigo__confirmar .v-text-field {
  flex: 1 1 320px;
  max-width: 460px;
}
</style>
