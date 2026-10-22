<script setup lang="ts">
import type { AuthSession, ProdutoEstoqueDto } from "@padaria/shared";
import type { CaixaStatus, Opcao } from "~/types/padaria";
import AppShell from "~/components/app/AppShell.vue";
import ComprasCatalogoAba from "~/components/compras/ComprasCatalogoAba.vue";
import ComprasHistoricoAba from "~/components/compras/ComprasHistoricoAba.vue";
import ComprasPrecoBaseAba from "~/components/compras/ComprasPrecoBaseAba.vue";
import { usePermissoes } from "~/composables/usePermissoes";
import { mensagemErro } from "~/utils/domain";

// Cadastro de compras (doc 57 §4), módulo próprio do menu de Compras: catálogo fornecedor–produto, histórico
// de compras e preço-base. Cada aba busca o seu dado só quando é aberta (sem `eager`).
const router = useRouter();
const { apiGet, carregarSessao } = useApi();
const sessao = ref<AuthSession | null>(null);
const empresas = ref<Opcao[]>([]);
const empresaId = ref("");
const caixaStatus = ref<CaixaStatus | null>(null);
const carregandoSessao = ref(true);
const carregando = ref(false);
const erro = ref("");
const fornecedores = ref<Opcao[]>([]);
const produtos = ref<ProdutoEstoqueDto[]>([]);

const permissoesUsuario = computed(() => sessao.value?.perfil?.permissoes ?? []);
const { temPermissao, telasPermitidas, telasDesabilitadasMenu, motivosTelasDesabilitadas } = usePermissoes(
  permissoesUsuario,
  () => Boolean(caixaStatus.value?.caixaAberto)
);
const podeCatalogo = computed(() => temPermissao("compras_catalogo_gerir"));
const podePrecoBase = computed(() => temPermissao("compras_preco_base_importar"));
const podeCriarFornecedor = computed(() => temPermissao("cadastro_fornecedores_criar"));
const aba = ref("catalogo");
// Aplicar o histórico cria/aprova vínculos: trocar a chave remonta o catálogo, que busca de novo.
const versaoCatalogo = ref(0);

async function carregarFornecedores(): Promise<Opcao[]> {
  const todos: Opcao[] = [];
  for (let pagina = 1; pagina <= 20; pagina += 1) {
    const lote = await apiGet<Opcao[]>(
      `/api/fornecedores?empresaId=${encodeURIComponent(empresaId.value)}&page=${pagina}&pageSize=100`
    );
    todos.push(...lote);
    if (lote.length < 100) break;
  }
  return todos;
}
async function carregarDaEmpresa() {
  if (!empresaId.value) return;
  carregando.value = true;
  erro.value = "";
  try {
    [fornecedores.value, produtos.value] = await Promise.all([
      carregarFornecedores(),
      temPermissao("estoque_produtos_visualizar")
        ? apiGet<ProdutoEstoqueDto[]>(`/api/compras/estoque?empresaId=${encodeURIComponent(empresaId.value)}`)
        : Promise.resolve([])
    ]);
  } catch (causa) {
    erro.value = mensagemErro(causa);
  } finally {
    carregando.value = false;
  }
}
async function trocarEmpresa(id: string) {
  empresaId.value = id;
  versaoCatalogo.value += 1;
  await carregarDaEmpresa();
}

onMounted(async () => {
  try {
    sessao.value = await carregarSessao();
    if (!sessao.value) return void (await router.push("/login"));
    if (!podeCatalogo.value) return void (erro.value = "Sem permissão para o cadastro de compras.");
    empresas.value = sessao.value.empresas?.length ? sessao.value.empresas : await apiGet<Opcao[]>("/api/empresas");
    empresaId.value =
      sessao.value.perfil?.empresaId ?? sessao.value.perfil?.empresaIds?.[0] ?? empresas.value[0]?.id ?? "";
    await carregarDaEmpresa();
  } catch (causa) {
    erro.value = mensagemErro(causa);
  } finally {
    carregandoSessao.value = false;
  }
});
</script>

<template>
  <v-progress-linear v-if="carregandoSessao" indeterminate />
  <AppShell
    v-else-if="sessao"
    :sessao="sessao"
    :telas="telasPermitidas"
    tela-ativa="cadastro_compras"
    :empresas="empresas"
    :empresa-id="empresaId"
    :caixa-status="caixaStatus"
    :telas-desabilitadas="telasDesabilitadasMenu"
    :motivos-telas-desabilitadas="motivosTelasDesabilitadas"
    :carregando-empresa="carregando"
    @selecionar-empresa="trocarEmpresa"
  >
    <div class="d-grid ga-4">
      <AppCabecalhoTela
        titulo="Cadastro de compras"
        subtitulo="Quem vende o quê, o que já foi comprado e o preço de referência de cada produto."
      />
      <v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>
      <template v-if="podeCatalogo && empresaId">
        <v-tabs v-model="aba" show-arrows>
          <v-tab value="catalogo">Catálogo fornecedor–produto</v-tab>
          <v-tab value="historico">Histórico de compras</v-tab>
          <v-tab v-if="podePrecoBase" value="precos">Preço-base</v-tab>
        </v-tabs>
        <v-window v-model="aba">
          <v-window-item value="catalogo">
            <ComprasCatalogoAba
              :key="versaoCatalogo"
              :empresa-id="empresaId"
              :fornecedores="fornecedores"
              :produtos="produtos"
            />
          </v-window-item>
          <v-window-item value="historico">
            <ComprasHistoricoAba
              :empresa-id="empresaId"
              :fornecedores="fornecedores"
              :pode-criar-fornecedor="podeCriarFornecedor"
              @alterado="versaoCatalogo += 1"
            />
          </v-window-item>
          <v-window-item v-if="podePrecoBase" value="precos">
            <ComprasPrecoBaseAba :empresa-id="empresaId" />
          </v-window-item>
        </v-window>
      </template>
    </div>
  </AppShell>
</template>
