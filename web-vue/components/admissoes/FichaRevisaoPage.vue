<script setup lang="ts">
/**
 * ADM-003 V5 — a revisao da ficha do candidato pelo DP. PAGINA PROPRIA, e a unica.
 *
 * Nao e modal, e nao mora no detalhe do processo: a ficha tem cinco blocos de campos, uma lista de
 * dependentes e uma decisao — dentro do modal de 720px isso viraria o componente de mil linhas que
 * o AGENTS.md §4.5 proibe, e a decisao ficaria escondida atras de rolagem. O modal do processo tem
 * UMA porta para ca (`ProcessoDetalheDialog`, "Abrir ficha do candidato"); nao ha item de menu, e
 * nao deve haver — a ficha e de um processo, e se alcanca por ele.
 *
 * Segue o desenho de `ProdutoFormulario`: `AppShell` direto (sem `AppWorkspace`, que criaria item
 * de menu), sessao e permissao conferidas aqui, e a rota protegida pelo middleware global.
 *
 * O que esta tela NAO faz, de proposito:
 * - nao revela CPF do candidato: a UNICA entrada auditada e a do detalhe do processo, que grava
 *   `cpf_revelado` na trilha. Uma segunda aqui seria uma segunda porta para o mesmo dado;
 * - nao mostra CPF de dependente, nem mascarado: o servidor nao o envia (`cpfInformado`);
 * - nao edita nada da ficha: quem corrige e o candidato, pelo mesmo link, depois da devolucao.
 */
import type { AuthSession, FichaRevisaoDto, ProcessoDetalheDto } from "@padaria/shared";
import { ehAvisoDeTeste } from "@padaria/shared";
import type { Opcao } from "~/types/padaria";
import AppShell from "~/components/app/AppShell.vue";
import FichaRevisaoCampos from "~/components/admissoes/FichaRevisaoCampos.vue";
import FichaRevisaoDecisao from "~/components/admissoes/FichaRevisaoDecisao.vue";
import FichaRevisaoDependentes from "~/components/admissoes/FichaRevisaoDependentes.vue";
import { usePermissoes } from "~/composables/usePermissoes";
import {
  corSituacaoFicha,
  explicacaoSituacaoFicha,
  rotuloIdentidadeProcesso,
  rotuloOrigemProcesso,
  rotuloSituacaoFicha,
  rotuloTurnoDoProcesso
} from "~/utils/admissoes";
import { mensagemErro } from "~/utils/domain";
import { formatarDataHora, formatarDataSomenteDia } from "~/utils/formatacao";

const props = defineProps<{ processoId: string }>();

const router = useRouter();
const { apiGet, apiPost, carregarSessao } = useApi();

const sessao = ref<AuthSession | null>(null);
const carregandoPagina = ref(true);
const erroDeAcesso = ref("");
const processo = ref<ProcessoDetalheDto | null>(null);
const ficha = ref<FichaRevisaoDto | null>(null);
const decidindo = ref(false);
const snackbar = reactive({ show: false, text: "", color: "success" });

const permissoesUsuario = computed(() => sessao.value?.perfil?.permissoes ?? []);
const { temPermissao, telasPermitidas, telasDesabilitadasMenu, motivosTelasDesabilitadas } = usePermissoes(
  permissoesUsuario,
  () => false
);
// Ver e decidir sao permissoes DISTINTAS, e a tela respeita as duas: quem so tem `ver_ficha` le
// tudo e nao ve botao nenhum. O servidor recusa de qualquer forma; aqui e para nao oferecer o
// botao que ele recusaria.
const podeRevisar = computed(() => temPermissao("admissoes_processos_revisar_ficha"));

// Empresa do PERFIL, como no resto do modulo — nao ha seletor. `AppShell` so precisa da lista para
// o cabecalho, e ela sai da sessao, nao de `/api/empresas`: o DP pode nao ter permissao de ler ali.
const empresas = computed<Opcao[]>(() =>
  (sessao.value?.empresas ?? []).map((empresa) => ({ id: empresa.id, nome: empresa.nome }))
);
const empresaId = computed(() => sessao.value?.perfil?.empresaId ?? empresas.value[0]?.id ?? "");

const rotaDaFicha = computed(() => `/api/admissoes/processos/${props.processoId}/ficha`);

const cabecalho = computed(() => {
  if (!processo.value) return [];
  const itens = [
    rotuloOrigemProcesso[processo.value.origem],
    processo.value.funcaoNome,
    rotuloTurnoDoProcesso(processo.value),
    processo.value.internos.dataAdmissao
      ? `Admissão em ${formatarDataSomenteDia(processo.value.internos.dataAdmissao)}`
      : null
  ];
  return itens.filter((item): item is string => Boolean(item));
});

function notificar(text: string, color = "success") {
  snackbar.text = text;
  snackbar.color = color;
  snackbar.show = true;
}

async function carregar() {
  const [detalhe, dados] = await Promise.all([
    apiGet<ProcessoDetalheDto>(`/api/admissoes/processos/${props.processoId}`),
    apiGet<FichaRevisaoDto | null>(rotaDaFicha.value)
  ]);
  processo.value = detalhe;
  ficha.value = dados;
}

/**
 * Releitura depois de decidir — com sucesso OU com erro. Um 409 (`VERSAO_CONFLITANTE`,
 * `FICHA_NAO_REVISAVEL`) significa que a ficha mudou por baixo, e a tela precisa mostrar o que ela
 * e agora, nao o que era quando o DP comecou a ler. Falha da releitura nao pode engolir o aviso da
 * decisao, por isso e silenciosa.
 */
async function relerFicha() {
  try {
    ficha.value = await apiGet<FichaRevisaoDto | null>(rotaDaFicha.value);
  } catch {
    // O aviso que importa ja foi dado; a proxima acao do DP recarrega.
  }
}

async function decidir(acao: "aprovar" | "devolver", corpo: Record<string, unknown>, aviso: string) {
  if (!ficha.value || decidindo.value) return;
  decidindo.value = true;
  try {
    await apiPost(`${rotaDaFicha.value}/${acao}`, { versao: ficha.value.versao, ...corpo });
    notificar(aviso);
  } catch (error) {
    notificar(mensagemErro(error), "error");
  } finally {
    await relerFicha();
    decidindo.value = false;
  }
}

function aprovar() {
  return decidir("aprovar", {}, "Ficha aprovada.");
}

function devolver(pendencias: string) {
  return decidir("devolver", { pendencias }, "Ficha devolvida. O candidato corrige pelo mesmo link.");
}

function voltar() {
  void router.push("/admissoes_processos");
}

onMounted(async () => {
  try {
    sessao.value = await carregarSessao();
    if (!sessao.value) {
      await router.push("/login");
      return;
    }
    if (!temPermissao("admissoes_processos_ver_ficha")) {
      erroDeAcesso.value = "Sem permissão para acessar esta página.";
      return;
    }
    await carregar();
  } catch (error) {
    erroDeAcesso.value = mensagemErro(error);
  } finally {
    carregandoPagina.value = false;
  }
});
</script>

<template>
  <v-progress-linear v-if="carregandoPagina" indeterminate color="primary" />

  <AppShell
    v-else-if="sessao"
    :sessao="sessao"
    :telas="telasPermitidas"
    tela-ativa="admissoes_processos"
    :empresas="empresas"
    :empresa-id="empresaId"
    :caixa-status="null"
    :telas-desabilitadas="telasDesabilitadasMenu"
    :motivos-telas-desabilitadas="motivosTelasDesabilitadas"
    :carregando-empresa="false"
  >
    <v-alert v-if="erroDeAcesso" type="error" variant="tonal">{{ erroDeAcesso }}</v-alert>

    <article v-else-if="processo" class="revisao">
      <header class="revisao__cabecalho">
        <v-btn icon="mdi-arrow-left" variant="text" aria-label="Voltar para Processos de admissão" @click="voltar" />
        <div class="revisao__identidade">
          <p class="revisao__contexto">Ficha do candidato</p>
          <h1 class="revisao__nome">{{ rotuloIdentidadeProcesso(processo.nomeCompleto) }}</h1>
          <p v-if="cabecalho.length" class="revisao__resumo">{{ cabecalho.join(" · ") }}</p>
        </div>
      </header>

      <!-- A situacao e o que o DP precisa ler PRIMEIRO: ela decide se ha algo a fazer nesta tela. -->
      <section class="revisao__estado" aria-labelledby="revisao-situacao">
        <h2 id="revisao-situacao" class="d-sr-only">Situação da ficha</h2>

        <template v-if="ficha">
          <div class="revisao__estado-linha">
            <v-chip :color="corSituacaoFicha(ficha.situacao)" variant="tonal" class="revisao__chip">
              {{ rotuloSituacaoFicha[ficha.situacao] }}
            </v-chip>
            <p class="revisao__explicacao">{{ explicacaoSituacaoFicha[ficha.situacao] }}</p>
          </div>

          <dl class="revisao__meta">
            <div v-if="ficha.enviadoEm">
              <dt>Enviada em</dt>
              <dd>{{ formatarDataHora(ficha.enviadoEm) }}</dd>
            </div>
            <div v-if="ficha.revisadoEm">
              <dt>Revisada por</dt>
              <dd>{{ ficha.revisadoPorNome ?? "—" }} · {{ formatarDataHora(ficha.revisadoEm) }}</dd>
            </div>
            <div>
              <dt>Aviso de privacidade</dt>
              <dd v-if="ficha.avisoPrivacidadeVersao && ficha.avisoAceitoEm">
                Aceito em {{ formatarDataHora(ficha.avisoAceitoEm) }} · versão
                <span class="cx-num">{{ ficha.avisoPrivacidadeVersao }}</span>
                <span v-if="ehAvisoDeTeste(ficha.avisoPrivacidadeVersao)"> (ambiente de teste)</span>
              </dd>
              <dd v-else>Ainda não aceito</dd>
            </div>
          </dl>

          <v-alert
            v-if="ficha.situacao === 'devolvida' && ficha.revisaoPendencias"
            type="warning"
            variant="tonal"
            density="compact"
          >
            <strong>Pendências enviadas ao candidato:</strong> {{ ficha.revisaoPendencias }}
          </v-alert>
        </template>

        <p v-else class="revisao__vazia">
          O candidato ainda não abriu o link. A ficha aparece aqui a partir do primeiro acesso.
        </p>
      </section>

      <template v-if="ficha">
        <FichaRevisaoCampos :campos="ficha.campos" />
        <FichaRevisaoDependentes :dependentes="ficha.dependentes" :sem-dependentes="ficha.semDependentes" />
        <FichaRevisaoDecisao
          :situacao="ficha.situacao"
          :pode-revisar="podeRevisar"
          :processando="decidindo"
          @aprovar="aprovar"
          @devolver="devolver"
        />
      </template>
    </article>
  </AppShell>

  <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="4000">{{ snackbar.text }}</v-snackbar>
</template>

<style scoped>
.revisao {
  display: grid;
  gap: var(--cx-sp-4);
  min-width: 0;
  max-width: 960px;
  padding-bottom: var(--cx-sp-8);
}

.revisao__cabecalho {
  display: flex;
  align-items: flex-start;
  gap: var(--cx-sp-2);
  min-width: 0;
}

.revisao__identidade {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.revisao__contexto {
  margin: 0;
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}

.revisao__nome {
  margin: 0;
  font-size: var(--cx-fs-h2);
  font-weight: 700;
  letter-spacing: var(--cx-tracking-tight);
  color: var(--cx-ink);
  overflow-wrap: anywhere;
}

.revisao__resumo {
  margin: 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

.revisao__estado {
  display: grid;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-4) var(--cx-sp-5);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface);
  box-shadow: var(--cx-e-1);
  /* A faixa de estado e a assinatura da tela: um filete na cor da marca, e so ele. */
  border-left: 4px solid var(--cx-brand);
}

.revisao__estado-linha {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cx-sp-3);
}

.revisao__explicacao {
  margin: 0;
  color: var(--cx-ink-soft);
}

.revisao__meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--cx-sp-3);
  margin: 0;
}

.revisao__meta dt {
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}

.revisao__meta dd {
  margin: 0;
  color: var(--cx-ink);
  overflow-wrap: anywhere;
}

.revisao__vazia {
  margin: 0;
  color: var(--cx-ink-soft);
}

@media (max-width: 1024px) {
  .revisao__meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .revisao__meta {
    grid-template-columns: minmax(0, 1fr);
  }

  .revisao__estado {
    padding: var(--cx-sp-4);
  }
}
</style>
