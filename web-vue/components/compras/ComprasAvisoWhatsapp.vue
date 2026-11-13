<script setup lang="ts">
/**
 * Aviso das telas de Compras quando o WhatsApp das cotações cai (13/11/2026). A instância da Evolution desconecta
 * quando o celular remove o aparelho ou fica muito tempo sem internet: as cotações ficam na fila e saem sozinhas
 * depois que alguém escaneia o QR de novo. Sem o aviso, a tela dizia "Enviado" e nada chegava.
 */
import { onMounted, ref } from "vue";
import type { EstadoWhatsappDto } from "@padaria/shared";

const { apiGet } = useApi();
const estado = ref<EstadoWhatsappDto["estado"] | null>(null);

onMounted(async () => {
  try {
    estado.value = (await apiGet<EstadoWhatsappDto>("/api/compras/whatsapp/estado")).estado;
  } catch {
    // Sem resposta, a tela segue sem o aviso: ele é ajuda, não trava nada.
  }
});
</script>

<template>
  <v-alert
    v-if="estado === 'desconectado'"
    type="warning"
    variant="tonal"
    prominent
    icon="mdi-whatsapp"
    title="O WhatsApp das cotações está desconectado"
    data-aviso="whatsapp-desconectado"
  >
    As cotações ficam na fila e saem sozinhas quando ele reconectar. Para reconectar, um administrador gera o QR Code no
    painel da Evolution e escaneia com o WhatsApp Business da padaria (Dispositivos conectados → Conectar dispositivo).
  </v-alert>
</template>
