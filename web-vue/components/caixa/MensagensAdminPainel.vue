<script setup lang="ts">
import { ref, watch } from "vue";
import type { LinhaHistoricoCaixa } from "@padaria/shared";
import type { MensagemAdmin, MensagemAdminDetalhe } from "@padaria/shared/mensagens-admin";
import type { Opcao } from "~/types/padaria";
import { mensagemErro } from "~/utils/domain";
import { formatarDataHora } from "~/utils/formatacao";
import { corSituacao, rotuloSituacao, useMensagensAdmin } from "~/composables/useMensagensAdmin";
import MensagemAdminEnvioDialog from "~/components/caixa/MensagemAdminEnvioDialog.vue";

// R-200: a mensagem administrativa nao tem tela nem menu proprio. Ela vive AQUI, dentro do Monitor
// de caixas abertos, que e onde o administrador ja esta olhando para os caixas que vai notificar.
const props = defineProps<{
  empresaId: string;
  pdvs: Opcao[];
  caixasAbertos: LinhaHistoricoCaixa[];
  podeEnviar: boolean;
}>();

const { listar, detalhar, encerrar } = useMensagensAdmin();

const mensagens = ref<MensagemAdmin[]>([]);
const detalhes = ref<Record<string, MensagemAdminDetalhe>>({});
const abertos = ref<string[]>([]);
const carregando = ref(false);
const erro = ref("");
const aviso = ref("");
const envioAberto = ref(false);

async function carregar() {
  if (!props.empresaId) return;
  carregando.value = true;
  erro.value = "";
  try {
    mensagens.value = await listar(props.empresaId);
  } catch (error) {
    erro.value = mensagemErro(error);
  } finally {
    carregando.value = false;
  }
}

// A situacao por destinatario so e buscada quando alguem abre a linha: o painel comum mostra o
// contador, e a lista completa de entregas nao precisa trafegar para todas as mensagens de uma vez.
async function abrir(mensagemId: string) {
  if (detalhes.value[mensagemId]) return;
  try {
    detalhes.value = { ...detalhes.value, [mensagemId]: await detalhar(mensagemId, props.empresaId) };
  } catch (error) {
    erro.value = mensagemErro(error);
  }
}

async function encerrarMensagem(mensagemId: string) {
  try {
    await encerrar(mensagemId, props.empresaId);
    aviso.value = "Mensagem encerrada. Ela para de alcançar quem abrir caixa.";
    await carregar();
  } catch (error) {
    erro.value = mensagemErro(error);
  }
}

function aoEnviar(destinatarios: number) {
  aviso.value =
    destinatarios === 0
      ? "Mensagem criada, mas nenhum destinatário foi alcançado agora. Quem abrir caixa dentro da validade vai receber."
      : `Mensagem enviada para ${destinatarios} ${destinatarios === 1 ? "destinatário" : "destinatários"}.`;
  void carregar();
}

watch(() => props.empresaId, carregar, { immediate: true });
</script>

<template>
  <section class="mensagens-painel" data-teste="mensagens-admin-painel">
    <div class="mensagens-painel__topo">
      <div>
        <div class="text-subtitle-2 font-weight-bold">Mensagens aos PDVs</div>
        <div class="text-caption text-medium-emphasis">
          Situação por destinatário e PDV: entregue, visualizada, confirmada ou fechada.
        </div>
      </div>
      <v-spacer />
      <v-btn
        v-if="podeEnviar"
        color="primary"
        variant="flat"
        size="small"
        prepend-icon="mdi-bullhorn-variant-outline"
        data-teste="abrir-envio-mensagem"
        @click="envioAberto = true"
      >
        Enviar mensagem
      </v-btn>
    </div>

    <v-alert v-if="erro" type="error" variant="tonal" density="compact" class="mt-3">{{ erro }}</v-alert>
    <v-alert
      v-if="aviso"
      type="success"
      variant="tonal"
      density="compact"
      closable
      class="mt-3"
      @click:close="aviso = ''"
    >
      {{ aviso }}
    </v-alert>

    <v-progress-linear v-if="carregando" indeterminate color="primary" class="mt-3" />

    <p v-else-if="!mensagens.length" class="text-body-2 text-medium-emphasis mt-3">Nenhuma mensagem enviada ainda.</p>

    <v-expansion-panels v-else v-model="abertos" multiple class="mt-3" @update:model-value="abertos.forEach(abrir)">
      <v-expansion-panel v-for="mensagem in mensagens" :key="mensagem.id" :value="mensagem.id">
        <v-expansion-panel-title>
          <div class="mensagens-painel__linha">
            <span class="mensagens-painel__titulo">{{ mensagem.titulo }}</span>
            <v-chip
              size="x-small"
              :color="mensagem.totalConfirmadas === mensagem.totalDestinatarios ? 'success' : 'warning'"
              variant="tonal"
            >
              {{ mensagem.totalConfirmadas }} de {{ mensagem.totalDestinatarios }} confirmaram
            </v-chip>
            <v-chip v-if="mensagem.status === 'encerrada'" size="x-small" variant="tonal">Encerrada</v-chip>
            <span class="mensagens-painel__data">{{ formatarDataHora(mensagem.criadoEm) }}</span>
          </div>
        </v-expansion-panel-title>

        <v-expansion-panel-text>
          <p class="mensagens-painel__corpo">{{ mensagem.corpo }}</p>
          <p v-if="mensagem.validoAte" class="text-caption text-medium-emphasis">
            Válida até {{ formatarDataHora(mensagem.validoAte) }}.
          </p>

          <div class="responsive-table-shell mt-2">
            <v-table density="compact">
              <thead>
                <tr>
                  <th>Destinatário</th>
                  <th>PDV</th>
                  <th>Situação</th>
                  <th>Quando</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="entrega in detalhes[mensagem.id]?.entregas ?? []" :key="entrega.id">
                  <td>{{ entrega.destinatarioNome ?? "Sem nome" }}</td>
                  <td>{{ entrega.pdvNome ?? "Sem caixa aberto" }}</td>
                  <td>
                    <v-chip size="x-small" :color="corSituacao(entrega.situacao)" variant="tonal">
                      {{ rotuloSituacao(entrega.situacao) }}
                    </v-chip>
                  </td>
                  <td>
                    {{
                      formatarDataHora(
                        entrega.confirmadaEm ?? entrega.fechadaEm ?? entrega.visualizadaEm ?? entrega.entregueEm ?? ""
                      ) || "—"
                    }}
                  </td>
                </tr>
                <tr v-if="!(detalhes[mensagem.id]?.entregas ?? []).length">
                  <td colspan="4" class="text-medium-emphasis">Nenhum destinatário registrado.</td>
                </tr>
              </tbody>
            </v-table>
          </div>

          <div v-if="podeEnviar && mensagem.status === 'ativa'" class="mt-3">
            <v-btn
              size="small"
              variant="outlined"
              prepend-icon="mdi-close-circle-outline"
              @click="encerrarMensagem(mensagem.id)"
            >
              Encerrar mensagem
            </v-btn>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <MensagemAdminEnvioDialog
      v-model="envioAberto"
      :empresa-id="empresaId"
      :pdvs="pdvs"
      :caixas-abertos="caixasAbertos"
      @enviada="aoEnviar"
      @erro="erro = $event"
    />
  </section>
</template>

<style scoped>
.mensagens-painel {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--cx-line-soft);
}

.mensagens-painel__topo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.mensagens-painel__linha {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.mensagens-painel__titulo {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.mensagens-painel__data {
  margin-left: auto;
  font-size: 0.78rem;
  color: var(--cx-ink-soft);
}

.mensagens-painel__corpo {
  margin: 0 0 8px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@media (width <= 560px) {
  .mensagens-painel__data {
    margin-left: 0;
  }
}
</style>
