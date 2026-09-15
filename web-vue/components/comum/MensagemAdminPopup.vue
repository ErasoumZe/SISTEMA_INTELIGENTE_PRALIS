<script setup lang="ts">
import { computed, watch } from "vue";
import type { MensagemAdminDoOperador } from "@padaria/shared/mensagens-admin";

// Pop-up do operador (R-194). Componente BURRO de proposito: recebe a mensagem e emite intencao.
// Quem fala com a API e o workspace — assim este arquivo e testavel sem runtime de rede e o pop-up
// nao vira um segundo lugar que sabe montar URL de mensagem.
const props = defineProps<{ mensagem: MensagemAdminDoOperador | null }>();
const emit = defineEmits<{
  (event: "visualizada", entregaId: string): void;
  (event: "confirmar", entregaId: string): void;
  (event: "fechar", entregaId: string): void;
}>();

const aberto = computed(() => Boolean(props.mensagem));

// Ver a mensagem na tela E a visualizacao. Carimbar so no clique deixaria o administrador sem saber
// a diferenca entre "nao chegou" e "chegou, ficou na tela e a pessoa ignorou".
watch(
  () => props.mensagem?.entregaId,
  (entregaId) => {
    if (entregaId && !props.mensagem?.visualizadaEm) emit("visualizada", entregaId);
  },
  { immediate: true }
);

function quando(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
</script>

<template>
  <!-- `persistent`: some so pelos dois botoes. Clique fora fecharia sem registrar nada, e o
       administrador ficaria sem saber se a mensagem foi lida ou so espantada da tela. -->
  <v-dialog :model-value="aberto" persistent max-width="520" scrollable class="mensagem-admin-dialog">
    <v-card v-if="mensagem" class="mensagem-admin" data-teste="mensagem-admin-popup">
      <div class="mensagem-admin__faixa">
        <v-icon size="20">mdi-bullhorn-variant-outline</v-icon>
        <span>Mensagem da administração</span>
      </div>

      <v-card-title class="mensagem-admin__titulo">{{ mensagem.titulo }}</v-card-title>

      <v-card-text class="mensagem-admin__corpo">
        <p class="mensagem-admin__texto">{{ mensagem.corpo }}</p>
        <p class="mensagem-admin__data">Enviada em {{ quando(mensagem.criadoEm) }}</p>
      </v-card-text>

      <v-card-actions class="mensagem-admin__acoes">
        <!-- "Fechar" ADIA: dispensa o pop-up nesta sessao e a mensagem continua no sino ate
             "Entendi". O rotulo diz isso, para ninguem achar que dispensou resolvido. -->
        <v-btn variant="text" class="mensagem-admin__btn" @click="emit('fechar', mensagem.entregaId)"> Fechar </v-btn>
        <v-spacer />
        <v-btn
          color="primary"
          variant="flat"
          class="mensagem-admin__btn"
          prepend-icon="mdi-check"
          data-teste="mensagem-admin-entendi"
          @click="emit('confirmar', mensagem.entregaId)"
        >
          Entendi
        </v-btn>
      </v-card-actions>

      <p class="mensagem-admin__rodape">Fechar apenas adia. A mensagem continua no sino até você confirmar.</p>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.mensagem-admin {
  display: flex;
  flex-direction: column;
  /* §13.3: o card nunca passa da janela do celular, mesmo com a barra do navegador. */
  max-height: 88dvh;
}

.mensagem-admin__faixa {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background: var(--cx-brand);
  color: var(--cx-brand-on);
  font-size: 0.82rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.mensagem-admin__titulo {
  padding: 16px 20px 4px;
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.25;
  text-wrap: balance;
  white-space: normal;
}

.mensagem-admin__corpo {
  padding: 8px 20px 4px;
}

.mensagem-admin__texto {
  margin: 0;
  font-size: 1rem;
  line-height: 1.55;
  /* O corpo vem de um campo de texto livre: quebras de linha do autor valem. */
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--cx-ink);
}

.mensagem-admin__data {
  margin: 12px 0 0;
  font-size: 0.8rem;
  color: var(--cx-ink-soft);
}

.mensagem-admin__acoes {
  /* Grudada no rodape: numa mensagem longa, o operador nao precisa rolar ate o fim para responder. */
  position: sticky;
  bottom: 0;
  gap: 8px;
  padding: 12px 16px 4px;
  background: var(--cx-surface);
  border-top: 1px solid var(--cx-line-soft);
}

.mensagem-admin__btn {
  /* Alvo de toque de 44px: este pop-up e operado em celular, no balcao. */
  min-height: 44px;
  padding-inline: 18px;
}

.mensagem-admin__rodape {
  margin: 0;
  padding: 0 20px 16px;
  font-size: 0.78rem;
  line-height: 1.45;
  color: var(--cx-ink-soft);
}

@media (width <= 480px) {
  .mensagem-admin__acoes {
    flex-wrap: wrap;
  }
  .mensagem-admin__btn {
    flex: 1 1 100%;
  }
}
</style>
