<script setup lang="ts">
type Registro = Record<string, unknown>;
type Anexo = { id: string; tipo: string; nomeOriginal: string; mimeType: string; href: string };
type LinhaMaquininha = { forma: string; liquido: number | null };
type Transferencia = Registro & {
  tipo?: string;
  valorOriginal?: number;
  lacreNumero?: string | null;
  observacao?: string | null;
};

const props = defineProps<{
  caixa: Registro;
  resumo: Registro | null;
  anexos: Anexo[];
  maquininha: LinhaMaquininha[];
  transferencias: Transferencia[];
  relatorioVendas: Registro | null;
  ajuste: Registro | null;
  dinheiro: (valor: number) => string;
  numero: (valor: unknown) => number;
  texto: (valor: unknown) => string;
  dataHora: (valor: unknown) => string;
}>();

const folhaFinal = computed(() => props.anexos.filter((anexo) => anexo.tipo === "folha_fechamento"));
const folhaCreare = computed(() => props.anexos.filter((anexo) => anexo.tipo === "relatorio_vendas_creare"));
const comprovantesCartao = computed(() => props.anexos.filter((anexo) => anexo.tipo === "comprovante_cartao"));
const entradas = computed(() =>
  props.transferencias.filter((item) => ["abertura", "suprimento"].includes(String(item.tipo)))
);
const saidas = computed(() =>
  props.transferencias.filter((item) => ["sangria", "retorno"].includes(String(item.tipo)))
);
const totalCartoes = computed(() => props.maquininha.reduce((total, linha) => total + (linha.liquido ?? 0), 0));
const dadosVendas = computed(() => registro(props.relatorioVendas?.dados));
const vendas = computed(() => registro(dadosVendas.value.vendas));
const porPagamento = computed(() =>
  (Array.isArray(vendas.value.porFormaPagamento) ? vendas.value.porFormaPagamento : []).map(registro)
);
const diferenca = computed(() => {
  if (props.ajuste) return props.numero(props.ajuste.valorDiferenca);
  const esperado = props.numero(props.resumo?.valorFisicoEsperadoFechamento);
  const contado =
    props.numero(props.resumo?.valorEspecieFechamento) + props.numero(props.resumo?.valorMoedasFechamento);
  return contado - esperado;
});
const totalVendas = computed(() => props.numero(vendas.value.totalGeral));

function registro(valor: unknown): Registro {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Registro) : {};
}
function descricaoTransferencia(item: Transferencia) {
  return String(
    item.observacao ||
      (item.tipo === "abertura"
        ? "Fundo de abertura"
        : item.tipo === "suprimento"
          ? "Suprimento"
          : item.tipo === "sangria"
            ? "Sangria"
            : "Retorno final")
  );
}
function rotuloPagamento(item: Registro) {
  return props.texto(item.formaPagamento || item.categoriaFechamentoCaixa).replace("--", "Não informado");
}
</script>

<template>
  <section class="folha-kaylane" aria-labelledby="folha-digital-titulo">
    <div class="folha-kaylane__cabecalho">
      <div>
        <div class="text-overline text-primary">TESOURARIA</div>
        <h3 id="folha-digital-titulo" class="text-h6">Relatório do fechamento</h3>
      </div>
      <v-chip :color="folhaFinal.length ? 'success' : 'warning'" variant="tonal" size="small">
        {{ folhaFinal.length ? "Folha final anexada" : "Folha final pendente" }}
      </v-chip>
    </div>

    <section class="folha-kaylane__bloco">
      <h4>Identificação</h4>
      <div class="identificacao">
        <strong>{{ texto(caixa.pdvNome) }}</strong>
        <span>{{ dataHora(caixa.dataHoraAbertura) }} · {{ texto(caixa.turnoNome) }}</span>
        <span>Responsável: {{ texto(resumo?.caixaResponsavelNomeFechamento || caixa.usuarioCaixaNome) }}</span>
        <span v-if="resumo?.supervisorResponsavelNomeFechamento">
          Supervisor: {{ texto(resumo.supervisorResponsavelNomeFechamento) }}
        </span>
      </div>
    </section>

    <section class="folha-kaylane__bloco">
      <h4>Transferência de entrada — Total: {{ dinheiro(numero(resumo?.totalTransferenciasEntrada)) }}</h4>
      <div v-if="entradas.length" class="linhas">
        <div v-for="item in entradas" :key="String(item.id)">
          <span
            >{{ descricaoTransferencia(item)
            }}<small v-if="item.lacreNumero"> · Lacre {{ item.lacreNumero }}</small></span
          >
          <strong>{{ dinheiro(numero(item.valorOriginal)) }}</strong>
        </div>
      </div>
      <p v-else>Sem transferência de entrada registrada.</p>
    </section>

    <section class="folha-kaylane__bloco">
      <h4>Sangrias e retornos — Total: {{ dinheiro(numero(resumo?.totalTransferenciasSaida)) }}</h4>
      <div v-if="saidas.length" class="linhas">
        <div v-for="item in saidas" :key="String(item.id)">
          <span
            >{{ descricaoTransferencia(item)
            }}<small v-if="item.lacreNumero"> · Lacre {{ item.lacreNumero }}</small></span
          >
          <strong>{{ dinheiro(numero(item.valorOriginal)) }}</strong>
        </div>
      </div>
      <p v-else>Nenhuma sangria ou retorno registrado.</p>
    </section>

    <section class="folha-kaylane__bloco">
      <h4>Relatório PDV / CREARE — Total: {{ dinheiro(totalVendas) }}</h4>
      <div v-if="porPagamento.length" class="linhas">
        <div v-for="(item, indice) in porPagamento" :key="String(item.id || indice)">
          <span>{{ rotuloPagamento(item) }}</span
          ><strong>{{ dinheiro(numero(item.total)) }}</strong>
        </div>
      </div>
      <p v-else>Nenhum relatório CREARE gerado neste caixa.</p>
      <div v-if="folhaCreare.length" class="anexos-inline">
        <a v-for="anexo in folhaCreare" :key="anexo.id" :href="anexo.href" target="_blank">
          Abrir folha CREARE: {{ anexo.nomeOriginal }}
        </a>
      </div>
    </section>

    <section class="folha-kaylane__bloco">
      <h4>Relatório cartões (líquido)</h4>
      <div v-if="maquininha.length" class="linhas">
        <div v-for="linha in maquininha" :key="linha.forma">
          <span>{{ linha.forma }}</span
          ><strong>{{ linha.liquido === null ? "Não informado" : dinheiro(linha.liquido) }}</strong>
        </div>
        <div class="linha-total">
          <span>Total cartões</span><strong>{{ dinheiro(totalCartoes) }}</strong>
        </div>
      </div>
      <p v-else>Nenhuma leitura de maquininha informada.</p>
      <div v-if="comprovantesCartao.length" class="anexos-inline">
        <a v-for="anexo in comprovantesCartao" :key="anexo.id" :href="anexo.href" target="_blank">
          Abrir comprovante: {{ anexo.nomeOriginal }}
        </a>
      </div>
    </section>

    <section class="folha-kaylane__bloco">
      <h4>Transferência final</h4>
      <div class="linhas">
        <div>
          <span>Nº lacre de abertura</span><strong>{{ texto(resumo?.lacreAbertura) }}</strong>
        </div>
        <div>
          <span>Nº lacre final</span><strong>{{ texto(resumo?.lacreFechamento) }}</strong>
        </div>
        <div>
          <span>Valor em notas</span><strong>{{ dinheiro(numero(resumo?.valorEspecieFechamento)) }}</strong>
        </div>
        <div>
          <span>Valor em moedas</span><strong>{{ dinheiro(numero(resumo?.valorMoedasFechamento)) }}</strong>
        </div>
        <div>
          <span>Contado na gaveta</span>
          <strong>{{
            dinheiro(numero(resumo?.valorEspecieFechamento) + numero(resumo?.valorMoedasFechamento))
          }}</strong>
        </div>
        <div>
          <span>Esperado na gaveta</span><strong>{{ dinheiro(numero(resumo?.valorFisicoEsperadoFechamento)) }}</strong>
        </div>
        <div :class="diferenca ? 'text-error' : 'text-success'">
          <span>{{ diferenca < 0 ? "Falta" : diferenca > 0 ? "Sobra" : "Conferência" }}</span>
          <strong>{{ diferenca ? dinheiro(diferenca) : "Bateu" }}</strong>
        </div>
      </div>
    </section>

    <section class="relatorio-final">
      <h4>Relatório final</h4>
      <div class="relatorio-final__grade">
        <v-sheet class="resumo resumo--vendas"
          ><span>Venda</span><strong>{{ dinheiro(totalVendas) }}</strong></v-sheet
        >
        <v-sheet class="resumo resumo--transferencias">
          <span>Transferências</span
          ><strong>{{
            dinheiro(numero(resumo?.totalTransferenciasEntrada) - numero(resumo?.totalTransferenciasSaida))
          }}</strong>
        </v-sheet>
        <v-sheet class="resumo resumo--despesas"
          ><span>Despesas</span><strong>{{ dinheiro(numero(resumo?.totalDespesas)) }}</strong></v-sheet
        >
        <v-sheet class="resumo resumo--mercadorias"
          ><span>Mercadorias</span><strong>{{ dinheiro(numero(resumo?.totalMercadorias)) }}</strong></v-sheet
        >
        <v-sheet class="resumo resumo--retiradas"
          ><span>Retiradas</span><strong>{{ dinheiro(numero(resumo?.totalRetiradas)) }}</strong></v-sheet
        >
      </div>
      <v-sheet class="diferenca-geral" :class="diferenca ? 'diferenca-geral--alerta' : 'diferenca-geral--ok'">
        <span>Diferença geral</span><strong>{{ diferenca ? dinheiro(diferenca) : "R$ 0,00" }}</strong>
        <small>{{
          diferenca < 0
            ? "Falta a justificar no fechamento."
            : diferenca > 0
              ? "Sobra registrada no fechamento."
              : "Valores físicos conferem."
        }}</small>
      </v-sheet>
    </section>

    <section class="folha-kaylane__bloco anexos-finais">
      <h4>Folhas e comprovantes anexados</h4>
      <div v-if="folhaFinal.length" class="anexos-inline">
        <a v-for="anexo in folhaFinal" :key="anexo.id" :href="anexo.href" target="_blank">
          Abrir folha final: {{ anexo.nomeOriginal }}
        </a>
      </div>
      <p v-else>Folha final ainda não foi anexada pelo operador antes do encerramento.</p>
    </section>
  </section>
</template>

<style scoped>
.folha-kaylane {
  max-width: 760px;
  margin: 0 auto;
}
.folha-kaylane__cabecalho {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}
.folha-kaylane__cabecalho h3,
.folha-kaylane__bloco h4,
.relatorio-final h4 {
  margin: 0;
}
.folha-kaylane__bloco {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 16px;
}
.folha-kaylane__bloco h4 {
  font-size: 0.98rem;
  margin-bottom: 12px;
}
.folha-kaylane__bloco p {
  margin: 0;
  color: rgb(var(--v-theme-on-surface-variant));
}
.identificacao {
  display: grid;
  gap: 4px;
}
.identificacao strong {
  font-size: 1rem;
}
.identificacao span {
  color: rgb(var(--v-theme-on-surface-variant));
}
.linhas {
  display: grid;
  gap: 7px;
}
.linhas > div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}
.linhas span {
  min-width: 0;
}
.linhas small {
  color: rgb(var(--v-theme-on-surface-variant));
}
.linha-total {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  margin-top: 5px;
  padding-top: 8px;
}
.anexos-inline {
  display: grid;
  gap: 6px;
  margin-top: 12px;
}
.anexos-inline a {
  color: rgb(var(--v-theme-primary));
  font-size: 0.84rem;
  overflow-wrap: anywhere;
}
.relatorio-final {
  margin: 22px 0;
}
.relatorio-final__grade {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.resumo {
  min-height: 92px;
  padding: 13px;
  border-left: 4px solid;
  border-radius: 10px;
  display: grid;
  align-content: center;
  gap: 4px;
}
.resumo span,
.diferenca-geral span {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
}
.resumo strong {
  font-size: 1.08rem;
}
.resumo--vendas {
  border-color: #d99b00;
  background: rgba(217, 155, 0, 0.12);
}
.resumo--transferencias {
  border-color: #f97316;
  background: rgba(249, 115, 22, 0.12);
}
.resumo--despesas {
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.12);
}
.resumo--mercadorias {
  border-color: #16a34a;
  background: rgba(22, 163, 74, 0.12);
}
.resumo--retiradas {
  border-color: #2563eb;
  background: rgba(37, 99, 235, 0.12);
}
.diferenca-geral {
  display: grid;
  gap: 4px;
  padding: 14px;
  border-left: 4px solid;
  border-radius: 10px;
  margin-top: 12px;
}
.diferenca-geral strong {
  font-size: 1.35rem;
}
.diferenca-geral small {
  color: rgb(var(--v-theme-on-surface-variant));
}
.diferenca-geral--ok {
  border-color: #16a34a;
  background: rgba(22, 163, 74, 0.12);
}
.diferenca-geral--alerta {
  border-color: #7c3aed;
  background: rgba(124, 58, 237, 0.12);
}
@media (max-width: 599px) {
  .folha-kaylane__cabecalho {
    align-items: flex-start;
    flex-direction: column;
  }
  .folha-kaylane__bloco {
    padding: 14px;
  }
  .linhas > div {
    gap: 10px;
  }
  .linhas strong {
    white-space: nowrap;
  }
  .relatorio-final__grade {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .resumo {
    min-height: 80px;
  }
}
</style>
