<script setup lang="ts">
import type { CaixaOperacional } from "~/types/padaria";
import { mensagemErro } from "~/utils/domain";

type Forma = "credito" | "debito" | "pix" | "voucher";
type Leitura = Record<Forma, number | null> & {
  documentoLegivel: boolean;
  numeroMaquininha: string | null;
  dataEmissao: string | null;
  acumulador: number | null;
  detalhes: Record<Forma, unknown[]>;
  camposDuvidosos: string[];
  observacoes: string[];
};
type Editavel = Omit<Leitura, Forma> & Record<Forma, string>;
const props = defineProps<{ caixa: CaixaOperacional }>();
const { apiUrl, apiGet, apiPost, apiPut } = useApi();
const campos = [
  { chave: "credito", titulo: "Crédito" },
  { chave: "debito", titulo: "Débito" },
  { chave: "pix", titulo: "Pix" },
  { chave: "voucher", titulo: "Voucher" }
] as const;
const paineis = [
  { chave: "manha", titulo: "Relatório da manhã", subtitulo: "Leitura inicial", icone: "mdi-weather-sunny" },
  { chave: "tarde", titulo: "Relatório da tarde", subtitulo: "Leitura final", icone: "mdi-weather-sunset" }
] as const;
const camera = useTemplateRef<HTMLInputElement>("camera");
const galeria = useTemplateRef<HTMLInputElement>("galeria");
const etapa = ref<"manha" | "tarde">("manha");
const paineisAbertos = ref<string[]>(["manha"]);
const anexoId = ref("");
const base = ref<Editavel | null>(null);
const leitura = ref<Editavel>(novaLeitura(null));
const enviando = ref(false),
  salvando = ref(false),
  erro = ref(""),
  aviso = ref(""),
  salvo = ref(false);
const podeSalvar = computed(
  () => Boolean(anexoId.value) && campos.every(({ chave }) => valorMonetario(leitura.value[chave]) !== null)
);
function valorMonetario(valor: unknown) {
  const numero = Number(String(valor).replace(",", "."));
  return String(valor).trim() && Number.isFinite(numero) && numero >= 0 ? numero : null;
}
function novaLeitura(valor: unknown): Editavel {
  const dados = valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
  return {
    documentoLegivel: dados.documentoLegivel === true,
    numeroMaquininha: typeof dados.numeroMaquininha === "string" ? dados.numeroMaquininha : null,
    dataEmissao: typeof dados.dataEmissao === "string" ? dados.dataEmissao : null,
    acumulador: typeof dados.acumulador === "number" ? dados.acumulador : null,
    credito: dados.credito == null ? "" : String(dados.credito),
    debito: dados.debito == null ? "" : String(dados.debito),
    pix: dados.pix == null ? "" : String(dados.pix),
    voucher: dados.voucher == null ? "" : String(dados.voucher),
    detalhes: { credito: [], debito: [], pix: [], voucher: [] },
    camposDuvidosos: [],
    observacoes: []
  };
}
function leituraParaApi(): Leitura {
  return {
    ...leitura.value,
    credito: valorMonetario(leitura.value.credito),
    debito: valorMonetario(leitura.value.debito),
    pix: valorMonetario(leitura.value.pix),
    voucher: valorMonetario(leitura.value.voucher)
  };
}
function moeda(valor: number | null) {
  return valor === null ? "—" : valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function liquido(chave: Forma) {
  const atual = valorMonetario(leitura.value[chave]);
  const referencia = base.value ? valorMonetario(base.value[chave]) : 0;
  return atual === null || referencia === null ? null : atual - referencia;
}
function valorDaBase(chave: Forma) {
  return base.value ? valorMonetario(base.value[chave]) : null;
}
async function carregar() {
  if (!props.caixa.id) return;
  try {
    const resposta = await apiGet<{
      etapaDia: "manha" | "tarde";
      leituraReferencia: { leitura: unknown } | null;
      relatorio: { dadosRevisados: Record<string, unknown> } | null;
    }>(`/api/caixa/${encodeURIComponent(props.caixa.id)}/relatorio-maquininha`);
    etapa.value = resposta.etapaDia;
    paineisAbertos.value = [etapa.value];
    base.value = resposta.leituraReferencia?.leitura ? novaLeitura(resposta.leituraReferencia.leitura) : null;
    const dados = resposta.relatorio?.dadosRevisados;
    if (dados?.anexoId && dados.leituraAcumulada) {
      anexoId.value = String(dados.anexoId);
      leitura.value = novaLeitura(dados.leituraAcumulada);
      salvo.value = true;
    }
  } catch (falha) {
    erro.value = mensagemErro(falha);
  }
}
async function enviar(evento: Event) {
  const input = evento.target as HTMLInputElement;
  const arquivo = input.files?.[0];
  input.value = "";
  if (!arquivo || !props.caixa.id) return;
  enviando.value = true;
  erro.value = "";
  try {
    const corpo = new FormData();
    corpo.append("tipo", "comprovante_cartao");
    corpo.append("arquivo", arquivo);
    const resposta = await fetch(`${apiUrl}/api/caixa/${encodeURIComponent(props.caixa.id)}/anexos`, {
      method: "POST",
      credentials: "include",
      body: corpo
    });
    const json = (await resposta.json()) as { data?: { id: string }; detail?: string };
    if (!resposta.ok || !json.data) throw new Error(json.detail || "Não foi possível anexar o comprovante.");
    anexoId.value = json.data.id;
    const leituraIa = await apiPost<{ sugestao: Leitura }>(
      `/api/caixa/${encodeURIComponent(props.caixa.id)}/relatorio-maquininha/analisar`,
      { anexoId: json.data.id }
    );
    leitura.value = novaLeitura(leituraIa.sugestao);
    aviso.value = "A IA sugeriu os valores. Revise cada campo antes de salvar.";
    salvo.value = false;
  } catch (falha) {
    erro.value = mensagemErro(falha);
  } finally {
    enviando.value = false;
  }
}
async function salvar() {
  if (!podeSalvar.value || !props.caixa.id) return;
  salvando.value = true;
  erro.value = "";
  try {
    await apiPut(`/api/caixa/${encodeURIComponent(props.caixa.id)}/relatorio-maquininha`, {
      anexoId: anexoId.value,
      leituraAcumulada: leituraParaApi()
    });
    salvo.value = true;
    await carregar();
  } catch (falha) {
    erro.value = mensagemErro(falha);
  } finally {
    salvando.value = false;
  }
}
watch(
  () => props.caixa.id,
  () => void carregar(),
  { immediate: true }
);
</script>

<template>
  <section class="maquininha" aria-labelledby="maquininha-titulo">
    <header class="maquininha__cabecalho">
      <div>
        <span>Etapa 3 · maquininha</span>
        <h3 id="maquininha-titulo">Relatórios da maquininha</h3>
        <p>Abra o turno atual para registrar a foto. Os dois turnos ficam no mesmo lugar para conferência.</p>
      </div>
      <v-chip :color="salvo ? 'success' : 'warning'" size="small">{{ salvo ? "Revisado" : "Pendente" }}</v-chip>
    </header>
    <v-alert v-if="base" type="info" density="compact" variant="tonal" class="mb-4"
      >A leitura da manhã pertence a este PDV e a esta máquina. A tarde sempre calcula acumulado menos manhã.</v-alert
    >
    <v-expansion-panels v-model="paineisAbertos" multiple class="maquininha__paineis">
      <v-expansion-panel
        v-for="painel in paineis"
        :key="painel.chave"
        :value="painel.chave"
        :class="`maquininha__painel maquininha__painel--${painel.chave}`"
      >
        <v-expansion-panel-title
          ><v-icon :icon="painel.icone" /><span
            ><strong>{{ painel.titulo }}</strong
            ><small>{{
              painel.chave === etapa
                ? painel.subtitulo
                : painel.chave === "manha" && base
                  ? "Leitura já conferida"
                  : "Disponível após o turno da manhã"
            }}</small></span
          ></v-expansion-panel-title
        >
        <v-expansion-panel-text>
          <template v-if="painel.chave !== etapa && painel.chave === 'manha' && base"
            ><div class="maquininha__referencia">
              <article v-for="campo in campos" :key="campo.chave">
                <span>{{ campo.titulo }}</span
                ><strong>{{ moeda(valorDaBase(campo.chave)) }}</strong
                ><small>Leitura acumulada da manhã</small>
              </article>
            </div></template
          >
          <template v-else-if="painel.chave !== etapa"
            ><v-alert type="info" density="compact" variant="tonal"
              >O turno da tarde será liberado automaticamente quando a manhã deste PDV estiver fechada.</v-alert
            ></template
          >
          <template v-else>
            <section class="maquininha__foto">
              <div>
                <strong>Comprovante do turno</strong
                ><span>Envie uma foto pela câmera ou escolha uma imagem/PDF da galeria.</span>
              </div>
              <div class="maquininha__botoes">
                <v-btn prepend-icon="mdi-camera" :loading="enviando" @click="camera?.click()">Câmera</v-btn
                ><v-btn prepend-icon="mdi-image" :loading="enviando" @click="galeria?.click()">Galeria</v-btn>
              </div>
            </section>
            <div class="maquininha__campos">
              <v-text-field
                v-for="campo in campos"
                :key="campo.chave"
                v-model="leitura[campo.chave]"
                :label="campo.titulo"
                prefix="R$"
                inputmode="decimal"
              />
            </div>
            <section class="maquininha__liquidos">
              <h4>{{ etapa === "manha" ? "Total da manhã" : "Líquido da tarde" }}</h4>
              <div>
                <article v-for="campo in campos" :key="campo.chave">
                  <span>{{ campo.titulo }}</span
                  ><strong>{{ moeda(liquido(campo.chave)) }}</strong
                  ><small>{{ etapa === "manha" ? "Acumulado do turno" : "Acumulado menos manhã" }}</small>
                </article>
              </div>
            </section>
            <v-alert v-if="aviso" type="info" density="compact" class="mt-4">{{ aviso }}</v-alert
            ><v-alert v-if="erro" type="error" density="compact" class="mt-4">{{ erro }}</v-alert
            ><v-btn
              color="success"
              class="maquininha__salvar mt-4"
              :loading="salvando"
              :disabled="!podeSalvar"
              @click="salvar"
              >Salvar leitura da maquininha</v-btn
            >
          </template>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
    <!-- Os dois inputs ficam FORA do v-for dos paineis: dentro dele `useTemplateRef` devolve um ARRAY e
         `camera?.click()` estourava "is not a function" (Camera e Galeria nao abriam). So o painel do turno
         atual usa os botoes, entao um unico par de inputs basta. -->
    <input ref="camera" class="d-none" type="file" accept="image/*" capture="environment" @change="enviar" />
    <input ref="galeria" class="d-none" type="file" accept="image/*,application/pdf" @change="enviar" />
  </section>
</template>

<style src="./CaixaFechamentoMaquininha.css" scoped></style>
