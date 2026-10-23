<script setup lang="ts">
/**
 * Convites da rodada (doc 57 §3): o sistema manda o link pelo WhatsApp, e aqui o comprador vê se saiu, se
 * está na fila ou se falhou, e pode reenviar. Copiar o link é o plano B: só aparece com o WhatsApp
 * desconectado ou com falha, e só logo após a abertura (o token sai uma única vez).
 */
import type { RodadaConviteDto, RodadaDto } from "@padaria/shared";
import { mensagemErro } from "~/utils/domain";
import { linkDaRodada } from "~/utils/rodada-link";

const aberto = defineModel<boolean>({ required: true });
const props = defineProps<{ rodada: RodadaDto | null; empresaId: string }>();
const emit = defineEmits<{ reenviado: [] }>();
const { apiPost } = useApi();

const copiado = ref<string | null>(null);
const reenviando = ref<string | null>(null);
const erro = ref("");
const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const ROTULO_STATUS: Record<string, string> = {
  aberto: "Aguardando resposta",
  aguardando_comprador: "Respondeu",
  encerrado: "Encerrado",
  revogado: "Revogado"
};

const prazo = computed(() => (props.rodada ? DATA_HORA.format(new Date(props.rodada.expiraEm)) : ""));
const totalItens = computed(() => props.rodada?.itens.length ?? 0);

function envio(convite: RodadaConviteDto): { texto: string; cor: string; icone: string } {
  if (!convite.whatsapp) return { texto: "Não enviado", cor: "secondary", icone: "mdi-clock-outline" };
  if (convite.whatsapp.status === "enviado")
    return { texto: "Enviado pelo WhatsApp", cor: "success", icone: "mdi-whatsapp" };
  if (convite.whatsapp.status === "falhou") return { texto: "Falhou", cor: "error", icone: "mdi-alert-circle-outline" };
  return props.rodada?.whatsappConectado
    ? { texto: "Na fila do WhatsApp", cor: "info", icone: "mdi-progress-clock" }
    : { texto: "WhatsApp não conectado", cor: "warning", icone: "mdi-link-off" };
}

const planoB = (convite: RodadaConviteDto) =>
  Boolean(convite.token) && (!props.rodada?.whatsappConectado || convite.whatsapp?.status === "falhou");
const podeReenviar = (convite: RodadaConviteDto) =>
  convite.status === "aberto" || convite.status === "aguardando_comprador";

async function copiar(convite: RodadaConviteDto) {
  if (!convite.token) return;
  try {
    await navigator.clipboard.writeText(linkDaRodada(window.location.origin, convite.token));
    copiado.value = convite.id;
    setTimeout(() => (copiado.value = copiado.value === convite.id ? null : copiado.value), 1500);
  } catch {
    copiado.value = null;
  }
}

async function reenviar(convite: RodadaConviteDto) {
  if (!props.rodada) return;
  reenviando.value = convite.id;
  erro.value = "";
  try {
    await apiPost(`/api/compras/rodadas/${props.rodada.id}/convites/${convite.id}/reenviar`, {
      empresaId: props.empresaId
    });
    emit("reenviado");
  } catch (causa) {
    erro.value = mensagemErro(causa);
  } finally {
    reenviando.value = null;
  }
}
</script>

<template>
  <v-dialog v-model="aberto" max-width="680" scrollable>
    <v-card v-if="rodada">
      <v-card-title class="d-flex align-center ga-2">
        <v-icon icon="mdi-send-outline" color="primary" />
        Convites da cotação #{{ rodada.numero }}
      </v-card-title>
      <v-card-subtitle>Prazo até {{ prazo }} · {{ totalItens }} item(ns)</v-card-subtitle>
      <v-card-text class="d-grid ga-3">
        <v-alert v-if="!rodada.whatsappConectado" type="warning" variant="tonal" density="compact">
          O WhatsApp da empresa ainda não está conectado: as mensagens ficam na fila. Enquanto isso, copie o link de
          cada fornecedor e mande você mesmo.
        </v-alert>
        <v-alert v-if="erro" type="error" variant="tonal" density="compact">{{ erro }}</v-alert>
        <p v-if="!rodada.convites.length" class="text-body-2 text-medium-emphasis">
          Nenhum fornecedor convidado: os itens estão “A fazer” em Pedidos.
        </p>
        <div v-for="convite in rodada.convites" :key="convite.id" class="convite" data-bloco="convite">
          <div class="convite__topo">
            <div>
              <strong>{{ convite.fornecedorNome }}</strong>
              <span v-if="convite.fornecedorWhatsapp" class="text-caption text-medium-emphasis ml-2">{{
                convite.fornecedorWhatsapp
              }}</span>
              <div class="text-caption text-medium-emphasis">
                {{ convite.rodadaItemIds.length }} item(ns) · {{ ROTULO_STATUS[convite.status] ?? convite.status }}
              </div>
            </div>
            <v-chip
              size="small"
              variant="tonal"
              label
              :color="envio(convite).cor"
              :prepend-icon="envio(convite).icone"
              >{{ envio(convite).texto }}</v-chip
            >
          </div>
          <p v-if="convite.whatsapp?.status === 'falhou' && convite.whatsapp.erro" class="text-caption text-error">
            {{ convite.whatsapp.erro }}
          </p>
          <div class="convite__acoes">
            <v-btn
              v-if="podeReenviar(convite)"
              size="small"
              variant="tonal"
              color="primary"
              prepend-icon="mdi-send-variant-outline"
              :loading="reenviando === convite.id"
              @click="reenviar(convite)"
              >Reenviar</v-btn
            >
            <v-btn
              v-if="planoB(convite)"
              size="small"
              variant="text"
              :prepend-icon="copiado === convite.id ? 'mdi-check' : 'mdi-content-copy'"
              @click="copiar(convite)"
              >{{ copiado === convite.id ? "Copiado" : "Copiar link" }}</v-btn
            >
          </div>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="aberto = false">Fechar</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.convite {
  display: grid;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-3);
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface-raised);
}

.convite__topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--cx-sp-2);
}

.convite__acoes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-2);
}
</style>
