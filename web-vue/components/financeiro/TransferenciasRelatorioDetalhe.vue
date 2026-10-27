<script setup lang="ts">
import { computed } from "vue";
import type { OperacaoResumo } from "~/types/padaria";
import { dinheiro } from "~/utils/domain";
import { formatarDataHora, formatarDiaDeTimestamp } from "~/utils/formatacao";
import { ROTULO_SITUACAO_LACRE, horaCurta } from "~/utils/transferencias-relatorio";

// Painel de detalhe do relatorio: SO LEITURA, sem nenhuma acao nova. Tres blocos: quem usou o malote,
// os lacres por extenso e a conferencia/observacao.
const props = defineProps<{ operacao: OperacaoResumo; idPainel: string; idTitulo: string }>();

const ehMalote = computed(() => Boolean(props.operacao.situacaoMalote));
const tituloCaixa = computed(() => (ehMalote.value ? "Quem usou o malote" : "Caixa de origem"));
const lacres = computed(() => props.operacao.lacres ?? []);
const caixa = computed(() => props.operacao.caixa ?? null);

const semCaixaTexto = computed(() => {
  if (props.operacao.situacaoMalote === "disponivel") return "Ninguém abriu caixa com este malote ainda.";
  if (props.operacao.situacaoMalote === "recebido_sem_caixa") return "Recebido sem abertura de caixa.";
  if (props.operacao.situacaoMalote === "agendado") return "Agendado: ainda não foi liberado para o PDV.";
  if (props.operacao.situacaoMalote === "cancelado") return "Cancelado: não foi usado.";
  return "Sem caixa vinculado.";
});

const nomeTipo: Record<string, string> = { abertura: "Abertura", sangria: "Sangria", fechamento: "Fechamento" };
const contado = computed(() => (props.operacao.valorRecebido != null ? dinheiro(props.operacao.valorRecebido) : null));
</script>

<template>
  <div :id="idPainel" class="detalhe" role="region" :aria-labelledby="idTitulo">
    <section v-if="ehMalote || caixa" class="detalhe__bloco">
      <h4>{{ tituloCaixa }}</h4>
      <dl v-if="caixa" class="detalhe__lista">
        <div>
          <dt>PDV</dt>
          <dd>{{ caixa.pdvNome || "Não informado" }}</dd>
        </div>
        <div>
          <dt>Turno</dt>
          <dd>{{ caixa.turnoNome || "Não informado" }}</dd>
        </div>
        <div>
          <dt>Operador</dt>
          <dd>{{ caixa.operadorNome || "Não informado" }}</dd>
        </div>
        <div>
          <dt>Supervisor</dt>
          <dd>{{ caixa.supervisorNome || "Não informado" }}</dd>
        </div>
        <div>
          <dt>Aberto em</dt>
          <dd>
            <template v-if="caixa.abertoEm"
              >{{ formatarDiaDeTimestamp(caixa.abertoEm) }} às {{ horaCurta(caixa.abertoEm) }}</template
            >
            <template v-else>Não informado</template>
          </dd>
        </div>
        <div>
          <dt>Situação do caixa</dt>
          <dd class="detalhe__cap">{{ caixa.status }}</dd>
        </div>
      </dl>
      <p v-else class="detalhe__vazio">{{ semCaixaTexto }}</p>
    </section>

    <section class="detalhe__bloco">
      <h4>Lacres</h4>
      <ul v-if="lacres.length" class="detalhe__lacres">
        <li v-for="(lacre, indice) in lacres" :key="`${lacre.tipo}-${indice}`">
          <strong>{{ nomeTipo[lacre.tipo] }}</strong>
          <span>{{ lacre.numero ?? "Número oculto para o seu perfil" }}</span>
          <span class="detalhe__estado">{{ ROTULO_SITUACAO_LACRE[lacre.situacao] }}</span>
          <span v-if="lacre.usadoEmTransferenciaId" class="detalhe__estado">usada em uma sangria</span>
        </li>
      </ul>
      <p v-else-if="operacao.nLacreDoc" class="detalhe__vazio">Lacre {{ operacao.nLacreDoc }}</p>
      <p v-else class="detalhe__vazio">Sem lacre registrado.</p>
    </section>

    <section class="detalhe__bloco">
      <h4>Conferência e observação</h4>
      <dl class="detalhe__lista">
        <div v-if="operacao.dataRecebimento">
          <dt>Recebido em</dt>
          <dd>{{ formatarDataHora(operacao.dataRecebimento) }}</dd>
        </div>
        <div v-if="contado">
          <dt>Contado × declarado</dt>
          <dd>Contado {{ contado }} · Declarado {{ dinheiro(operacao.valorOriginal) }}</dd>
        </div>
        <div v-if="operacao.prazoConfirmacaoEm">
          <dt>Prazo de confirmação</dt>
          <dd>{{ formatarDataHora(operacao.prazoConfirmacaoEm) }}</dd>
        </div>
        <div v-if="operacao.ehPlanejamentoRetorno">
          <dt>Tipo</dt>
          <dd>Planejamento de retorno (legado)</dd>
        </div>
      </dl>
      <p class="detalhe__obs">{{ operacao.observacao || operacao.descricao || "Sem observação." }}</p>
    </section>
  </div>
</template>

<style scoped>
.detalhe {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--cx-sp-4);
  padding: var(--cx-sp-4);
  border-top: 1px solid var(--cx-line-soft);
  background: var(--cx-surface-sunken);
  color: var(--cx-ink);
}
.detalhe__bloco {
  min-width: 0;
}
.detalhe__bloco h4 {
  margin: 0 0 var(--cx-sp-2);
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-micro);
  font-weight: 800;
  letter-spacing: var(--cx-tracking-wide);
  text-transform: uppercase;
}
.detalhe__lista {
  display: grid;
  gap: var(--cx-sp-2);
  margin: 0;
}
.detalhe__lista > div {
  display: grid;
  gap: 2px;
}
.detalhe__lista dt {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
.detalhe__lista dd {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: var(--cx-fs-body);
  font-weight: 600;
}
.detalhe__cap {
  text-transform: capitalize;
}
.detalhe__lacres {
  display: grid;
  gap: var(--cx-sp-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.detalhe__lacres li {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-1) var(--cx-sp-2);
  font-size: var(--cx-fs-caption);
}
.detalhe__lacres strong {
  min-width: 78px;
}
.detalhe__estado,
.detalhe__vazio {
  color: var(--cx-ink-soft);
}
.detalhe__vazio {
  margin: 0;
  font-size: var(--cx-fs-caption);
}
.detalhe__obs {
  margin: var(--cx-sp-2) 0 0;
  overflow-wrap: anywhere;
  font-size: var(--cx-fs-caption);
}
@container lista (width <= 1000px) {
  .detalhe {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@container lista (width <= 780px) {
  .detalhe {
    grid-template-columns: minmax(0, 1fr);
    padding: var(--cx-sp-3);
  }
}
</style>
