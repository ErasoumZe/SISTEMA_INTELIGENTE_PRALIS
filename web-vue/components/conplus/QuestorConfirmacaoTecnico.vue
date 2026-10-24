<script setup lang="ts">
/**
 * Confirmação antes de baixar um arquivo TÉCNICO. Ele tem o mesmo layout do oficial e o Questor não lê o
 * nome do arquivo: se for importado, os lançamentos entram de verdade. O servidor também exige a
 * confirmação (`confirmacaoArquivoTecnico`) e registra o download na auditoria.
 */
const aberto = defineModel<boolean>({ required: true });
const emit = defineEmits<{ confirmar: [] }>();
const entendido = ref(false);

watch(aberto, (valor) => {
  if (valor) entendido.value = false;
});

function confirmar() {
  if (!entendido.value) return;
  aberto.value = false;
  emit("confirmar");
}
</script>

<template>
  <v-dialog v-model="aberto" max-width="520">
    <v-card>
      <v-card-title class="d-flex align-center ga-2">
        <v-icon color="warning" icon="mdi-alert" />
        Arquivo técnico — não importar
      </v-card-title>
      <v-card-text class="confirmacao">
        <p>
          Este arquivo serve só para <strong>conferência e amostra para a Conplus</strong>. Ele segue o layout oficial:
          se for importado no Questor, os dados entram de verdade e podem gerar lançamento em dobro quando o oficial for
          gerado.
        </p>
        <ul>
          <li>O nome começa com <code>TECNICO-NAO-IMPORTAR</code>, mas o Questor não lê o nome.</li>
          <li>O Pralís não envia este arquivo a ninguém; o download fica registrado com o seu usuário.</li>
        </ul>
        <v-checkbox
          v-model="entendido"
          color="warning"
          hide-details
          label="Entendi: este arquivo NÃO será importado no Questor"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="aberto = false">Cancelar</v-btn>
        <v-btn color="warning" variant="flat" :disabled="!entendido" @click="confirmar">Baixar arquivo técnico</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.confirmacao {
  display: grid;
  gap: 8px;
}
.confirmacao p,
.confirmacao ul {
  margin: 0;
}
</style>
