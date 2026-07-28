<script setup lang="ts">
// Cadastro do vinculo USUARIO <-> CONTAS (FOTO 4). Lista as contas da empresa com um checkbox por
// linha: marcado = o usuario opera aquela conta. Reusa os endpoints CRUD de /api/contas-usuarios
// (nao inventa UX nova). Marcar => POST; desmarcar => DELETE. Escopo/permissao ficam no backend.
import { ref, watch } from "vue";
import type { Opcao } from "~/types/padaria";
import { useApi } from "~/composables/useApi";
import { mensagemErro } from "~/utils/domain";

const props = defineProps<{
  modelValue: boolean;
  usuario: { usuarioId: string; nome: string } | null;
  empresaId: string;
}>();
const emit = defineEmits<{ (event: "update:modelValue", valor: boolean): void }>();

const { apiGet, apiPost, apiDelete } = useApi();

const contas = ref<Opcao[]>([]);
// contaId -> id do vinculo (para o DELETE). Presenca da chave = vinculada.
const vinculoPorConta = ref<Record<string, string>>({});
const carregando = ref(false);
const salvandoId = ref("");
const erro = ref("");

async function carregar() {
  if (!props.usuario || !props.empresaId) return;
  carregando.value = true;
  erro.value = "";
  try {
    const q = `?empresaId=${props.empresaId}`;
    const [todas, atuais] = await Promise.all([
      apiGet<Opcao[]>(`/api/contas${q}`),
      apiGet<Array<{ id: string; contaId: string }>>(`/api/contas-usuarios${q}&usuarioId=${props.usuario.usuarioId}`)
    ]);
    contas.value = todas;
    vinculoPorConta.value = Object.fromEntries(atuais.map((v) => [v.contaId, v.id]));
  } catch (error) {
    erro.value = mensagemErro(error);
  } finally {
    carregando.value = false;
  }
}

watch(
  () => props.modelValue,
  (aberto) => {
    if (aberto) void carregar();
  }
);

async function alternar(contaId: string, marcar: boolean) {
  if (!props.usuario) return;
  salvandoId.value = contaId;
  erro.value = "";
  try {
    if (marcar) {
      const criado = await apiPost<{ id: string }>("/api/contas-usuarios", {
        empresaId: props.empresaId,
        contaId,
        usuarioId: props.usuario.usuarioId
      });
      vinculoPorConta.value = { ...vinculoPorConta.value, [contaId]: criado.id };
    } else {
      const id = vinculoPorConta.value[contaId];
      if (id) await apiDelete(`/api/contas-usuarios/${id}`);
      const copia = { ...vinculoPorConta.value };
      delete copia[contaId];
      vinculoPorConta.value = copia;
    }
  } catch (error) {
    erro.value = mensagemErro(error);
  } finally {
    salvandoId.value = "";
  }
}
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="520" @update:model-value="emit('update:modelValue', $event)">
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center ga-2">
        <v-icon icon="mdi-bank-outline" size="20" /> Contas de {{ usuario?.nome || "usuário" }}
      </v-card-title>
      <v-card-subtitle>Marque as contas que este usuário pode operar (origem/destino e lançamentos).</v-card-subtitle>
      <v-card-text>
        <v-alert v-if="erro" type="error" variant="tonal" density="compact" class="mb-3">{{ erro }}</v-alert>
        <div v-if="carregando" class="text-center py-6"><v-progress-circular indeterminate color="primary" /></div>
        <div v-else-if="!contas.length" class="text-medium-emphasis py-4">Nenhuma conta cadastrada nesta empresa.</div>
        <v-list v-else density="compact" class="py-0">
          <v-list-item v-for="conta in contas" :key="conta.id" class="px-1">
            <template #prepend>
              <v-checkbox-btn
                :model-value="conta.id in vinculoPorConta"
                :disabled="salvandoId === conta.id"
                color="primary"
                @update:model-value="alternar(conta.id, Boolean($event))"
              />
            </template>
            <v-list-item-title>{{ conta.nome }}</v-list-item-title>
            <template #append>
              <v-progress-circular v-if="salvandoId === conta.id" indeterminate size="18" width="2" color="primary" />
            </template>
          </v-list-item>
        </v-list>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="emit('update:modelValue', false)">Fechar</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
