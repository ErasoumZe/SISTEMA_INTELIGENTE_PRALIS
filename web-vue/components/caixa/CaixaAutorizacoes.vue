<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import type { CaixaOperacional } from "~/types/padaria";
import { dataHoraLocal, dataHoraParaUtc, formatarDataHora } from "~/utils/formatacao";
import { useCaixaAutorizacoes } from "~/composables/useCaixaAutorizacoes";

const props = defineProps<{
  empresaId: string;
  caixaAberto: CaixaOperacional | null;
  permissoes: string[];
}>();

const emit = defineEmits<{ (event: "alterado"): void }>();

const {
  autorizadores,
  pendentes,
  carregandoPendentes,
  carregarAutorizadores,
  carregarPendentes,
  alterarHorario,
  solicitarAutorizacao,
  gerarToken
} = useCaixaAutorizacoes();

const podeAlterarDireto = computed(() => props.permissoes.includes("caixa_alterar_horario"));

const snackbar = reactive({ show: false, text: "", color: "success" });
function notificar(text: string, color = "success") {
  snackbar.text = text;
  snackbar.color = color;
  snackbar.show = true;
}

// --- Alterar horario ---
const alterarAberto = ref(false);
const alterarSalvando = ref(false);
const formAlterar = reactive({ dataHoraAbertura: "", dataHoraFechamento: "", token: "", observacao: "" });

function abrirAlterar() {
  const caixa = props.caixaAberto;
  formAlterar.dataHoraAbertura = caixa?.dataHoraAbertura ? dataHoraLocal(caixa.dataHoraAbertura) : "";
  formAlterar.dataHoraFechamento = caixa?.dataHoraFechamento ? dataHoraLocal(caixa.dataHoraFechamento) : "";
  formAlterar.token = "";
  formAlterar.observacao = "";
  alterarAberto.value = true;
}

async function confirmarAlterar() {
  const caixa = props.caixaAberto;
  if (!caixa) return;
  if (!formAlterar.observacao.trim()) {
    notificar("Informe o motivo (observacao) da alteracao.", "error");
    return;
  }
  if (!podeAlterarDireto.value && !formAlterar.token.trim()) {
    notificar("Informe o token gerado pelo autorizador.", "error");
    return;
  }
  const body: { dataHoraAbertura?: string; dataHoraFechamento?: string; token?: string; observacao: string } = {
    observacao: formAlterar.observacao.trim()
  };
  if (formAlterar.dataHoraAbertura) body.dataHoraAbertura = dataHoraParaUtc(formAlterar.dataHoraAbertura);
  if (formAlterar.dataHoraFechamento) body.dataHoraFechamento = dataHoraParaUtc(formAlterar.dataHoraFechamento);
  if (!podeAlterarDireto.value && formAlterar.token.trim()) body.token = formAlterar.token.trim();

  alterarSalvando.value = true;
  try {
    const resposta = await alterarHorario(caixa.id, body);
    const { anexadas, desanexadas } = resposta.revinculacao;
    notificar(`Horario alterado. Vendas: ${anexadas} anexada(s), ${desanexadas} desanexada(s).`);
    alterarAberto.value = false;
    emit("alterado");
  } catch (error) {
    notificar(error instanceof Error ? error.message : "Falha ao alterar o horario.", "error");
  } finally {
    alterarSalvando.value = false;
  }
}

// --- Operador solicita autorizacao ---
const solicitarAberto = ref(false);
const solicitarSalvando = ref(false);
const formSolicitar = reactive({ autorizadorId: "", observacao: "" });

async function abrirSolicitar() {
  formSolicitar.autorizadorId = "";
  formSolicitar.observacao = "";
  solicitarAberto.value = true;
  try {
    await carregarAutorizadores(props.empresaId);
  } catch (error) {
    notificar(error instanceof Error ? error.message : "Falha ao carregar autorizadores.", "error");
  }
}

async function confirmarSolicitar() {
  const caixa = props.caixaAberto;
  if (!caixa) return;
  if (!formSolicitar.autorizadorId) {
    notificar("Escolha um autorizador.", "error");
    return;
  }
  solicitarSalvando.value = true;
  try {
    await solicitarAutorizacao(caixa.id, {
      autorizadorId: formSolicitar.autorizadorId,
      observacao: formSolicitar.observacao.trim() || null
    });
    notificar("Solicitacao enviada. Peca o token ao autorizador.");
    solicitarAberto.value = false;
  } catch (error) {
    notificar(error instanceof Error ? error.message : "Falha ao solicitar autorizacao.", "error");
  } finally {
    solicitarSalvando.value = false;
  }
}

// --- Autorizador: fila de pendencias + gerar token ---
const pendentesAberto = ref(false);
const gerandoId = ref("");
const tokensGerados = reactive<Record<string, { token: string; expiraEm: string }>>({});

// silencioso: usado pelo polling — um 403/queda de rede a cada 30s nao pode virar chuva de toast.
async function recarregarPendentes(silencioso = false) {
  try {
    await carregarPendentes(props.empresaId);
  } catch (error) {
    if (silencioso) return;
    notificar(error instanceof Error ? error.message : "Falha ao carregar pendencias.", "error");
  }
}

async function abrirPendentes() {
  pendentesAberto.value = true;
  await recarregarPendentes();
}

async function gerarTokenPara(autorizacaoId: string) {
  gerandoId.value = autorizacaoId;
  try {
    tokensGerados[autorizacaoId] = await gerarToken(autorizacaoId);
    notificar("Token gerado. Compartilhe com o operador (validade 15 min).");
    await recarregarPendentes();
  } catch (error) {
    notificar(error instanceof Error ? error.message : "Falha ao gerar o token.", "error");
  } finally {
    gerandoId.value = "";
  }
}

// A fila de pendencias e da EMPRESA, nao do caixa: o autorizador (gerencia/admin) quase nunca tem
// caixa aberto e ficava cego as solicitacoes. Carrega e faz polling so com caixa_alterar_horario,
// independente de haver caixa aberto. Sem polling com a aba oculta (mesma regra do AppWorkspace).
const INTERVALO_PENDENTES_MS = 30_000;
let intervaloPendentes: ReturnType<typeof setInterval> | null = null;

function pararPollingPendentes() {
  if (!intervaloPendentes) return;
  clearInterval(intervaloPendentes);
  intervaloPendentes = null;
}

function iniciarPollingPendentes() {
  pararPollingPendentes();
  if (!podeAlterarDireto.value || !props.empresaId) return;
  void recarregarPendentes(true);
  intervaloPendentes = setInterval(() => {
    if (document.visibilityState === "visible") void recarregarPendentes(true);
  }, INTERVALO_PENDENTES_MS);
}

onMounted(iniciarPollingPendentes);
watch([podeAlterarDireto, () => props.empresaId], iniciarPollingPendentes);
onBeforeUnmount(pararPollingPendentes);
</script>

<template>
  <div v-if="caixaAberto || podeAlterarDireto" class="d-flex flex-wrap ga-2">
    <!-- Alterar/solicitar exigem um caixa aberto; a fila de autorizacoes nao (ver polling acima). -->
    <v-btn v-if="caixaAberto" variant="outlined" prepend-icon="mdi-clock-edit-outline" @click="abrirAlterar">
      Alterar horario
    </v-btn>

    <v-btn
      v-if="caixaAberto && !podeAlterarDireto"
      variant="text"
      prepend-icon="mdi-key-outline"
      @click="abrirSolicitar"
    >
      Solicitar autorizacao
    </v-btn>

    <v-badge v-if="podeAlterarDireto" :content="pendentes.length" :model-value="pendentes.length > 0" color="warning">
      <v-btn variant="text" prepend-icon="mdi-account-key-outline" @click="abrirPendentes">Autorizacoes</v-btn>
    </v-badge>

    <!-- Alterar horario -->
    <v-dialog v-model="alterarAberto" max-width="560">
      <v-card>
        <v-card-title>Alterar horario do caixa</v-card-title>
        <v-card-text>
          <v-row dense>
            <v-col cols="12" md="6">
              <v-text-field v-model="formAlterar.dataHoraAbertura" type="datetime-local" label="Abertura" />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                v-model="formAlterar.dataHoraFechamento"
                type="datetime-local"
                label="Fechamento (opcional)"
                clearable
              />
            </v-col>
            <v-col v-if="!podeAlterarDireto" cols="12">
              <v-text-field
                v-model="formAlterar.token"
                label="Token do autorizador *"
                prepend-inner-icon="mdi-key"
                hint="Codigo de 6 digitos gerado pelo autorizador (validade 15 min)."
                persistent-hint
              />
            </v-col>
            <v-col cols="12">
              <v-textarea v-model="formAlterar.observacao" label="Motivo (observacao) *" rows="2" />
            </v-col>
          </v-row>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="alterarSalvando" @click="alterarAberto = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="alterarSalvando" @click="confirmarAlterar">Alterar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Solicitar autorizacao -->
    <v-dialog v-model="solicitarAberto" max-width="480">
      <v-card>
        <v-card-title>Solicitar autorizacao</v-card-title>
        <v-card-text>
          <v-select
            v-model="formSolicitar.autorizadorId"
            :items="autorizadores"
            item-title="nome"
            item-value="usuarioId"
            label="Autorizador *"
          />
          <v-textarea v-model="formSolicitar.observacao" label="Motivo (opcional)" rows="2" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="solicitarSalvando" @click="solicitarAberto = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="solicitarSalvando" @click="confirmarSolicitar">Enviar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Fila do autorizador -->
    <v-dialog v-model="pendentesAberto" max-width="620" scrollable>
      <v-card>
        <v-card-title class="d-flex align-center justify-space-between">
          Autorizacoes pendentes
          <v-btn variant="text" size="small" prepend-icon="mdi-refresh" @click="recarregarPendentes">Atualizar</v-btn>
        </v-card-title>
        <v-card-text>
          <div v-if="carregandoPendentes" class="text-center py-6">
            <v-progress-circular indeterminate color="primary" />
          </div>
          <v-alert
            v-else-if="!pendentes.length"
            type="success"
            variant="tonal"
            density="comfortable"
            text="Nenhuma solicitacao pendente."
          />
          <v-list v-else>
            <v-list-item v-for="solicitacao in pendentes" :key="solicitacao.id" class="px-0">
              <v-list-item-title>{{ solicitacao.solicitanteNome }}</v-list-item-title>
              <v-list-item-subtitle>
                {{ solicitacao.observacao || "Sem motivo informado" }} — {{ formatarDataHora(solicitacao.criadoEm) }}
              </v-list-item-subtitle>
              <template #append>
                <div class="text-right">
                  <v-btn
                    v-if="!tokensGerados[solicitacao.id]"
                    size="small"
                    color="primary"
                    variant="tonal"
                    :loading="gerandoId === solicitacao.id"
                    @click="gerarTokenPara(solicitacao.id)"
                  >
                    Gerar token
                  </v-btn>
                  <div v-else>
                    <div class="text-h6 font-weight-bold">{{ tokensGerados[solicitacao.id]?.token }}</div>
                    <div class="text-caption text-medium-emphasis">
                      vale ate {{ formatarDataHora(tokensGerados[solicitacao.id]?.expiraEm ?? "") }}
                    </div>
                  </div>
                </div>
              </template>
            </v-list-item>
          </v-list>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="pendentesAberto = false">Fechar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="4000">{{ snackbar.text }}</v-snackbar>
  </div>
</template>
