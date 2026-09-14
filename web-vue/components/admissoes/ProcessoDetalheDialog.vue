<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { HistoricoProcessoDto, PainelConviteDto, ProcessoDetalheDto } from "@padaria/shared";
import {
  corStatusProcesso,
  explicacaoSituacaoProcesso,
  rotuloAcaoHistoricoProcesso,
  rotuloIdentidadeProcesso,
  rotuloOrigemProcesso,
  rotuloSituacaoProcesso,
  rotuloStatusProcesso,
  rotuloTurnoDoProcesso,
  processoCancelavel
} from "~/utils/admissoes";
import ProcessoInternosBloco from "~/components/admissoes/ProcessoInternosBloco.vue";
import { formatarDataHora, mascararCpf } from "~/utils/formatacao";
import { linkDoConvite } from "~/utils/convite-token";
import { copiarTexto } from "~/utils/copiar-texto";

/**
 * O detalhe do processo de admissao — MODAL CENTRAL, e o unico caminho de detalhe.
 *
 * Era um `v-navigation-drawer` de 460px. Num celular de 390px o painel media mais que a viewport, e
 * o pedaco que sobrava ficava escondido atras do `overflow-x: hidden` global do `main.css` — sem
 * barra, sem sinal, sem jeito de alcancar. O drawer tambem nao prende o foco do teclado.
 *
 * O modal segue o desenho dos outros modais deste modulo (`ProcessoNovoDialog`,
 * `ProcessoInternosDialog`): `v-dialog` + `v-card`, X no cabecalho, corpo rolavel, acoes no rodape.
 *
 * SEM `persistent`, ao contrario dos dois: eles seguram formulario com dado nao salvo, e este e
 * leitura. Escape e clique fora fecham, que e o que se espera de um detalhe.
 *
 * As regras nao mudaram: o que aparece, quem pode cancelar e quem pode editar o bloco interno sao
 * exatamente os mesmos do painel que ele substitui.
 */
const props = defineProps<{
  aberto: boolean;
  processo: ProcessoDetalheDto | null;
  historico: HistoricoProcessoDto[];
  podeCancelar: boolean;
  podeEditarInternos: boolean;
  /**
   * Se ESTA tela tem para onde levar o "Ver o teste". NAO e permissao — as duas acima sao.
   *
   * Obrigatoria de proposito: o modal e montado por duas telas, e so a de Testes sabe abrir um
   * teste. Na de Processos o botao emitia para o vazio. Com a prop opcional o defeito voltaria em
   * silencio no dia em que uma terceira tela montasse o modal; obrigatoria, cada chamador declara.
   */
  podeVerTeste: boolean;
  /**
   * `admissoes_processos_visualizar` — a MESMA permissao que abre o processo. Revelar nao pede uma
   * segunda: o que muda e que fica registrado quem viu e quando.
   */
  podeVerCpf: boolean;
  /**
   * O CPF depois de revelado. Mora na PAGINA, nao aqui: e ela que faz a chamada auditada e que
   * limpa o valor ao fechar. O modal so exibe — e so enquanto estiver aberto.
   */
  cpfRevelado: string | null;
  /** A chamada esta em curso. Vem da pagina, que e quem sabe quando ela termina. */
  revelandoCpf: boolean;
  processando: boolean;
  // O painel antigo NAO declarava esta prop, e a pagina a passava mesmo assim: virava atributo solto
  // e o carregamento nunca aparecia. Num drawer isso passava; um modal vazio no meio da tela, nao.
  carregando?: boolean;
  /**
   * ADM-003 V2 — o convite ao candidato. `null` enquanto a pagina nao carregou.
   *
   * A SITUACAO vem derivada do servidor, e o motivo tambem: a tela nao decide se pode convidar,
   * so mostra o que o servidor respondeu. Quem decide e a guarda de emissao.
   */
  convite: PainelConviteDto | null;
  /** `admissoes_processos_convidar`. Sem ela, nao ha botao — e a rota recusa de qualquer forma. */
  podeConvidar: boolean;
  /** O token em claro, que existe UMA vez. Mora na pagina; o modal so exibe enquanto aberto. */
  tokenEmitido: string | null;
  convitePendente: boolean;
  /**
   * ADM-003 V5 — se ESTA tela leva a ficha do candidato. E permissao E caminho, como `podeVerTeste`:
   * a pagina de Processos passa `admissoes_processos_ver_ficha`; a de Testes passa `false`, porque
   * dali o processo e so leitura e a revisao e um ato, que mora na tela dona.
   *
   * Obrigatoria pelo mesmo motivo de `podeVerTeste`: com default, uma terceira tela montaria o modal
   * com a porta aberta para o vazio sem ninguem perceber.
   */
  podeRevisarFicha: boolean;
}>();

const emit = defineEmits<{
  // Sem motivo: a V0 nao tem lista de motivos, e o cancelamento e auditado por ator, data e acao.
  (event: "cancelar"): void;
  (event: "fechar"): void;
  (event: "verTeste"): void;
  // UM evento. A edicao dos internos e do exame virou um modal so, aberto pela pagina.
  (event: "editarInternos"): void;
  (event: "revelarCpf"): void;
  (event: "emitirConvite"): void;
  (event: "revogarConvite"): void;
  // A UNICA porta para a tela de revisao. O modal nao carrega ficha nem dependente, e nao aprova
  // nem devolve: quem navega e a pagina, para onde este evento vai.
  (event: "revisarFicha"): void;
}>();

const dialogCancelar = ref(false);

/**
 * Revelar CPF — ato explicito, e UM por clique.
 *
 * O CPF do processo so existe na admissao DIRETA. Vindo de teste efetivado, a coluna
 * `admissoes_processos.cpf` e nula por CHECK (PROJECT_BRAIN/44 D-1) e o documento mora no teste: o
 * servidor responde 400 dizendo isso. Por isso o botao olha a ORIGEM, e nao a mascara — a mascara
 * aparece nas duas origens, porque a projecao resolve por `coalesce`. Oferecer o botao onde ele so
 * pode falhar seria o botao morto que a D-8.1 tirou daqui.
 */
const podeRevelarCpf = computed(
  () =>
    props.podeVerCpf &&
    props.processo?.origem === "admissao_direta" &&
    props.processo.cpfMascarado !== null &&
    props.cpfRevelado === null
);

/**
 * O que a celula do CPF mostra.
 *
 * O servidor devolve o documento em DIGITOS CRUS (`52998224725`), enquanto a mascara vem formatada
 * (`•••.•••.•••-••`): sem formatar, revelar trocava um valor pontuado por uma tira de numeros, e
 * ainda dava ao `overflow-wrap: anywhere` da celula a chance de partir o CPF no meio.
 */
const cpfExibido = computed(() =>
  props.cpfRevelado ? mascararCpf(props.cpfRevelado) : (props.processo?.cpfMascarado ?? "—")
);

// Guarda SINCRONA do clique duplo. `disabled` sozinho nao basta: dois cliques no mesmo tick chegam
// antes de qualquer re-render, e cada um viraria uma requisicao e um evento `cpf_revelado` na
// trilha. Uma revelacao, uma linha de auditoria.
const pedindoCpf = ref(false);
const revelando = computed(() => pedindoCpf.value || props.revelandoCpf);

function pedirCpf() {
  if (revelando.value || props.cpfRevelado !== null) return;
  pedindoCpf.value = true;
  emit("revelarCpf");
}

// Borda de descida: a pagina terminou — com CPF ou com erro — e o botao volta a poder ser usado.
// Sem isto, uma falha deixaria o botao travado ate fechar o modal.
watch(
  () => props.revelandoCpf,
  (emCurso) => {
    if (!emCurso) pedindoCpf.value = false;
  }
);

// Enquanto o GET nao volta, `processo` e nulo. Mostrar o card vazio seria uma caixa em branco no
// meio da tela; o drawer disfarcava isso porque encostava na borda.
/**
 * O link que o DP entrega ao candidato, montado a partir da origem do PROPRIO navegador.
 *
 * Nao vem do servidor e nao ha configuracao para ele: em producao o app e servido na raiz do
 * dominio atras do proxy, e o build nao sabe qual e o dominio publico. Quem sabe e a aba aberta.
 *
 * O token cru nunca e exibido sozinho — o DP nao tem o que fazer com um hexadecimal de 64
 * caracteres, e repassar isso a mao era o convite a erro que esta tela criava.
 */
const linkDoCandidato = computed(() =>
  props.tokenEmitido ? linkDoConvite(window.location.origin, props.tokenEmitido) : ""
);

const avisoDaCopia = ref("");

/**
 * A copia acontece no proprio handler do clique, ANTES de qualquer `await`: a autorizacao do gesto
 * do usuario expira quando se espera por rede, e ai a Clipboard API rejeita.
 *
 * Falha nao vira sucesso silencioso. Se nenhum caminho copiar, a mensagem diz o que fazer — o link
 * continua na tela, selecionavel.
 */
async function copiarLink() {
  avisoDaCopia.value = "";
  const copiou = await copiarTexto(linkDoCandidato.value);
  avisoDaCopia.value = copiou
    ? "Link copiado."
    : "Não foi possível copiar automaticamente. Selecione o link acima e copie.";
}

// Convite novo e link novo: o aviso da copia anterior nao pode ficar valendo para outro link.
watch(
  () => props.tokenEmitido,
  () => {
    avisoDaCopia.value = "";
  }
);

const carregandoDetalhe = computed(() => props.carregando === true || props.processo === null);

// Pausado TAMBEM cancela — e a mesma regra do servidor, que recusa so `cancelado`. Esconder o
// botao na pausa deixava sem saida justamente o processo que o DP mais quer encerrar.
const cancelavel = computed(() => {
  const status = props.processo?.status;
  return status !== undefined && processoCancelavel(status);
});

/**
 * Devolver o foco a quem abriu.
 *
 * O `v-dialog` do Vuetify so refoca o `activatorEl` — o elemento passado pelo slot `activator`.
 * Aqui a abertura e programatica (a pagina busca o processo antes de abrir), entao nao ha
 * activator e o Vuetify nao devolve nada: ao fechar, o foco cairia no `body` e a navegacao por
 * teclado recomecaria do topo da pagina.
 */
let origemDoFoco: HTMLElement | null = null;

watch(
  () => props.aberto,
  async (aberto) => {
    if (aberto) {
      // Ainda e o botao que acabou de ser clicado: o overlay so toma o foco depois de montar.
      const ativo = document.activeElement;
      origemDoFoco = ativo instanceof HTMLElement ? ativo : null;
      return;
    }

    dialogCancelar.value = false;
    pedindoCpf.value = false;

    const alvo = origemDoFoco;
    origemDoFoco = null;
    await nextTick();
    // `isConnected` porque nem sempre o gatilho sobrevive: vindo da tela de Testes, quem abre o
    // processo e um botao do painel do teste, que fecha no mesmo ato.
    if (alvo?.isConnected) alvo.focus({ preventScroll: true });
  }
);

function confirmarCancelar() {
  emit("cancelar");
  dialogCancelar.value = false;
}
</script>

<template>
  <v-dialog :model-value="aberto" max-width="720" scrollable @update:model-value="(valor) => !valor && emit('fechar')">
    <v-card role="dialog" aria-labelledby="titulo-processo-detalhe">
      <v-card-title id="titulo-processo-detalhe" class="d-flex align-center justify-space-between ga-3">
        <span>Processo de admissão</span>
        <v-btn icon="mdi-close" variant="text" size="small" aria-label="Fechar" @click="emit('fechar')" />
      </v-card-title>

      <v-card-text>
        <div v-if="carregandoDetalhe" class="detalhe-carregando" role="status">
          <v-progress-circular indeterminate size="28" width="3" />
          <span>Carregando o processo…</span>
        </div>

        <div v-else-if="processo" class="detalhe">
          <!-- Mesmo padrão do painel do teste: cada estado com rótulo, e a frase que diz de onde a
               situação vem. Chip solto vira "campo" na cabeça de quem lê. -->
          <div class="detalhe-estados">
            <div class="estado">
              <span class="estado-rotulo">Status do processo</span>
              <v-chip :color="corStatusProcesso(processo.status)" size="small" variant="tonal">
                {{ rotuloStatusProcesso[processo.status] }}
              </v-chip>
            </div>
            <div class="estado">
              <span class="estado-rotulo">Situação</span>
              <v-chip size="small" variant="outlined">{{ rotuloSituacaoProcesso[processo.situacao] }}</v-chip>
            </div>
          </div>
          <p class="detalhe-derivacao">{{ explicacaoSituacaoProcesso[processo.situacao] }}.</p>

          <dl class="detalhe-campos">
            <dt>Candidato</dt>
            <dd>
              <strong>{{ rotuloIdentidadeProcesso(processo.nomeCompleto) }}</strong>
              <!-- Sem nome no processo direto ate o candidato responder. Dizer isso e mais honesto que
                   um traco, e muito mais honesto que inventar identidade. -->
              <span v-if="!processo.nomeCompleto" class="detalhe-derivacao">
                O nome chega com a resposta do candidato.
              </span>
            </dd>

            <!-- ORIGEM: so leitura. Nao ha controle que a troque — ela se registra, nao se escolhe. -->
            <dt>Origem</dt>
            <dd>
              {{ rotuloOrigemProcesso[processo.origem] }}
              <!-- Duas condicoes, e as duas sao necessarias: o processo precisa TER teste, e a tela
                   precisa saber abri-lo. Botao que nao leva a lugar nenhum gasta a confianca do DP
                   mais rapido que botao ausente. -->
              <template v-if="podeVerTeste && processo.testeId">
                <br />
                <v-btn variant="text" size="x-small" class="ps-0" @click="emit('verTeste')">Ver o teste</v-btn>
              </template>
            </dd>

            <dt>CPF</dt>
            <dd>
              <!--
                A mascara e o padrao, e continua ate alguem PEDIR o documento. Revelado, o CPF vive
                so aqui dentro, enquanto o modal estiver aberto: nao vai para URL, query, titulo,
                tooltip, aviso nem para a listagem.

                O botao repete o tratamento do "Ver o teste" logo acima — `<br />` e `ps-0`, em
                linha propria —, porque os dois moram na mesma celula deste `dl`.
              -->
              <span class="cx-num">{{ cpfExibido }}</span>
              <template v-if="podeRevelarCpf">
                <br />
                <v-btn
                  variant="text"
                  size="x-small"
                  class="ps-0"
                  :loading="revelando"
                  :disabled="revelando"
                  @click="pedirCpf"
                >
                  Ver CPF
                </v-btn>
              </template>
              <!--
                Live region SEMPRE montada, e nao `v-if`: regiao que nasce junto com o texto
                costuma nao ser anunciada por leitor de tela — e anunciar e justamente o ponto,
                porque o valor muda depois de uma acao. Ela diz que a consulta foi registrada; o
                documento em si nao entra aqui, para nao virar um segundo canal de saida do dado.
              -->
              <span class="detalhe-derivacao" role="status">
                {{ cpfRevelado ? "CPF revelado. Esta consulta ficou registrada no histórico." : "" }}
              </span>
            </dd>

            <dt>Função operacional</dt>
            <dd>{{ processo.funcaoNome ?? "—" }}</dd>

            <dt>Turno</dt>
            <dd>{{ rotuloTurnoDoProcesso(processo) ?? "—" }}</dd>

            <!-- Só aparece quando existe: é registro anterior ao catálogo de turnos, e não foi convertido
                 porque converter seria adivinhar qual turno da empresa aquele texto era. -->
            <template v-if="processo.jornadaHorario">
              <dt>Jornada (registro anterior)</dt>
              <dd>
                {{ processo.jornadaHorario }}
                <span class="detalhe-derivacao">Cadastro feito antes do catálogo de turnos.</span>
              </dd>
            </template>
          </dl>

          <ProcessoInternosBloco
            :internos="processo.internos"
            :pode-editar="podeEditarInternos"
            :processando="processando"
            :editavel="processo.status !== 'cancelado'"
            @editar="emit('editarInternos')"
          />

          <!-- O convite existe, mas quem decide se pode emitir e o SERVIDOR: a tela mostra a situacao e o
               motivo que vieram de la. Botao escondido nao protege de quem chama a rota direto. -->
          <section class="detalhe-convite">
            <h3>Convite ao candidato</h3>

            <v-alert v-if="convite?.situacao === 'indisponivel'" type="info" variant="tonal" density="compact">
              <strong>Indisponível.</strong> {{ convite.motivo }}
            </v-alert>

            <template v-else-if="convite">
              <p v-if="convite.situacao === 'ausente'" class="detalhe-convite__vazio">
                Nenhum convite emitido. O link leva o candidato ao formulário e vale por 14 dias.
              </p>

              <dl v-else-if="convite.convite" class="detalhe-lista">
                <div>
                  <dt>Situação</dt>
                  <dd>
                    <v-chip
                      :color="convite.situacao === 'expirado' ? 'warning' : 'primary'"
                      size="small"
                      variant="flat"
                    >
                      {{ convite.situacao === "expirado" ? "Expirado" : "Vigente" }}
                    </v-chip>
                  </dd>
                </div>
                <div>
                  <dt>Validade</dt>
                  <dd>{{ formatarDataHora(convite.convite.expiraEm) }}</dd>
                </div>
                <div>
                  <dt>Primeiro acesso</dt>
                  <dd>{{ convite.convite.primeiroAcessoEm ? formatarDataHora(convite.convite.primeiroAcessoEm) : "Ainda não abriu" }}</dd>
                </div>
                <div>
                  <dt>Aviso aceito na versão</dt>
                  <dd>{{ convite.convite.avisoPrivacidadeVersao }}</dd>
                </div>
              </dl>

              <!--
                O link aparece UMA vez. Nao ha rota que o devolva: fechado o modal, ele some.

                O `v-alert` carrega SO a instrucao, nunca o link. O Vuetify emite `role="alert"`
                fixo nesse componente, e alerta e regiao assertiva: se o link estivesse dentro, o
                leitor de tela interromperia tudo para soletrar a URL inteira com o token.
              -->
              <template v-if="linkDoCandidato">
                <v-alert type="success" variant="tonal" density="compact" class="mt-3">
                  <strong>Copie agora.</strong> Este link não aparece de novo.
                </v-alert>

                <div class="detalhe-convite__entrega">
                  <!--
                    `code`, e nao `input`: campo de formulario com `readonly` continua sendo
                    submetido, restaurado pelo navegador e oferecido ao autofill. E nao `a href`:
                    o endereco iria para a barra de status, para o menu de contexto e para o
                    historico do DP se ele clicasse.
                  -->
                  <code class="detalhe-convite__link">{{ linkDoCandidato }}</code>
                  <v-btn
                    variant="tonal"
                    size="small"
                    prepend-icon="mdi-content-copy"
                    class="detalhe-convite__copiar"
                    @click="copiarLink"
                  >
                    Copiar link
                  </v-btn>
                </div>

                <!--
                  Live region SEMPRE montada, e nao `v-if` — a mesma doutrina do aviso do CPF acima:
                  regiao que nasce junto com o texto costuma nao ser anunciada. Ela diz o RESULTADO
                  da copia, nunca o link.
                -->
                <p class="detalhe-convite__copia" role="status">{{ avisoDaCopia }}</p>
              </template>

              <div v-if="podeConvidar" class="detalhe-convite__acoes">
                <v-btn
                  color="primary"
                  variant="flat"
                  size="small"
                  :loading="convitePendente"
                  @click="emit('emitirConvite')"
                >
                  {{ convite.situacao === "ausente" ? "Gerar link" : "Gerar novo link" }}
                </v-btn>
                <v-btn
                  v-if="convite.convite"
                  color="error"
                  variant="text"
                  size="small"
                  :disabled="convitePendente"
                  @click="emit('revogarConvite')"
                >
                  Revogar link
                </v-btn>
              </div>
            </template>
          </section>

          <!--
            ADM-003 V5: a ficha do candidato mora em TELA PROPRIA. Aqui so a porta — nenhum campo da
            ficha, nenhum dependente, nenhum aprovar/devolver. Um segundo lugar para o mesmo ato e o
            que a regra-mae proibe, e o modal ja passa de 600 linhas.
          -->
          <section v-if="podeRevisarFicha" class="detalhe-ficha">
            <h3>Ficha do candidato</h3>
            <p class="detalhe-derivacao">
              Os dados enviados pelo link, a declaração de dependentes e a decisão de aprovar ou devolver ficam
              em tela própria.
            </p>
            <v-btn
              variant="tonal"
              size="small"
              prepend-icon="mdi-file-account-outline"
              class="detalhe-ficha__abrir"
              @click="emit('revisarFicha')"
            >
              Abrir ficha do candidato
            </v-btn>
          </section>

          <p class="detalhe-autoria">
            Iniciado por {{ processo.criadoPorNome ?? "—" }} · {{ formatarDataHora(processo.criadoEm) }}<br />
            Alterado por {{ processo.atualizadoPorNome ?? "—" }} · {{ formatarDataHora(processo.atualizadoEm) }}
            <template v-if="processo.canceladoEm">
              <br />Cancelado por {{ processo.canceladoPorNome ?? "—" }} ·
              {{ formatarDataHora(processo.canceladoEm) }}
            </template>
          </p>

          <section v-if="historico.length" class="detalhe-trilha">
            <h3 class="trilha-titulo">Histórico</h3>
            <ul class="trilha-lista">
              <li v-for="evento in historico" :key="evento.id">
                <strong>{{ rotuloAcaoHistoricoProcesso[evento.acao] }}</strong>
                · {{ evento.atorNome ?? "—" }} · {{ formatarDataHora(evento.ocorridoEm) }}
              </li>
            </ul>
          </section>
        </div>
      </v-card-text>

      <!-- Rodape so quando ha o que fazer. Fechar mora no X, e um segundo botao para o mesmo ato
           seria a duplicidade que o AGENTS.md proibe. -->
      <v-card-actions v-if="processo && cancelavel && podeCancelar">
        <v-btn color="error" variant="text" :disabled="processando" @click="dialogCancelar = true">
          Cancelar e arquivar
        </v-btn>
        <v-spacer />
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Irmao, nao filho: o dialogo de confirmacao empilha por cima e um Escape fecha so o de cima. -->
  <v-dialog v-model="dialogCancelar" max-width="460">
    <v-card>
      <v-card-title>Cancelar e arquivar</v-card-title>
      <v-card-text>
        <p class="mb-2"><strong>Isto não apaga o processo.</strong> O que acontece:</p>
        <ul class="mb-3 ps-5">
          <li>o processo fica <strong>Inativo</strong>;</li>
          <li>o histórico registra quem cancelou e quando;</li>
          <li>não há reabertura, e não existe exclusão definitiva.</li>
        </ul>
        <p class="mb-0">O período de teste de origem <strong>não</strong> é alterado.</p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="dialogCancelar = false">Voltar</v-btn>
        <v-btn color="error" variant="flat" @click="confirmarCancelar">Cancelar e arquivar</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.detalhe {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-4);
}

.detalhe-carregando {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-5) 0;
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}

.detalhe-estados {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-2);
}

.estado {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-2);
}

.estado-rotulo {
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
  min-width: 132px;
}

/* `--cx-ink-soft`, e nao `--cx-texto-suave`: este ultimo nunca existiu no `main.css`, e as frases
   herdavam a cor do texto normal — a derivacao parecia campo. */
.detalhe-derivacao,
.detalhe-convite__vazio {
  margin: 0;
  color: var(--cx-ink-soft);
}

.detalhe-ficha {
  display: grid;
  gap: var(--cx-sp-2);
  justify-items: start;
}

/* Alvo de toque: 40px de piso (`67` §9), 44px no celular (`67` §13.4). */
.detalhe-ficha__abrir {
  min-height: 40px;
}

.detalhe-convite__acoes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-2);
  margin-top: var(--cx-sp-3);
}

.detalhe-convite__entrega {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cx-sp-2);
  margin-top: var(--cx-sp-2);
  min-width: 0;
}

/* O link e longo e nao pode empurrar o modal: quebra dentro da propria celula. `min-width: 0` e
   obrigatorio junto, senao o filho flex se recusa a encolher abaixo do conteudo. */
.detalhe-convite__link {
  flex: 1 1 16rem;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 0.8rem;
  padding: var(--cx-sp-2);
  border-radius: var(--cx-r-sm);
  background: var(--cx-surface-sunken);
}

/* Alvo de toque: 40px de piso pelo `67` §9, 44px no celular pelo §13.4. Escopado a esta secao. */
.detalhe-convite__copiar {
  min-height: 40px;
}

.detalhe-convite__copia {
  margin: var(--cx-sp-2) 0 0;
  min-height: 1.25rem;
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}

.detalhe-autoria {
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
  line-height: 1.6;
}

.detalhe-campos {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr);
  gap: var(--cx-sp-2);
  font-size: var(--cx-fs-body);
}

.detalhe-campos dt {
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}

.detalhe-campos dd {
  margin: 0;
  min-width: 0;
  /* Nome longo e CPF mascarado nao empurram o modal: quebram dentro da propria celula. */
  overflow-wrap: anywhere;
}

.trilha-titulo {
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
  margin-bottom: var(--cx-sp-2);
}

.trilha-lista {
  list-style: none;
  padding: 0;
  font-size: var(--cx-fs-caption);
  line-height: 1.8;
  overflow-wrap: anywhere;
}

/* Duas colunas de rotulo nao cabem num celular. O corte segue os breakpoints do projeto
   (PROJECT_BRAIN/67 §13): 768 e o ponto em que o card ja vira coluna com acoes fixas. */
@media (max-width: 768px) {
  .detalhe-campos {
    grid-template-columns: minmax(0, 1fr);
    gap: 2px var(--cx-sp-2);
  }

  .detalhe-campos dt {
    margin-top: var(--cx-sp-2);
  }

  .estado {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
  }

  .estado-rotulo {
    min-width: 0;
  }

  /* No celular o link ocupa a linha inteira e o botao vem abaixo, com alvo de 44px (`67` §13.4).
     Lado a lado, o link espremeria a ponto de virar tres letras por linha. */
  .detalhe-convite__link {
    flex: 1 1 100%;
  }

  .detalhe-convite__copiar,
  .detalhe-ficha__abrir {
    min-height: 44px;
  }
}
</style>
