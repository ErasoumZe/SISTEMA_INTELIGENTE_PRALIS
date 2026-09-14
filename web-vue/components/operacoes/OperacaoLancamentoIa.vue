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
    <button type="button" class="ia-nota-toggle" :aria-expanded="aberto" @click="aberto = !aberto">
      <v-icon size="18">mdi-auto-fix</v-icon>
      <span>Discriminar com IA</span>
      <span class="lc-flex" />
      <v-icon size="16">{{ aberto ? "mdi-chevron-down" : "mdi-chevron-right" }}</v-icon>
    </button>

    <div v-if="aberto" class="ia-nota-corpo">
      <p class="ia-nota-ajuda">A IA apenas prepara uma sugestao. Revise tudo antes de usar o Salvar.</p>
      <div class="ia-nota-acoes">
        <button type="button" class="ia-nota-btn" :disabled="carregando" @click="camera?.click()">
          <v-icon size="18">mdi-camera</v-icon> Tirar foto
        </button>
        <button type="button" class="ia-nota-btn" :disabled="carregando" @click="galeria?.click()">
          <v-icon size="18">mdi-image-multiple</v-icon> Escolher da galeria
        </button>
        <input
          ref="camera"
          class="ia-nota-input"
          type="file"
          accept="image/*"
          capture="environment"
          @change="analisarArquivo"
        />
        <input ref="galeria" class="ia-nota-input" type="file" accept="image/*" @change="analisarArquivo" />
      </div>

      <p v-if="carregando" class="ia-nota-status" role="status">
        <v-progress-circular indeterminate size="18" width="2" /> Lendo a nota com seguranca...
      </p>
      <p v-if="erro" class="ia-nota-erro" role="alert">{{ erro }}</p>
      <p v-if="fotoNotaPreview || fotoNotaExistente" class="ia-nota-anexo">
        <v-icon size="15">mdi-paperclip</v-icon> A foto ficara anexada para auditoria somente quando voce salvar.
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
        <ul v-if="resultado.avisos.length" class="ia-nota-avisos">
          <li v-for="aviso in resultado.avisos" :key="aviso">{{ aviso }}</li>
        </ul>
        <button type="button" class="ia-nota-aplicar" :disabled="aplicado" @click="aplicar">
          <v-icon size="17">mdi-file-document-edit-outline</v-icon>
          {{ aplicado ? "Sugestoes aplicadas — revise abaixo" : "Aplicar sugestoes" }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ia-nota {
  margin: 4px 0 12px;
  border: 1px solid var(--cx-line);
  border-radius: 10px;
  overflow: hidden;
}
.ia-nota.aberta {
  border-color: var(--cat);
}
.ia-nota-toggle {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 0;
  color: var(--cx-ink);
  background: var(--cx-surface);
  font-weight: 700;
  text-align: left;
}
.ia-nota-corpo {
  padding: 12px;
  background: color-mix(in srgb, var(--cat-soft) 35%, var(--cx-surface));
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
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid var(--cat);
  border-radius: 8px;
  color: var(--cat-tinta);
  background: var(--cx-surface);
  font-weight: 700;
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
.ia-nota-aplicar {
  width: 100%;
  color: white;
  background: var(--cat);
}
@media (max-width: 480px) {
  .ia-nota-acoes {
    display: grid;
    grid-template-columns: 1fr;
  }
  .ia-nota-grade {
    grid-template-columns: 1fr;
  }
}
</style>
