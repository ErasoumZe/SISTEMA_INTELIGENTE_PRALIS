<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Notificacao } from "@padaria/shared/notificacoes";
import { dinheiro } from "~/utils/domain";

const props = defineProps<{ notificacoes: Notificacao[]; notificacoesComHistorico: Notificacao[] }>();
const emit = defineEmits<{ (event: "verificar", id: string): void; (event: "abrir", rota: string): void }>();
const categoria = ref("todas");
const busca = ref("");
const dataInicial = ref("");
const dataFinal = ref("");
const pagina = ref(1);
const porPagina = 12;
const categorias = [
  { title: "Todas as categorias", value: "todas" }, { title: "Vencimentos", value: "lancamento_vencimento" },
  { title: "Transferências", value: "transferencia" }, { title: "Quebras de caixa", value: "quebra_caixa" },
  { title: "Mensagens", value: "mensagem_admin" }, { title: "Campanhas", value: "campanha" }
];
function correspondeCategoria(item: Notificacao) {
  return categoria.value === "todas" || (categoria.value === "transferencia" ? item.tipo.startsWith("transferencia_") : item.tipo === categoria.value);
}
const filtradas = computed(() => {
  const termo = busca.value.trim().toLocaleLowerCase("pt-BR");
  return props.notificacoes.filter((item) => {
    const dia = item.criadoEm.slice(0, 10);
    const texto = [item.titulo, item.tipo, item.detalhes?.setor, item.detalhes?.descricao].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
    return correspondeCategoria(item) && (!dataInicial.value || dia >= dataInicial.value) && (!dataFinal.value || dia <= dataFinal.value) && (!termo || texto.includes(termo));
  });
});
const totalPaginas = computed(() => Math.max(1, Math.ceil(filtradas.value.length / porPagina)));
const paginaAtual = computed(() => filtradas.value.slice((pagina.value - 1) * porPagina, pagina.value * porPagina));
const notificacoesVerificadas = computed(() => props.notificacoesComHistorico.filter((item) => item.verificado).slice(0, 12));
watch([categoria, busca, dataInicial, dataFinal], () => (pagina.value = 1));
function rotuloTipo(tipo: Notificacao["tipo"]) {
  return { lancamento_vencimento: "Vencimento", quebra_caixa: "Caixa", transferencia_divergencia: "Transferência", transferencia_prazo_confirmacao: "Transferência", mensagem_admin: "Administração", campanha: "Campanha" }[tipo];
}
</script>

<template>
  <section class="pendencias-page">
    <header><h1>Pendências operacionais</h1><p>Consulte, detalhe e verifique somente o que ainda precisa de ação.</p></header>
    <v-card variant="outlined" class="filtros"><v-card-text><v-row dense>
      <v-col cols="12" sm="6" md="3"><v-select v-model="categoria" :items="categorias" label="Categoria" hide-details /></v-col>
      <v-col cols="12" sm="6" md="4"><v-text-field v-model="busca" label="Assunto ou detalhe" prepend-inner-icon="mdi-magnify" hide-details /></v-col>
      <v-col cols="6" sm="6" md="2"><v-text-field v-model="dataInicial" type="date" label="A partir de" hide-details /></v-col>
      <v-col cols="6" sm="6" md="2"><v-text-field v-model="dataFinal" type="date" label="Até" hide-details /></v-col>
    </v-row></v-card-text></v-card>
    <v-alert v-if="!filtradas.length" type="success" variant="tonal">Nenhuma pendência corresponde aos filtros.</v-alert>
    <template v-else>
      <div class="pendencias-grid"><v-card v-for="item in paginaAtual" :key="item.id" variant="outlined">
        <v-card-title class="cartao-titulo"><span>{{ item.titulo }}</span><v-chip size="x-small" variant="tonal">{{ rotuloTipo(item.tipo) }}</v-chip></v-card-title>
        <v-card-text class="cartao-corpo">
          <div v-if="item.valor != null" class="pendencia-valor">{{ dinheiro(item.valor) }}</div>
          <div v-if="item.detalhes" class="detalhes"><strong>{{ item.detalhes.setor }}</strong><span v-if="item.detalhes.descricao">{{ item.detalhes.descricao }}</span><span v-if="item.detalhes.dataVencimento">Vencimento: {{ new Date(`${item.detalhes.dataVencimento}T00:00:00`).toLocaleDateString('pt-BR') }}</span></div>
          <div>{{ new Date(item.criadoEm).toLocaleString("pt-BR") }}</div>
        </v-card-text>
        <v-card-actions><v-btn v-if="item.detalhes?.rota" size="small" variant="text" prepend-icon="mdi-open-in-new" @click="emit('abrir', item.detalhes.rota)">Abrir setor</v-btn><v-spacer /><v-btn size="small" prepend-icon="mdi-check" color="primary" variant="tonal" @click="emit('verificar', item.id)">Marcar visto</v-btn></v-card-actions>
      </v-card></div>
      <v-pagination v-if="totalPaginas > 1" v-model="pagina" :length="totalPaginas" density="comfortable" aria-label="Paginação de pendências" />
    </template>
    <section v-if="notificacoesVerificadas.length" class="notificacoes-verificadas" aria-labelledby="titulo-verificadas">
      <h2 id="titulo-verificadas">Verificadas recentemente</h2>
      <div class="pendencias-grid"><v-card v-for="item in notificacoesVerificadas" :key="item.id" variant="outlined"><v-card-title class="text-subtitle-1">{{ item.titulo }}</v-card-title><v-card-text>Verificada em {{ new Date(item.verificadoEm ?? item.criadoEm).toLocaleString("pt-BR") }}</v-card-text></v-card></div>
    </section>
  </section>
</template>

<style scoped>
.pendencias-page,.notificacoes-verificadas { display:grid; gap:20px; min-width:0; }
.pendencias-page h1,.notificacoes-verificadas h2 { margin:0; }
.pendencias-page p { margin:4px 0 0; color:var(--padaria-muted-foreground,#64748b); }
.pendencias-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr)); gap:12px; }
.cartao-titulo { display:flex; align-items:start; justify-content:space-between; gap:8px; white-space:normal; }
.cartao-corpo,.detalhes { display:grid; gap:6px; }.detalhes span { overflow-wrap:anywhere; }
.pendencia-valor { color:var(--cat-retiradas-base,#b91c1c); font-size:1.35rem; font-weight:800; }
</style>
