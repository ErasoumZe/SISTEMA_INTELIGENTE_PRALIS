<script setup lang="ts">
import { computed } from "vue";
import { dinheiro } from "~/utils/domain";
import { formatarDataHora } from "~/utils/formatacao";
import { GRUPOS_FOLHA_CREARE, type CampoValorFolhaCreare, type FolhaCreareGerada } from "~/utils/folha-creare";

// R-225 · Relatorio final: a conferencia do turno em cartoes (um por linha da folha, cada um abre e fecha). Cada linha da folha do CREARE (espelho do
// fechamento manual do PDV) contra o relatorio de vendas do Pralis e, nas formas de cartao/Pix, contra o
// liquido da maquininha. Saldo Inicial, CLIENTES e Saldo Final Dinheiro so aparecem no rodape (sem comparar).
type FormaMaquininha = "credito" | "debito" | "pix" | "voucher";
const props = defineProps<{
  creare: FolhaCreareGerada;
  versao: number;
  maquininha: Partial<Record<FormaMaquininha, number | null>>;
  periodo: { inicio: string; fim: string } | null;
  // O que o Pralis registrou e o que o PDV vendeu: o operador reconhece pelo nome do PDV, nao "Pralis".
  pdvNome?: string | null;
}>();
const nomePdv = computed(() => props.pdvNome?.trim() || "PDV");

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
      // Maior diferenca encontrada (folha ou maquininha contra o PDV): vai no selo.
      let diferenca = 0;
      if (folha === null) problemas.push("Sem valor na folha");
      else if (pralis !== null && centavos(folha) !== centavos(pralis)) {
        problemas.push(`Folha ${sentido(folha - pralis)} que o ${nomePdv.value}`);
        diferenca = Math.max(diferenca, Math.abs(folha - pralis));
      }
      if (temMaquininha && maquininha === null) problemas.push("Maquininha sem leitura");
      else if (temMaquininha && maquininha !== null && pralis !== null && centavos(maquininha) !== centavos(pralis)) {
        problemas.push(`Maquininha ${sentido(maquininha - pralis)} que o ${nomePdv.value}`);
        diferenca = Math.max(diferenca, Math.abs(maquininha - pralis));
      }
      return { ...campo, folha, pralis, temMaquininha, maquininha, problemas, diferenca };
    })
);
const comDiferenca = computed(() => linhas.value.filter((linha) => linha.problemas.length).length);
const soNaFolha = computed(() =>
  campos
    .filter((campo) => !campo.compara)
    .map((campo) => `${campo.rotulo}: ${valor(numeroDaFolha(campo.chave))}`)
    .join(" · ")
);

// Cada linha tem a cor da sua categoria, igual as do caixa: o operador acha a linha pela cor.
const CORES: Record<string, string> = {
  trocoInicial: "var(--cat-transferencias-base)",
  credito: "var(--cx-brand)",
  debito: "var(--cat-retiradas-base)",
  dinheiro: "var(--cx-positive)",
  pix: "var(--cat-mercadorias-base)",
  voucher: "var(--cat-entradas-base)",
  total: "var(--cat-resultado-base)",
  despesas: "var(--cat-despesas-base)",
  sangria: "var(--cx-attention)"
};
function selo(linha: { problemas: string[]; diferenca: number }) {
  if (!linha.problemas.length) return { classe: "ok", texto: "✓ Confere" };
  if (!linha.diferenca) return { classe: "pendente", texto: "Sem valor" };
  return { classe: "divergente", texto: `Diferença ${dinheiro(Math.round(linha.diferenca * 100) / 100)}` };
}

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
const horarioConfere = computed(() => horarios.value.every((horario) => horario.situacao === "ok"));
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

    <div v-else class="conferencia__cartoes">
      <details
        v-for="linha in linhas"
        :key="linha.chave"
        class="conferencia__cartao"
        :style="{ '--cor': CORES[linha.chave] }"
        :data-teste="`final-linha-${linha.chave}`"
      >
        <summary>
          <span class="conferencia__nome">{{ linha.rotulo }}</span>
          <span class="conferencia__valor">{{ valor(linha.folha, linha.negativo) }}</span>
          <span class="conferencia__selo" :class="`conferencia__selo--${selo(linha).classe}`">{{
            selo(linha).texto
          }}</span>
        </summary>
        <dl class="conferencia__valores">
          <div>
            <dt>Folha CREARE</dt>
            <dd>{{ valor(linha.folha, linha.negativo) }}</dd>
          </div>
          <div>
            <dt>{{ nomePdv }}</dt>
            <dd>{{ valor(linha.pralis, linha.negativo) }}</dd>
          </div>
          <div v-if="linha.temMaquininha">
            <dt>Maquininha</dt>
            <dd>{{ valor(linha.maquininha) }}</dd>
          </div>
        </dl>
        <p class="conferencia__explicacao">
          {{ linha.problemas.length ? linha.problemas.join(" · ") : `Folha e ${nomePdv} iguais.` }}
        </p>
      </details>

      <details class="conferencia__cartao" :style="{ '--cor': 'var(--cat-resultado-base)' }">
        <summary>
          <span class="conferencia__nome">Horário da folha</span>
          <span
            class="conferencia__selo"
            :class="horarioConfere ? 'conferencia__selo--ok' : 'conferencia__selo--divergente'"
            >{{ horarioConfere ? "Confere" : "Não bate" }}</span
          >
        </summary>
        <dl class="conferencia__horarios">
          <div v-for="horario in horarios" :key="horario.titulo">
            <dt>{{ horario.titulo }}</dt>
            <dd>
              Folha {{ horario.folha ?? "—" }} · Caixa {{ horario.caixa ?? "—" }} ·
              <strong>{{
                horario.situacao === "ok" ? "Confere" : horario.situacao === "pendente" ? "Sem horário" : "Não bate"
              }}</strong>
            </dd>
          </div>
        </dl>
      </details>

      <details class="conferencia__cartao" :style="{ '--cor': 'var(--cx-ink-soft)' }">
        <summary>
          <span class="conferencia__nome">Outros dados da folha</span>
          <span class="conferencia__selo conferencia__selo--pendente">Só na folha</span>
        </summary>
        <p class="conferencia__explicacao">{{ soNaFolha }}.</p>
        <p v-if="creare.somaFormasConfereTotal === false" class="conferencia__explicacao">
          A soma das formas de pagamento da folha não dá o Total impresso.
        </p>
        <p class="conferencia__explicacao">Maquininha à tarde: o líquido já desconta a leitura da manhã.</p>
      </details>
    </div>
  </section>
</template>

<style scoped>
.conferencia {
  display: grid;
  gap: var(--cx-sp-2);
  margin-top: var(--cx-sp-3);
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
.conferencia__nota {
  margin: 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
.conferencia__cartoes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
  gap: 8px;
  align-items: start;
}
.conferencia__cartao {
  border: 1px solid color-mix(in srgb, var(--cor) 45%, var(--cx-line));
  border-left: 4px solid var(--cor);
  border-radius: 10px;
  background: color-mix(in srgb, var(--cor) 9%, var(--cx-surface));
}
.conferencia__cartao summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  gap: 8px;
  align-items: center;
  min-height: 48px;
  padding: 8px 12px;
  cursor: pointer;
  list-style: none;
  font-variant-numeric: tabular-nums;
}
.conferencia__cartao summary::-webkit-details-marker {
  display: none;
}
.conferencia__cartao summary::after {
  content: "▾";
  color: var(--cx-ink-soft);
  transition: transform 160ms ease;
}
.conferencia__cartao[open] summary::after {
  transform: rotate(180deg);
}
.conferencia__cartao summary:focus-visible {
  outline: 2px solid var(--cor);
  outline-offset: 2px;
  border-radius: 8px;
}
.conferencia__nome {
  min-width: 0;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.conferencia__valor {
  font-weight: 700;
}
/* Selos em destaque: verde solido quando confere, vermelho solido com o valor quando ha diferenca. */
.conferencia__selo {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 800;
  white-space: nowrap;
}
.conferencia__selo--ok {
  background: var(--cx-positive);
  color: #fff;
}
.conferencia__selo--divergente {
  background: var(--cx-negative);
  color: #fff;
}
.conferencia__selo--pendente {
  background: var(--cx-surface-sunken);
  color: var(--cx-ink-soft);
}
.conferencia__valores {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0 12px;
}
.conferencia__valores dt,
.conferencia__horarios dt {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
.conferencia__valores dd {
  margin: 2px 0 0;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.conferencia__explicacao {
  margin: 8px 12px 12px;
  font-size: var(--cx-fs-caption);
  font-weight: 600;
}
.conferencia__horarios {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0 12px 12px;
}
.conferencia__horarios dd {
  margin: 0;
}
@media (prefers-reduced-motion: reduce) {
  .conferencia__cartao summary::after {
    transition: none;
  }
}
@media (width <= 420px) {
  .conferencia__cartao summary {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .conferencia__cartao summary::after {
    display: none;
  }
  .conferencia__valor {
    grid-row: 2;
    color: var(--cx-ink-soft);
  }
}
</style>
