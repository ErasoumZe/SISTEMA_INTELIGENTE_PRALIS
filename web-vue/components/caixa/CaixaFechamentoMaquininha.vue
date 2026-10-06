<script setup lang="ts">
import type { CaixaOperacional } from "~/types/padaria";
import { mensagemErro } from "~/utils/domain";

type Forma = "credito" | "debito" | "pix" | "voucher";
type Turno = "manha" | "tarde";
type Anexo = { id: string; tipo: "folha_fechamento" | "comprovante_cartao"; nomeOriginal: string };
type Detalhe = { nome: string; valor: number };
type Leitura = {
  documentoLegivel: boolean;
  numeroMaquininha: string | null;
  dataEmissao: string | null;
  acumulador: number | null;
  credito: number | null;
  debito: number | null;
  pix: number | null;
  voucher: number | null;
  detalhes: Record<Forma, Detalhe[]>;
  camposDuvidosos: string[];
  observacoes: string[];
};
type LeituraEditavel = Omit<Leitura, Forma> & Record<Forma, string>;
type Analise = { sugestao: Leitura; numeroLidoDivergente: boolean; simulada?: boolean };

const props = defineProps<{ caixa: CaixaOperacional }>();
const { apiUrl, apiGet, apiPost, apiPut } = useApi();
const campos: Array<{ chave: Forma; titulo: string }> = [
  { chave: "credito", titulo: "Crédito" },
  { chave: "debito", titulo: "Débito" },
  { chave: "pix", titulo: "Pix" },
  { chave: "voucher", titulo: "Voucher" }
];
const arquivo = useTemplateRef<HTMLInputElement>("arquivo");
const anexos = ref<Anexo[]>([]),
  alvoUpload = ref<Turno>("manha"),
  anexoManhaId = ref(""),
  anexoTardeId = ref("");
const leituraManha = ref<LeituraEditavel>(novaLeitura(null)),
  leituraTarde = ref<LeituraEditavel>(novaLeitura(null));
const enviando = ref(false),
  salvando = ref(false),
  erro = ref(""),
  aviso = ref(""),
  salvo = ref(false);
const temMaquininha = computed(() => Boolean(props.caixa.maquininhaNumeroSerie?.trim()));
const numeroMaquininha = computed(() => props.caixa.maquininhaNumeroSerie?.trim() || "Não vinculada na abertura");
const podeSalvar = computed(
  () =>
    temMaquininha.value &&
    Boolean(anexoManhaId.value && anexoTardeId.value) &&
    leituraCompleta(leituraManha.value) &&
    leituraCompleta(leituraTarde.value)
);

function texto(valor: unknown) {
  return typeof valor === "string" ? valor : null;
}
function numero(valor: unknown) {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}
function detalhes(valor: unknown): Record<Forma, Detalhe[]> {
  const base = valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
  return Object.fromEntries(
    campos.map(({ chave }) => [
      chave,
      Array.isArray(base[chave])
        ? base[chave].filter(
            (item): item is Detalhe =>
              Boolean(item) &&
              typeof item === "object" &&
              typeof (item as Detalhe).nome === "string" &&
              numero((item as Detalhe).valor) !== null
          )
        : []
    ])
  ) as Record<Forma, Detalhe[]>;
}
function novaLeitura(valor: unknown): LeituraEditavel {
  const dados = valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
  return {
    documentoLegivel: dados.documentoLegivel === true,
    numeroMaquininha: texto(dados.numeroMaquininha),
    dataEmissao: texto(dados.dataEmissao),
    acumulador: numero(dados.acumulador),
    credito: numero(dados.credito) === null ? "" : String(numero(dados.credito)),
    debito: numero(dados.debito) === null ? "" : String(numero(dados.debito)),
    pix: numero(dados.pix) === null ? "" : String(numero(dados.pix)),
    voucher: numero(dados.voucher) === null ? "" : String(numero(dados.voucher)),
    detalhes: detalhes(dados.detalhes),
    camposDuvidosos: Array.isArray(dados.camposDuvidosos)
      ? dados.camposDuvidosos.filter((item): item is string => typeof item === "string")
      : [],
    observacoes: Array.isArray(dados.observacoes)
      ? dados.observacoes.filter((item): item is string => typeof item === "string")
      : []
  };
}
function paraNumero(valor: string) {
  const convertido = Number(valor.replace(",", "."));
  return valor.trim() && Number.isFinite(convertido) && convertido >= 0 ? convertido : null;
}
function leituraCompleta(leitura: LeituraEditavel) {
  return campos.every(({ chave }) => paraNumero(leitura[chave]) !== null);
}
function leituraParaApi(leitura: LeituraEditavel): Leitura {
  return {
    ...leitura,
    credito: paraNumero(leitura.credito),
    debito: paraNumero(leitura.debito),
    pix: paraNumero(leitura.pix),
    voucher: paraNumero(leitura.voucher)
  };
}
function valor(leitura: LeituraEditavel, forma: Forma) {
  return paraNumero(leitura[forma]);
}
function moeda(valorMonetario: number | null) {
  return valorMonetario === null ? "—" : valorMonetario.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function totalManha() {
  const valores = campos.map(({ chave }) => valor(leituraManha.value, chave));
  if (valores.some((item) => item === null)) return null;
  return valores.reduce<number>((total, item) => total + (item ?? 0), 0);
}
function liquidoTarde(forma: Forma) {
  const manha = valor(leituraManha.value, forma),
    tarde = valor(leituraTarde.value, forma);
  return manha === null || tarde === null ? null : tarde - manha;
}
function totalTarde() {
  const valores = campos.map(({ chave }) => liquidoTarde(chave));
  if (valores.some((item) => item === null)) return null;
  return valores.reduce<number>((total, item) => total + (item ?? 0), 0);
}
function comprovante(id: string) {
  return anexos.value.find((anexo) => anexo.id === id) ?? null;
}
function aplicarSugestao(destino: LeituraEditavel, sugestao: Leitura) {
  const proxima = novaLeitura(sugestao);
  for (const { chave } of campos) if (proxima[chave] === "") proxima[chave] = destino[chave];
  if (proxima.acumulador === null) proxima.acumulador = destino.acumulador;
  for (const { chave } of campos)
    if (!proxima.detalhes[chave].length) proxima.detalhes[chave] = destino.detalhes[chave];
  return proxima;
}
async function carregar() {
  if (!props.caixa.id) return;
  erro.value = "";
  try {
    const [lista, resposta] = await Promise.all([
      apiGet<Anexo[]>(`/api/caixa/${encodeURIComponent(props.caixa.id)}/anexos`),
      apiGet<{ relatorio: { dadosRevisados: unknown } | null }>(
        `/api/caixa/${encodeURIComponent(props.caixa.id)}/relatorio-maquininha`
      )
    ]);
    anexos.value = lista ?? [];
    const dados = resposta.relatorio?.dadosRevisados;
    if (!dados || typeof dados !== "object") return;
    const revisado = dados as Record<string, unknown>;
    anexoManhaId.value = texto(revisado.anexoManhaId) || "";
    anexoTardeId.value = texto(revisado.anexoTardeId) || "";
    leituraManha.value = novaLeitura(revisado.leituraManha);
    leituraTarde.value = novaLeitura(revisado.leituraTarde);
    salvo.value = Boolean(anexoManhaId.value && anexoTardeId.value);
  } catch (falha) {
    erro.value = mensagemErro(falha);
  }
}
function escolherArquivo(turno: Turno) {
  alvoUpload.value = turno;
  arquivo.value?.click();
}
async function enviar(evento: Event) {
  const entrada = evento.target as HTMLInputElement,
    selecionado = entrada.files?.[0];
  entrada.value = "";
  if (!selecionado || !props.caixa.id || !temMaquininha.value) return;
  enviando.value = true;
  erro.value = "";
  aviso.value = "";
  try {
    const corpo = new FormData();
    corpo.append("tipo", "comprovante_cartao");
    corpo.append("arquivo", selecionado);
    const resposta = await fetch(`${apiUrl}/api/caixa/${encodeURIComponent(props.caixa.id)}/anexos`, {
      method: "POST",
      credentials: "include",
      body: corpo
    });
    const json = (await resposta.json()) as { data?: Anexo; detail?: string; title?: string };
    if (!resposta.ok || !json.data) throw new Error(json.detail || json.title || "Não foi possível anexar a foto.");
    anexos.value = [...anexos.value, json.data];
    if (alvoUpload.value === "manha") anexoManhaId.value = json.data.id;
    else anexoTardeId.value = json.data.id;
    try {
      const analise = await apiPost<Analise>(
        `/api/caixa/${encodeURIComponent(props.caixa.id)}/relatorio-maquininha/analisar`,
        { anexoId: json.data.id, tipoLeitura: alvoUpload.value }
      );
      if (alvoUpload.value === "manha") leituraManha.value = aplicarSugestao(leituraManha.value, analise.sugestao);
      else leituraTarde.value = aplicarSugestao(leituraTarde.value, analise.sugestao);
      aviso.value = analise.simulada
        ? "SIMULAÇÃO LOCAL: valores artificiais foram preenchidos. Não use esta leitura como comprovante real."
        : "Campos visíveis foram preenchidos pela leitura. Revise antes de salvar.";
      if (analise.numeroLidoDivergente)
        aviso.value +=
          " O número lido difere do equipamento vinculado na abertura; a abertura continua sendo a referência oficial.";
    } catch (falha) {
      aviso.value = `Foto anexada como prova. Preencha os campos manualmente: ${mensagemErro(falha)}`;
    }
    salvo.value = false;
  } catch (falha) {
    erro.value = mensagemErro(falha);
  } finally {
    enviando.value = false;
  }
}
async function salvar() {
  if (!props.caixa.id || !podeSalvar.value) return;
  salvando.value = true;
  erro.value = "";
  try {
    await apiPut(`/api/caixa/${encodeURIComponent(props.caixa.id)}/relatorio-maquininha`, {
      anexoManhaId: anexoManhaId.value,
      leituraManha: leituraParaApi(leituraManha.value),
      anexoTardeId: anexoTardeId.value,
      leituraTarde: leituraParaApi(leituraTarde.value)
    });
    salvo.value = true;
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
  <section class="maquininha" aria-labelledby="maquininha-fechamento-titulo">
    <header class="maquininha__cabecalho">
      <div>
        <span>Etapa 3 · maquininha</span>
        <h3 id="maquininha-fechamento-titulo">Relatórios da maquininha</h3>
      </div>
      <v-chip :color="salvo ? 'success' : 'warning'" size="small">{{ salvo ? "Revisado" : "Pendente" }}</v-chip>
    </header>
    <p>Registre a leitura inicial e final. A IA sugere os campos visíveis; revise antes de salvar.</p>
    <v-text-field
      :model-value="numeroMaquininha"
      label="Maquininha vinculada na abertura"
      prepend-inner-icon="mdi-credit-card-chip-outline"
      readonly
      :error="!temMaquininha"
      :error-messages="
        temMaquininha ? undefined : 'Abra o caixa com a maquininha selecionada para conferir o relatório.'
      "
    />
    <v-expansion-panels variant="accordion" multiple class="maquininha__paineis">
      <v-expansion-panel value="manha" class="maquininha__painel maquininha__painel--manha">
        <v-expansion-panel-title>
          <v-icon icon="mdi-weather-sunny" size="20" />
          <span><strong>Relatório da manhã</strong><small>Leitura inicial</small></span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <section class="maquininha__foto">
            <div>
              <strong>Foto da leitura inicial</strong><span>Antes do primeiro movimento do turno.</span
              ><small v-if="comprovante(anexoManhaId)">{{ comprovante(anexoManhaId)?.nomeOriginal }}</small>
            </div>
            <v-btn
              color="primary"
              variant="tonal"
              prepend-icon="mdi-camera"
              :loading="enviando && alvoUpload === 'manha'"
              :disabled="!temMaquininha || enviando"
              @click="escolherArquivo('manha')"
              >Foto ou anexo</v-btn
            >
          </section>
          <v-text-field
            v-model.number="leituraManha.acumulador"
            label="Leitura acumulada da manhã"
            prefix="R$"
            inputmode="decimal"
          />
          <div class="maquininha__campos">
            <div v-for="campo in campos" :key="`manha-${campo.chave}`">
              <v-text-field
                v-model="leituraManha[campo.chave]"
                :label="`${campo.titulo} manhã`"
                prefix="R$"
                inputmode="decimal"
              /><v-expansion-panels v-if="leituraManha.detalhes[campo.chave].length" variant="accordion"
                ><v-expansion-panel title="Detalhes do relatório"
                  ><v-expansion-panel-text>{{
                    leituraManha.detalhes[campo.chave].map((item) => `${item.nome}: ${moeda(item.valor)}`).join(" · ")
                  }}</v-expansion-panel-text></v-expansion-panel
                ></v-expansion-panels
              >
            </div>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
      <v-expansion-panel value="tarde" class="maquininha__painel maquininha__painel--tarde">
        <v-expansion-panel-title>
          <v-icon icon="mdi-weather-sunset" size="20" />
          <span><strong>Relatório da tarde</strong><small>Leitura final</small></span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <section class="maquininha__foto">
            <div>
              <strong>Foto da leitura final</strong><span>Depois da última venda do turno.</span
              ><small v-if="comprovante(anexoTardeId)">{{ comprovante(anexoTardeId)?.nomeOriginal }}</small>
            </div>
            <v-btn
              color="primary"
              variant="tonal"
              prepend-icon="mdi-camera"
              :loading="enviando && alvoUpload === 'tarde'"
              :disabled="!temMaquininha || enviando"
              @click="escolherArquivo('tarde')"
              >Foto ou anexo</v-btn
            >
          </section>
          <v-text-field
            v-model.number="leituraTarde.acumulador"
            label="Leitura acumulada da tarde"
            prefix="R$"
            inputmode="decimal"
          />
          <div class="maquininha__campos">
            <div v-for="campo in campos" :key="`tarde-${campo.chave}`">
              <v-text-field
                v-model="leituraTarde[campo.chave]"
                :label="`${campo.titulo} tarde`"
                prefix="R$"
                inputmode="decimal"
              /><v-expansion-panels v-if="leituraTarde.detalhes[campo.chave].length" variant="accordion"
                ><v-expansion-panel title="Detalhes do relatório"
                  ><v-expansion-panel-text>{{
                    leituraTarde.detalhes[campo.chave].map((item) => `${item.nome}: ${moeda(item.valor)}`).join(" · ")
                  }}</v-expansion-panel-text></v-expansion-panel
                ></v-expansion-panels
              >
            </div>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
    <input
      ref="arquivo"
      class="d-none"
      type="file"
      accept="image/*,application/pdf"
      capture="environment"
      @change="enviar"
    />
    <section class="maquininha__liquidos">
      <h4>Líquido calculado</h4>
      <div>
        <article>
          <span>Manhã</span><strong>{{ moeda(totalManha()) }}</strong
          ><small>Soma do relatório da manhã</small>
        </article>
        <article>
          <span>Tarde</span><strong>{{ moeda(totalTarde()) }}</strong
          ><small>Relatório da tarde menos o da manhã</small>
        </article>
      </div>
      <div class="maquininha__formas">
        <span v-for="campo in campos" :key="campo.chave"
          >{{ campo.titulo }}: <b>{{ moeda(liquidoTarde(campo.chave)) }}</b></span
        >
      </div>
    </section>
    <v-alert type="info" variant="tonal" density="compact" class="mt-4"
      >Cartão, Pix e voucher são recebíveis: não entram no dinheiro físico do caixa.</v-alert
    ><v-alert v-if="aviso" type="warning" density="compact" class="mt-3">{{ aviso }}</v-alert
    ><v-alert v-if="erro" type="error" density="compact" class="mt-3">{{ erro }}</v-alert
    ><v-btn
      class="mt-4"
      color="success"
      prepend-icon="mdi-content-save-check"
      :loading="salvando"
      :disabled="!podeSalvar"
      @click="salvar"
      >Salvar leitura da maquininha</v-btn
    >
  </section>
</template>

<style src="./CaixaFechamentoMaquininha.css" scoped></style>
