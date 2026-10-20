<script setup lang="ts">
import { ehAdministradorTotal, ehTesouraria, type AuthSession } from "@padaria/shared";
import { permissoes } from "~/utils/domain";
import type { ItemMenu } from "~/types/padaria";
import CadastroTablePage from "~/components/cadastros/CadastroTablePage.vue";

const props = defineProps<{
  telaAtual: ItemMenu | null | undefined;
  descricao: string;
  colunas: string[];
  linhas: Array<Record<string, string | undefined>>;
  empresaId: string;
  abrirNovo: () => void;
  abrirImportacao: () => void;
  abrirExportacao: (linha: Record<string, string | undefined>) => void;
  abrirEdicao: (linha: Record<string, string | undefined>) => void;
  recarregar: () => Promise<void>;
  notificar: (texto: string, cor?: string) => void;
}>();

const { apiPost } = useApi();
const sessao = useState<AuthSession | null>("padaria.workspace.sessao");
const podeAjustarSaldo = computed(() => {
  const perfil = sessao.value?.perfil;
  return Boolean(perfil && (ehAdministradorTotal(perfil) || ehTesouraria(perfil)));
});

const modalAberto = ref(false);
const modo = ref<"individual" | "zerar">("individual");
const contaSelecionada = ref<Record<string, string | undefined> | null>(null);
const saldoDesejado = ref("");
const motivo = ref("");
const salvando = ref(false);

const contasComSaldo = computed(() =>
  props.linhas.filter((linha) => {
    const saldo = String(linha.saldo_atual ?? "")
      .replaceAll(" ", " ")
      .trim();
    return saldo && saldo !== "R$ 0,00";
  })
);
const tituloModal = computed(() => (modo.value === "zerar" ? "Zerar saldos atuais" : "Ajustar saldo atual"));

function abrirAjuste(linha: Record<string, string | undefined>) {
  modo.value = "individual";
  contaSelecionada.value = linha;
  saldoDesejado.value = "";
  motivo.value = "";
  modalAberto.value = true;
}

function abrirZeragem() {
  modo.value = "zerar";
  contaSelecionada.value = null;
  saldoDesejado.value = "0";
  motivo.value = "Zeragem inicial dos saldos para inicio da operacao";
  modalAberto.value = true;
}

async function salvarAjuste() {
  const motivoLimpo = motivo.value.trim();
  if (motivoLimpo.length < 5) {
    props.notificar("Informe uma justificativa com pelo menos 5 caracteres.", "error");
    return;
  }
  if (modo.value === "individual" && (!saldoDesejado.value.trim() || !Number.isFinite(Number(saldoDesejado.value)))) {
    props.notificar("Informe o saldo desejado.", "error");
    return;
  }

  salvando.value = true;
  try {
    if (modo.value === "zerar") {
      const resultado = await apiPost<{ ajustadas: Array<{ contaId: string }> }>("/api/contas/ajustes/zerar", {
        empresaId: props.empresaId,
        motivo: motivoLimpo
      });
      props.notificar(`${resultado.ajustadas.length} conta(s) tiveram o saldo ajustado para R$ 0,00.`, "success");
    } else if (contaSelecionada.value?.id) {
      await apiPost(`/api/contas/${encodeURIComponent(contaSelecionada.value.id)}/ajustes`, {
        empresaId: props.empresaId,
        saldoDesejado: Number(saldoDesejado.value),
        motivo: motivoLimpo
      });
      props.notificar("Saldo atual ajustado e registrado no historico.", "success");
    }
    modalAberto.value = false;
    await props.recarregar();
  } catch (error) {
    props.notificar(error instanceof Error ? error.message : "Nao foi possivel ajustar o saldo.", "error");
  } finally {
    salvando.value = false;
  }
}

function lidarExtra(payload: { event: string; linha: Record<string, string | undefined> }) {
  if (payload.event === "ajustarSaldo") abrirAjuste(payload.linha);
}
</script>

<template>
  <v-alert v-if="podeAjustarSaldo" type="info" variant="tonal" class="mb-4" icon="mdi-scale-balance">
    <div class="d-flex flex-column flex-sm-row align-sm-center justify-space-between ga-3">
      <div>
        <strong>Ajuste de saldo auditado</strong>
        <div class="text-body-2">
          Ajustes preservam os movimentos anteriores; entradas e saídas seguem abatendo normalmente.
        </div>
      </div>
      <v-btn
        color="error"
        variant="outlined"
        prepend-icon="mdi-refresh"
        :disabled="!contasComSaldo.length"
        @click="abrirZeragem"
      >
        Zerar saldos
      </v-btn>
    </div>
  </v-alert>

  <CadastroTablePage
    tela="contas"
    :tela-atual="telaAtual"
    :descricao="descricao"
    :colunas="colunas"
    :linhas="linhas"
    :permissoes-filtro="[...permissoes]"
    :pode-excluir="false"
    :pode-exportar="false"
    :acoes-extras-externas="podeAjustarSaldo ? [{ label: 'Ajustar saldo', event: 'ajustarSaldo' }] : []"
    @acionar="abrirNovo"
    @importar="abrirImportacao"
    @exportar="abrirExportacao"
    @editar="abrirEdicao"
    @extra="lidarExtra"
  />

  <v-dialog v-model="modalAberto" max-width="620" persistent>
    <v-card>
      <v-card-title>{{ tituloModal }}</v-card-title>
      <v-card-text class="pt-2">
        <template v-if="modo === 'individual'">
          <p class="text-body-2 mb-4">
            Conta: <strong>{{ contaSelecionada?.nome }}</strong
            >. Saldo atual: <strong>{{ contaSelecionada?.saldo_atual }}</strong
            >.
          </p>
          <v-text-field v-model="saldoDesejado" label="Saldo atual desejado" type="number" step="0.01" prefix="R$" />
        </template>
        <template v-else>
          <p class="text-body-2 mb-2">As contas abaixo receberão um ajuste para saldo atual de R$ 0,00.</p>
          <v-list density="compact" class="border rounded mb-4">
            <v-list-item
              v-for="conta in contasComSaldo"
              :key="conta.id"
              :title="conta.nome"
              :subtitle="`Saldo atual: ${conta.saldo_atual}`"
            />
          </v-list>
          <p class="text-caption text-medium-emphasis">
            Movimentos históricos não serão apagados; a zeragem fica registrada por conta.
          </p>
        </template>
        <v-textarea v-model="motivo" label="Justificativa obrigatória" rows="3" counter="500" />
      </v-card-text>
      <v-card-actions class="px-6 pb-5">
        <v-spacer />
        <v-btn variant="text" :disabled="salvando" @click="modalAberto = false">Cancelar</v-btn>
        <v-btn color="primary" :loading="salvando" @click="salvarAjuste">
          {{ modo === "zerar" ? "Confirmar zeragem" : "Registrar ajuste" }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
