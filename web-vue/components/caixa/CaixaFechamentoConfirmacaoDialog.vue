<script setup lang="ts">
import { dinheiro } from "~/utils/domain";

type AnexoFechamento = {
  id: string;
  tipo: "folha_fechamento" | "comprovante_cartao";
  nomeOriginal: string;
  relatorio: unknown;
};

const props = defineProps<{
  aberto: boolean;
  saldoEsperado: number;
  observacao: string;
  lacreFechamento: string;
  caixaResponsavelNome: string;
  supervisorResponsavelNome: string;
  valorEspecie: number;
  valorMoedas: number;
  anexos: AnexoFechamento[];
}>();

const emit = defineEmits<{
  (event: "editar"): void;
  (event: "confirmar"): void;
}>();

const totalContado = computed(() => props.valorEspecie + props.valorMoedas);
const diferenca = computed(() => totalContado.value - props.saldoEsperado);
const folhas = computed(() => props.anexos.filter((anexo) => anexo.tipo === "folha_fechamento"));
const cartoes = computed(() => props.anexos.filter((anexo) => anexo.tipo === "comprovante_cartao"));
const relatorioMaquininha = computed(() => cartoes.value.find((anexo) => anexo.relatorio)?.relatorio ?? null);

function campoRelatorio(campo: string) {
  const dados = relatorioMaquininha.value;
  return dados && typeof dados === "object" ? (dados as Record<string, unknown>)[campo] : null;
}

function dinheiroRelatorio(campo: string) {
  const valor = campoRelatorio(campo);
  return typeof valor === "number" && Number.isFinite(valor) ? dinheiro(valor) : "não informado";
}
</script>

<template>
  <v-dialog :model-value="aberto" max-width="760" persistent no-click-animation>
    <v-card>
      <v-card-title>Revisar fechamento do caixa</v-card-title>
      <v-card-text>
        <p class="text-body-2 mb-4">
          Confira os dados antes de fechar. Se houver algo errado, escolha <strong>Voltar e editar</strong>.
        </p>

        <v-sheet class="pa-3 mb-4" rounded border>
          <div class="text-overline">Conferência física</div>
          <v-row dense>
            <v-col cols="12" sm="4"><strong>Esperado:</strong> {{ dinheiro(saldoEsperado) }}</v-col>
            <v-col cols="12" sm="4"><strong>Contado:</strong> {{ dinheiro(totalContado) }}</v-col>
            <v-col cols="12" sm="4" :class="diferenca ? 'text-error' : 'text-success'">
              <strong>{{ diferenca ? 'Diferença:' : 'Conferência:' }}</strong>
              {{ diferenca ? dinheiro(Math.abs(diferenca)) : 'bateu' }}
            </v-col>
            <v-col cols="12" sm="6"><strong>Dinheiro físico:</strong> {{ dinheiro(valorEspecie) }}</v-col>
            <v-col cols="12" sm="6"><strong>Moedas:</strong> {{ dinheiro(valorMoedas) }}</v-col>
          </v-row>
        </v-sheet>

        <v-list density="compact" class="mb-3" aria-label="Dados informados no fechamento">
          <v-list-item prepend-icon="mdi-lock-outline" title="Lacre de fechamento" :subtitle="lacreFechamento" />
          <v-list-item
            prepend-icon="mdi-account-cash-outline"
            title="Caixa responsável no fechamento"
            :subtitle="caixaResponsavelNome"
          />
          <v-list-item
            prepend-icon="mdi-account-supervisor-outline"
            title="Supervisor responsável no fechamento"
            :subtitle="supervisorResponsavelNome"
          />
          <v-list-item
            v-if="observacao"
            prepend-icon="mdi-note-text-outline"
            title="Observação"
            :subtitle="observacao"
          />
        </v-list>

        <v-divider class="mb-3" />
        <div class="text-subtitle-2">Anexos que ficarão no fechamento</div>
        <div class="text-body-2 mt-1">
          Folha: <strong>{{ folhas.length }}</strong> · Comprovantes de cartão: <strong>{{ cartoes.length }}</strong>
        </div>
        <v-chip-group v-if="anexos.length" class="mt-2">
          <v-chip v-for="anexo in anexos" :key="anexo.id" size="small" :prepend-icon="anexo.tipo === 'folha_fechamento' ? 'mdi-file-document-outline' : 'mdi-credit-card-outline'">
            {{ anexo.nomeOriginal }}
          </v-chip>
        </v-chip-group>
        <v-list v-if="relatorioMaquininha" density="compact" class="mt-2">
          <v-list-subheader>Relatório único da maquininha</v-list-subheader>
          <v-list-item prepend-icon="mdi-credit-card-outline">
            <v-list-item-title>
              {{ campoRelatorio('numeroMaquininha') ? `Máquina ${campoRelatorio('numeroMaquininha')}` : 'Máquina não identificada' }} · {{ cartoes.length }} foto(s)
            </v-list-item-title>
            <v-list-item-subtitle>
              Crédito {{ dinheiroRelatorio('credito') }} · Débito {{ dinheiroRelatorio('debito') }} · Pix {{ dinheiroRelatorio('pix') }} · Voucher {{ dinheiroRelatorio('voucher') }}
            </v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </v-card-text>
      <v-card-actions class="px-6 pb-5">
        <v-spacer />
        <v-btn variant="text" @click="emit('editar')">Voltar e editar</v-btn>
        <v-btn color="primary" variant="flat" prepend-icon="mdi-lock" @click="emit('confirmar')">Confirmar fechamento</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
