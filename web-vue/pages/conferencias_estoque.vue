<script setup lang="ts">
import type { AuthSession, ConferenciaEstoqueDto, ProdutoEstoqueDto } from "@padaria/shared";
import type { CaixaStatus, Opcao } from "~/types/padaria";
import AppShell from "~/components/app/AppShell.vue";
import { usePermissoes } from "~/composables/usePermissoes";
import { mensagemErro } from "~/utils/domain";

const router = useRouter();
const { apiGet, apiPost, carregarSessao } = useApi();
const sessao = ref<AuthSession | null>(null);
const empresas = ref<Opcao[]>([]);
const empresaId = ref("");
const caixaStatus = ref<CaixaStatus | null>(null);
const carregando = ref(true);
const empresaCarregando = ref(false);
const erro = ref("");
const snackbar = reactive({ show: false, text: "", color: "success" });
const catalogo = ref<ProdutoEstoqueDto[]>([]);
const conferencias = ref<ConferenciaEstoqueDto[]>([]);
const salvando = ref(false);
const form = reactive({
  grupoMercadoriaId: "",
  areaEstoque: "",
  localVenda: "",
  localEstoque: "",
  curvaAbc: "",
  agendadaPara: "",
  observacao: ""
});

const permissoesUsuario = computed(() => sessao.value?.perfil?.permissoes ?? []);
const { temPermissao, telasPermitidas, telasDesabilitadasMenu, motivosTelasDesabilitadas } = usePermissoes(
  permissoesUsuario,
  () => Boolean(caixaStatus.value?.caixaAberto)
);
const podeAgendar = computed(() => temPermissao("conferencias_estoque_agendar"));
const grupos = computed(() => {
  const mapa = new Map<string, string>();
  for (const produto of catalogo.value) {
    if (produto.grupoMercadoriaId && produto.grupo) mapa.set(produto.grupoMercadoriaId, produto.grupo);
  }
  return [...mapa].map(([id, nome]) => ({ id, nome }));
});
const valores = (seletor: (produto: ProdutoEstoqueDto) => string | null | string[]) =>
  computed(() =>
    [
      ...new Set(
        catalogo.value.flatMap((produto) => seletor(produto)).filter((valor): valor is string => Boolean(valor))
      )
    ].sort()
  );
const areas = valores((produto) => produto.areaEstoque);
const locaisVenda = valores((produto) => produto.localVenda);
const locaisEstoque = valores((produto) => produto.localEstoque);

function notificar(text: string, color = "success") {
  snackbar.text = text;
  snackbar.color = color;
  snackbar.show = true;
}
function queryEmpresa() {
  return `?empresaId=${empresaId.value}`;
}
function limparFormulario() {
  Object.assign(form, {
    grupoMercadoriaId: "",
    areaEstoque: "",
    localVenda: "",
    localEstoque: "",
    curvaAbc: "",
    agendadaPara: "",
    observacao: ""
  });
}
async function carregarDados() {
  if (!empresaId.value) return;
  empresaCarregando.value = true;
  try {
    [catalogo.value, conferencias.value] = await Promise.all([
      apiGet<ProdutoEstoqueDto[]>(`/api/compras/estoque${queryEmpresa()}`),
      apiGet<ConferenciaEstoqueDto[]>(`/api/compras/conferencias${queryEmpresa()}`)
    ]);
  } catch (causa) {
    erro.value = mensagemErro(causa);
  } finally {
    empresaCarregando.value = false;
  }
}
async function agendar() {
  if (!form.agendadaPara) return notificar("Informe data e hora da conferência.", "error");
  salvando.value = true;
  try {
    await apiPost("/api/compras/conferencias", {
      empresaId: empresaId.value,
      grupoMercadoriaId: form.grupoMercadoriaId || null,
      areaEstoque: form.areaEstoque || null,
      localVenda: form.localVenda || null,
      localEstoque: form.localEstoque || null,
      curvaAbc: form.curvaAbc || null,
      agendadaPara: form.agendadaPara,
      observacao: form.observacao || null
    });
    notificar("Conferência agendada. Nenhum saldo foi alterado.");
    limparFormulario();
    await carregarDados();
  } catch (causa) {
    notificar(mensagemErro(causa), "error");
  } finally {
    salvando.value = false;
  }
}
async function trocarEmpresa(id: string) {
  empresaId.value = id;
  limparFormulario();
  await carregarDados();
}

onMounted(async () => {
  try {
    sessao.value = await carregarSessao();
    if (!sessao.value) return void (await router.push("/login"));
    if (!temPermissao("conferencias_estoque_visualizar"))
      return void (erro.value = "Sem permissão para conferir estoque.");
    empresas.value = await apiGet<Opcao[]>("/api/empresas");
    empresaId.value =
      sessao.value.perfil?.empresaId ?? sessao.value.perfil?.empresaIds?.[0] ?? empresas.value[0]?.id ?? "";
    await carregarDados();
  } catch (causa) {
    erro.value = mensagemErro(causa);
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
    tela-ativa="conferencias_estoque"
    :empresas="empresas"
    :empresa-id="empresaId"
    :caixa-status="caixaStatus"
    :telas-desabilitadas="telasDesabilitadasMenu"
    :motivos-telas-desabilitadas="motivosTelasDesabilitadas"
    :carregando-empresa="empresaCarregando"
    @selecionar-empresa="trocarEmpresa"
  >
    <div class="d-grid ga-4">
      <AppCabecalhoTela
        titulo="Conferência de estoque"
        subtitulo="Organize a contagem física por escopo, data e orientação operacional."
      />
      <v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>
      <v-alert type="warning" density="comfortable" variant="tonal" icon="mdi-clipboard-check-outline"
        >Esta agenda não altera saldo e não registra perda ou sobra. O ajuste de divergência ainda depende de regra
        operacional aprovada.</v-alert
      >
      <v-card v-if="podeAgendar" variant="outlined"
        ><v-card-title class="d-flex align-center ga-2"
          ><v-icon icon="mdi-calendar-plus" color="primary" />Agendar nova conferência</v-card-title
        ><v-card-subtitle
          >Escolha o recorte que será contado. Sem filtro, a agenda cobre todo o estoque da empresa.</v-card-subtitle
        ><v-card-text
          ><v-row dense>
            <v-col cols="12" sm="6" md="4"
              ><v-select
                v-model="form.grupoMercadoriaId"
                :items="grupos"
                item-title="nome"
                item-value="id"
                label="Grupo"
                clearable
            /></v-col>
            <v-col cols="12" sm="6" md="4"
              ><v-select v-model="form.areaEstoque" :items="areas" label="Área" clearable
            /></v-col>
            <v-col cols="12" sm="6" md="4"
              ><v-select v-model="form.localVenda" :items="locaisVenda" label="Local de venda" clearable
            /></v-col>
            <v-col cols="12" sm="6" md="4"
              ><v-select v-model="form.localEstoque" :items="locaisEstoque" label="Local de estoque" clearable
            /></v-col>
            <v-col cols="12" sm="6" md="2"
              ><v-select v-model="form.curvaAbc" :items="['A', 'B', 'C']" label="Curva ABC" clearable
            /></v-col>
            <v-col cols="12" sm="6" md="3"
              ><v-text-field v-model="form.agendadaPara" type="datetime-local" label="Data e hora *"
            /></v-col>
            <v-col cols="12" md="9"
              ><v-textarea
                v-model="form.observacao"
                label="Orientação para quem contará"
                rows="2"
                auto-grow
                counter="1000"
            /></v-col> </v-row></v-card-text
        ><v-card-actions class="px-4 pb-4"
          ><v-btn variant="text" @click="limparFormulario">Limpar</v-btn><v-spacer /><v-btn
            color="primary"
            prepend-icon="mdi-calendar-check"
            :loading="salvando"
            @click="agendar"
            >Agendar conferência</v-btn
          ></v-card-actions
        ></v-card
      >
      <v-card
        ><v-card-title>Agenda de conferências</v-card-title
        ><v-card-subtitle>As próximas contagens permanecem visíveis para o time de Compras.</v-card-subtitle
        ><v-card-text><ConferenciasAgenda :conferencias="conferencias" /></v-card-text
      ></v-card>
    </div>
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3500">{{ snackbar.text }}</v-snackbar>
  </AppShell>
</template>
