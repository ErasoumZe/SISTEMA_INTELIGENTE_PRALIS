<script setup lang="ts">
/**
 * Formulario de produto em PAGINA DEDICADA. Substitui as ~290 linhas de template que viviam dentro
 * do `WorkspaceDialogs.vue` (arquivo de quase mil linhas) — produto saiu do modal.
 */
import type { AuthSession, FiltrosDeProduto } from "@padaria/shared";
import type { CaixaStatus, Opcao } from "~/types/padaria";
import AppShell from "~/components/app/AppShell.vue";
import ProdutoSecaoIdentificacao from "~/components/produtos/ProdutoSecaoIdentificacao.vue";
import ProdutoSecaoComercial from "~/components/produtos/ProdutoSecaoComercial.vue";
import ProdutoSecaoFiscalPromocoes from "~/components/produtos/ProdutoSecaoFiscalPromocoes.vue";
import { usePermissoes } from "~/composables/usePermissoes";
import { useAjudaDeCampo } from "~/composables/useAjudaDeCampo";
import { useProdutoFormulario } from "~/composables/useProdutoFormulario";
import { dicaProduto } from "~/utils/produto-dicas";
import { mensagemErro } from "~/utils/domain";

const props = defineProps<{ produtoId: string | null }>();

const router = useRouter();
const { apiGet, carregarSessao } = useApi();

const sessao = ref<AuthSession | null>(null);
const empresas = ref<Opcao[]>([]);
const empresaId = ref("");
const caixaStatus = ref<CaixaStatus | null>(null);
const carregandoPagina = ref(true);
const erroDeAcesso = ref("");
const setores = ref<string[]>([]);

const permissoesUsuario = computed(() => sessao.value?.perfil?.permissoes ?? []);
const { temPermissao, telasPermitidas, telasDesabilitadasMenu, motivosTelasDesabilitadas } = usePermissoes(
  permissoesUsuario,
  () => Boolean(caixaStatus.value?.caixaAberto)
);

/** Sem permissao de escrita a tela abre em leitura — nao esconde o produto, so nao deixa salvar. */
const somenteLeitura = computed(() =>
  props.produtoId ? !temPermissao("cadastro_produtos_editar") : !temPermissao("cadastro_produtos_criar")
);

const idDoProduto = computed(() => props.produtoId);
const formulario = useProdutoFormulario(empresaId, idDoProduto);
const ajuda = useAjudaDeCampo(computed(() => sessao.value?.user?.id));
const dicaDoProduto = (campo: string) => dicaProduto(campo, formulario.form.value.habilitarAjuda, ajuda.dica);

async function salvar(forcar = false) {
  const id = await formulario.salvar(forcar);
  if (id) await router.push("/produtos");
  else focarPrimeiroInvalido();
}

/** Foco no primeiro campo invalido — quem salva e cai num erro precisa saber ONDE. */
function focarPrimeiroInvalido() {
  const campo = Object.keys(formulario.erros.value)[0];
  if (!campo) return;
  const alvo = document.querySelector<HTMLElement>(`[data-campo="${campo}"] input, [data-campo="${campo}"]`);
  alvo?.focus();
  alvo?.scrollIntoView({ block: "center", behavior: "smooth" });
}

function sair() {
  if (formulario.alterado.value && !window.confirm("Há alterações não salvas. Sair mesmo assim?")) return;
  void router.push("/produtos");
}

function abrirHistorico() {
  if (formulario.alterado.value && !window.confirm("Há alterações não salvas. Abrir o histórico mesmo assim?")) return;
  void router.push(`/produtos/${props.produtoId}/historico?empresaId=${encodeURIComponent(empresaId.value)}`);
}

/** Fechar a aba com alteracao pendente tambem avisa. */
function avisarAoSair(evento: BeforeUnloadEvent) {
  if (!formulario.alterado.value) return;
  evento.preventDefault();
}

onMounted(async () => {
  try {
    sessao.value = await carregarSessao();
    if (!sessao.value) {
      await router.push("/login");
      return;
    }
    if (!temPermissao("cadastro_produtos_visualizar")) {
      erroDeAcesso.value = "Sem permissão para acessar esta página.";
      return;
    }
    empresas.value = sessao.value.empresas?.length ? sessao.value.empresas : await apiGet<Opcao[]>("/api/empresas");
    empresaId.value =
      sessao.value.perfil?.empresaId ?? sessao.value.perfil?.empresaIds?.[0] ?? empresas.value[0]?.id ?? "";
    await formulario.carregar();
    const filtros = await apiGet<FiltrosDeProduto>(`/api/produtos/filtros?empresaId=${empresaId.value}`);
    setores.value = filtros.setores;
    window.addEventListener("beforeunload", avisarAoSair);
  } catch (erro) {
    erroDeAcesso.value = mensagemErro(erro);
  } finally {
    carregandoPagina.value = false;
  }
});

onBeforeUnmount(() => window.removeEventListener("beforeunload", avisarAoSair));
</script>

<template>
  <v-progress-linear v-if="carregandoPagina" indeterminate />

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
    <v-alert v-if="erroDeAcesso" type="error" variant="tonal">{{ erroDeAcesso }}</v-alert>

    <form v-else class="produto-form" @submit.prevent="salvar(false)">
      <header class="produto-form__cabecalho">
        <v-btn icon="mdi-arrow-left" variant="text" aria-label="Voltar para a listagem" @click="sair" />
        <div>
          <h1>{{ produtoId ? "Editar produto" : "Novo produto" }}</h1>
          <p v-if="somenteLeitura">Você pode ver, mas não editar este cadastro.</p>
        </div>
        <v-spacer />
        <v-btn
          v-if="produtoId && sessao?.perfil?.role === 'usuario_admin'"
          variant="outlined"
          prepend-icon="mdi-history"
          @click="abrirHistorico"
        >
          Histórico de nomes
        </v-btn>
        <v-btn
          :variant="ajuda.ligada.value ? 'flat' : 'outlined'"
          :color="ajuda.ligada.value ? 'primary' : undefined"
          size="small"
          prepend-icon="mdi-help-circle-outline"
          :aria-pressed="ajuda.ligada.value"
          @click="ajuda.alternar"
        >
          Ajuda
        </v-btn>
      </header>

      <v-alert v-if="formulario.erro.value" type="error" variant="tonal">{{ formulario.erro.value }}</v-alert>

      <v-alert v-if="formulario.duplicado.value" type="warning" variant="tonal">
        <div class="d-flex flex-wrap align-center ga-3">
          <span>{{ formulario.duplicado.value }}</span>
          <v-spacer />
          <v-btn size="small" color="warning" variant="flat" :loading="formulario.salvando.value" @click="salvar(true)">
            Cadastrar mesmo assim
          </v-btn>
        </div>
      </v-alert>

      <v-progress-linear v-if="formulario.carregando.value" indeterminate color="primary" />

      <template v-else>
        <ProdutoSecaoIdentificacao
          :form="formulario.form.value"
          :produto-id="produtoId"
          :unidades="formulario.unidades.value"
          :grupos="formulario.grupos.value"
          :erros="formulario.erros.value"
          :descricao-preview="formulario.descricaoPreview.value"
          :como-se-compra-preview="formulario.comoSeCompraPreview.value"
          :somente-leitura="somenteLeitura"
          :dica="dicaDoProduto"
          @foto-escolhida="formulario.fotoPendente.value = $event"
        />

        <ProdutoSecaoComercial
          :form="formulario.form.value"
          :unidades="formulario.unidades.value"
          :setores="setores"
          :erros="formulario.erros.value"
          :preco-preview="formulario.precoPreview.value"
          :validacao-qtd-preview="formulario.validacaoQtdPreview.value"
          :somente-leitura="somenteLeitura"
          :dica="dicaDoProduto"
        />

        <ProdutoSecaoFiscalPromocoes
          :form="formulario.form.value"
          :unidades="formulario.unidades.value"
          :erros="formulario.erros.value"
          :erros-de-promocao="formulario.errosDePromocao.value"
          :somente-leitura="somenteLeitura"
          :dica="dicaDoProduto"
        />
      </template>

      <footer class="produto-form__acoes">
        <v-btn variant="text" @click="sair">Cancelar</v-btn>
        <v-btn
          v-if="!somenteLeitura"
          type="submit"
          color="primary"
          prepend-icon="mdi-content-save-outline"
          :loading="formulario.salvando.value"
          :disabled="formulario.salvando.value || !formulario.valido.value"
        >
          Salvar produto
        </v-btn>
      </footer>
    </form>
  </AppShell>
</template>

<style scoped>
.produto-form {
  display: grid;
  gap: var(--cx-sp-4);
  min-width: 0;
  max-width: 100%;
  padding-bottom: var(--cx-sp-8);
}
.produto-form__cabecalho {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cx-sp-2);
}
.produto-form__cabecalho h1 {
  font-size: var(--cx-fs-h2);
  font-weight: 700;
  letter-spacing: var(--cx-tracking-tight);
  color: var(--cx-ink);
}
.produto-form__cabecalho p {
  margin: 0;
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}

.produto-form__acoes {
  display: flex;
  justify-content: flex-end;
  gap: var(--cx-sp-2);
}

/* No celular as acoes ficam FIXAS no rodape: salvar e cancelar sempre visiveis. */
@media (max-width: 768px) {
  .produto-form__acoes {
    position: sticky;
    bottom: 0;
    z-index: 2;
    margin: 0 calc(var(--cx-sp-4) * -1) calc(var(--cx-sp-4) * -1);
    padding: var(--cx-sp-3) var(--cx-sp-4);
    border-top: 1px solid var(--cx-line-soft);
    background: var(--cx-surface);
  }
  .produto-form__acoes .v-btn {
    flex: 1;
  }
}
</style>
