<script setup lang="ts">
import { computed } from "vue";
import { dinheiro } from "~/utils/domain";
import { formatarDataHora } from "~/utils/formatacao";
import { GRUPOS_FOLHA_CREARE, type CampoValorFolhaCreare, type FolhaCreareGerada } from "~/utils/folha-creare";

// R-225 · Relatorio final: UMA tabela de conferencia do turno. Cada linha da folha do CREARE (espelho do
// fechamento manual do PDV) contra o relatorio de vendas do Pralis e, nas formas de cartao/Pix, contra o
// liquido da maquininha. Saldo Inicial, CLIENTES e Saldo Final Dinheiro so aparecem no rodape (sem comparar).
type FormaMaquininha = "credito" | "debito" | "pix" | "voucher";
const props = defineProps<{
  creare: FolhaCreareGerada;
  versao: number;
  maquininha: Partial<Record<FormaMaquininha, number | null>>;
  periodo: { inicio: string; fim: string } | null;
}>();

const FORMAS_MAQUININHA: readonly string[] = ["credito", "debito", "pix", "voucher"];
const centavos = (valor: number) => Math.round(valor * 100);
const modeloAntigo = computed(() => props.versao < 4);
const campos = GRUPOS_FOLHA_CREARE.flatMap((grupo) => grupo.campos);

function numeroDaFolha(chave: CampoValorFolhaCreare) {
  const valor = props.creare.leitura?.[chave];
  return typeof valor === "number" ? valor : null;
}

function sentido(diferenca: number) {
  return `${dinheiro(Math.abs(Math.round(diferenca * 100) / 100))} ${diferenca > 0 ? "a mais" : "a menos"}`;
}

function valor(numero: number | null, negativo?: boolean) {
  if (numero === null) return "—";
  return negativo && numero !== 0 ? `-${dinheiro(numero)}` : dinheiro(numero);
}

const linhas = computed(() =>
  campos
    .filter((campo) => campo.compara)
    .map((campo) => {
      const folha = numeroDaFolha(campo.chave);
      const pralis = props.creare.pralis?.[campo.chave] ?? null;
      const temMaquininha = FORMAS_MAQUININHA.includes(campo.chave);
      const maquininha = temMaquininha ? (props.maquininha[campo.chave as FormaMaquininha] ?? null) : null;
      const problemas: string[] = [];
      if (folha === null) problemas.push("Sem valor na folha");
      else if (pralis !== null && centavos(folha) !== centavos(pralis)) {
        problemas.push(`Folha ${sentido(folha - pralis)} que o Pralis`);
      }
      if (temMaquininha && maquininha === null) problemas.push("Maquininha sem leitura");
      else if (temMaquininha && maquininha !== null && pralis !== null && centavos(maquininha) !== centavos(pralis)) {
        problemas.push(`Maquininha ${sentido(maquininha - pralis)} que o Pralis`);
      }
      return { ...campo, folha, pralis, temMaquininha, maquininha, problemas };
    })
);
const comDiferenca = computed(() => linhas.value.filter((linha) => linha.problemas.length).length);
const soNaFolha = computed(() =>
  campos
    .filter((campo) => !campo.compara)
    .map((campo) => `${campo.rotulo}: ${valor(numeroDaFolha(campo.chave))}`)
    .join(" · ")
);

// Horario em datas legiveis ("folha 26/10/2026 06:14:58 · caixa 28/10/2026 13:18"), nunca em minutos.
const horarios = computed(() => {
  const situacao = (valor?: string) =>
    !valor || valor === "pendente" ? "pendente" : valor === "ok" ? "ok" : "divergente";
  return [
    {
      titulo: "Início das vendas",
      folha: props.creare.leitura?.periodoInicio ?? null,
      caixa: props.periodo ? formatarDataHora(props.periodo.inicio) : null,
      situacao: situacao(props.creare.horario?.inicio.situacao)
    },
    {
      titulo: "Emissão da folha × corte",
      folha: props.creare.leitura?.dataEmissao ?? null,
      caixa: props.periodo ? formatarDataHora(props.periodo.fim) : null,
      situacao: situacao(props.creare.horario?.emissao.situacao)
    }
  ];
});
</script>

<template>
  <section class="conferencia" aria-labelledby="conferencia-titulo" data-teste="relatorio-final-folha-creare">
    <header class="conferencia__cabecalho">
      <strong id="conferencia-titulo">Conferência do turno</strong>
      <span
        v-if="!modeloAntigo"
        class="conferencia__resumo"
        :class="comDiferenca ? 'conferencia__resumo--divergente' : 'conferencia__resumo--ok'"
      >
        {{ comDiferenca ? `${comDiferenca} linha(s) para conferir` : "Tudo confere" }}
      </span>
    </header>

    <p v-if="modeloAntigo" class="conferencia__nota">
      O relatório de vendas foi gerado no modelo antigo da folha. Gere de novo na etapa Vendas para conferir linha a
      linha.
    </p>

    <template v-else>
      <div class="conferencia__tabela" role="table" aria-label="Folha do CREARE, Pralis e maquininha">
        <div class="conferencia__linha conferencia__linha--titulo" role="row">
          <span role="columnheader">Linha da folha</span>
          <span role="columnheader">Folha CREARE</span>
          <span role="columnheader">Pralis</span>
          <span role="columnheader">Maquininha</span>
          <span role="columnheader" class="conferencia__situacao">Situação</span>
        </div>
        <div
          v-for="linha in linhas"
          :key="linha.chave"
          class="conferencia__linha"
          :class="{ 'conferencia__linha--divergente': linha.problemas.length }"
          role="row"
          :data-teste="`final-linha-${linha.chave}`"
        >
          <span role="cell" class="conferencia__rotulo">{{ linha.rotulo }}</span>
          <span role="cell"><small>Folha </small>{{ valor(linha.folha, linha.negativo) }}</span>
          <span role="cell"><small>Pralis </small>{{ valor(linha.pralis, linha.negativo) }}</span>
          <span role="cell"><small>Maquininha </small>{{ linha.temMaquininha ? valor(linha.maquininha) : "—" }}</span>
          <span role="cell" class="conferencia__situacao">
            {{ linha.problemas.length ? linha.problemas.join(" · ") : "Confere" }}
          </span>
        </div>
      </div>

      <p class="conferencia__nota">
        <strong>Só na folha:</strong> {{ soNaFolha }}.
        <template v-if="creare.somaFormasConfereTotal === false">
          A soma das formas de pagamento da folha não dá o Total impresso.</template
        >
      </p>
      <p class="conferencia__nota">Maquininha à tarde: o líquido já desconta a leitura da manhã.</p>

      <dl class="conferencia__horarios">
        <div v-for="horario in horarios" :key="horario.titulo">
          <dt>{{ horario.titulo }}</dt>
          <dd>
            Folha {{ horario.folha ?? "—" }} · Caixa {{ horario.caixa ?? "—" }} ·
            <strong :class="`conferencia__horario--${horario.situacao}`">{{
              horario.situacao === "ok" ? "Confere" : horario.situacao === "pendente" ? "Sem horário" : "Não bate"
            }}</strong>
          </dd>
        </div>
      </dl>
    </template>
  </section>
</template>

<style scoped>
.conferencia {
  display: grid;
  gap: var(--cx-sp-2);
  margin-top: var(--cx-sp-3);
  padding: 12px;
  border: 1px solid var(--cx-line);
  border-radius: 12px;
}
.conferencia__cabecalho {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.conferencia__resumo {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: var(--cx-fs-caption);
  font-weight: 700;
}
.conferencia__resumo--ok {
  background: color-mix(in srgb, var(--cx-positive) 22%, transparent);
}
.conferencia__resumo--divergente {
  background: color-mix(in srgb, var(--cx-attention) 28%, transparent);
}
.conferencia__linha {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) repeat(3, minmax(0, 1fr)) minmax(0, 1.6fr);
  gap: 8px;
  align-items: center;
  padding: 6px 8px;
  border-bottom: 1px solid var(--cx-line);
  font-variant-numeric: tabular-nums;
}
.conferencia__linha small {
  display: none;
  color: var(--cx-ink-soft);
}
.conferencia__linha--titulo {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
  font-weight: 700;
}
.conferencia__linha--divergente {
  background: color-mix(in srgb, var(--cx-attention) 12%, transparent);
}
.conferencia__situacao {
  font-size: var(--cx-fs-caption);
  font-weight: 700;
}
.conferencia__linha:not(.conferencia__linha--divergente, .conferencia__linha--titulo) .conferencia__situacao {
  color: var(--cx-positive);
}
.conferencia__nota {
  margin: 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
.conferencia__horarios {
  display: grid;
  gap: 6px;
  margin: 0;
}
.conferencia__horarios div {
  display: grid;
  grid-template-columns: minmax(150px, auto) 1fr;
  gap: 8px;
}
.conferencia__horarios dt {
  font-weight: 700;
}
.conferencia__horarios dd {
  margin: 0;
  color: var(--cx-ink-soft);
}
.conferencia__horario--ok {
  color: var(--cx-positive);
}
.conferencia__horario--divergente {
  color: var(--cx-ink);
}
@media (width <= 720px) {
  .conferencia__linha {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .conferencia__linha small {
    display: block;
  }
  /* Os titulos saem da vista mas continuam para o leitor de tela; cada valor ganha o proprio rotulo. */
  .conferencia__linha--titulo {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .conferencia__rotulo,
  .conferencia__linha .conferencia__situacao {
    grid-column: 1 / -1;
  }
  .conferencia__rotulo {
    font-weight: 700;
  }
  .conferencia__horarios div {
    grid-template-columns: 1fr;
    gap: 2px;
  }
}
</style>
