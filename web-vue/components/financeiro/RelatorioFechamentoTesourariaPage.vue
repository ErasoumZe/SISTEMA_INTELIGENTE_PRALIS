<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import type { LinhaHistoricoCaixa, TotaisHistoricoCaixa } from "@padaria/shared";
import type { Opcao } from "~/types/padaria";
import { dinheiro, mensagemErro } from "~/utils/domain";
import { formatarDataHora, formatarDataSomenteDia } from "~/utils/formatacao";

const props = defineProps<{ empresaId: string; pdvs: Opcao[]; turnos: Opcao[] }>();

type Situacao = "aberto" | "em_fechamento" | "aguardando_tesouraria" | "fechado_sem_pendencias" | "com_quebra";
type LinhaRelatorio = LinhaHistoricoCaixa & { situacaoTesouraria: Situacao };
type Anexo = { id: string; tipo: string; nomeOriginal: string; mimeType: string; tamanhoBytes: number; criadoEm: string | null };
type Dossie = {
  caixa: Record<string, unknown>;
  resumo: Record<string, unknown> | null;
  situacaoTesouraria: Situacao;
  transferencias: Array<Record<string, unknown>>;
  conferencias: Array<Record<string, unknown>>;
  quebras: Array<Record<string, unknown>>;
  relatorioVendas: Record<string, unknown> | null;
  relatorioMaquininha: Record<string, unknown> | null;
  anexos: Anexo[];
  lancamentos: Record<string, Array<Record<string, unknown>>>;
  vendasCanceladas: Array<Record<string, unknown>>;
  ajuste: Record<string, unknown> | null;
};
type Meta = { totais: TotaisHistoricoCaixa };
type LinhaConferencia = { forma: string; creare: number | null; sistema: number | null };
type LinhaMaquininha = { forma: string; inicial: number | null; acumulado: number | null; liquido: number | null };

const { apiGet, apiGetPaginado, apiUrl } = useApi();
const filtros = reactive({ dataInicio: "", dataFim: "", pdvId: "", turnoId: "", status: "" });
const statusOpcoes = [
  { title: "Todos os estados", value: "" },
  { title: "Aberto", value: "aberto" },
  { title: "Em fechamento", value: "em_fechamento" },
  { title: "Fechado", value: "fechado" }
];
const linhas = ref<LinhaRelatorio[]>([]);
const totais = ref<TotaisHistoricoCaixa | null>(null);
const carregando = ref(false);
const erro = ref("");
const pagina = ref(1);
const itensPorPagina = 20;
const total = ref(0);
const dossie = ref<Dossie | null>(null);
const caixaSelecionado = ref<LinhaRelatorio | null>(null);
const carregandoDossie = ref(false);
const dialogoAberto = ref(false);
const totalPaginas = computed(() => Math.max(1, Math.ceil(total.value / itensPorPagina)));
const periodoInvertido = computed(() => Boolean(filtros.dataInicio && filtros.dataFim && filtros.dataInicio > filtros.dataFim));
const secoesLancamentos = computed(() => {
  const lancamentos = dossie.value?.lancamentos;
  return [
    { titulo: "Vendas", itens: lancamentos?.linhasVendas ?? [] },
    { titulo: "Transferências", itens: lancamentos?.linhasTransferencias ?? [] },
    { titulo: "Despesas", itens: lancamentos?.linhasDespesas ?? [] },
    { titulo: "Mercadorias", itens: lancamentos?.linhasMercadorias ?? [] },
    { titulo: "Retiradas", itens: lancamentos?.linhasRetiradas ?? [] }
  ];
});
const conferenciaCreare = computed<LinhaConferencia[]>(() => {
  const dados = registro(dossie.value?.relatorioVendas?.dados);
  const vendas = registro(dados.vendas);
  const creare = registro(registro(dados.creare).leitura);
  const totaisPralis = new Map<string, number>();
  const porForma = Array.isArray(vendas.porFormaPagamento) ? vendas.porFormaPagamento : [];
  for (const item of porForma) {
    const linha = registro(item);
    const categoria = texto(linha.categoriaFechamentoCaixa).toLowerCase();
    totaisPralis.set(categoria, numero(linha.total));
  }
  return [
    { forma: "Total de vendas", creare: valorOpcional(creare.totalBruto), sistema: valorOpcional(vendas.totalGeral) },
    { forma: "Dinheiro", creare: valorOpcional(creare.dinheiro), sistema: totaisPralis.get("dinheiro") ?? null },
    { forma: "Crédito", creare: valorOpcional(creare.credito), sistema: totaisPralis.get("credito") ?? null },
    { forma: "Débito", creare: valorOpcional(creare.debito), sistema: totaisPralis.get("debito") ?? null },
    { forma: "Pix", creare: valorOpcional(creare.pix), sistema: totaisPralis.get("pix") ?? null },
    { forma: "Voucher", creare: valorOpcional(creare.voucher), sistema: totaisPralis.get("voucher") ?? null }
  ];
});
const conferenciaMaquininha = computed<LinhaMaquininha[]>(() => {
  const relatorio = registro(dossie.value?.relatorioMaquininha);
  return ["credito", "debito", "pix", "voucher"].map((forma) => {
    const inicial = valorOpcional(relatorio[`${forma}Inicial`]);
    const acumulado = valorOpcional(relatorio[`${forma}Final`]);
    return {
      forma: forma === "pix" ? "Pix" : `${forma.slice(0, 1).toUpperCase()}${forma.slice(1)}`,
      inicial,
      acumulado,
      liquido: inicial === null || acumulado === null ? null : acumulado - inicial
    };
  });
});

function parametros() {
  const params = new URLSearchParams({ empresaId: props.empresaId, page: String(pagina.value), pageSize: String(itensPorPagina) });
  for (const [chave, valor] of Object.entries(filtros)) if (valor) params.set(chave, valor);
  return params;
}

async function buscar() {
  if (!props.empresaId || periodoInvertido.value) return;
  carregando.value = true;
  erro.value = "";
  try {
    const resultado = await apiGetPaginado<LinhaRelatorio, Meta>(`/api/relatorios/fechamentos?${parametros().toString()}`);
    linhas.value = resultado.itens;
    total.value = resultado.total;
    totais.value = resultado.meta?.totais ?? null;
  } catch (error) {
    erro.value = mensagemErro(error);
    linhas.value = [];
    total.value = 0;
    totais.value = null;
  } finally {
    carregando.value = false;
  }
}

function aplicarFiltros() { pagina.value = 1; void buscar(); }
function limparFiltros() { Object.assign(filtros, { dataInicio: "", dataFim: "", pdvId: "", turnoId: "", status: "" }); aplicarFiltros(); }

async function abrirDossie(linha: LinhaRelatorio) {
  caixaSelecionado.value = linha;
  dossie.value = null;
  dialogoAberto.value = true;
  carregandoDossie.value = true;
  try {
    dossie.value = await apiGet<Dossie>(`/api/relatorios/fechamentos/${linha.id}`);
  } catch (error) {
    erro.value = mensagemErro(error);
  } finally {
    carregandoDossie.value = false;
  }
}

function corSituacao(situacao: Situacao) {
  return { aberto: "info", em_fechamento: "warning", aguardando_tesouraria: "deep-orange", fechado_sem_pendencias: "success", com_quebra: "error" }[situacao];
}
function textoSituacao(situacao: Situacao) {
  return { aberto: "Aberto", em_fechamento: "Em fechamento", aguardando_tesouraria: "Aguardando Tesouraria", fechado_sem_pendencias: "Fechado sem pendências", com_quebra: "Com quebra" }[situacao];
}
function numero(valor: unknown) { return typeof valor === "number" ? valor : Number(valor ?? 0); }
function valorOpcional(valor: unknown) { return valor === null || valor === undefined || valor === "" ? null : numero(valor); }
function texto(valor: unknown) { return typeof valor === "string" && valor ? valor : "--"; }
function registro(valor: unknown): Record<string, unknown> { return valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Record<string, unknown> : {}; }
function confere(linha: LinhaConferencia) {
  return linha.creare !== null && linha.sistema !== null && Math.round(linha.creare * 100) === Math.round(linha.sistema * 100);
}
function anexoUrl(anexo: Anexo) {
  return `${apiUrl}/api/relatorios/fechamentos/${caixaSelecionado.value?.id}/anexos/${anexo.id}`;
}
function rotuloAnexo(tipo: string) {
  return { folha_fechamento: "Folha de fechamento", comprovante_cartao: "Comprovante da maquininha", relatorio_vendas_creare: "Folha CREARE" }[tipo] ?? tipo;
}

watch(pagina, () => void buscar());
watch(() => props.empresaId, () => { pagina.value = 1; void buscar(); }, { immediate: true });
</script>

<template>
  <v-card class="relatorio-fechamento">
    <v-card-text>
      <div class="d-flex flex-wrap justify-space-between align-center ga-3 mb-5">
        <div>
          <div class="text-overline text-primary">TESOURARIA</div>
          <h2 class="text-h6">Relatório de fechamento</h2>
          <p class="text-body-2 text-medium-emphasis mb-0">Consulte o dossiê completo de cada turno, sem alterar a operação do PDV.</p>
        </div>
        <v-chip color="primary" variant="tonal" prepend-icon="mdi-shield-check">Somente leitura</v-chip>
      </div>

      <v-row dense>
        <v-col cols="12" sm="6" md="2"><v-text-field v-model="filtros.dataInicio" type="date" label="Data inicial" hide-details="auto" /></v-col>
        <v-col cols="12" sm="6" md="2"><v-text-field v-model="filtros.dataFim" type="date" label="Data final" :error="periodoInvertido" :error-messages="periodoInvertido ? 'A data final é anterior à inicial.' : undefined" hide-details="auto" /></v-col>
        <v-col cols="12" sm="6" md="3"><v-select v-model="filtros.pdvId" :items="pdvs" item-title="nome" item-value="id" label="PDV" clearable hide-details /></v-col>
        <v-col cols="12" sm="6" md="3"><v-select v-model="filtros.turnoId" :items="turnos" item-title="nome" item-value="id" label="Turno" clearable hide-details /></v-col>
        <v-col cols="12" md="2"><v-select v-model="filtros.status" :items="statusOpcoes" label="Situação" hide-details /></v-col>
      </v-row>
      <div class="d-flex flex-wrap ga-2 mt-4">
        <v-btn color="primary" variant="flat" prepend-icon="mdi-magnify" :loading="carregando" :disabled="periodoInvertido" @click="aplicarFiltros">Filtrar</v-btn>
        <v-btn color="secondary" variant="outlined" prepend-icon="mdi-filter-remove" @click="limparFiltros">Limpar</v-btn>
      </div>

      <v-alert v-if="erro" type="error" variant="tonal" class="mt-4">{{ erro }}</v-alert>

      <v-row v-if="totais" dense class="mt-2">
        <v-col cols="6" sm="4" lg="2"><v-sheet class="pa-3 rounded-lg painel-total painel-total--neutro"><div class="text-caption">Caixas</div><strong>{{ totais.caixas }}</strong></v-sheet></v-col>
        <v-col cols="6" sm="4" lg="2"><v-sheet class="pa-3 rounded-lg painel-total painel-total--entrada"><div class="text-caption">Entradas</div><strong>{{ dinheiro(totais.totalEntradas) }}</strong></v-sheet></v-col>
        <v-col cols="6" sm="4" lg="2"><v-sheet class="pa-3 rounded-lg painel-total painel-total--sangria"><div class="text-caption">Sangrias / saídas</div><strong>{{ dinheiro(totais.totalTransferenciasSaida) }}</strong></v-sheet></v-col>
        <v-col cols="6" sm="4" lg="2"><v-sheet class="pa-3 rounded-lg painel-total painel-total--despesa"><div class="text-caption">Despesas</div><strong>{{ dinheiro(totais.totalDespesas) }}</strong></v-sheet></v-col>
        <v-col cols="6" sm="4" lg="2"><v-sheet class="pa-3 rounded-lg painel-total painel-total--mercadoria"><div class="text-caption">Mercadorias</div><strong>{{ dinheiro(totais.totalMercadorias) }}</strong></v-sheet></v-col>
        <v-col cols="6" sm="4" lg="2"><v-sheet class="pa-3 rounded-lg painel-total painel-total--saldo"><div class="text-caption">Saldo físico</div><strong>{{ dinheiro(totais.saldo) }}</strong></v-sheet></v-col>
      </v-row>

      <v-progress-linear v-if="carregando" indeterminate color="primary" class="mt-5" />
      <v-row v-else class="mt-2" dense>
        <v-col v-for="linha in linhas" :key="linha.id" cols="12" md="6" xl="4">
          <v-card variant="outlined" class="h-100 cartao-caixa">
            <v-card-text>
              <div class="d-flex justify-space-between ga-2 align-start">
                <div><div class="text-overline">{{ formatarDataSomenteDia(linha.dataMovimento) }}</div><div class="text-h6">{{ linha.pdvNome }}</div><div class="text-body-2 text-medium-emphasis">{{ linha.turnoNome || 'Turno não informado' }} · {{ linha.colaboradorNome || linha.usuarioCaixaNome || '--' }}</div></div>
                <v-chip :color="corSituacao(linha.situacaoTesouraria)" size="small" variant="tonal">{{ textoSituacao(linha.situacaoTesouraria) }}</v-chip>
              </div>
              <v-divider class="my-3" />
              <div class="d-flex justify-space-between"><span class="text-medium-emphasis">Abertura</span><span>{{ linha.dataHoraAbertura ? formatarDataHora(linha.dataHoraAbertura) : '--' }}</span></div>
              <div class="d-flex justify-space-between mt-1"><span class="text-medium-emphasis">Fechamento</span><span>{{ linha.dataHoraFechamento ? formatarDataHora(linha.dataHoraFechamento) : 'Em curso' }}</span></div>
              <div class="d-flex justify-space-between mt-3 text-subtitle-1"><span>Saldo físico</span><strong>{{ dinheiro(linha.saldo) }}</strong></div>
              <v-chip v-if="linha.temAjuste" color="error" size="small" class="mt-3" variant="tonal">Ajuste / diferença registrado</v-chip>
            </v-card-text>
            <v-card-actions><v-btn block color="primary" variant="flat" prepend-icon="mdi-clipboard-text-search-outline" @click="abrirDossie(linha)">Conferir caixa</v-btn></v-card-actions>
          </v-card>
        </v-col>
        <v-col v-if="!linhas.length" cols="12"><v-alert type="info" variant="tonal">Nenhum fechamento para os filtros informados.</v-alert></v-col>
      </v-row>
      <v-pagination v-if="totalPaginas > 1" v-model="pagina" class="mt-5" :length="totalPaginas" density="comfortable" />
    </v-card-text>
  </v-card>

  <v-dialog v-model="dialogoAberto" max-width="1200" scrollable>
    <v-card>
      <v-toolbar color="primary" density="comfortable"><v-toolbar-title>Folha digital do fechamento · {{ caixaSelecionado?.pdvNome }}</v-toolbar-title><v-btn icon="mdi-close" @click="dialogoAberto = false" /></v-toolbar>
      <v-card-text class="pa-4">
        <div v-if="carregandoDossie" class="py-10"><v-progress-circular indeterminate color="primary" /><span class="ml-3">Carregando dossiê auditável…</span></div>
        <template v-else-if="dossie">
          <v-alert :color="corSituacao(dossie.situacaoTesouraria)" variant="tonal" class="mb-4"><strong>{{ textoSituacao(dossie.situacaoTesouraria) }}</strong> · este painel não altera o fechamento do PDV.</v-alert>
          <v-row dense>
            <v-col cols="12" md="6"><v-card variant="outlined"><v-card-title class="text-subtitle-1">Identificação e responsáveis</v-card-title><v-card-text class="dossie-grid"><span>PDV</span><strong>{{ texto(dossie.caixa.pdvNome) }}</strong><span>Turno</span><strong>{{ texto(dossie.caixa.turnoNome) }}</strong><span>Operador</span><strong>{{ texto(dossie.caixa.usuarioCaixaNome) }}</strong><span>Aberto em</span><strong>{{ dossie.caixa.dataHoraAbertura ? formatarDataHora(String(dossie.caixa.dataHoraAbertura)) : '--' }}</strong><span>Fechado em</span><strong>{{ dossie.caixa.dataHoraFechamento ? formatarDataHora(String(dossie.caixa.dataHoraFechamento)) : 'Ainda não fechado' }}</strong></v-card-text></v-card></v-col>
            <v-col cols="12" md="6"><v-card variant="outlined"><v-card-title class="text-subtitle-1">Contagem e lacres</v-card-title><v-card-text class="dossie-grid"><span>Lacre de abertura</span><strong>{{ texto(dossie.resumo?.lacreAbertura) }}</strong><span>Lacre de fechamento</span><strong>{{ texto(dossie.resumo?.lacreFechamento) }}</strong><span>Físico esperado</span><strong>{{ dinheiro(numero(dossie.resumo?.valorFisicoEsperadoFechamento)) }}</strong><span>Espécie contada</span><strong>{{ dinheiro(numero(dossie.resumo?.valorEspecieFechamento)) }}</strong><span>Moedas contadas</span><strong>{{ dinheiro(numero(dossie.resumo?.valorMoedasFechamento)) }}</strong><span>Diferença / ajuste</span><strong>{{ dossie.ajuste ? dinheiro(numero(dossie.ajuste.valorDiferenca)) : 'Sem ajuste' }}</strong></v-card-text></v-card></v-col>
          </v-row>

          <v-expansion-panels multiple class="mt-4">
            <v-expansion-panel title="Transferências, sangrias e lacres">
              <v-expansion-panel-text><v-table density="compact"><thead><tr><th>Tipo</th><th>Valor</th><th>Lacre</th><th>Status</th><th>Data</th></tr></thead><tbody><tr v-for="item in dossie.transferencias" :key="String(item.id)"><td>{{ texto(item.tipo) }}</td><td>{{ dinheiro(numero(item.valorOriginal)) }}</td><td>{{ texto(item.lacreNumero) }}</td><td>{{ texto(item.status) }}</td><td>{{ item.dataTransferencia ? formatarDataHora(String(item.dataTransferencia)) : '--' }}</td></tr><tr v-if="!dossie.transferencias.length"><td colspan="5">Nenhuma transferência vinculada.</td></tr></tbody></v-table></v-expansion-panel-text>
            </v-expansion-panel>
            <v-expansion-panel title="Conferências físicas e quebras"><v-expansion-panel-text><v-table density="compact"><thead><tr><th>Etapa</th><th>Resultado</th><th>Declarado</th><th>Contado</th><th>Conferido em</th></tr></thead><tbody><tr v-for="item in dossie.conferencias" :key="String(item.id)"><td>{{ texto(item.etapa) }}</td><td>{{ texto(item.resultado) }}</td><td>{{ dinheiro(numero(item.valorEspecieDeclarado) + numero(item.valorMoedasDeclarado)) }}</td><td>{{ dinheiro(numero(item.valorEspecieContado) + numero(item.valorMoedasContado)) }}</td><td>{{ item.conferidoEm ? formatarDataHora(String(item.conferidoEm)) : '--' }}</td></tr><tr v-if="!dossie.conferencias.length"><td colspan="5">Ainda não há conferência física registrada.</td></tr></tbody></v-table><v-alert v-for="quebra in dossie.quebras" :key="String(quebra.id)" type="error" variant="tonal" class="mt-3"><strong>Quebra {{ dinheiro(numero(quebra.valor)) }}</strong> · {{ texto(quebra.observacao) }}</v-alert></v-expansion-panel-text></v-expansion-panel>
            <v-expansion-panel title="Conferência CREARE × maquininha">
              <v-expansion-panel-text>
                <v-row dense>
                  <v-col cols="12" lg="7">
                    <v-card class="folha-conferencia h-100" variant="outlined">
                      <v-card-title class="text-subtitle-1">Vendas por forma de pagamento</v-card-title>
                      <v-card-subtitle>Valores informados na folha CREARE comparados aos lançamentos do PDV.</v-card-subtitle>
                      <v-card-text>
                        <v-alert v-if="!dossie.relatorioVendas" type="info" variant="tonal" density="compact">A folha CREARE ainda não foi gerada neste caixa.</v-alert>
                        <v-table v-else density="compact" class="tabela-conferencia">
                          <thead><tr><th>Forma</th><th class="text-right">CREARE</th><th class="text-right">PDV</th><th class="text-right">Conferência</th></tr></thead>
                          <tbody><tr v-for="linha in conferenciaCreare" :key="linha.forma"><td>{{ linha.forma }}</td><td class="text-right">{{ linha.creare === null ? '—' : dinheiro(linha.creare) }}</td><td class="text-right">{{ linha.sistema === null ? '—' : dinheiro(linha.sistema) }}</td><td class="text-right"><v-chip v-if="linha.creare !== null && linha.sistema !== null" :color="confere(linha) ? 'success' : 'error'" size="x-small" variant="tonal">{{ confere(linha) ? 'Bateu' : 'Divergente' }}</v-chip><span v-else class="text-medium-emphasis">Pendente</span></td></tr></tbody>
                        </v-table>
                      </v-card-text>
                    </v-card>
                  </v-col>
                  <v-col cols="12" lg="5">
                    <v-card class="maquininha-conferencia h-100" variant="outlined">
                      <v-card-title class="text-subtitle-1">Leitura da maquininha</v-card-title>
                      <v-card-subtitle>Inicial, acumulado e líquido informado para este PDV.</v-card-subtitle>
                      <v-card-text>
                        <v-alert v-if="!dossie.relatorioMaquininha" type="info" variant="tonal" density="compact">A leitura da maquininha ainda não foi informada.</v-alert>
                        <v-table v-else density="compact" class="tabela-conferencia">
                          <thead><tr><th>Forma</th><th class="text-right">Inicial</th><th class="text-right">Acumulado</th><th class="text-right">Líquido</th></tr></thead>
                          <tbody><tr v-for="linha in conferenciaMaquininha" :key="linha.forma"><td>{{ linha.forma }}</td><td class="text-right">{{ linha.inicial === null ? '—' : dinheiro(linha.inicial) }}</td><td class="text-right">{{ linha.acumulado === null ? '—' : dinheiro(linha.acumulado) }}</td><td class="text-right font-weight-bold">{{ linha.liquido === null ? '—' : dinheiro(linha.liquido) }}</td></tr></tbody>
                        </v-table>
                        <p class="text-caption text-medium-emphasis mt-3 mb-0">No turno da tarde, o líquido é o acumulado menos a leitura da manhã do mesmo PDV e da mesma maquininha.</p>
                      </v-card-text>
                    </v-card>
                  </v-col>
                </v-row>
              </v-expansion-panel-text>
            </v-expansion-panel>
            <v-expansion-panel title="Movimentações e vendas canceladas"><v-expansion-panel-text><v-list density="compact" lines="two"><template v-for="secao in secoesLancamentos" :key="secao.titulo"><v-list-subheader>{{ secao.titulo }} · {{ secao.itens.length }}</v-list-subheader><v-list-item v-for="item in secao.itens" :key="String(item.id)"><v-list-item-title>{{ texto(item.descricao) }}</v-list-item-title><v-list-item-subtitle>{{ item.data ? formatarDataSomenteDia(String(item.data)) : '--' }}</v-list-item-subtitle><template #append><strong>{{ dinheiro(numero(item.valor)) }}</strong></template></v-list-item><v-list-item v-if="!secao.itens.length" title="Nenhum lançamento" /></template></v-list><v-alert v-if="dossie.vendasCanceladas.length" type="warning" variant="tonal" class="mt-2">{{ dossie.vendasCanceladas.length }} venda(s) cancelada(s), fora dos totais do caixa.</v-alert></v-expansion-panel-text></v-expansion-panel>
            <v-expansion-panel title="Folhas e comprovantes anexados"><v-expansion-panel-text><v-row dense><v-col v-for="anexo in dossie.anexos" :key="anexo.id" cols="12" sm="6" md="4"><v-card variant="outlined"><v-img v-if="anexo.mimeType.startsWith('image/')" :src="anexoUrl(anexo)" height="120" cover /><v-sheet v-else class="pa-6 text-center"><v-icon icon="mdi-file-pdf-box" size="42" color="error" /></v-sheet><v-card-text><strong>{{ rotuloAnexo(anexo.tipo) }}</strong><div class="text-caption text-truncate">{{ anexo.nomeOriginal }}</div></v-card-text><v-card-actions><v-btn :href="anexoUrl(anexo)" target="_blank" size="small" prepend-icon="mdi-download">Abrir</v-btn></v-card-actions></v-card></v-col><v-col v-if="!dossie.anexos.length" cols="12"><span class="text-medium-emphasis">Nenhum anexo foi enviado.</span></v-col></v-row></v-expansion-panel-text></v-expansion-panel>
          </v-expansion-panels>
        </template>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.painel-total {
  min-height: 74px;
  border: 1px solid rgb(var(--v-theme-outline-variant));
  border-left: 4px solid #94a3b8;
  background: rgba(148, 163, 184, .12);
}
.painel-total--entrada { border-left-color: #22c55e; background: rgba(34, 197, 94, .13); }
.painel-total--sangria { border-left-color: #f97316; background: rgba(249, 115, 22, .14); }
.painel-total--despesa { border-left-color: #ef4444; background: rgba(239, 68, 68, .13); }
.painel-total--mercadoria { border-left-color: #3b82f6; background: rgba(59, 130, 246, .13); }
.painel-total--saldo { border-left-color: #a855f7; background: rgba(168, 85, 247, .14); }
.cartao-caixa { border-top: 3px solid rgb(var(--v-theme-primary)); }
.dossie-grid { display: grid; grid-template-columns: minmax(130px, 1fr) minmax(130px, 1.2fr); gap: 9px 16px; }
.folha-conferencia { border-top: 4px solid #f59e0b; background: rgba(245, 158, 11, .055); }
.maquininha-conferencia { border-top: 4px solid #7c3aed; background: rgba(124, 58, 237, .07); }
.tabela-conferencia :deep(th) { white-space: nowrap; color: rgb(var(--v-theme-on-surface-variant)); font-size: .75rem; }
.tabela-conferencia :deep(td) { white-space: nowrap; }
@media (max-width: 599px) {
  .dossie-grid { grid-template-columns: 1fr; gap: 3px; }
  .dossie-grid strong { margin-bottom: 8px; }
  .tabela-conferencia { overflow-x: auto; display: block; }
}
</style>
