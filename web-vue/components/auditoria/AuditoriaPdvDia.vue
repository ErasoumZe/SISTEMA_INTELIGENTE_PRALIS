<script setup lang="ts">
import type { AuditoriaDia, FormaAuditoria, StatusAuditoria } from "@padaria/shared";
import { dinheiro } from "~/utils/domain";

// Auditoria de PDVs: o dia aberto. Um cartao por PDV com os caixas (turno, quem abriu, vendas e total) e, se
// houver, as vendas que nao cairam em nenhum caixa — hora, valor, forma e produtos.
defineProps<{ dia: AuditoriaDia; gerando: boolean }>();
const emit = defineEmits<{ (e: "gerar"): void }>();

const rotulos: Record<StatusAuditoria, string> = {
  ok: "Bateu",
  alerta: "Venda fora de caixa",
  andamento: "Caixa aberto",
  sem_vendas: "Sem vendas"
};
const cores: Record<StatusAuditoria, string> = {
  ok: "success",
  alerta: "error",
  andamento: "primary",
  sem_vendas: "default"
};
const formas: Record<string, string> = {
  dinheiro: "Dinheiro",
  credito: "Crédito",
  debito: "Débito",
  pix: "PIX",
  voucher: "Voucher",
  crediario: "Clientes",
  outros: "Outros"
};
const hora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
    : "--:--";
const turno = (valor: "manha" | "tarde" | null) =>
  valor === "manha" ? "Manhã" : valor === "tarde" ? "Tarde" : "Caixa";
const listaFormas = (lista: FormaAuditoria[]) =>
  lista.map((f) => `${formas[f.categoria] ?? f.categoria} ${dinheiro(f.valor)}`).join(" · ");
const dataLonga = (data: string) =>
  new Date(`${data}T12:00:00Z`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "UTC"
  });
const momento = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
</script>

<template>
  <section class="auditoria-dia" :aria-label="`Auditoria de ${dia.data}`" data-teste="auditoria-detalhe">
    <header class="auditoria-dia__topo">
      <div>
        <h3>{{ dataLonga(dia.data) }}</h3>
        <p>
          {{ dia.vendas }} vendas · {{ dinheiro(dia.total) }}
          <template v-if="dia.vendasFora">
            ·
            <strong class="texto-alerta"
              >{{ dia.vendasFora }} fora de caixa ({{ dinheiro(dia.valorFora) }})</strong
            ></template
          >
        </p>
        <small v-if="dia.gerada" class="auditoria-dia__gerada">
          Auditoria gerada{{ dia.gerada.automatica ? " automaticamente" : "" }} em {{ momento(dia.gerada.em) }}
        </small>
      </div>
      <div class="auditoria-dia__acoes">
        <v-chip :color="cores[dia.status]" variant="tonal" size="small">{{ rotulos[dia.status] }}</v-chip>
        <v-btn
          size="small"
          variant="tonal"
          color="primary"
          prepend-icon="mdi-calendar-check-outline"
          :loading="gerando"
          data-teste="gerar-auditoria"
          @click="emit('gerar')"
          >{{ dia.gerada ? "Gerar de novo" : "Gerar auditoria" }}</v-btn
        >
      </div>
    </header>

    <p v-if="!dia.pdvs.length" class="auditoria-dia__vazio">Nenhuma venda da CREARE neste dia.</p>

    <article
      v-for="pdv in dia.pdvs"
      :key="pdv.pdvId ?? pdv.pdvNome"
      class="auditoria-pdv"
      :class="`auditoria-pdv--${pdv.status}`"
    >
      <header class="auditoria-pdv__topo">
        <strong>{{ pdv.pdvNome }}</strong>
        <span>{{ pdv.vendas }} vendas · {{ dinheiro(pdv.total) }}</span>
        <v-chip :color="cores[pdv.status]" variant="tonal" size="x-small">{{ rotulos[pdv.status] }}</v-chip>
      </header>

      <ul class="auditoria-pdv__caixas">
        <li v-for="caixa in pdv.caixas" :key="caixa.caixaId">
          <span class="auditoria-pdv__turno">{{ turno(caixa.turno) }}</span>
          <span>{{ caixa.operador ?? "—" }} · {{ hora(caixa.abertura) }}–{{ hora(caixa.fechamento) }}</span>
          <span
            >{{ caixa.vendas }} vendas · <strong>{{ dinheiro(caixa.total) }}</strong></span
          >
          <small v-if="caixa.formas.length">{{ listaFormas(caixa.formas) }}</small>
        </li>
        <li v-if="!pdv.caixas.length" class="auditoria-pdv__sem-caixa">Nenhum caixa aberto neste PDV no dia.</li>
      </ul>

      <div v-if="pdv.fora.length" class="auditoria-pdv__fora" role="alert">
        <strong>{{ pdv.fora.length }} venda(s) sem caixa aberto</strong>
        <table>
          <thead>
            <tr>
              <th>Hora</th>
              <th>Valor</th>
              <th>Forma</th>
              <th>Produtos</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="venda in pdv.fora" :key="venda.vendaId">
              <td>{{ hora(venda.hora) }}</td>
              <td>{{ dinheiro(venda.valor) }}</td>
              <td>{{ listaFormas(venda.formas) || "—" }}</td>
              <td>{{ venda.produtos.map((p) => `${p.quantidade}× ${p.descricao}`).join(", ") || "—" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  </section>
</template>

<style scoped>
.auditoria-dia {
  display: grid;
  gap: 12px;
  padding-top: 14px;
  border-top: 1px solid var(--cx-line);
}
.auditoria-dia__acoes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.auditoria-dia__gerada {
  color: var(--cx-ink-soft);
  font-size: 0.8rem;
}
.auditoria-dia__topo {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.auditoria-dia__topo h3 {
  margin: 0;
  font-size: 1.05rem;
}
.auditoria-dia__topo h3::first-letter {
  text-transform: uppercase;
}
.auditoria-dia__topo p,
.auditoria-dia__vazio {
  margin: 2px 0 0;
  color: var(--cx-ink-soft);
  font-size: 0.88rem;
}
.texto-alerta {
  color: var(--cx-negative);
}
.auditoria-pdv {
  padding: 12px 14px;
  border: 1px solid var(--cx-line);
  border-left: 4px solid var(--cx-line);
  border-radius: 10px;
  background: var(--cx-surface);
}
.auditoria-pdv--ok {
  border-left-color: var(--cx-positive);
}
.auditoria-pdv--alerta {
  border-left-color: var(--cx-negative);
}
.auditoria-pdv--andamento {
  border-left-color: var(--cx-brand);
}
.auditoria-pdv__topo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}
.auditoria-pdv__topo span {
  color: var(--cx-ink-soft);
  font-size: 0.86rem;
}
.auditoria-pdv__topo .v-chip {
  margin-left: auto;
}
.auditoria-pdv__caixas {
  display: grid;
  gap: 6px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}
.auditoria-pdv__caixas li {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) auto;
  gap: 2px 12px;
  align-items: baseline;
  font-size: 0.86rem;
}
.auditoria-pdv__caixas small {
  grid-column: 2 / -1;
  color: var(--cx-ink-soft);
}
.auditoria-pdv__turno {
  font-weight: 700;
}
.auditoria-pdv__caixas .auditoria-pdv__sem-caixa {
  display: block;
  color: var(--cx-ink-soft);
}
.auditoria-pdv__fora {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--cx-negative) 9%, var(--cx-surface));
}
.auditoria-pdv__fora strong {
  color: var(--cx-negative);
  font-size: 0.88rem;
}
.auditoria-pdv__fora table {
  width: 100%;
  margin-top: 6px;
  border-collapse: collapse;
  font-size: 0.84rem;
}
.auditoria-pdv__fora th {
  color: var(--cx-ink-soft);
  font-weight: 600;
  text-align: left;
}
.auditoria-pdv__fora th,
.auditoria-pdv__fora td {
  padding: 4px 8px 4px 0;
  vertical-align: top;
}
@media (max-width: 760px) {
  .auditoria-pdv__caixas li {
    grid-template-columns: 1fr;
  }
  .auditoria-pdv__caixas small {
    grid-column: auto;
  }
  .auditoria-pdv__fora table,
  .auditoria-pdv__fora tbody,
  .auditoria-pdv__fora tr,
  .auditoria-pdv__fora td {
    display: block;
  }
  .auditoria-pdv__fora thead {
    display: none;
  }
  .auditoria-pdv__fora tr {
    padding: 6px 0;
    border-top: 1px solid var(--cx-line);
  }
}
</style>
