<script setup lang="ts">
import type { HistoricoTesteDto, MotivoCancelamento, ResultadoTeste, TesteDetalheDto } from "@padaria/shared";
import { motivosCancelamentoTeste, resultadosTeste } from "@padaria/shared";
import { formatarDataHora } from "~/utils/formatacao";
import {
  corPrazoTeste,
  corStatusTeste,
  rotuloMotivoCancelamento,
  rotuloPrazoTeste,
  rotuloResultadoTeste,
  rotuloSituacaoTeste,
  rotuloStatusTeste
} from "~/utils/admissoes";

const props = defineProps<{
  aberto: boolean;
  teste: TesteDetalheDto | null;
  historico: HistoricoTesteDto[];
  carregando: boolean;
  processando: boolean;
  cpfRevelado: string;
  podeEditar: boolean;
  podeEncerrar: boolean;
  podeCancelar: boolean;
}>();

const emit = defineEmits<{
  (event: "fechar"): void;
  (event: "editar"): void;
  (event: "revelarCpf"): void;
  (event: "encerrar", resultado: ResultadoTeste): void;
  (event: "cancelar", motivo: MotivoCancelamento): void;
}>();

const emAndamento = computed(() => props.teste?.status === "em_teste");

const dialogEncerrar = ref(false);
const dialogCancelar = ref(false);
const resultadoEscolhido = ref<ResultadoTeste | null>(null);
const motivoEscolhido = ref<MotivoCancelamento | null>(null);

const opcoesResultado = resultadosTeste.map((valor) => ({ valor, rotulo: rotuloResultadoTeste[valor] }));
const opcoesMotivo = motivosCancelamentoTeste.map((valor) => ({ valor, rotulo: rotuloMotivoCancelamento[valor] }));

watch(
  () => props.aberto,
  (aberto) => {
    if (aberto) return;
    dialogEncerrar.value = false;
    dialogCancelar.value = false;
    resultadoEscolhido.value = null;
    motivoEscolhido.value = null;
  }
);

const rotuloAcao: Record<string, string> = {
  criado: "Registrado",
  alterado: "Alterado",
  encerrado: "Encerrado",
  cancelado: "Cancelado e arquivado",
  cpf_revelado: "CPF consultado"
};

function confirmarEncerrar() {
  if (!resultadoEscolhido.value) return;
  emit("encerrar", resultadoEscolhido.value);
  dialogEncerrar.value = false;
}

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
    width="480"
    @update:model-value="(valor) => !valor && emit('fechar')"
  >
    <div v-if="carregando" class="pa-4"><v-progress-linear indeterminate /></div>

    <div v-else-if="teste" class="painel">
      <header class="painel-topo">
        <div class="d-flex align-start justify-space-between ga-2">
          <h2 class="painel-nome">{{ teste.nomeCompleto }}</h2>
          <v-btn icon="mdi-close" variant="text" size="small" aria-label="Fechar" @click="emit('fechar')" />
        </div>
        <div class="d-flex align-center flex-wrap ga-2 mt-2">
          <v-chip :color="corStatusTeste(teste.status)" size="small" variant="tonal">
            {{ rotuloStatusTeste[teste.status] }}
          </v-chip>
          <v-chip size="small" variant="outlined">{{ rotuloSituacaoTeste[teste.situacao] }}</v-chip>
          <v-chip
            v-if="teste.prazo && teste.prazo !== 'no_prazo'"
            :color="corPrazoTeste(teste.prazo)"
            size="small"
            variant="tonal"
          >
            {{ rotuloPrazoTeste[teste.prazo] }}
          </v-chip>
        </div>
      </header>

      <dl class="painel-campos">
        <dt>CPF</dt>
        <dd class="d-flex align-center ga-2">
          <span class="cx-num">{{ cpfRevelado || teste.cpfMascarado }}</span>
          <!-- Revelar e um ATO: gera evento de auditoria (sem o valor). Por isso o botao some depois
               de revelado, em vez de virar um alternador que registra a cada clique. -->
          <v-btn v-if="!cpfRevelado" variant="text" size="x-small" @click="emit('revelarCpf')">Ver</v-btn>
        </dd>

        <dt>Cargo</dt>
        <dd>{{ teste.cargoNome }}</dd>

        <dt>Jornada / horário</dt>
        <dd>{{ teste.jornadaHorario }}</dd>

        <dt>Início</dt>
        <dd class="cx-num">{{ formatarDataHora(teste.inicioEm) }}</dd>

        <dt>Fim combinado</dt>
        <dd class="cx-num">{{ formatarDataHora(teste.fimCombinadoEm) }}</dd>

        <template v-if="teste.resultado">
          <dt>Resultado</dt>
          <dd>{{ rotuloResultadoTeste[teste.resultado] }}</dd>
        </template>

        <template v-if="teste.motivoCancelamento">
          <dt>Motivo do cancelamento</dt>
          <dd>{{ rotuloMotivoCancelamento[teste.motivoCancelamento] }}</dd>
        </template>
      </dl>

      <section class="painel-secao">
        <h3 class="painel-secao-titulo">Histórico</h3>
        <ul class="painel-historico">
          <li v-for="evento in historico" :key="evento.id">
            <span class="historico-acao">{{ rotuloAcao[evento.acao] ?? evento.acao }}</span>
            <span class="historico-meta">
              {{ evento.atorNome ?? "—" }} · {{ formatarDataHora(evento.ocorridoEm) }}
            </span>
            <span v-if="evento.camposAlterados.length" class="historico-campos">
              Campos: {{ evento.camposAlterados.join(", ") }}
            </span>
          </li>
          <li v-if="!historico.length" class="historico-vazio">Sem eventos registrados.</li>
        </ul>
      </section>

      <footer class="painel-acoes">
        <v-btn v-if="emAndamento && podeEditar" variant="outlined" :disabled="processando" @click="emit('editar')">
          Editar
        </v-btn>
        <v-btn
          v-if="emAndamento && podeEncerrar"
          color="primary"
          variant="flat"
          :disabled="processando"
          @click="dialogEncerrar = true"
        >
          Encerrar
        </v-btn>
        <!-- "Excluir" e cancelamento arquivado: exige motivo, sai da listagem padrao e preserva a
             auditoria. Nao existe exclusao fisica nesta vertical. -->
        <v-btn
          v-if="emAndamento && podeCancelar"
          color="error"
          variant="text"
          :disabled="processando"
          @click="dialogCancelar = true"
        >
          Excluir
        </v-btn>
      </footer>

      <p class="painel-autoria">
        Registrado por {{ teste.criadoPorNome ?? "—" }} · {{ formatarDataHora(teste.criadoEm) }}<br />
        Alterado por {{ teste.atualizadoPorNome ?? "—" }} · {{ formatarDataHora(teste.atualizadoEm) }}
        <template v-if="teste.encerradoEm">
          <br />Encerrado por {{ teste.encerradoPorNome ?? "—" }} · {{ formatarDataHora(teste.encerradoEm) }}
        </template>
        <template v-if="teste.canceladoEm">
          <br />Cancelado por {{ teste.canceladoPorNome ?? "—" }} · {{ formatarDataHora(teste.canceladoEm) }}
        </template>
      </p>
    </div>

    <v-dialog v-model="dialogEncerrar" max-width="460">
      <v-card>
        <v-card-title>Encerrar período de teste</v-card-title>
        <v-card-text>
          <p class="mb-3">Encerrar registra a decisão do DP. Não abre admissão nem cria colaborador.</p>
          <v-select
            v-model="resultadoEscolhido"
            :items="opcoesResultado"
            item-title="rotulo"
            item-value="valor"
            label="Resultado *"
            density="comfortable"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialogEncerrar = false">Voltar</v-btn>
          <v-btn color="primary" variant="flat" :disabled="!resultadoEscolhido" @click="confirmarEncerrar">
            Encerrar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="dialogCancelar" max-width="460">
      <v-card>
        <v-card-title>Excluir período de teste</v-card-title>
        <v-card-text>
          <p class="mb-3">
            O registro é cancelado e arquivado: sai da listagem padrão, mas o histórico é preservado. Não há
            exclusão definitiva.
          </p>
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
            Excluir
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-navigation-drawer>
</template>

<style scoped>
.painel {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-6);
  padding: var(--cx-sp-5);
}

.painel-nome {
  font-size: var(--cx-fs-title);
  font-weight: 600;
  line-height: 1.3;
}

.painel-campos {
  display: grid;
  grid-template-columns: minmax(0, 11rem) minmax(0, 1fr);
  gap: var(--cx-sp-2) var(--cx-sp-4);
  margin: 0;
}

.painel-campos dt {
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}

.painel-campos dd {
  margin: 0;
  font-size: var(--cx-fs-body);
}

.painel-secao-titulo {
  font-size: var(--cx-fs-caption);
  letter-spacing: var(--cx-tracking-wide);
  text-transform: uppercase;
  color: var(--cx-ink-soft);
  margin-bottom: var(--cx-sp-3);
}

.painel-historico {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--cx-sp-3);
}

.painel-historico li {
  display: grid;
  gap: 2px;
  border-left: 2px solid var(--cx-line);
  padding-left: var(--cx-sp-3);
}

.historico-acao {
  font-size: var(--cx-fs-body);
}

.historico-meta,
.historico-campos,
.historico-vazio {
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}

.painel-acoes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-2);
}

.painel-autoria {
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
  line-height: 1.6;
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

  .painel-acoes > * {
    flex: 1 1 auto;
  }
}
</style>
