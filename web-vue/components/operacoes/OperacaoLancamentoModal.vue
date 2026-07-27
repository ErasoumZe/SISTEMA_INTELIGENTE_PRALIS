<script setup lang="ts">
// Lancamento (Despesa / Mercadoria / Retirada) num UNICO formulario, fiel ao desenho do Rodrigo
// (PROJECT_BRAIN/14, FOTO 2). VISUAL-FIRST: muda de cor por categoria (--cat-*). Os campos que o
// backend JA suporta salvam normal via salvarOperacao; os NOVOS sao ESTADO LOCAL marcado
// data-pendente="regra" + // TODO(regras) e NUNCA vao para a API (a persistencia vem na rodada de
// regras). Nada de api/db/shared.
import { useWorkspaceContext } from "~/components/workspace/workspace-context";
import { dinheiro } from "~/utils/domain";
import type { ItemMercadoriaForm } from "~/utils/operacoes";

const {
  modalOperacaoAberto,
  entidadeNova,
  operacaoEditandoId,
  form,
  opcoesEmpresa,
  valorTotalOperacao,
  discriminandoDespesa,
  discriminandoMercadoria,
  itensDespesa,
  itensMercadoria,
  fotoDocumentoPreview,
  fotoDocumentoExistente,
  selecionarFotoDocumento,
  salvandoOperacao,
  salvarOperacao
} = useWorkspaceContext();

type Cat = "despesa" | "mercadoria" | "retirada";
const CATEGORIAS: Cat[] = ["despesa", "mercadoria", "retirada"];

const aberto = computed({
  get: () => modalOperacaoAberto.value && CATEGORIAS.includes(entidadeNova.value as Cat),
  set: (v: boolean) => {
    if (!v) modalOperacaoAberto.value = false;
  }
});

const cat = computed<Cat>(() =>
  CATEGORIAS.includes(entidadeNova.value as Cat) ? (entidadeNova.value as Cat) : "despesa"
);

const CFG: Record<Cat, { token: string; icone: string; discrimina: boolean }> = {
  despesa: { token: "despesas", icone: "mdi-receipt-text-outline", discrimina: true },
  mercadoria: { token: "mercadorias", icone: "mdi-package-variant", discrimina: true },
  retirada: { token: "retiradas", icone: "mdi-cash-remove", discrimina: false }
};
const cfg = computed(() => CFG[cat.value]);
const catVars = computed(() => ({
  "--cat": `var(--cat-${cfg.value.token}-base)`,
  "--cat-soft": `var(--cat-${cfg.value.token}-soft)`
}));

// --- Grupo: roteia para o campo suportado da categoria (grupoDespesa/Mercadoria/Retirada). ---
const grupoOpcoes = computed(() =>
  cat.value === "despesa"
    ? opcoesEmpresa.value.gruposDespesas
    : cat.value === "mercadoria"
      ? opcoesEmpresa.value.gruposMercadorias
      : opcoesEmpresa.value.gruposRetiradas
);
const grupoId = computed({
  get: () =>
    cat.value === "despesa"
      ? form.value.grupoDespesaId
      : cat.value === "mercadoria"
        ? form.value.grupoMercadoriaId
        : form.value.grupoRetiradaId,
  set: (v: string) => {
    if (cat.value === "despesa") form.value.grupoDespesaId = v;
    else if (cat.value === "mercadoria") form.value.grupoMercadoriaId = v;
    else form.value.grupoRetiradaId = v;
  }
});

// --- Tipo de credor (define a fonte de busca do campo Credor) ---
type TipoCredor = "fornecedor" | "colaborador" | "socios_setores";
const CREDORES: Record<Cat, TipoCredor[]> = {
  despesa: ["fornecedor", "colaborador"],
  mercadoria: ["fornecedor"],
  // Retirada: o desenho traz "Sócios/setores"; mantemos Colaborador (que o backend exige) para salvar.
  retirada: ["colaborador", "socios_setores"]
};
const rotuloCredor: Record<TipoCredor, string> = {
  fornecedor: "Fornecedor",
  colaborador: "Colaborador",
  socios_setores: "Sócios / setores"
};
const tipoCredor = ref<TipoCredor>("fornecedor");
watch(
  cat,
  (c) => {
    const primeiro = CREDORES[c][0];
    if (primeiro && !CREDORES[c].includes(tipoCredor.value)) tipoCredor.value = primeiro;
  },
  { immediate: true }
);
const credorOpcoes = computed(() =>
  tipoCredor.value === "fornecedor"
    ? opcoesEmpresa.value.fornecedores
    : tipoCredor.value === "colaborador"
      ? opcoesEmpresa.value.colaboradores
      : opcoesEmpresa.value.setores
);
// TODO(regras): "Sócios/setores" nao tem coluna propria de credor — fica LOCAL (data-pendente).
const socioSetorId = ref("");
const credorId = computed({
  get: () =>
    tipoCredor.value === "fornecedor"
      ? form.value.fornecedorId
      : tipoCredor.value === "colaborador"
        ? form.value.colaboradorId
        : socioSetorId.value,
  set: (v: string) => {
    if (tipoCredor.value === "fornecedor") form.value.fornecedorId = v;
    else if (tipoCredor.value === "colaborador") form.value.colaboradorId = v;
    else socioSetorId.value = v;
  }
});

// Pagamento (toggle S/N): derivado de dataPagamento (campo suportado). Sem data = nao pago.
const pago = computed({
  get: () => Boolean(form.value.dataPagamento),
  set: (v: boolean) => {
    form.value.dataPagamento = v ? form.value.dataPagamento || hojeISO.value : "";
  }
});

// --- Campos SEM backend nesta rodada (data-pendente="regra"): estado LOCAL, nunca enviado. ---
// TODO(regras): Data e N do Documento Fiscal no lancamento.
const dataDocFiscal = ref("");
const numeroDocFiscal = ref("");
// Foto 1 (Recibo/Boleto/Nota): campo SUPORTADO. Extrai o File do input nativo e reusa o handler do
// contexto (que espera File | File[] | null, nao um Event).
function onFotoDocumento(e: Event) {
  selecionarFotoDocumento((e.target as HTMLInputElement).files?.[0] ?? null);
}
// TODO(regras): segunda foto (nota/interno) — sem upload nesta rodada.
const fotoInternaNome = ref("");
function selecionarFotoInterna(e: Event) {
  const arquivo = (e.target as HTMLInputElement).files?.[0];
  fotoInternaNome.value = arquivo?.name ?? "";
}
// TODO(regras): Recorrencia (numero de repeticoes, dias da semana, frequencia).
const recorrenciaAberta = ref(false);
const recorrenciaNumero = ref("1");
const DIAS = ["Sg", "Ter", "Qa", "Qi", "Sx", "Sa"];
const recorrenciaDias = ref<boolean[]>([false, false, false, false, false, false]);
const FREQUENCIAS = ["dia", "semana", "mês", "quinzena", "3 em 3"];
const recorrenciaFrequencia = ref("mês");

const discriminando = computed({
  get: () => (cat.value === "despesa" ? discriminandoDespesa.value : discriminandoMercadoria.value),
  set: (v: boolean) => {
    if (cat.value === "despesa") discriminandoDespesa.value = v;
    else discriminandoMercadoria.value = v;
  }
});

// --- Discriminação (FOTO 3): desconto GERAL "Vale Presente" (R$ ou %) distribuído nas linhas. O
// valor em R$ vai para form.valorDesconto (SUPORTADO — salva). As colunas c/Desc e % e os totais
// são RECÁLCULO no front (não persistidos). Em Mercadoria a Descrição vem do cadastro de produto. ---
const modoDesconto = ref<"valor" | "percentual">("valor");
const descontoInput = ref("");
const totalGeralBruto = computed(() =>
  itensMercadoria.value.reduce((soma, it) => soma + Number(it.quantidade || 0) * Number(it.valorUnitario || 0), 0)
);
const descontoFrac = computed(() => {
  const bruto = totalGeralBruto.value;
  if (modoDesconto.value === "percentual") return Math.min(1, Math.max(0, Number(descontoInput.value || 0) / 100));
  return bruto > 0 ? Math.min(1, Math.max(0, Number(descontoInput.value || 0) / bruto)) : 0;
});
const descontoValorReais = computed(() => totalGeralBruto.value * descontoFrac.value);
const totalGeralComDesc = computed(() => totalGeralBruto.value - descontoValorReais.value);
const pctEfetivo = computed(() => descontoFrac.value * 100);
// Espelha o desconto geral no campo suportado do header (em R$) para salvar de verdade.
watch(descontoValorReais, (v) => {
  form.value.valorDesconto = v ? v.toFixed(2) : "";
});
function totalLinha(it: ItemMercadoriaForm) {
  return Number(it.quantidade || 0) * Number(it.valorUnitario || 0);
}
function unitComDesc(it: ItemMercadoriaForm) {
  return Number(it.valorUnitario || 0) * (1 - descontoFrac.value);
}
function totalLinhaComDesc(it: ItemMercadoriaForm) {
  return totalLinha(it) * (1 - descontoFrac.value);
}
function brn(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// Mercadoria: a Descrição vem do cadastro de produto (preenche produtoId + descrição).
function escolherProduto(item: ItemMercadoriaForm, produtoId: string) {
  item.produtoId = produtoId;
  const p = opcoesEmpresa.value.produtos.find((x) => x.id === produtoId);
  if (p?.descricao) item.descricao = p.descricao;
}
function novoItemMercadoria() {
  itensMercadoria.value.push({
    descricao: "",
    quantidade: "1",
    valorUnitario: "",
    descontoTipo: "",
    descontoValor: "",
    valorTotal: "",
    produtoId: "",
    grupoMercadoriaId: "",
    unidadeMedidaId: ""
  });
}

function dataISO(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}
const hojeISO = computed(() => dataISO(0));
</script>

<template>
  <v-dialog v-model="aberto" :max-width="discriminando && cat === 'mercadoria' ? 920 : 560">
    <div class="lc-modal" :style="catVars">
      <div class="lc-head">
        <span class="lc-ic"
          ><v-icon size="19">{{ cfg.icone }}</v-icon></span
        >
        <span class="lc-titulo"> {{ operacaoEditandoId ? "Editar" : "Nova" }} {{ cat }} </span>
        <v-icon class="lc-x" size="19" @click="aberto = false">mdi-close</v-icon>
      </div>

      <!-- Linha 1: Valor · Juros · Valor Total -->
      <div class="lc-hero">
        <span class="lc-cifra">R$</span>
        <input v-model="form.valorOriginal" class="lc-valor" type="number" inputmode="decimal" placeholder="0,00" />
      </div>
      <div class="lc-tres">
        <label class="lc-campo">
          <span class="lc-campo-lbl">Juros</span>
          <input v-model="form.valorAcrescimo" type="number" class="lc-input" placeholder="R$ 0,00" />
        </label>
        <label class="lc-campo">
          <span class="lc-campo-lbl">Valor Total</span>
          <input :value="dinheiro(valorTotalOperacao)" class="lc-input lc-input-ro" readonly />
        </label>
      </div>

      <!-- Linha 2: Data Lanç · Data Doc. Fiscal · N° Doc. Fiscal -->
      <div class="lc-tres">
        <label class="lc-campo">
          <span class="lc-campo-lbl">Data Lanç</span>
          <div class="lc-data-row">
            <button
              type="button"
              class="lc-pill"
              :class="{ ativo: form.dataReferencia === hojeISO }"
              @click="form.dataReferencia = hojeISO"
            >
              Hoje
            </button>
            <input v-model="form.dataReferencia" type="date" class="lc-input" />
          </div>
        </label>
        <label class="lc-campo">
          <span class="lc-campo-lbl">Data Doc. Fiscal</span>
          <input v-model="dataDocFiscal" type="date" data-pendente="regra" class="lc-input" />
        </label>
        <label class="lc-campo">
          <span class="lc-campo-lbl">N° Doc. Fiscal</span>
          <input v-model="numeroDocFiscal" data-pendente="regra" class="lc-input" placeholder="000000" />
        </label>
      </div>

      <!-- Linha 3: Tipo de credor → Credor -->
      <div class="lc-campo-lbl lc-mt">Tipo de credor</div>
      <div class="lc-credor-tipos">
        <button
          v-for="t in CREDORES[cat]"
          :key="t"
          type="button"
          class="lc-chip"
          :class="{ ativo: tipoCredor === t }"
          :data-pendente="t === 'socios_setores' ? 'regra' : undefined"
          @click="tipoCredor = t"
        >
          {{ rotuloCredor[t] }}
        </button>
      </div>
      <label class="lc-campo">
        <span class="lc-campo-lbl">Credor</span>
        <select
          v-model="credorId"
          class="lc-input"
          :data-pendente="tipoCredor === 'socios_setores' ? 'regra' : undefined"
        >
          <option value="">—</option>
          <option v-for="o in credorOpcoes" :key="o.id" :value="o.id">{{ o.nome }}</option>
        </select>
      </label>

      <!-- Grupo + Conta (nao estao no desenho, mas o backend precisa para salvar) -->
      <div class="lc-dois">
        <label class="lc-campo">
          <span class="lc-campo-lbl">Grupo</span>
          <select v-model="grupoId" class="lc-input">
            <option value="">—</option>
            <option v-for="g in grupoOpcoes" :key="g.id" :value="g.id">{{ g.nome }}</option>
          </select>
        </label>
        <label class="lc-campo">
          <span class="lc-campo-lbl">Conta</span>
          <select v-model="form.contaOrigemId" class="lc-input">
            <option value="">—</option>
            <option v-for="c in opcoesEmpresa.contas" :key="c.id" :value="c.id">{{ c.nome }}</option>
          </select>
        </label>
      </div>

      <!-- Linha 4: Pagamento (S/N) · Data pagamento · Data Vencimento -->
      <div class="lc-tres lc-pagamento">
        <label class="lc-campo lc-toggle">
          <span class="lc-campo-lbl">Pagamento</span>
          <button type="button" class="lc-sn" :class="{ sim: pago }" @click="pago = !pago">
            {{ pago ? "Sim" : "Não" }}
          </button>
        </label>
        <label class="lc-campo">
          <span class="lc-campo-lbl">Data pagamento</span>
          <input v-model="form.dataPagamento" type="date" class="lc-input" :disabled="!pago" />
        </label>
        <label class="lc-campo">
          <span class="lc-campo-lbl">Data Vencimento</span>
          <input v-model="form.dataVencimento" type="date" class="lc-input" />
        </label>
      </div>

      <!-- Duas fotos -->
      <div class="lc-dois">
        <label class="lc-foto">
          <span class="lc-campo-lbl">Foto (Recibo/Boleto/Nota)</span>
          <input type="file" accept="image/*,application/pdf" class="lc-file" @change="onFotoDocumento" />
          <span v-if="fotoDocumentoPreview || fotoDocumentoExistente" class="lc-foto-ok">
            <v-icon size="14">mdi-paperclip</v-icon> anexado
          </span>
        </label>
        <label class="lc-foto">
          <span class="lc-campo-lbl">Foto (Nota / interno)</span>
          <input
            type="file"
            accept="image/*,application/pdf"
            data-pendente="regra"
            class="lc-file"
            @change="selecionarFotoInterna"
          />
          <span v-if="fotoInternaNome" class="lc-foto-ok"
            ><v-icon size="14">mdi-paperclip</v-icon> {{ fotoInternaNome }}</span
          >
        </label>
      </div>

      <!-- Discriminar itens (despesa/mercadoria) — a tabela rica vem na tela de Discriminação. -->
      <template v-if="cfg.discrimina">
        <button type="button" class="lc-linha" @click="discriminando = !discriminando">
          <v-icon size="17">mdi-format-list-bulleted</v-icon> Discriminar itens
          <span class="lc-flex" />
          <v-icon size="16">{{ discriminando ? "mdi-chevron-down" : "mdi-chevron-right" }}</v-icon>
        </button>
        <!-- Despesa: descrição e grupo LIVRES (FOTO 3, nota). -->
        <div v-if="discriminando && cat === 'despesa'" class="lc-itens">
          <div v-for="(item, i) in itensDespesa" :key="`d-${i}`" class="lc-item">
            <input v-model="item.descricao" class="lc-input" placeholder="Descrição (livre)" />
            <select v-model="item.grupoDespesaId" class="lc-input lc-item-grupo">
              <option value="">Grupo</option>
              <option v-for="g in opcoesEmpresa.gruposDespesas" :key="g.id" :value="g.id">{{ g.nome }}</option>
            </select>
            <input v-model="item.valor" type="number" class="lc-input lc-item-valor" placeholder="R$" />
            <v-icon size="18" class="lc-item-del" @click="itensDespesa.length > 1 && itensDespesa.splice(i, 1)"
              >mdi-close</v-icon
            >
          </div>
          <button
            type="button"
            class="lc-add"
            @click="itensDespesa.push({ descricao: '', valor: '', grupoDespesaId: '' })"
          >
            <v-icon size="15">mdi-plus</v-icon> Adicionar item
          </button>
        </div>

        <!-- Mercadoria: tabela de Discriminação (FOTO 3). Itens do cadastro de produto; colunas
             c/Desc e % recalculadas no front a partir do Vale Presente geral. -->
        <div v-if="discriminando && cat === 'mercadoria'" class="disc">
          <div class="disc-scroll">
            <table class="disc-tabela">
              <thead>
                <tr>
                  <th>Quant</th>
                  <th>Descrição</th>
                  <th>Grupo</th>
                  <th>V.Unit</th>
                  <th>V.Unit c/Desc</th>
                  <th>V.Total</th>
                  <th>V.Total c/Desc</th>
                  <th>%</th>
                  <th aria-label="remover" />
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, i) in itensMercadoria" :key="`m-${i}`">
                  <td><input v-model="item.quantidade" type="number" class="disc-in disc-qtd" /></td>
                  <td>
                    <select
                      :value="item.produtoId"
                      class="disc-in"
                      @change="escolherProduto(item, ($event.target as HTMLSelectElement).value)"
                    >
                      <option value="">— livre —</option>
                      <option v-for="p in opcoesEmpresa.produtos" :key="p.id" :value="p.id">{{ p.descricao }}</option>
                    </select>
                    <input v-model="item.descricao" class="disc-in disc-desc" placeholder="Descrição" />
                  </td>
                  <td>
                    <select v-model="item.grupoMercadoriaId" class="disc-in">
                      <option value="">—</option>
                      <option v-for="g in opcoesEmpresa.gruposMercadorias" :key="g.id" :value="g.id">
                        {{ g.nome }}
                      </option>
                    </select>
                  </td>
                  <td><input v-model="item.valorUnitario" type="number" class="disc-in disc-num" /></td>
                  <td class="disc-calc">{{ brn(unitComDesc(item)) }}</td>
                  <td class="disc-calc">{{ brn(totalLinha(item)) }}</td>
                  <td class="disc-calc">{{ brn(totalLinhaComDesc(item)) }}</td>
                  <td class="disc-calc">{{ brn(pctEfetivo) }}%</td>
                  <td>
                    <v-icon
                      size="18"
                      class="lc-item-del"
                      @click="itensMercadoria.length > 1 && itensMercadoria.splice(i, 1)"
                      >mdi-close</v-icon
                    >
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="5" class="disc-foot-lbl">V. Total geral</td>
                  <td class="disc-calc disc-foot">{{ brn(totalGeralBruto) }}</td>
                  <td class="disc-calc disc-foot">{{ brn(totalGeralComDesc) }}</td>
                  <td class="disc-calc disc-foot">{{ brn(pctEfetivo) }}%</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <div class="disc-rodape">
            <button type="button" class="lc-add" @click="novoItemMercadoria">
              <v-icon size="15">mdi-plus</v-icon> Adicionar item
            </button>
            <div class="disc-vale">
              <span class="lc-campo-lbl">Vale Presente / Desconto</span>
              <div class="disc-vale-row">
                <div class="disc-modo">
                  <button
                    type="button"
                    class="disc-modo-btn"
                    :class="{ ativo: modoDesconto === 'valor' }"
                    @click="modoDesconto = 'valor'"
                  >
                    R$
                  </button>
                  <button
                    type="button"
                    class="disc-modo-btn"
                    :class="{ ativo: modoDesconto === 'percentual' }"
                    @click="modoDesconto = 'percentual'"
                  >
                    %
                  </button>
                </div>
                <input v-model="descontoInput" type="number" class="disc-in disc-num" placeholder="0" />
                <span class="disc-vale-res">= R$ {{ brn(descontoValorReais) }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Bloco Recorrência (data-pendente) -->
      <button type="button" class="lc-linha lc-linha-top" @click="recorrenciaAberta = !recorrenciaAberta">
        <v-icon size="17">mdi-repeat</v-icon> Recorrência
        <span class="lc-flex" />
        <v-icon size="16">{{ recorrenciaAberta ? "mdi-chevron-down" : "mdi-chevron-right" }}</v-icon>
      </button>
      <div v-if="recorrenciaAberta" class="lc-recorrencia" data-pendente="regra">
        <div class="lc-dois">
          <label class="lc-campo">
            <span class="lc-campo-lbl">Número de repetições</span>
            <input v-model="recorrenciaNumero" type="number" min="1" data-pendente="regra" class="lc-input" />
          </label>
          <label class="lc-campo">
            <span class="lc-campo-lbl">Frequência</span>
            <select v-model="recorrenciaFrequencia" data-pendente="regra" class="lc-input">
              <option v-for="f in FREQUENCIAS" :key="f" :value="f">{{ f }}</option>
            </select>
          </label>
        </div>
        <span class="lc-campo-lbl">Dias</span>
        <div class="lc-dias">
          <button
            v-for="(dia, i) in DIAS"
            :key="dia"
            type="button"
            class="lc-dia"
            :class="{ ativo: recorrenciaDias[i] }"
            data-pendente="regra"
            @click="recorrenciaDias[i] = !recorrenciaDias[i]"
          >
            {{ dia }}
          </button>
        </div>
      </div>

      <div class="lc-acoes">
        <button type="button" class="lc-salvar-nova" :disabled="salvandoOperacao" @click="salvarOperacao">
          Salvar e criar nova
        </button>
        <button type="button" class="lc-salvar" :disabled="salvandoOperacao" @click="salvarOperacao">Salvar</button>
      </div>
    </div>
  </v-dialog>
</template>

<style scoped>
/* FOTO 2 do Rodrigo. --cat/--cat-soft trocam por categoria (despesa/mercadoria/retirada). */
.lc-modal {
  background: #fff;
  border: 0.5px solid #e4e8ef;
  border-radius: 16px;
  padding: 20px 22px;
  /* Nunca ultrapassa a viewport: rola por dentro em qualquer largura (o rodape de acoes fica fixo,
     abaixo). Sem isto, formularios altos cortavam o "Salvar" fora da tela. */
  max-height: calc(100dvh - 48px);
  overflow-y: auto;
}
.lc-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.lc-ic {
  display: flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--cat-soft);
  color: var(--cat);
}
.lc-titulo {
  flex: 1;
  font-size: 16px;
  font-weight: 500;
  color: #1f2733;
  text-transform: capitalize;
}
.lc-x {
  color: #94a3b8;
  cursor: pointer;
}
.lc-hero {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 12px;
  border-bottom: 2px solid var(--cat);
  padding-bottom: 6px;
}
.lc-cifra {
  font-size: 16px;
  color: var(--cat);
}
.lc-valor {
  width: 100%;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--cat);
  font-size: 32px;
  font-weight: 500;
  letter-spacing: -0.5px;
}
.lc-tres,
.lc-dois {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
/* 3 campos por linha no desktop; 2 no tablet (<=768) e 1 no celular (<=560) — os campos EMPILHAM. */
.lc-tres > .lc-campo {
  flex: 1 1 calc(33.333% - 6px);
  min-width: 0;
}
.lc-dois > .lc-campo,
.lc-dois > .lc-foto {
  flex: 1 1 calc(50% - 4px);
  min-width: 0;
}
.lc-campo {
  display: block;
  margin-bottom: 10px;
}
.lc-mt {
  margin-top: 4px;
}
.lc-campo-lbl {
  display: block;
  margin-bottom: 3px;
  font-size: 11px;
  color: #94a3b8;
}
.lc-input {
  width: 100%;
  border: 0.5px solid #e4e8ef;
  border-radius: 8px;
  padding: 9px 10px;
  font-size: 13px;
  color: #1f2733;
  background: #fff;
  outline: none;
}
.lc-input:focus {
  border-color: var(--cat);
}
.lc-input-ro {
  background: #f4f6fa;
  color: #64748b;
}
.lc-input:disabled {
  background: #f4f6fa;
  color: #cbd2dc;
}
.lc-data-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.lc-data-row .lc-input {
  flex: 1;
}
.lc-pill {
  border: 0.5px solid #cbd2dc;
  background: none;
  padding: 8px 10px;
  border-radius: 999px;
  color: #64748b;
  font-size: 12px;
  cursor: pointer;
}
.lc-pill.ativo {
  background: var(--cat-soft);
  border-color: transparent;
  color: var(--cat);
}
.lc-credor-tipos {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.lc-chip {
  border: 0.5px solid #e4e8ef;
  border-radius: 999px;
  padding: 6px 14px;
  background: #fff;
  color: #64748b;
  font-size: 12px;
  cursor: pointer;
}
.lc-chip.ativo {
  border-color: transparent;
  background: var(--cat-soft);
  color: var(--cat);
  font-weight: 500;
}
.lc-pagamento .lc-toggle {
  flex: 0 0 96px;
}
.lc-sn {
  width: 100%;
  border: 0.5px solid #cbd2dc;
  border-radius: 8px;
  padding: 9px 0;
  background: #fff;
  color: #64748b;
  font-size: 13px;
  cursor: pointer;
}
.lc-sn.sim {
  border-color: transparent;
  background: var(--cat-soft);
  color: var(--cat);
  font-weight: 500;
}
.lc-foto {
  display: block;
  flex: 1;
  margin-bottom: 10px;
}
.lc-file {
  width: 100%;
  font-size: 11px;
  color: #64748b;
}
.lc-foto-ok {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-top: 2px;
  font-size: 11px;
  color: var(--cat);
}
.lc-linha {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 0;
  border: 0;
  background: none;
  color: #64748b;
  font-size: 13px;
  cursor: pointer;
}
.lc-linha-top {
  border-top: 0.5px solid #e4e8ef;
}
.lc-flex {
  flex: 1;
}
.lc-itens {
  margin-bottom: 6px;
}
.lc-item {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.lc-item-valor {
  max-width: 100px;
}
.lc-item-qtd {
  max-width: 70px;
}
.lc-item-del {
  color: #94a3b8;
  cursor: pointer;
}
.lc-add {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0.5px solid #e4e8ef;
  border-radius: 8px;
  padding: 6px 12px;
  background: none;
  color: #64748b;
  font-size: 12px;
  cursor: pointer;
}
.lc-item-grupo {
  max-width: 140px;
}

/* --- Discriminação (FOTO 3): tabela com rolagem horizontal (não estoura o modal) --- */
.disc {
  margin-bottom: 8px;
}
.disc-scroll {
  overflow-x: auto;
}
.disc-tabela {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.disc-tabela th {
  padding: 4px 6px;
  color: #94a3b8;
  font-size: 10px;
  font-weight: 700;
  text-align: left;
  text-transform: uppercase;
  white-space: nowrap;
  border-bottom: 0.5px solid #e4e8ef;
}
.disc-tabela td {
  padding: 3px 5px;
  border-bottom: 0.5px solid #f1f3f7;
  vertical-align: middle;
}
.disc-in {
  width: 100%;
  min-width: 64px;
  border: 0.5px solid #e4e8ef;
  border-radius: 6px;
  padding: 6px 7px;
  font-size: 12px;
  color: #1f2733;
  background: #fff;
  outline: none;
}
.disc-in:focus {
  border-color: var(--cat);
}
.disc-desc {
  margin-top: 3px;
}
.disc-qtd {
  min-width: 52px;
  max-width: 64px;
}
.disc-num {
  min-width: 72px;
  max-width: 96px;
}
.disc-calc {
  color: var(--cat);
  font-weight: 600;
  white-space: nowrap;
}
.disc-foot-lbl {
  color: #64748b;
  font-weight: 700;
  text-align: right;
}
.disc-foot {
  border-top: 0.5px solid #e4e8ef;
}
.disc-rodape {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
}
.disc-vale {
  min-width: 220px;
}
.disc-vale-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.disc-modo {
  display: flex;
  border: 0.5px solid #cbd2dc;
  border-radius: 8px;
  overflow: hidden;
}
.disc-modo-btn {
  border: 0;
  background: #fff;
  padding: 7px 12px;
  color: #64748b;
  font-size: 12px;
  cursor: pointer;
}
.disc-modo-btn.ativo {
  background: var(--cat-soft);
  color: var(--cat);
  font-weight: 600;
}
.disc-vale-res {
  color: var(--cat);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
.lc-recorrencia {
  margin-bottom: 8px;
  padding: 10px 12px;
  border: 0.5px solid #e4e8ef;
  border-radius: 10px;
  background: #fbfcfe;
}
.lc-dias {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}
.lc-dia {
  min-width: 38px;
  border: 0.5px solid #cbd2dc;
  border-radius: 8px;
  padding: 6px 0;
  background: #fff;
  color: #64748b;
  font-size: 12px;
  cursor: pointer;
}
.lc-dia.ativo {
  border-color: transparent;
  background: var(--cat-soft);
  color: var(--cat);
  font-weight: 500;
}
.lc-acoes {
  position: sticky;
  bottom: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  /* margens negativas = rodape "full-bleed" ate as bordas do modal (padding 20/22). */
  margin: 12px -22px -20px;
  padding: 12px 22px;
  background: #fff;
  border-top: 0.5px solid #e4e8ef;
}
.lc-salvar-nova {
  border: 0;
  background: none;
  color: var(--cat);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.lc-salvar {
  border: 0;
  border-radius: 8px;
  padding: 9px 22px;
  background: var(--cat);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.lc-salvar:disabled,
.lc-salvar-nova:disabled {
  opacity: 0.6;
  cursor: default;
}

/* --- Responsividade (1024/768/560) — so layout. Os campos EMPILHAM, nunca somem. --- */
@media (width <= 768px) {
  .lc-tres > .lc-campo {
    flex-basis: calc(50% - 4px);
  }
}
@media (width <= 560px) {
  .lc-tres > .lc-campo,
  .lc-dois > .lc-campo,
  .lc-dois > .lc-foto,
  .lc-pagamento > .lc-toggle {
    flex-basis: 100%;
  }
  /* Modal fullscreen (a casca do overlay ja e 100dvh via main.css): ocupa a tela toda. O rodape
     fixo ja vem da regra base; aqui so ampliamos a altura e respeitamos a safe-area do iOS. */
  .lc-modal {
    max-height: 100dvh;
    height: 100dvh;
    border-radius: 0;
  }
  .lc-acoes {
    padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  }
}
</style>
