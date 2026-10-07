<script setup lang="ts">
type Anexo = { id: string; tipo: string; nomeOriginal: string; mimeType: string; href: string };
type LinhaMaquininha = { forma: string; liquido: number | null };

const props = defineProps<{
  resumo: Record<string, unknown> | null;
  anexos: Anexo[];
  maquininha: LinhaMaquininha[];
  ajuste: Record<string, unknown> | null;
  dinheiro: (valor: number) => string;
  numero: (valor: unknown) => number;
}>();

const folhaFinal = computed(() => props.anexos.filter((anexo) => anexo.tipo === "folha_fechamento"));
const totalCartoes = computed(() => props.maquininha.reduce((total, linha) => total + (linha.liquido ?? 0), 0));
const diferenca = computed(() => {
  if (props.ajuste) return props.numero(props.ajuste.valorDiferenca);
  const esperado = props.numero(props.resumo?.valorFisicoEsperadoFechamento);
  const contado =
    props.numero(props.resumo?.valorEspecieFechamento) + props.numero(props.resumo?.valorMoedasFechamento);
  return contado - esperado;
});
</script>

<template>
  <section class="folha-digital" aria-labelledby="folha-digital-titulo">
    <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-3">
      <div>
        <div class="text-overline text-primary">FOLHA DIGITAL DO FECHAMENTO</div>
        <h3 id="folha-digital-titulo" class="text-h6">Conferência do turno</h3>
      </div>
      <v-chip
        :color="folhaFinal.length ? 'success' : 'warning'"
        variant="tonal"
        prepend-icon="mdi-file-document-check-outline"
      >
        {{ folhaFinal.length ? `${folhaFinal.length} folha(s) final(is) anexada(s)` : "Folha final pendente" }}
      </v-chip>
    </div>

    <v-alert v-if="!folhaFinal.length" type="warning" variant="tonal" density="compact" class="mb-4">
      A folha final ainda não foi anexada pelo operador. Ela deve ser enviada no fechamento do caixa, antes de concluir
      o turno.
    </v-alert>
    <v-row v-else dense class="mb-4">
      <v-col v-for="anexo in folhaFinal" :key="anexo.id" cols="12" sm="6" md="4">
        <v-card variant="outlined" class="anexo-final h-100">
          <v-img v-if="anexo.mimeType.startsWith('image/')" :src="anexo.href" height="116" cover />
          <v-sheet v-else class="d-flex align-center justify-center" height="116"
            ><v-icon icon="mdi-file-pdf-box" color="error" size="46"
          /></v-sheet>
          <v-card-text class="py-3"
            ><strong>Folha final</strong>
            <div class="text-caption text-truncate">{{ anexo.nomeOriginal }}</div></v-card-text
          >
          <v-card-actions class="pt-0"
            ><v-btn :href="anexo.href" target="_blank" size="small" color="primary" prepend-icon="mdi-download"
              >Abrir folha</v-btn
            ></v-card-actions
          >
        </v-card>
      </v-col>
    </v-row>

    <v-row dense>
      <v-col cols="12" md="6"
        ><v-card variant="outlined" class="bloco bloco--entrada h-100"
          ><v-card-title>Transferência de entrada</v-card-title
          ><v-card-text
            ><strong class="valor">{{ dinheiro(numero(resumo?.totalTransferenciasEntrada)) }}</strong>
            <p>Suprimento e fundo recebidos pelo PDV.</p></v-card-text
          ></v-card
        ></v-col
      >
      <v-col cols="12" md="6"
        ><v-card variant="outlined" class="bloco bloco--saida h-100"
          ><v-card-title>Sangrias e transferências de saída</v-card-title
          ><v-card-text
            ><strong class="valor">{{ dinheiro(numero(resumo?.totalTransferenciasSaida)) }}</strong>
            <p>Saídas lacradas, retornos e sangrias registrados no turno.</p></v-card-text
          ></v-card
        ></v-col
      >
      <v-col cols="12" md="6"
        ><v-card variant="outlined" class="bloco bloco--vendas h-100"
          ><v-card-title>Relatório PDV / CREARE</v-card-title
          ><v-card-text
            ><strong class="valor">{{ dinheiro(numero(resumo?.totalEntradas)) }}</strong>
            <p>Vendas que entram no fechamento do PDV.</p></v-card-text
          ></v-card
        ></v-col
      >
      <v-col cols="12" md="6"
        ><v-card variant="outlined" class="bloco bloco--cartao h-100"
          ><v-card-title>Relatório de cartões (líquido)</v-card-title
          ><v-card-text class="cartoes"
            ><div v-for="linha in maquininha" :key="linha.forma">
              <span>{{ linha.forma }}</span
              ><strong>{{ linha.liquido === null ? "Não informado" : dinheiro(linha.liquido) }}</strong>
            </div>
            <v-divider class="my-2" />
            <div>
              <span>Total cartões</span><strong>{{ dinheiro(totalCartoes) }}</strong>
            </div></v-card-text
          ></v-card
        ></v-col
      >
      <v-col cols="12"
        ><v-card variant="outlined" class="bloco bloco--final"
          ><v-card-title>Transferência final e contagem física</v-card-title
          ><v-card-text class="grade-final"
            ><div>
              <span>Lacre de abertura</span><strong>{{ resumo?.lacreAbertura || "--" }}</strong>
            </div>
            <div>
              <span>Lacre de fechamento</span><strong>{{ resumo?.lacreFechamento || "--" }}</strong>
            </div>
            <div>
              <span>Notas contadas</span><strong>{{ dinheiro(numero(resumo?.valorEspecieFechamento)) }}</strong>
            </div>
            <div>
              <span>Moedas contadas</span><strong>{{ dinheiro(numero(resumo?.valorMoedasFechamento)) }}</strong>
            </div>
            <div>
              <span>Contado na gaveta</span
              ><strong>{{
                dinheiro(numero(resumo?.valorEspecieFechamento) + numero(resumo?.valorMoedasFechamento))
              }}</strong>
            </div>
            <div>
              <span>Esperado na gaveta</span
              ><strong>{{ dinheiro(numero(resumo?.valorFisicoEsperadoFechamento)) }}</strong>
            </div>
            <div :class="diferenca ? 'text-error' : 'text-success'">
              <span>{{ diferenca < 0 ? "Falta" : diferenca > 0 ? "Sobra" : "Conferência" }}</span
              ><strong>{{ diferenca ? dinheiro(Math.abs(diferenca)) : "Bateu" }}</strong>
            </div></v-card-text
          ></v-card
        ></v-col
      >
    </v-row>

    <div class="text-subtitle-2 mt-5 mb-2">Relatório final</div>
    <v-row dense>
      <v-col cols="6" md="4" lg="2"
        ><v-sheet class="resumo resumo--vendas"
          ><span>Vendas</span><strong>{{ dinheiro(numero(resumo?.totalEntradas)) }}</strong></v-sheet
        ></v-col
      >
      <v-col cols="6" md="4" lg="2"
        ><v-sheet class="resumo resumo--transferencias"
          ><span>Transferências</span
          ><strong>{{
            dinheiro(numero(resumo?.totalTransferenciasEntrada) - numero(resumo?.totalTransferenciasSaida))
          }}</strong></v-sheet
        ></v-col
      >
      <v-col cols="6" md="4" lg="2"
        ><v-sheet class="resumo resumo--despesas"
          ><span>Despesas</span><strong>{{ dinheiro(numero(resumo?.totalDespesas)) }}</strong></v-sheet
        ></v-col
      >
      <v-col cols="6" md="4" lg="2"
        ><v-sheet class="resumo resumo--mercadorias"
          ><span>Mercadorias</span><strong>{{ dinheiro(numero(resumo?.totalMercadorias)) }}</strong></v-sheet
        ></v-col
      >
      <v-col cols="6" md="4" lg="2"
        ><v-sheet class="resumo resumo--retiradas"
          ><span>Retiradas</span><strong>{{ dinheiro(numero(resumo?.totalRetiradas)) }}</strong></v-sheet
        ></v-col
      >
      <v-col cols="6" md="4" lg="2"
        ><v-sheet class="resumo resumo--diferenca"
          ><span>Diferença</span><strong>{{ diferenca ? dinheiro(diferenca) : "R$ 0,00" }}</strong></v-sheet
        ></v-col
      >
    </v-row>
  </section>
</template>

<style scoped>
.folha-digital {
  border-top: 3px solid rgb(var(--v-theme-primary));
  padding-top: 18px;
}
.anexo-final {
  overflow: hidden;
}
.bloco {
  border-left-width: 4px;
}
.bloco--entrada {
  border-left-color: #16a34a;
}
.bloco--saida {
  border-left-color: #f97316;
}
.bloco--vendas {
  border-left-color: #d99b00;
}
.bloco--cartao {
  border-left-color: #7c3aed;
}
.bloco--final {
  border-left-color: #2563eb;
}
.bloco :deep(.v-card-title) {
  font-size: 0.94rem;
  white-space: normal;
}
.bloco p {
  color: rgb(var(--v-theme-on-surface-variant));
  font-size: 0.82rem;
  margin: 5px 0 0;
}
.valor {
  display: block;
  font-size: 1.2rem;
}
.cartoes > div,
.grade-final > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.grade-final {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 24px;
}
.grade-final span {
  color: rgb(var(--v-theme-on-surface-variant));
}
.resumo {
  min-height: 78px;
  border-radius: 10px;
  display: grid;
  align-content: center;
  gap: 4px;
  padding: 12px;
}
.resumo span {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
}
.resumo strong {
  font-size: 1.05rem;
}
.resumo--vendas {
  border-left: 4px solid #d99b00;
  background: rgba(217, 155, 0, 0.12);
}
.resumo--transferencias {
  border-left: 4px solid #f97316;
  background: rgba(249, 115, 22, 0.12);
}
.resumo--despesas {
  border-left: 4px solid #ef4444;
  background: rgba(239, 68, 68, 0.12);
}
.resumo--mercadorias {
  border-left: 4px solid #16a34a;
  background: rgba(22, 163, 74, 0.12);
}
.resumo--retiradas {
  border-left: 4px solid #2563eb;
  background: rgba(37, 99, 235, 0.12);
}
.resumo--diferenca {
  border-left: 4px solid #7c3aed;
  background: rgba(124, 58, 237, 0.12);
}
@media (max-width: 599px) {
  .grade-final {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}
</style>
