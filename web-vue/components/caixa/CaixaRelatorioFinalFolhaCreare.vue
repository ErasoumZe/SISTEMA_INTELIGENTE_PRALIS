<script setup lang="ts">
import { computed } from "vue";
import { dinheiro } from "~/utils/domain";
import { GRUPOS_FOLHA_CREARE, type FolhaCreareGerada } from "~/utils/folha-creare";

// R-225 · Relatorio final: a folha do CREARE (espelho do fechamento manual do PDV) contra o relatorio de
// vendas do Pralis, linha a linha. CLIENTES, Saldo Inicial e Saldo Final Dinheiro so aparecem (sem comparar).
const props = defineProps<{ creare: FolhaCreareGerada; versao: number }>();

const modeloAntigo = computed(() => props.versao < 4);
const linhas = computed(() =>
  GRUPOS_FOLHA_CREARE.flatMap((grupo) => grupo.campos).map((campo) => {
    const folha = props.creare.leitura?.[campo.chave] ?? null;
    const pralis = campo.compara ? (props.creare.pralis?.[campo.chave] ?? null) : null;
    return {
      ...campo,
      folha: typeof folha === "number" ? folha : null,
      pralis,
      situacao: campo.compara ? (props.creare.comparacao[campo.chave] ?? "pendente") : null
    };
  })
);
const divergencias = computed(() => linhas.value.filter((linha) => linha.situacao === "divergente").length);
const pendentes = computed(() => linhas.value.filter((linha) => linha.situacao === "pendente").length);

const textoInicio = computed(() => {
  const inicio = props.creare.horario?.inicio;
  if (!inicio || inicio.situacao === "pendente") return "";
  if (inicio.situacao === "ok") return "O início da folha bate com o início das vendas do caixa.";
  const minutos = Math.abs(inicio.diferencaMinutos ?? 0);
  return `O início da folha difere ${minutos} min do início das vendas do caixa.`;
});
const textoEmissao = computed(() => {
  const emissao = props.creare.horario?.emissao;
  if (!emissao || emissao.situacao === "pendente") return "";
  if (emissao.situacao === "ok") return "A folha foi impressa no corte do fechamento.";
  const minutos = Math.abs(emissao.diferencaMinutos ?? 0);
  return emissao.situacao === "antes_do_corte"
    ? `A folha foi impressa ${minutos} min antes do corte: vendas depois disso não estão nela.`
    : `A folha foi impressa ${minutos} min depois do corte.`;
});

function valor(numero: number | null, negativo?: boolean) {
  if (numero === null) return "—";
  return negativo ? `-${dinheiro(numero)}` : dinheiro(numero);
}
</script>

<template>
  <section class="folha-final" aria-labelledby="folha-final-titulo" data-teste="relatorio-final-folha-creare">
    <header class="folha-final__cabecalho">
      <strong id="folha-final-titulo">Folha do CREARE × relatório de vendas</strong>
      <span
        v-if="!modeloAntigo"
        class="folha-final__resumo"
        :class="divergencias ? 'folha-final__resumo--divergente' : pendentes ? '' : 'folha-final__resumo--ok'"
      >
        {{
          divergencias
            ? `${divergencias} linha(s) com diferença`
            : pendentes
              ? `${pendentes} linha(s) sem valor na folha`
              : "Tudo confere"
        }}
      </span>
    </header>

    <p v-if="modeloAntigo" class="folha-final__nota">
      O relatório de vendas foi gerado no modelo antigo da folha. Gere de novo na etapa Vendas para comparar linha a
      linha.
    </p>

    <template v-else>
      <div class="folha-final__tabela" role="table" aria-label="Comparação linha a linha">
        <div class="folha-final__linha folha-final__linha--titulo" role="row">
          <span role="columnheader">Linha da folha</span>
          <span role="columnheader">Folha</span>
          <span role="columnheader">Pralis</span>
          <span role="columnheader">Situação</span>
        </div>
        <div
          v-for="linha in linhas"
          :key="linha.chave"
          class="folha-final__linha"
          :class="linha.situacao ? `folha-final__linha--${linha.situacao}` : ''"
          role="row"
          :data-teste="`final-linha-${linha.chave}`"
        >
          <span role="cell">{{ linha.rotulo }}</span>
          <span role="cell">{{ valor(linha.folha, linha.negativo) }}</span>
          <span role="cell">{{ linha.compara ? valor(linha.pralis, linha.negativo) : "—" }}</span>
          <span role="cell" class="folha-final__situacao">
            <template v-if="!linha.compara">Só na folha</template>
            <template v-else-if="linha.situacao === 'ok'">Confere</template>
            <template v-else-if="linha.situacao === 'divergente'"
              >Diferença {{ dinheiro((linha.folha ?? 0) - (linha.pralis ?? 0)) }}</template
            >
            <template v-else>Sem valor</template>
          </span>
        </div>
      </div>
      <p v-if="creare.somaFormasConfereTotal === false" class="folha-final__nota folha-final__nota--alerta">
        A soma das formas de pagamento da folha não dá o Total impresso.
      </p>
      <p v-if="textoInicio" class="folha-final__nota">{{ textoInicio }}</p>
      <p v-if="textoEmissao" class="folha-final__nota">{{ textoEmissao }}</p>
    </template>
  </section>
</template>

<style scoped>
.folha-final {
  display: grid;
  gap: var(--cx-sp-2);
  margin-top: var(--cx-sp-3);
  padding: 12px;
  border: 1px solid var(--cx-line);
  border-radius: 12px;
}
.folha-final__cabecalho {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.folha-final__resumo {
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--cx-surface-sunken);
  font-size: var(--cx-fs-caption);
  font-weight: 700;
}
.folha-final__resumo--ok {
  background: color-mix(in srgb, var(--cx-positive) 22%, transparent);
}
.folha-final__resumo--divergente {
  background: color-mix(in srgb, var(--cx-attention) 28%, transparent);
}
.folha-final__tabela {
  display: grid;
}
.folha-final__linha {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) repeat(2, minmax(0, 1fr)) minmax(0, 1.1fr);
  gap: 8px;
  align-items: center;
  padding: 6px 8px;
  border-bottom: 1px solid var(--cx-line);
  font-variant-numeric: tabular-nums;
}
.folha-final__linha--titulo {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
  font-weight: 700;
}
.folha-final__linha--ok .folha-final__situacao {
  color: var(--cx-positive);
  font-weight: 700;
}
.folha-final__linha--divergente {
  background: color-mix(in srgb, var(--cx-attention) 12%, transparent);
}
.folha-final__linha--divergente .folha-final__situacao {
  font-weight: 700;
}
.folha-final__situacao {
  color: var(--cx-ink-soft);
}
.folha-final__nota {
  margin: 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
.folha-final__nota--alerta {
  color: var(--cx-ink);
  font-weight: 600;
}
@media (width <= 600px) {
  .folha-final__linha {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  .folha-final__linha--titulo {
    display: none;
  }
  .folha-final__linha span:first-child {
    grid-column: 1 / -1;
    font-weight: 700;
  }
}
</style>
