<script setup lang="ts">
import type { CaixaOperacional } from "~/types/padaria";
import { mensagemErro } from "~/utils/domain";
import { formatarDataHora } from "~/utils/formatacao";
import { formatarCampoDinheiro, numeroDoCampo } from "~/utils/campo-dinheiro";
import CapturaCameraDialog from "~/components/comum/CapturaCameraDialog.vue";
import CaixaCorrecaoManual from "~/components/caixa/CaixaCorrecaoManual.vue";
import { useCapturaCamera } from "~/composables/useCapturaCamera";

type Forma = "credito" | "debito" | "pix" | "voucher";
type Leitura = Record<Forma, number | null> & {
  documentoLegivel: boolean;
  numeroMaquininha: string | null;
  dataEmissao: string | null;
  acumulador: number | null;
  detalhes: Record<Forma, unknown[]>;
  camposDuvidosos: string[];
  observacoes: string[];
  correcaoManual: { justificativa: string; campos: string[] } | null;
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
const { aberta: cameraAberta, abrir: abrirCamera, aoCapturar, aoIndisponivel } = useCapturaCamera(camera);
const galeria = useTemplateRef<HTMLInputElement>("galeria");
const etapa = ref<"manha" | "tarde">("manha");
// Manha e tarde ficam sempre abertos (R-227): o turno que nao e o deste caixa mostra o aviso do que fazer.
const paineisAbertos = ref<string[]>(["manha", "tarde"]);
// Quando a manha deste PDV fechou (a tarde desconta essa leitura).
const manhaFechadaEm = ref<string | null>(null);
const anexoId = ref("");
const base = ref<Editavel | null>(null);
const leitura = ref<Editavel>(novaLeitura(null));
const enviando = ref(false),
  salvando = ref(false),
  erro = ref(""),
  aviso = ref(""),
  salvo = ref(false);
// O que a IA leu (ou o que foi salvo): base para saber se o operador mudou algum valor travado.
const original = ref<Editavel | null>(null);
const corrigindo = ref(false);
const justificativa = ref("");
const camposAlterados = computed(() => {
  const lida = original.value;
  if (!lida) return [];
  return campos.filter(
    ({ chave }) => travadoEm(lida, chave) && valorMonetario(leitura.value[chave]) !== valorMonetario(lida[chave])
  );
});
const podeSalvar = computed(
  () =>
    Boolean(anexoId.value) &&
    campos.every(({ chave }) => valorMonetario(leitura.value[chave]) !== null) &&
    (!camposAlterados.value.length || justificativa.value.trim().length >= 5)
);
function definirLeitura(nova: Editavel) {
  leitura.value = nova;
  original.value = { ...nova };
  corrigindo.value = false;
  justificativa.value = "";
}
// "947,05", "2.552,61" (digitado) e "947.05" (payload) valem; vazio, lixo ou negativo nao.
function valorMonetario(valor: unknown) {
  const numero = numeroDoCampo(typeof valor === "number" || typeof valor === "string" ? valor : null);
  return numero !== null && numero >= 0 ? numero : null;
}
// O campo mostra o valor como o cupom: com virgula ("947,05"), nunca "947.05".
function textoMonetario(valor: unknown) {
  return typeof valor === "number" && Number.isFinite(valor) ? formatarCampoDinheiro(valor) : "";
}
// Valor lido pela IA fica travado; so o que ela nao leu (ou marcou como duvidoso) e digitado.
function travadoEm(dados: Editavel, chave: Forma) {
  return dados.documentoLegivel && Boolean(dados[chave].trim()) && !dados.camposDuvidosos.includes(chave);
}
function travado(chave: Forma) {
  return !corrigindo.value && travadoEm(leitura.value, chave);
}
function novaLeitura(valor: unknown): Editavel {
  const dados = valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
  return {
    documentoLegivel: dados.documentoLegivel === true,
    numeroMaquininha: typeof dados.numeroMaquininha === "string" ? dados.numeroMaquininha : null,
    dataEmissao: typeof dados.dataEmissao === "string" ? dados.dataEmissao : null,
    acumulador: typeof dados.acumulador === "number" ? dados.acumulador : null,
    credito: textoMonetario(dados.credito),
    debito: textoMonetario(dados.debito),
    pix: textoMonetario(dados.pix),
    voucher: textoMonetario(dados.voucher),
    detalhes: { credito: [], debito: [], pix: [], voucher: [] },
    camposDuvidosos: Array.isArray(dados.camposDuvidosos)
      ? dados.camposDuvidosos.filter((campo): campo is string => typeof campo === "string")
      : [],
    observacoes: [],
    correcaoManual:
      dados.correcaoManual && typeof dados.correcaoManual === "object"
        ? (dados.correcaoManual as Editavel["correcaoManual"])
        : null
  };
}
function leituraParaApi(): Leitura {
  return {
    ...leitura.value,
    // Mudou valor lido pela IA: grava quais campos e por que; senao mantem a correcao ja registrada.
    correcaoManual: camposAlterados.value.length
      ? { justificativa: justificativa.value.trim(), campos: camposAlterados.value.map(({ titulo }) => titulo) }
      : leitura.value.correcaoManual,
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
      leituraReferencia: { leitura: unknown; fechadoEm: string | null } | null;
      relatorio: { dadosRevisados: Record<string, unknown> } | null;
    }>(`/api/caixa/${encodeURIComponent(props.caixa.id)}/relatorio-maquininha`);
    etapa.value = resposta.etapaDia;
    paineisAbertos.value = ["manha", "tarde"];
    base.value = resposta.leituraReferencia?.leitura ? novaLeitura(resposta.leituraReferencia.leitura) : null;
    manhaFechadaEm.value = resposta.leituraReferencia?.fechadoEm ?? null;
    const dados = resposta.relatorio?.dadosRevisados;
    if (dados?.anexoId && dados.leituraAcumulada) {
      anexoId.value = String(dados.anexoId);
      definirLeitura(novaLeitura(dados.leituraAcumulada));
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
    salvo.value = false;
    try {
      const leituraIa = await apiPost<{ sugestao: Leitura }>(
        `/api/caixa/${encodeURIComponent(props.caixa.id)}/relatorio-maquininha/analisar`,
        { anexoId: json.data.id }
      );
      definirLeitura(novaLeitura(leituraIa.sugestao));
      aviso.value =
        "A IA leu o comprovante. Os valores lidos ficam travados; preencha só os que ela não conseguiu ler e salve.";
    } catch {
      // IA fora do ar (ou sem resposta): a foto continua anexada como prova e todos os campos ficam livres.
      definirLeitura(novaLeitura(null));
      aviso.value =
        "A leitura automática não funcionou. A foto ficou anexada: preencha os valores do comprovante manualmente e salve.";
    }
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
    <v-alert type="info" density="compact" variant="tonal" class="mb-4" data-teste="maquininha-aviso-turno">
      <template v-if="etapa === 'tarde'">
        <strong>Este é o relatório da tarde do {{ caixa.pdvNome }}.</strong> O sistema desconta sozinho a leitura da
        manhã deste PDV e desta maquininha<template v-if="manhaFechadaEm">
          (manhã fechada em {{ formatarDataHora(manhaFechadaEm) }})</template
        >. Não precisa fazer conta: envie o relatório acumulado do dia.
      </template>
      <template v-else>
        <strong>Este é o relatório da manhã do {{ caixa.pdvNome }}.</strong> Envie o relatório da maquininha. O da tarde
        é feito pelo caixa da tarde deste PDV, depois que esta manhã fechar. No dia seguinte tudo começa do zero.
      </template>
    </v-alert>
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
                  ? "Leitura da manhã deste PDV, já fechada"
                  : "Feito pelo caixa da tarde, depois que a manhã fechar"
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
            ><v-alert type="warning" density="compact" variant="tonal" data-teste="maquininha-aviso-tarde"
              >O relatório da tarde só pode ser feito depois que o caixa da manhã deste PDV fechar. Ele é feito pelo
              caixa da tarde e desconta sozinho a leitura da manhã.</v-alert
            ></template
          >
          <template v-else>
            <section class="maquininha__foto">
              <div>
                <strong>Comprovante do turno</strong
                ><span>Envie uma foto pela câmera ou escolha uma imagem/PDF da galeria.</span>
              </div>
              <div class="maquininha__botoes">
                <v-btn prepend-icon="mdi-camera" :loading="enviando" @click="abrirCamera()">Câmera</v-btn
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
                :readonly="travado(campo.chave)"
                :append-inner-icon="travado(campo.chave) ? 'mdi-lock-outline' : undefined"
                :hint="travado(campo.chave) ? 'Lido pela IA' : ''"
                :persistent-hint="travado(campo.chave)"
                :data-teste="`maquininha-campo-${campo.chave}`"
              />
            </div>
            <CaixaCorrecaoManual
              v-model:corrigindo="corrigindo"
              v-model:justificativa="justificativa"
              :tem-travados="campos.some(({ chave }) => travadoEm(leitura, chave))"
              :alterados="camposAlterados.map(({ titulo }) => titulo)"
              :salva="leitura.correcaoManual"
            />
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
    <CapturaCameraDialog v-model="cameraAberta" @capturada="aoCapturar" @indisponivel="aoIndisponivel" />
  </section>
</template>

<style src="./CaixaFechamentoMaquininha.css" scoped></style>
