<script setup lang="ts">
/**
 * Formulario de produto em PAGINA DEDICADA. Dois cadastros, um formulario (igual ao app oficial):
 *  - `base`: produto novo e edicao da base geral — so o administrador; a edicao desce para as lojas;
 *  - `loja`: a copia importada — o que veio da base fica em leitura; a loja completa o resto.
 */
import type { AuthSession } from "@padaria/shared";
import type { CaixaStatus, Opcao } from "~/types/padaria";
import AppShell from "~/components/app/AppShell.vue";
import ProdutoSecaoIdentificacao from "~/components/produtos/ProdutoSecaoIdentificacao.vue";
import ProdutoSecaoComercial from "~/components/produtos/ProdutoSecaoComercial.vue";
import ProdutoSecaoFiscal from "~/components/produtos/ProdutoSecaoFiscal.vue";
import ProdutoSecaoPromocao from "~/components/produtos/ProdutoSecaoPromocao.vue";
import ProdutoConversoes from "~/components/produtos/ProdutoConversoes.vue";
import ProdutoHerancaBase from "~/components/produtos/ProdutoHerancaBase.vue";
import { usePermissoes } from "~/composables/usePermissoes";
import { useAvisoAoNavegar } from "~/composables/useAvisoAoNavegar";
import {
  REGRAS_FISCAIS_INDISPONIVEIS,
  useProdutoFormulario,
  type ModoDoProduto
} from "~/composables/useProdutoFormulario";
import { dicaProduto } from "~/utils/produto-dicas";
import { semRolagemNoNumero } from "~/utils/produto-numeros";
import { mensagemErro } from "~/utils/domain";

const props = defineProps<{ produtoId: string | null; modo: ModoDoProduto }>();

const router = useRouter();
const { apiGet, carregarSessao } = useApi();

const sessao = ref<AuthSession | null>(null);
const empresas = ref<Opcao[]>([]);
const empresaId = ref("");
const caixaStatus = ref<CaixaStatus | null>(null);
const carregandoPagina = ref(true);
const erroDeAcesso = ref("");

const permissoesUsuario = computed(() => sessao.value?.perfil?.permissoes ?? []);
const { temPermissao, telasPermitidas, telasDesabilitadasMenu, motivosTelasDesabilitadas } = usePermissoes(
  permissoesUsuario,
  () => Boolean(caixaStatus.value?.caixaAberto)
);

const ehAdmin = computed(() => sessao.value?.perfil?.role === "usuario_admin");

/**
 * Sem permissao de escrita a tela abre em leitura — nao esconde o produto, so nao deixa salvar.
 * A BASE (produto novo e edicao da base geral) e so do administrador (oficial).
 */
const somenteLeitura = computed(() => {
  if (props.modo === "base" && !ehAdmin.value) return true;
  return props.produtoId ? !temPermissao("cadastro_produtos_editar") : !temPermissao("cadastro_produtos_criar");
});
/** Para onde volta: a base geral volta ao catalogo BASE; a loja, a listagem da loja. */
const listagem = computed(() => (props.modo === "base" ? "/produtos/base" : "/produtos"));
const titulo = computed(() => {
  if (props.modo === "loja") return "Editar produto";
  return props.produtoId ? "Editar produto da base" : "Novo produto na base";
});

const idDoProduto = computed(() => props.produtoId);
const formulario = useProdutoFormulario(
  empresaId,
  idDoProduto,
  computed(() => props.modo)
);
// Uma ajuda so, como no paralelo: o "Habilitar ajuda" do proprio produto.
const dicaDoProduto = (campo: string) => dicaProduto(campo, formulario.form.value.habilitarAjuda);
const { avisar } = useAvisoAoNavegar();

/** Salvar so pelo BOTAO: o leitor de codigo de barras manda Enter, e Enter nao pode salvar e sair. */
async function salvar(forcar = false) {
  const salvo = await formulario.salvar(forcar);
  if (salvo) {
    avisar(salvo.mensagem, salvo.tipo);
    await router.push(listagem.value);
  } else focarPrimeiroInvalido();
}

/** Foco no primeiro campo invalido — quem salva e cai num erro precisa saber ONDE. */
function focarPrimeiroInvalido() {
  const campo = Object.keys(formulario.erros.value)[0];
  // Erro sem campo (promocao, API): leva ao alerta do topo, que diz o motivo.
  const alvo = campo
    ? document.querySelector<HTMLElement>(`[data-campo="${campo}"] input, [data-campo="${campo}"]`)
    : document.querySelector<HTMLElement>(".produto-form__erro");
  alvo?.focus();
  alvo?.scrollIntoView({ block: "center", behavior: "smooth" });
}

/** Remover a foto so marca no formulario; o servidor so fica sabendo ao salvar. */
function removerFoto() {
  formulario.fotoPendente.value = null;
  formulario.form.value.fotoUrl = null;
}

function sair() {
  if (formulario.alterado.value && !window.confirm("Há alterações não salvas. Sair mesmo assim?")) return;
  void router.push(listagem.value);
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
    if (props.modo === "base" && !props.produtoId && !ehAdmin.value) {
      erroDeAcesso.value =
        "Apenas o administrador cadastra produtos novos (na base geral). A loja recebe produtos importando da base.";
      return;
    }
    empresas.value = sessao.value.empresas?.length ? sessao.value.empresas : await apiGet<Opcao[]>("/api/empresas");
    empresaId.value =
      sessao.value.perfil?.empresaId ?? sessao.value.perfil?.empresaIds?.[0] ?? empresas.value[0]?.id ?? "";
    await formulario.carregar();
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

    <!-- Sem <form>: Enter (do teclado ou do leitor de codigo) nao submete. A rolagem do mouse tira o
         foco de qualquer campo numerico, para o numero nao mudar sozinho. -->
    <div v-else class="produto-form" @wheel.passive="semRolagemNoNumero">
      <header class="produto-form__cabecalho">
        <v-btn icon="mdi-arrow-left" variant="text" aria-label="Voltar para a listagem" @click="sair" />
        <div>
          <h1>{{ titulo }}</h1>
          <p v-if="somenteLeitura">Você pode ver, mas não editar este cadastro.</p>
        </div>
        <v-spacer />
        <v-btn
          v-if="produtoId && modo === 'loja' && ehAdmin"
          variant="outlined"
          prepend-icon="mdi-history"
          @click="abrirHistorico"
        >
          Histórico de nomes
        </v-btn>
      </header>

      <v-alert v-if="formulario.erro.value" type="error" variant="tonal" class="produto-form__erro">
        {{ formulario.erro.value }}
      </v-alert>

      <v-alert v-if="formulario.duplicado.value" type="warning" variant="tonal">
        <div class="d-flex flex-wrap align-center ga-3">
          <span>{{ formulario.duplicado.value }}</span>
          <v-spacer />
          <v-btn size="small" color="warning" variant="flat" :loading="formulario.salvando.value" @click="salvar(true)">
            Cadastrar mesmo assim
          </v-btn>
        </div>
      </v-alert>

      <!-- Paralelo: sem regra fiscal, edicao segue, mas cadastro novo e reclassificacao ficam bloqueados. -->
      <v-alert
        v-if="!formulario.carregando.value && formulario.planilhaFiscalForaDoAr.value"
        type="warning"
        variant="tonal"
      >
        {{ REGRAS_FISCAIS_INDISPONIVEIS }}
      </v-alert>

      <v-progress-linear v-if="formulario.carregando.value" indeterminate color="primary" />

      <template v-else>
        <ProdutoHerancaBase
          v-if="formulario.herdadoTravado.value && formulario.heranca.value"
          :nao-seguem="formulario.heranca.value.naoSeguem"
          :somente-leitura="somenteLeitura"
          @voltar-a-herdar="formulario.voltarAHerdar"
        />
        <v-alert v-if="formulario.herdadoTravado.value" type="info" variant="tonal" density="compact">
          Este produto veio da base. Os campos do cadastro geral estão em leitura — só o administrador os altera, e a
          mudança desce para as lojas. Aqui você completa o que é da sua loja e pode ativar ou inativar.
        </v-alert>

        <ProdutoSecaoIdentificacao
          :form="formulario.form.value"
          :produto-id="produtoId"
          :unidades="formulario.unidades.value"
          :erros="formulario.erros.value"
          :descricao-preview="formulario.descricaoPreview.value"
          :como-se-compra-preview="formulario.comoSeCompraPreview.value"
          :somente-leitura="somenteLeitura"
          :herdado-travado="formulario.herdadoTravado.value"
          :origem-da-foto="formulario.origemDaFoto.value"
          :foto-pendente="formulario.fotoPendente.value"
          :ean-repetido="formulario.eanRepetido.value"
          :dica="dicaDoProduto"
          :na-base="modo === 'base'"
          @foto-escolher="formulario.fotoPendente.value = $event"
          @foto-remover="removerFoto"
        />

        <ProdutoSecaoComercial
          :form="formulario.form.value"
          :grupos="formulario.gruposComRegra.value"
          :grupo-obrigatorio="formulario.grupoObrigatorio.value"
          :erros="formulario.erros.value"
          :preco-preview="formulario.precoPreview.value"
          :validacao-qtd-preview="formulario.validacaoQtdPreview.value"
          :margem-do-grupo-pct="formulario.margemDoGrupoPct.value"
          :na-base="modo === 'base'"
          :mostrar-area-venda="formulario.loja.value === 'TNP'"
          :somente-leitura="somenteLeitura"
          :herdado-travado="formulario.herdadoTravado.value"
          :dica="dicaDoProduto"
        />

        <!-- Oficial: fiscal, promocao e conversoes sao da LOJA; a base geral nao tem esses cartoes. -->
        <template v-if="modo === 'loja'">
          <ProdutoSecaoFiscal
            :form="formulario.form.value"
            :regra-do-grupo="formulario.regraDoGrupo.value"
            :classificacao="formulario.classificacaoAoVivo.value"
            :classificando="formulario.classificando.value"
            :eh-admin="ehAdmin"
            :fiscal-editavel="ehAdmin && !somenteLeitura"
            :dica="dicaDoProduto"
          />
          <ProdutoSecaoPromocao
            v-if="formulario.form.value.tipo === 'revenda'"
            :form="formulario.form.value"
            :erros-de-promocao="formulario.errosDePromocao.value"
            :somente-leitura="somenteLeitura"
          />
          <ProdutoConversoes
            :form="formulario.form.value"
            :unidades="formulario.unidades.value"
            :erros="formulario.erros.value"
            :somente-leitura="somenteLeitura"
            :dica="dicaDoProduto"
          />
        </template>
      </template>

      <footer class="produto-form__acoes">
        <v-btn variant="text" @click="sair">Cancelar</v-btn>
        <v-btn
          v-if="!somenteLeitura"
          color="primary"
          prepend-icon="mdi-content-save-outline"
          :loading="formulario.salvando.value"
          @click="salvar(false)"
        >
          Salvar produto
        </v-btn>
      </footer>
    </div>
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
