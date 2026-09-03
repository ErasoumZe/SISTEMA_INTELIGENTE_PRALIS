<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import type { AuthSession, FuncaoOperacionalDto } from "@padaria/shared";
import { temPermissao } from "@padaria/shared";
import { mensagemErro } from "~/utils/domain";
import FuncaoOperacionalDialog from "~/components/funcoes/FuncaoOperacionalDialog.vue";

/**
 * Catalogo de FUNCOES OPERACIONAIS — o que a pessoa faz.
 *
 * Nao e cargo de acesso. `cargos` responde o que a pessoa pode VER, e as duas listas nunca se
 * cruzam: esta tela nao conhece cargo, perfil nem permissao de ninguem.
 *
 * TRES atos, e a ausencia do quarto e a regra: listar, criar, editar — e **nao excluir**. Uma funcao
 * sai de circulacao com "Desativar" e volta com "Reativar". Apagar levaria embora a leitura do
 * periodo de teste e do processo de admissao que apontam para ela.
 *
 * Renomear e ligar/desligar sao atos DIFERENTES, e por isso tem botoes diferentes: o dialogo cuida
 * do nome e do CBO, a acao da linha cuida da situacao. Um interruptor dentro do dialogo mais um
 * botao na linha seriam dois caminhos para o mesmo ato.
 */
const props = defineProps<{ empresaId: string }>();

const { apiGetPaginado, apiPost, apiPut } = useApi();

const sessao = useState<AuthSession | null>("padaria.workspace.sessao");
const permissoes = computed(() => sessao.value?.perfil?.permissoes ?? []);
const podeCriar = computed(() => temPermissao(permissoes.value, "cadastro_funcoes_criar"));
const podeEditar = computed(() => temPermissao(permissoes.value, "cadastro_funcoes_editar"));

const linhas = ref<FuncaoOperacionalDto[]>([]);
const total = ref(0);
const carregando = ref(false);
const erro = ref("");
const busca = ref("");
const salvando = ref(false);
const erroDialogo = ref("");
const dialogoAberto = ref(false);
const emEdicao = ref<FuncaoOperacionalDto | null>(null);
const snackbar = reactive({ show: false, text: "", color: "success" });

/**
 * O catalogo cabe numa pagina: sao dezenas de funcoes, nao milhares. Pedimos o teto do contrato e
 * filtramos aqui — e se um dia nao couber, a tela DIZ que nao coube, em vez de esconder o resto.
 */
const TETO = 100;
const truncado = computed(() => total.value > linhas.value.length);

const filtradas = computed(() => {
  const termo = busca.value.trim().toLowerCase();
  if (!termo) return linhas.value;
  return linhas.value.filter(
    (funcao) => funcao.nome.toLowerCase().includes(termo) || (funcao.cbo ?? "").includes(termo)
  );
});

function notificar(text: string, color = "success") {
  snackbar.text = text;
  snackbar.color = color;
  snackbar.show = true;
}

async function carregar() {
  if (!props.empresaId) return;
  carregando.value = true;
  erro.value = "";
  try {
    const resposta = await apiGetPaginado<FuncaoOperacionalDto>(
      `/api/funcoes-operacionais?empresaId=${props.empresaId}&page=1&pageSize=${TETO}`
    );
    linhas.value = resposta.itens;
    total.value = resposta.total;
  } catch (error) {
    erro.value = mensagemErro(error);
  } finally {
    carregando.value = false;
  }
}

// A empresa vem do seletor do workspace e pode trocar sem a tela remontar.
watch(() => props.empresaId, carregar, { immediate: true });

function abrirNova() {
  emEdicao.value = null;
  erroDialogo.value = "";
  dialogoAberto.value = true;
}

function abrirEdicao(funcao: FuncaoOperacionalDto) {
  emEdicao.value = funcao;
  erroDialogo.value = "";
  dialogoAberto.value = true;
}

async function salvar(dados: { nome: string; cbo: string | null }) {
  if (salvando.value) return;
  salvando.value = true;
  erroDialogo.value = "";
  const alvo = emEdicao.value;
  try {
    if (alvo) {
      // `ativo` vai como esta: este dialogo NAO liga nem desliga a funcao — quem faz isso e a acao
      // da linha. Omitir o campo faria o contrato aplicar o default `true` e reativar sem pedir.
      await apiPut(`/api/funcoes-operacionais/${alvo.id}`, {
        empresaId: props.empresaId,
        nome: dados.nome,
        cbo: dados.cbo,
        ativo: alvo.ativo
      });
      notificar("Função atualizada.");
    } else {
      await apiPost("/api/funcoes-operacionais", {
        empresaId: props.empresaId,
        nome: dados.nome,
        cbo: dados.cbo,
        ativo: true
      });
      notificar("Função criada.");
    }
    dialogoAberto.value = false;
    await carregar();
  } catch (error) {
    // O dialogo fica ABERTO com o erro visivel: fechar perderia o que foi digitado, e o caso mais
    // provavel aqui e nome repetido — que se resolve mudando uma palavra.
    erroDialogo.value = mensagemErro(error);
  } finally {
    salvando.value = false;
  }
}

async function alternarSituacao(funcao: FuncaoOperacionalDto) {
  if (salvando.value) return;
  salvando.value = true;
  try {
    await apiPut(`/api/funcoes-operacionais/${funcao.id}`, {
      empresaId: props.empresaId,
      nome: funcao.nome,
      cbo: funcao.cbo,
      ativo: !funcao.ativo
    });
    notificar(funcao.ativo ? "Função desativada." : "Função reativada.");
    await carregar();
  } catch (error) {
    notificar(mensagemErro(error), "error");
  } finally {
    salvando.value = false;
  }
}
</script>

<template>
  <section class="funcoes">
    <header class="funcoes__cabecalho">
      <div>
        <h2>Funções operacionais</h2>
        <p class="funcoes__sub">
          O que a pessoa faz — não confundir com cargo de acesso, que define o que ela pode ver.
        </p>
      </div>
      <v-btn v-if="podeCriar" color="primary" variant="flat" class="funcoes__acao" @click="abrirNova">
        + Nova função
      </v-btn>
    </header>

    <v-alert v-if="erro" type="error" variant="tonal" density="compact" class="mb-4">{{ erro }}</v-alert>

    <v-text-field
      v-model="busca"
      label="Buscar por nome ou CBO"
      density="comfortable"
      hide-details
      clearable
      class="mb-3"
    />

    <v-progress-linear v-if="carregando" indeterminate color="primary" class="mb-2" />

    <v-alert v-if="truncado" type="warning" variant="tonal" density="compact" class="mb-3">
      Esta empresa tem {{ total }} funções e a tela está mostrando as {{ linhas.length }} primeiras.
    </v-alert>

    <div v-if="filtradas.length" class="responsive-table-shell">
      <v-table density="comfortable">
        <caption class="d-sr-only">
          Funções operacionais desta empresa
        </caption>
        <thead>
          <tr>
            <th scope="col">Função</th>
            <th scope="col">CBO</th>
            <th scope="col">Situação</th>
            <th scope="col"><span class="d-sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="funcao in filtradas" :key="funcao.id">
            <td>
              <span :class="{ 'funcoes__inativa': !funcao.ativo }">{{ funcao.nome }}</span>
              <!-- Informa, não bloqueia: função em uso pode ser desativada, e continua valendo no
                   registro que já a tinha. É a frase que explica por que não existe excluir. -->
              <span v-if="funcao.emUso" class="funcoes__uso">Em uso em admissões</span>
            </td>
            <td class="cx-num">{{ funcao.cbo ?? "—" }}</td>
            <td>
              <v-chip
                size="x-small"
                variant="tonal"
                :color="funcao.ativo ? 'success' : undefined"
                :prepend-icon="funcao.ativo ? 'mdi-check-circle-outline' : 'mdi-cancel'"
              >
                {{ funcao.ativo ? "Ativa" : "Inativa" }}
              </v-chip>
            </td>
            <td class="text-end">
              <div v-if="podeEditar" class="funcoes__linha-acoes">
                <v-btn
                  variant="text"
                  size="small"
                  class="funcoes__acao"
                  :aria-label="`Editar função ${funcao.nome}`"
                  @click="abrirEdicao(funcao)"
                >
                  Editar
                </v-btn>
                <v-btn
                  variant="text"
                  size="small"
                  class="funcoes__acao"
                  :disabled="salvando"
                  :aria-label="`${funcao.ativo ? 'Desativar' : 'Reativar'} função ${funcao.nome}`"
                  @click="alternarSituacao(funcao)"
                >
                  {{ funcao.ativo ? "Desativar" : "Reativar" }}
                </v-btn>
              </div>
            </td>
          </tr>
        </tbody>
      </v-table>
    </div>

    <p v-else-if="!carregando" class="funcoes__vazio">
      <template v-if="busca.trim()">Nenhuma função encontrada para esta busca.</template>
      <template v-else>
        Nenhuma função cadastrada nesta empresa. O catálogo nasce vazio: cadastre as funções que a
        operação usa para admitir.
      </template>
    </p>

    <p class="funcoes__resultado" role="status" aria-live="polite">
      <template v-if="filtradas.length">
        {{ filtradas.length }} função(ões) — nenhuma é excluída, apenas desativada.
      </template>
    </p>
  </section>

  <FuncaoOperacionalDialog
    :aberto="dialogoAberto"
    :funcao="emEdicao"
    :salvando="salvando"
    :erro="erroDialogo"
    @fechar="dialogoAberto = false"
    @salvar="salvar"
  />

  <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3500">{{ snackbar.text }}</v-snackbar>
</template>

<style scoped>
.funcoes {
  padding: var(--cx-sp-4);
  min-width: 0;
}

.funcoes__cabecalho {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cx-sp-3);
  margin-bottom: var(--cx-sp-4);
}

.funcoes__cabecalho h2 {
  font-size: var(--cx-fs-title);
  font-weight: 600;
  color: var(--cx-ink);
}

.funcoes__sub {
  margin: 0;
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
  max-width: 60ch;
}

.funcoes__inativa {
  color: var(--cx-ink-soft);
  font-style: italic;
}

.funcoes__uso {
  display: block;
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}

.funcoes__linha-acoes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-1);
  justify-content: flex-end;
}

.funcoes__vazio {
  margin: 0;
  padding: var(--cx-sp-5) 0;
  color: var(--cx-ink-soft);
}

.funcoes__resultado {
  min-height: 1.25rem;
  margin: var(--cx-sp-2) 0 0;
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}

/* Alvo de toque: 40px de piso (`67` §9), 44px no celular (`67` §13.4). */
.funcoes__acao {
  min-height: 40px;
}

@media (max-width: 768px) {
  .funcoes__acao {
    min-height: 44px;
  }

  .funcoes__cabecalho .funcoes__acao {
    width: 100%;
  }
}
</style>
