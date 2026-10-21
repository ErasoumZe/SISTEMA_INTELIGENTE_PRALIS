<script setup lang="ts">
/**
 * Convites da rodada: logo apos a abertura (com o token em claro, para montar o link) ou ao reabrir
 * uma rodada ja em cotacao (sem token — so status). O token sai uma unica vez; por isso o link so
 * aparece quando o convite traz `token`.
 */
import type { RodadaConviteDto, RodadaDto } from "@padaria/shared";
import { linkDaRodada, mensagemDaRodada } from "~/utils/rodada-link";

const aberto = defineModel<boolean>({ required: true });
const props = defineProps<{ rodada: RodadaDto | null; empresaNome: string }>();
const emit = defineEmits<{ enviar: [conviteId: string] }>();

const copiado = ref<string | null>(null);
const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const ROTULO_STATUS: Record<string, string> = {
  aberto: "Aberto",
  aguardando_comprador: "Aguardando comprador",
  encerrado: "Encerrado",
  revogado: "Revogado"
};

const origem = computed(() => (typeof window !== "undefined" ? window.location.origin : ""));
const prazo = computed(() => (props.rodada ? DATA_HORA.format(new Date(props.rodada.expiraEm)) : ""));
const totalItens = computed(() => props.rodada?.itens.length ?? 0);

function link(token: string | undefined): string {
  return token ? linkDaRodada(origem.value, token) : "";
}

async function copiar(conviteId: string, token: string | undefined) {
  const url = link(token);
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    copiado.value = conviteId;
    setTimeout(() => (copiado.value = copiado.value === conviteId ? null : copiado.value), 1500);
  } catch {
    copiado.value = null;
  }
}

function whatsapp(convite: RodadaConviteDto) {
  const url = link(convite.token);
  const texto = mensagemDaRodada({
    fornecedorNome: convite.fornecedorNome,
    empresaNome: props.empresaNome,
    totalItens: totalItens.value,
    link: url,
    prazo: prazo.value
  });
  const digitos = (convite.fornecedorWhatsapp ?? "").replace(/\D/g, "");
  const base = digitos ? `https://wa.me/55${digitos}` : "https://wa.me/";
  window.open(`${base}?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  emit("enviar", convite.id);
}
</script>

<template>
  <v-dialog v-model="aberto" max-width="680" scrollable>
    <v-card v-if="rodada">
      <v-card-title class="d-flex align-center ga-2">
        <v-icon icon="mdi-send-outline" color="primary" />
        Convites da rodada #{{ rodada.numero }}
      </v-card-title>
      <v-card-subtitle>Prazo até {{ prazo }} · {{ totalItens }} item(ns)</v-card-subtitle>
      <v-card-text class="d-grid ga-3">
        <v-alert type="info" variant="tonal" density="compact">
          Envie o link a cada fornecedor. Ele vale uma única vez por convite e você vê o link agora — ao reabrir a
          rodada, só o status permanece.
        </v-alert>
        <div v-for="convite in rodada.convites" :key="convite.id" class="convite">
          <div class="convite__topo">
            <div>
              <strong>{{ convite.fornecedorNome }}</strong>
              <span v-if="convite.fornecedorWhatsapp" class="text-caption text-medium-emphasis ml-2">{{
                convite.fornecedorWhatsapp
              }}</span>
            </div>
            <v-chip size="x-small" variant="tonal" label>{{ ROTULO_STATUS[convite.status] ?? convite.status }}</v-chip>
          </div>
          <div v-if="convite.token" class="convite__acoes">
            <v-btn size="small" color="success" variant="tonal" prepend-icon="mdi-whatsapp" @click="whatsapp(convite)"
              >WhatsApp</v-btn
            >
            <v-btn
              size="small"
              variant="text"
              :prepend-icon="copiado === convite.id ? 'mdi-check' : 'mdi-content-copy'"
              @click="copiar(convite.id, convite.token)"
              >{{ copiado === convite.id ? "Copiado" : "Copiar link" }}</v-btn
            >
            <v-btn size="small" variant="text" @click="emit('enviar', convite.id)">Marcar enviado</v-btn>
          </div>
          <div v-else class="text-caption text-medium-emphasis">
            {{
              convite.enviadoEm ? "Enviado em " + DATA_HORA.format(new Date(convite.enviadoEm)) : "Ainda não enviado"
            }}
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
  gap: var(--cx-sp-2);
}

.convite__acoes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-2);
}
</style>
