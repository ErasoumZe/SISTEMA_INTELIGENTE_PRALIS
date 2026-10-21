<script setup lang="ts">
/**
 * Abertura da rodada de cotacao multi-fornecedor (Fase 2, R-219/R-221).
 *
 * Seletor multiplo de fornecedores com cadastro rapido inline. Fornecedor inativo ou sem WhatsApp
 * valido aparece, mas nao pode ser marcado — o motivo fica a vista (podeConvidar, a mesma regra do
 * servidor). Para E3 todos os itens da solicitacao vao a cada fornecedor marcado (o default do
 * seletor); o backend ja suporta subconjunto por fornecedor para quando a tela precisar.
 */
import { podeConvidar } from "@padaria/shared";
import type { Opcao } from "~/types/padaria";
import { mensagemErro } from "~/utils/domain";

type SolicitacaoItem = { id: string };
const aberto = defineModel<boolean>({ required: true });
const props = defineProps<{
  empresaId: string;
  itens: SolicitacaoItem[];
  fornecedores: Opcao[];
  salvando: boolean;
}>();
const emit = defineEmits<{ abrir: [payload: AberturaPayload] }>();

export type AberturaPayload = {
  convites: Array<{ fornecedorId: string; solicitacaoItemIds: string[] }>;
  prazoRespostaHoras: number | null;
  tetoValor: number | null;
};

const { apiPost } = useApi();
const selecionados = ref<string[]>([]);
const prazoHoras = ref<string>("");
const teto = ref<string>("");
const erroCadastro = ref("");
const criandoFornecedor = ref(false);
const mostrarCadastro = ref(false);
const novoNome = ref("");
const novoWhatsapp = ref("");
const extras = ref<Opcao[]>([]);

const fornecedoresLocais = computed<Opcao[]>(() => [...props.fornecedores, ...extras.value]);
const motivoDe = (fornecedor: Opcao) =>
  podeConvidar({ situacao: fornecedor.situacao ?? null, whatsapp: fornecedor.whatsapp ?? null });

const impedimento = computed(() => {
  if (!selecionados.value.length) return "Escolha ao menos um fornecedor.";
  return "";
});

watch(aberto, (valor) => {
  if (valor) {
    selecionados.value = [];
    prazoHoras.value = "";
    teto.value = "";
    mostrarCadastro.value = false;
    novoNome.value = "";
    novoWhatsapp.value = "";
    erroCadastro.value = "";
  }
});

function alternar(fornecedor: Opcao) {
  if (motivoDe(fornecedor)) return;
  const indice = selecionados.value.indexOf(fornecedor.id);
  if (indice >= 0) selecionados.value.splice(indice, 1);
  else selecionados.value.push(fornecedor.id);
}

async function cadastrarRapido() {
  if (!novoNome.value.trim()) {
    erroCadastro.value = "Informe o nome do fornecedor.";
    return;
  }
  criandoFornecedor.value = true;
  erroCadastro.value = "";
  try {
    const criado = await apiPost<{ id: string }>("/api/fornecedores", {
      empresaId: props.empresaId,
      nome: novoNome.value.trim(),
      whatsapp: novoWhatsapp.value.trim() || null
    });
    const opcao: Opcao = {
      id: criado.id,
      nome: novoNome.value.trim(),
      whatsapp: novoWhatsapp.value.trim() || undefined,
      situacao: "ativo"
    };
    extras.value.push(opcao);
    if (!motivoDe(opcao)) selecionados.value.push(opcao.id);
    novoNome.value = "";
    novoWhatsapp.value = "";
    mostrarCadastro.value = false;
  } catch (causa) {
    erroCadastro.value = mensagemErro(causa);
  } finally {
    criandoFornecedor.value = false;
  }
}

function abrir() {
  if (impedimento.value) return;
  const solicitacaoItemIds = props.itens.map((item) => item.id);
  emit("abrir", {
    convites: selecionados.value.map((fornecedorId) => ({ fornecedorId, solicitacaoItemIds })),
    prazoRespostaHoras: prazoHoras.value ? Number(prazoHoras.value) : null,
    tetoValor: teto.value ? Number(teto.value) : null
  });
}
</script>

<template>
  <v-dialog v-model="aberto" max-width="640" scrollable>
    <v-card>
      <v-card-title class="d-flex align-center ga-2">
        <v-icon icon="mdi-account-multiple-plus-outline" color="primary" />
        Abrir rodada de cotação
      </v-card-title>
      <v-card-subtitle>
        Convide um ou mais fornecedores. A necessidade é a mesma; cada um cota os {{ itens.length }} item(ns).
      </v-card-subtitle>
      <v-card-text class="d-grid ga-4">
        <div>
          <div class="d-flex align-center justify-space-between mb-1">
            <span class="text-subtitle-2">Fornecedores</span>
            <v-btn size="small" variant="text" prepend-icon="mdi-plus" @click="mostrarCadastro = !mostrarCadastro"
              >Cadastro rápido</v-btn
            >
          </div>

          <v-expand-transition>
            <div v-if="mostrarCadastro" class="cadastro-rapido mb-2">
              <v-text-field v-model="novoNome" label="Nome do fornecedor" density="compact" hide-details="auto" />
              <v-text-field
                v-model="novoWhatsapp"
                label="WhatsApp (com DDD)"
                density="compact"
                hide-details="auto"
                placeholder="(11) 90000-0000"
              />
              <v-alert v-if="erroCadastro" type="error" density="compact" variant="tonal">{{ erroCadastro }}</v-alert>
              <div class="d-flex justify-end ga-2">
                <v-btn size="small" variant="text" @click="mostrarCadastro = false">Cancelar</v-btn>
                <v-btn size="small" color="primary" :loading="criandoFornecedor" @click="cadastrarRapido">Salvar</v-btn>
              </div>
            </div>
          </v-expand-transition>

          <v-list density="compact" class="fornecedores-lista">
            <v-list-item
              v-for="fornecedor in fornecedoresLocais"
              :key="fornecedor.id"
              :disabled="Boolean(motivoDe(fornecedor))"
              @click="alternar(fornecedor)"
            >
              <template #prepend>
                <v-checkbox-btn
                  :model-value="selecionados.includes(fornecedor.id)"
                  :disabled="Boolean(motivoDe(fornecedor))"
                  @click.stop="alternar(fornecedor)"
                />
              </template>
              <v-list-item-title>{{ fornecedor.nome }}</v-list-item-title>
              <v-list-item-subtitle v-if="motivoDe(fornecedor)" class="text-warning">
                {{ motivoDe(fornecedor) }}
              </v-list-item-subtitle>
              <v-list-item-subtitle v-else-if="fornecedor.whatsapp">{{ fornecedor.whatsapp }}</v-list-item-subtitle>
            </v-list-item>
            <v-list-item v-if="!fornecedoresLocais.length">
              <v-list-item-subtitle>Nenhum fornecedor cadastrado. Use o cadastro rápido.</v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </div>

        <div class="d-flex ga-3 flex-wrap">
          <v-text-field
            v-model="prazoHoras"
            type="number"
            min="1"
            label="Prazo (horas)"
            density="comfortable"
            hide-details="auto"
            placeholder="Padrão: 2 dias úteis"
            style="max-width: 220px"
          />
          <v-text-field
            v-model="teto"
            type="number"
            min="0"
            step="0.01"
            label="Teto da compra automática (R$)"
            density="comfortable"
            hide-details="auto"
            placeholder="Sem teto"
            style="max-width: 260px"
          />
        </div>
      </v-card-text>
      <v-card-actions>
        <span v-if="impedimento" class="text-caption text-warning ml-2">{{ impedimento }}</span>
        <v-spacer />
        <v-btn variant="text" @click="aberto = false">Cancelar</v-btn>
        <v-btn color="primary" :loading="salvando" :disabled="Boolean(impedimento)" @click="abrir"
          >Abrir e gerar convites</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.cadastro-rapido {
  display: grid;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-3);
  border: 1px dashed var(--cx-line-soft);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface-sunken);
}

.fornecedores-lista {
  max-height: 260px;
  overflow-y: auto;
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-lg);
}
</style>
