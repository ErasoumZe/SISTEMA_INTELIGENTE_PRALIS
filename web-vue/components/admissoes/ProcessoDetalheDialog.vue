<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { HistoricoProcessoDto, ProcessoDetalheDto } from "@padaria/shared";
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
import { formatarDataHora } from "~/utils/formatacao";

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
  processando: boolean;
  // O painel antigo NAO declarava esta prop, e a pagina a passava mesmo assim: virava atributo solto
  // e o carregamento nunca aparecia. Num drawer isso passava; um modal vazio no meio da tela, nao.
  carregando?: boolean;
}>();

const emit = defineEmits<{
  // Sem motivo: a V0 nao tem lista de motivos, e o cancelamento e auditado por ator, data e acao.
  (event: "cancelar"): void;
  (event: "fechar"): void;
  (event: "verTeste"): void;
  // UM evento. A edicao dos internos e do exame virou um modal so, aberto pela pagina.
  (event: "editarInternos"): void;
}>();

const dialogCancelar = ref(false);

// Enquanto o GET nao volta, `processo` e nulo. Mostrar o card vazio seria uma caixa em branco no
// meio da tela; o drawer disfarcava isso porque encostava na borda.
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
            <dd>{{ processo.cpfMascarado ?? "—" }}</dd>

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

          <!-- O convite fica DESABILITADO com o motivo escrito, e nao existe rota que o emita. Emitir um
               link que ainda nao abre gastaria a confianca do DP na primeira tentativa. -->
          <section class="detalhe-convite">
            <h3>Convite ao candidato</h3>
            <v-alert type="info" variant="tonal" density="compact">
              <strong>Indisponível.</strong> O cadastro online do candidato depende de duas coisas que ainda não
              existem: o aviso de privacidade aprovado, com versão registrada, e a política de documentos (tipo real do
              arquivo, tamanho, antimalware, storage e descarte). Enquanto isso, nenhum link é gerado — nem para teste.
            </v-alert>
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

.detalhe-derivacao,
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
}
</style>
