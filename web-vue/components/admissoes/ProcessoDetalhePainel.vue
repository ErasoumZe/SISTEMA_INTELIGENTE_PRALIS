<script setup lang="ts">
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

const props = defineProps<{
  aberto: boolean;
  processo: ProcessoDetalheDto | null;
  historico: HistoricoProcessoDto[];
  podeCancelar: boolean;
  podeEditarInternos: boolean;
  processando: boolean;
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

// Pausado TAMBEM cancela — e a mesma regra do servidor, que recusa so `cancelado`. Esconder o
// botao na pausa deixava sem saida justamente o processo que o DP mais quer encerrar.
const cancelavel = computed(() => {
  const status = props.processo?.status;
  return status !== undefined && processoCancelavel(status);
});

watch(
  () => props.aberto,
  (aberto) => {
    if (aberto) return;
    dialogCancelar.value = false;
  }
);

function confirmarCancelar() {
  emit("cancelar");
  dialogCancelar.value = false;
}
</script>

<template>
  <v-navigation-drawer
    :model-value="aberto"
    location="right"
    temporary
    width="460"
    @update:model-value="(v) => !v && emit('fechar')"
  >
    <div v-if="processo" class="painel">
      <header class="painel-topo">
        <div class="d-flex align-start justify-space-between ga-2">
          <h2 class="painel-nome">Processo de admissão</h2>
          <v-btn icon="mdi-close" variant="text" size="small" aria-label="Fechar" @click="emit('fechar')" />
        </div>

        <!-- Mesmo padrão do painel do teste: cada estado com rótulo, e a frase que diz de onde a
             situação vem. Chip solto vira "campo" na cabeça de quem lê. -->
        <div class="painel-estados mt-3">
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
        <p class="painel-derivacao">{{ explicacaoSituacaoProcesso[processo.situacao] }}.</p>
      </header>

      <dl class="painel-campos">
        <dt>Candidato</dt>
        <dd>
          <strong>{{ rotuloIdentidadeProcesso(processo.nomeCompleto) }}</strong>
          <!-- Sem nome no processo direto ate o candidato responder. Dizer isso e mais honesto que
               um traco, e muito mais honesto que inventar identidade. -->
          <span v-if="!processo.nomeCompleto" class="painel-derivacao">
            O nome chega com a resposta do candidato.
          </span>
        </dd>

        <!-- ORIGEM: so leitura. Nao ha controle que a troque — ela se registra, nao se escolhe. -->
        <dt>Origem</dt>
        <dd>
          {{ rotuloOrigemProcesso[processo.origem] }}
          <template v-if="processo.testeId">
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
            <span class="painel-derivacao">Cadastro feito antes do catálogo de turnos.</span>
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
      <section class="painel-convite">
        <h3>Convite ao candidato</h3>
        <v-alert type="info" variant="tonal" density="compact">
          <strong>Indisponível.</strong> O cadastro online do candidato depende de duas coisas que ainda
          não existem: o aviso de privacidade aprovado, com versão registrada, e a política de
          documentos (tipo real do arquivo, tamanho, antimalware, storage e descarte). Enquanto isso,
          nenhum link é gerado — nem para teste.
        </v-alert>
      </section>

      <footer class="painel-acoes">
        <v-btn
          v-if="cancelavel && podeCancelar"
          color="error"
          variant="text"
          :disabled="processando"
          @click="dialogCancelar = true"
        >
          Cancelar e arquivar
        </v-btn>
      </footer>

      <p class="painel-autoria">
        Iniciado por {{ processo.criadoPorNome ?? "—" }} · {{ formatarDataHora(processo.criadoEm) }}<br />
        Alterado por {{ processo.atualizadoPorNome ?? "—" }} · {{ formatarDataHora(processo.atualizadoEm) }}
        <template v-if="processo.canceladoEm">
          <br />Cancelado por {{ processo.canceladoPorNome ?? "—" }} ·
          {{ formatarDataHora(processo.canceladoEm) }}
        </template>
      </p>

      <section v-if="historico.length" class="painel-trilha">
        <h3 class="trilha-titulo">Histórico</h3>
        <ul class="trilha-lista">
          <li v-for="evento in historico" :key="evento.id">
            <strong>{{ rotuloAcaoHistoricoProcesso[evento.acao] }}</strong>
            · {{ evento.atorNome ?? "—" }} · {{ formatarDataHora(evento.ocorridoEm) }}
          </li>
        </ul>
      </section>
    </div>

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
  </v-navigation-drawer>
</template>

<style scoped>
.painel {
  padding: var(--cx-sp-5);
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-4);
}

.painel-nome {
  font-size: var(--cx-fs-title);
  line-height: 1.3;
}

.painel-estados {
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

.painel-derivacao,
.painel-nota,
.painel-autoria {
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
  line-height: 1.6;
}

.painel-campos {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr);
  gap: var(--cx-sp-2);
  font-size: var(--cx-fs-body);
}

.painel-campos dt {
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}

.painel-acoes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-2);
  border-top: 1px solid var(--cx-line);
  padding-top: var(--cx-sp-3);
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
}

/* No celular o painel ocupa a tela toda e as acoes viram largura total. */
@media (max-width: 768px) {
  .painel-campos {
    grid-template-columns: minmax(0, 1fr);
    gap: 2px var(--cx-sp-2);
  }

  .painel-campos dt {
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

  .painel-acoes > * {
    flex: 1 1 auto;
  }
}
</style>
