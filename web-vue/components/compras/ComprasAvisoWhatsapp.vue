<script setup lang="ts">
/**
 * Aviso das telas de Compras quando o WhatsApp das cotações cai (13/11/2026). A instância da Evolution desconecta
 * quando o celular remove o aparelho ou a sessão é derrubada: as cotações ficam na fila e saem sozinhas depois que
 * alguém escaneia o QR de novo. Só aparece quando a Evolution responde que a instância está fechada (16/11/2026):
 * consulta que falha não vira aviso de queda.
 */
import { onMounted, ref } from "vue";
import type { EstadoWhatsappDto } from "@padaria/shared";

const { apiGet } = useApi();
const situacao = ref<EstadoWhatsappDto | null>(null);

onMounted(async () => {
  try {
    situacao.value = await apiGet<EstadoWhatsappDto>("/api/compras/whatsapp/estado");
  } catch {
    // Sem resposta, a tela segue sem o aviso: ele é ajuda, não trava nada.
  }
});
</script>

<template>
  <v-alert
    v-if="situacao?.estado === 'desconectado'"
    type="warning"
    variant="tonal"
    prominent
    icon="mdi-whatsapp"
    title="O WhatsApp das cotações está desconectado"
    data-aviso="whatsapp-desconectado"
  >
    As cotações ficam na fila e saem sozinhas quando ele reconectar. Para reconectar, um administrador gera o QR Code no
    painel da Evolution e escaneia com o WhatsApp Business da padaria (Dispositivos conectados → Conectar dispositivo).
    <span v-if="situacao.detalhe" class="d-block text-caption mt-1">{{ situacao.detalhe }}</span>
  </v-alert>
</template>
