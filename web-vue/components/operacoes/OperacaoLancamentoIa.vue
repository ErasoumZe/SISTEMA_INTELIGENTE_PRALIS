<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { analiseNotaFiscalIaSchema, type AnaliseNotaFiscalIa } from "@padaria/shared";
import { useOperacaoLancamentoBloco } from "~/components/operacoes/useOperacaoLancamento";
import { aplicarAnaliseNotaFiscal } from "~/utils/discriminacao-ia";

const { cat, empresaId, form, itensDespesa, itensMercadoria, selecionarFotoNota, fotoNotaPreview, fotoNotaExistente } =
  useOperacaoLancamentoBloco();
const { apiUrl } = useApi();
const aberto = ref(false);
const carregando = ref(false);
const erro = ref("");
const resultado = ref<AnaliseNotaFiscalIa | null>(null);
const aplicado = ref(false);
const camera = ref<HTMLInputElement | null>(null);
const galeria = ref<HTMLInputElement | null>(null);
const categoria = computed<"despesa" | "mercadoria">(() => (cat.value === "despesa" ? "despesa" : "mercadoria"));

watch(cat, () => {
  resultado.value = null;
  erro.value = "";
  aplicado.value = false;
});

function mensagemDaApi(corpo: unknown) {
  if (corpo && typeof corpo === "object") {
    const problema = corpo as { detail?: string; title?: string; error?: { message?: string } };
    if (problema.detail || problema.title) return problema.detail ?? problema.title ?? "";
    if (problema.error?.message) return problema.error.message;
  }
  return "Nao foi possivel ler a nota. O preenchimento manual foi mantido.";
}

async function analisarArquivo(evento: Event) {
  const input = evento.target as HTMLInputElement;
  const arquivo = input.files?.[0] ?? null;
  input.value = "";
  if (!arquivo || carregando.value) return;
  selecionarFotoNota(arquivo);
  erro.value = "";
  resultado.value = null;
  aplicado.value = false;
  carregando.value = true;
  try {
    const dados = new FormData();
    dados.append("arquivo", arquivo);
    const query = new URLSearchParams({ empresaId: empresaId.value, categoria: categoria.value });
    const resposta = await fetch(`${apiUrl}/api/discriminacao-ia/analisar?${query}`, {
      method: "POST",
      credentials: "include",
      body: dados
    });
    const corpo = (await resposta.json().catch(() => null)) as { data?: unknown } | null;
    if (!resposta.ok) throw new Error(mensagemDaApi(corpo));
    resultado.value = analiseNotaFiscalIaSchema.parse(corpo?.data);
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Nao foi possivel ler a nota.";
  } finally {
    carregando.value = false;
  }
}

function aplicar() {
  if (!resultado.value || aplicado.value) return;
  aplicarAnaliseNotaFiscal(categoria.value, resultado.value, form.value, itensDespesa.value, itensMercadoria.value);
  aplicado.value = true;
}

function moeda(valor: string | null) {
  return valor === null ? "--" : Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
</script>

<template>
  <section class="ia-nota" :class="{ aberta: aberto }">
    <button type="button" class="ia-nota-toggle ia-nota-lumi-toggle" :aria-expanded="aberto" @click="aberto = !aberto">
      <span class="ia-nota-lumi-orbe" aria-hidden="true">
        <v-icon size="19">mdi-robot-outline</v-icon>
        <v-icon class="ia-nota-lumi-faisca" size="10">mdi-sparkles</v-icon>
      </span>
      <span class="ia-nota-lumi-titulo">
        <span>Discriminar com a</span>
        <strong>Cicluz Lumi</strong>
      </span>
      <span class="ia-nota-lumi-chip" aria-hidden="true">IA</span>
      <span class="lc-flex" />
      <v-icon size="16">{{ aberto ? "mdi-chevron-down" : "mdi-chevron-right" }}</v-icon>
    </button>

    <div v-if="aberto" class="ia-nota-corpo">
      <p class="ia-nota-ajuda">A IA apenas prepara uma sugestao. Revise tudo antes de usar o Salvar.</p>
      <div class="ia-nota-acoes">
        <button
          type="button"
          class="ia-nota-btn ia-nota-captura ia-nota-captura--primaria"
          :disabled="carregando"
          @click="camera?.click()"
        >
          <v-icon size="18">mdi-camera</v-icon> Tirar foto
        </button>
        <button
          type="button"
          class="ia-nota-btn ia-nota-captura ia-nota-captura--secundaria"
          :disabled="carregando"
          @click="galeria?.click()"
        >
          <v-icon size="18">mdi-file-document-multiple</v-icon> Escolher arquivo
        </button>
        <input
          ref="camera"
          class="ia-nota-input"
          type="file"
          accept="image/*"
          capture="environment"
          @change="analisarArquivo"
        />
        <input
          ref="galeria"
          class="ia-nota-input"
          type="file"
          accept="image/*,.pdf,application/pdf,.xml,application/xml,text/xml"
          @change="analisarArquivo"
        />
      </div>

      <p v-if="carregando" class="ia-nota-status" role="status">
        <span class="ia-nota-lumi-spinner" aria-hidden="true" /> Lendo a nota com seguranca...
      </p>
      <p v-if="erro" class="ia-nota-erro" role="alert">{{ erro }}</p>
      <p v-if="fotoNotaPreview || fotoNotaExistente" class="ia-nota-anexo">
        <v-icon size="15">mdi-paperclip</v-icon> O arquivo ficará anexado para auditoria somente quando você salvar.
      </p>

      <div v-if="resultado" class="ia-nota-resultado">
        <div v-if="!resultado.documentoLegivel" class="ia-nota-alerta perigo">
          A imagem parece incompleta ou ilegivel. Confira todos os campos manualmente.
        </div>
        <div v-if="resultado.validacoes.possivelDuplicata" class="ia-nota-alerta perigo">
          Possivel nota duplicada: {{ resultado.validacoes.motivoDuplicidade }}
        </div>
        <div
          v-if="resultado.validacoes.somaItensConfere === false || resultado.validacoes.valorTotalConfere === false"
          class="ia-nota-alerta aviso"
        >
          Os valores extraidos nao fecham. Nao salve sem conferir a nota.
        </div>

        <dl class="ia-nota-grade">
          <div :class="{ duvidoso: resultado.fornecedor.duvidoso }">
            <dt>Fornecedor</dt>
            <dd>{{ resultado.fornecedor.nome || "Ilegivel" }}</dd>
          </div>
          <div :class="{ duvidoso: resultado.camposDuvidosos.includes('numero') }">
            <dt>NF / serie</dt>
            <dd>{{ resultado.numero || "--" }} / {{ resultado.serie || "--" }}</dd>
          </div>
          <div :class="{ duvidoso: resultado.camposDuvidosos.includes('dataEmissao') }">
            <dt>Emissao</dt>
            <dd>{{ resultado.dataEmissao || "--" }}</dd>
          </div>
          <div>
            <dt>Chave NF-e</dt>
            <dd>
              {{ resultado.chaveNfeIdentificada ? `identificada (...${resultado.chaveNfeFinal})` : "nao identificada" }}
            </dd>
          </div>
          <div>
            <dt>Produtos</dt>
            <dd>{{ moeda(resultado.valorProdutos) }}</dd>
          </div>
          <div>
            <dt>Desconto</dt>
            <dd>{{ moeda(resultado.valorDesconto) }}</dd>
          </div>
          <div>
            <dt>Frete</dt>
            <dd>{{ moeda(resultado.valorFrete) }}</dd>
          </div>
          <div>
            <dt>Total NF</dt>
            <dd>{{ moeda(resultado.valorTotal) }}</dd>
          </div>
        </dl>

        <p class="ia-nota-itens">{{ resultado.itens.length }} item(ns) lido(s).</p>
        <div v-if="resultado.itens.some((item) => item.alertaCusto)" class="ia-custo-alertas" role="status">
          <div class="ia-custo-alertas-titulo"><v-icon size="17">mdi-chart-line-variant</v-icon> Revisão de custo por item</div>
          <div
            v-for="item in resultado.itens.filter((linha) => linha.alertaCusto)"
            :key="`${item.ean ?? item.codigo ?? item.descricao}-custo`"
            class="ia-custo-alerta"
            :class="`nivel-${item.alertaCusto?.nivel}`"
          >
            <strong>{{ item.descricao }}</strong>
            <span>
              {{ item.alertaCusto?.mensagem }}
              Último: {{ moeda(item.alertaCusto?.custoAnterior ?? null) }} · Nota: {{ moeda(item.alertaCusto?.custoNota ?? null) }}
            </span>
          </div>
          <small>Este alerta é informativo. A IA não altera o preço nem bloqueia o salvamento.</small>
        </div>
        <ul v-if="resultado.avisos.length" class="ia-nota-avisos">
          <li v-for="aviso in resultado.avisos" :key="aviso">{{ aviso }}</li>
        </ul>
        <button type="button" class="ia-nota-aplicar" :disabled="aplicado" @click="aplicar">
          <v-icon size="17">mdi-file-document-edit-outline</v-icon>
          {{ aplicado ? "Sugestoes aplicadas — revise abaixo" : "Usar sugestao" }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ia-nota {
  margin: 4px 0 12px;
  border: 1px solid color-mix(in srgb, var(--cx-brand) 26%, var(--cx-line));
  border-radius: 12px;
  overflow: hidden;
  background: color-mix(in srgb, var(--cx-surface) 90%, transparent);
  box-shadow: var(--cx-e-1);
}
.ia-nota.aberta {
  border-color: color-mix(in srgb, var(--cx-brand) 66%, var(--cx-line));
  box-shadow:
    var(--cx-e-1),
    0 0 0 3px color-mix(in srgb, var(--cx-brand) 10%, transparent);
}
.ia-nota-toggle {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 7px 11px;
  border: 0;
  color: var(--cx-ink);
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}
.ia-nota-lumi-toggle {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  background:
    linear-gradient(
      112deg,
      color-mix(in srgb, var(--cx-surface) 94%, transparent),
      color-mix(in srgb, var(--cx-brand) 7%, var(--cx-surface))
    ),
    var(--cx-surface);
  transition:
    background var(--cx-dur-2) var(--cx-ease),
    transform var(--cx-dur-1) var(--cx-ease);
}
.ia-nota-lumi-toggle::before {
  position: absolute;
  z-index: -1;
  inset: 0;
  background: var(--cx-brand-gradiente);
  opacity: 0.1;
  content: "";
  transition: opacity var(--cx-dur-2) var(--cx-ease);
}
.ia-nota-lumi-toggle:hover::before,
.ia-nota.aberta .ia-nota-lumi-toggle::before {
  opacity: 0.18;
}
.ia-nota-lumi-toggle:active {
  transform: translateY(1px);
}
.ia-nota-lumi-toggle:focus-visible,
.ia-nota-btn:focus-visible,
.ia-nota-aplicar:focus-visible {
  outline: 2px solid var(--cx-focus);
  outline-offset: -3px;
}
.ia-nota-lumi-orbe {
  position: relative;
  display: inline-grid;
  width: 29px;
  height: 29px;
  flex: 0 0 29px;
  place-items: center;
  border: 1px solid color-mix(in srgb, white 34%, transparent);
  border-radius: 10px;
  color: var(--cx-brand-on);
  background: var(--cx-brand-gradiente);
  box-shadow: 0 5px 14px color-mix(in srgb, var(--cx-brand) 32%, transparent);
}
.ia-nota-lumi-faisca {
  position: absolute;
  right: -5px;
  top: -5px;
  display: grid;
  width: 14px;
  height: 14px;
  place-items: center;
  border: 2px solid var(--cx-surface);
  border-radius: 50%;
  color: var(--cx-brand-on);
  background: var(--cat-mercadorias-base);
}
.ia-nota-lumi-titulo {
  display: inline-flex;
  min-width: 0;
  align-items: baseline;
  gap: 5px;
  font-size: 13px;
  letter-spacing: -0.01em;
  white-space: nowrap;
}
.ia-nota-lumi-titulo > span {
  color: var(--cx-ink-soft);
  font-weight: 600;
}
.ia-nota-lumi-titulo strong {
  color: var(--cx-brand-text);
  font-weight: 800;
}
.ia-nota-lumi-chip {
  padding: 2px 6px;
  border: 1px solid color-mix(in srgb, var(--cx-brand) 32%, var(--cx-line));
  border-radius: 999px;
  color: var(--cx-brand-text);
  background: color-mix(in srgb, var(--cx-brand) 9%, transparent);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.08em;
}
.ia-nota-corpo {
  padding: 12px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--cx-brand) 4%, transparent), transparent 44%),
    color-mix(in srgb, var(--cx-surface) 96%, transparent);
}
.ia-nota-ajuda,
.ia-nota-status,
.ia-nota-anexo {
  margin: 0 0 10px;
  color: var(--cx-ink-soft);
  font-size: 12px;
}
.ia-nota-acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.ia-nota-btn,
.ia-nota-aplicar {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 8px 13px;
  border-radius: 9px;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform var(--cx-dur-1) var(--cx-ease),
    box-shadow var(--cx-dur-2) var(--cx-ease),
    background var(--cx-dur-2) var(--cx-ease);
}
.ia-nota-captura {
  letter-spacing: 0.005em;
}
.ia-nota-captura--primaria {
  border: 1px solid transparent;
  color: var(--cx-brand-on);
  background: var(--cx-brand-gradiente);
  box-shadow: 0 7px 16px color-mix(in srgb, var(--cx-brand) 26%, transparent);
}
.ia-nota-captura--secundaria {
  border: 1px solid color-mix(in srgb, var(--cx-brand) 46%, var(--cx-line));
  color: var(--cx-brand-text);
  background: color-mix(in srgb, var(--cx-brand) 7%, var(--cx-surface));
}
.ia-nota-btn:hover:not(:disabled),
.ia-nota-aplicar:hover:not(:disabled) {
  transform: translateY(-1px);
}
.ia-nota-captura--primaria:hover:not(:disabled) {
  box-shadow: 0 10px 21px color-mix(in srgb, var(--cx-brand) 35%, transparent);
}
.ia-nota-captura--secundaria:hover:not(:disabled) {
  background: color-mix(in srgb, var(--cx-brand) 13%, var(--cx-surface));
}
.ia-nota-btn:disabled,
.ia-nota-aplicar:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.ia-nota-input {
  display: none;
}
.ia-nota-status,
.ia-nota-anexo {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 10px;
}
.ia-nota-lumi-spinner {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  border-radius: 50%;
  background: conic-gradient(
    var(--cat-entradas-tinta),
    var(--cat-transferencias-tinta),
    var(--cat-despesas-tinta),
    var(--cat-resultado-tinta),
    var(--cat-retiradas-tinta),
    var(--cat-mercadorias-tinta),
    var(--cat-entradas-tinta)
  );
  mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 0);
  animation: ia-lumi-giro 1s linear infinite;
}
.ia-nota-erro,
.ia-nota-alerta {
  margin: 10px 0 0;
  padding: 9px 10px;
  border-radius: 7px;
  font-size: 12px;
}
.ia-nota-erro,
.ia-nota-alerta.perigo {
  color: var(--cx-negative);
  background: color-mix(in srgb, var(--cx-negative) 12%, transparent);
}
.ia-nota-alerta.aviso {
  color: var(--cx-warning-ink, #8a4b00);
  background: color-mix(in srgb, var(--cx-warning, #f59e0b) 14%, transparent);
}
.ia-nota-grade {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin: 12px 0;
}
.ia-nota-grade > div {
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--cx-line-soft);
  border-radius: 7px;
  background: var(--cx-surface);
}
.ia-nota-grade .duvidoso {
  border-color: var(--cx-warning, #f59e0b);
  background: color-mix(in srgb, var(--cx-warning, #f59e0b) 9%, var(--cx-surface));
}
.ia-nota-grade dt {
  color: var(--cx-ink-soft);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}
.ia-nota-grade dd {
  overflow-wrap: anywhere;
  margin: 2px 0 0;
  color: var(--cx-ink);
  font-size: 12px;
}
.ia-nota-itens {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
}
.ia-nota-avisos {
  margin: 0 0 10px;
  padding-left: 18px;
  color: var(--cx-ink-soft);
  font-size: 12px;
}
.ia-custo-alertas { display: grid; gap: 7px; margin: 12px 0; padding: 10px; border-radius: 10px; background: color-mix(in srgb, var(--cx-warning) 8%, var(--cx-surface)); }
.ia-custo-alertas-titulo { display: flex; align-items: center; gap: 6px; color: var(--cx-warning); font-weight: 800; }
.ia-custo-alerta { display: grid; gap: 2px; padding: 8px 10px; border-left: 3px solid var(--cx-warning); border-radius: 6px; background: color-mix(in srgb, var(--cx-warning) 10%, transparent); font-size: .82rem; }
.ia-custo-alerta.nivel-critico { border-left-color: var(--cx-danger); background: color-mix(in srgb, var(--cx-danger) 10%, transparent); }
.ia-custo-alerta span { color: var(--cx-muted); }
.ia-custo-alertas small { color: var(--cx-muted); }
.ia-nota-aplicar {
  width: 100%;
  border: 1px solid transparent;
  color: var(--cx-brand-on);
  background: var(--cx-brand-gradiente);
  box-shadow: 0 7px 16px color-mix(in srgb, var(--cx-brand) 24%, transparent);
}
@keyframes ia-lumi-giro {
  to {
    transform: rotate(1turn);
  }
}
@media (max-width: 520px) {
  .ia-nota-acoes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .ia-nota-captura {
    min-width: 0;
    padding-inline: 9px;
    font-size: 12px;
  }
}
@media (max-width: 390px) {
  .ia-nota-acoes {
    grid-template-columns: 1fr;
  }
  .ia-nota-grade {
    grid-template-columns: 1fr;
  }
  .ia-nota-lumi-titulo {
    gap: 3px;
    font-size: 12px;
  }
  .ia-nota-lumi-chip {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ia-nota-lumi-spinner {
    animation: none;
  }
  .ia-nota-lumi-toggle,
  .ia-nota-lumi-toggle::before,
  .ia-nota-btn,
  .ia-nota-aplicar {
    transition: none;
  }
  .ia-nota-lumi-toggle:active,
  .ia-nota-btn:hover:not(:disabled),
  .ia-nota-aplicar:hover:not(:disabled) {
    transform: none;
  }
}
@media (forced-colors: active) {
  .ia-nota-lumi-spinner {
    border: 3px solid CanvasText;
    background: none;
    mask: none;
  }
}
</style>
