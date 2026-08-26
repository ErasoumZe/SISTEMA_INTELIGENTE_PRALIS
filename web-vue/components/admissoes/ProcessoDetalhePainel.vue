<script setup lang="ts">
import type { HistoricoProcessoDto, MotivoCancelamentoProcesso, ProcessoDetalheDto } from "@padaria/shared";
import { motivosCancelamentoProcesso } from "@padaria/shared";
import {
  corStatusProcesso,
  explicacaoSituacaoProcesso,
  rotuloAcaoHistoricoProcesso,
  rotuloMotivoCancelamentoProcesso,
  rotuloSituacaoProcesso,
  rotuloStatusProcesso
} from "~/utils/admissoes";
import { formatarDataHora } from "~/utils/formatacao";

const props = defineProps<{
  aberto: boolean;
  processo: ProcessoDetalheDto | null;
  historico: HistoricoProcessoDto[];
  podeCancelar: boolean;
  processando: boolean;
}>();

const emit = defineEmits<{
  (event: "cancelar", motivo: MotivoCancelamentoProcesso): void;
  (event: "fechar"): void;
  (event: "verTeste"): void;
}>();

const dialogCancelar = ref(false);
const motivoEscolhido = ref<MotivoCancelamentoProcesso | null>(null);

const opcoesMotivo = motivosCancelamentoProcesso.map((valor) => ({
  valor,
  rotulo: rotuloMotivoCancelamentoProcesso[valor]
}));

const emAndamento = computed(() => props.processo?.status === "iniciado");

watch(
  () => props.aberto,
  (aberto) => {
    if (aberto) return;
    dialogCancelar.value = false;
    motivoEscolhido.value = null;
  }
);

function confirmarCancelar() {
  if (!motivoEscolhido.value) return;
  emit("cancelar", motivoEscolhido.value);
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
        <dt>Origem</dt>
        <dd>
          Período de teste de <strong>{{ processo.testeNomeCompleto }}</strong>
          <br />
          <v-btn variant="text" size="x-small" class="ps-0" @click="emit('verTeste')">Ver o teste</v-btn>
        </dd>

        <template v-if="processo.motivoCancelamento">
          <dt>Motivo do cancelamento</dt>
          <dd>{{ rotuloMotivoCancelamentoProcesso[processo.motivoCancelamento] }}</dd>
        </template>
      </dl>

      <p class="painel-nota">
        A admissão foi iniciada. Convite, formulário do candidato, documentos e vínculo com o cadastro
        operacional ainda não existem — chegam nas próximas etapas.
      </p>

      <footer class="painel-acoes">
        <v-btn
          v-if="emAndamento && podeCancelar"
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
            <li>o histórico inteiro é preservado, inclusive quem fez o quê;</li>
            <li>é obrigatório informar um motivo;</li>
            <li>não há reabertura, e não existe exclusão definitiva.</li>
          </ul>
          <p class="mb-3">O período de teste de origem <strong>não</strong> é alterado.</p>
          <v-select
            v-model="motivoEscolhido"
            :items="opcoesMotivo"
            item-title="rotulo"
            item-value="valor"
            label="Motivo *"
            density="comfortable"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialogCancelar = false">Voltar</v-btn>
          <v-btn color="error" variant="flat" :disabled="!motivoEscolhido" @click="confirmarCancelar">
            Cancelar e arquivar
          </v-btn>
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
