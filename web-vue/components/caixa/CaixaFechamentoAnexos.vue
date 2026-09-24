<script setup lang="ts">
type TipoAnexo = "folha_fechamento" | "comprovante_cartao";
type Anexo = { id: string; tipo: TipoAnexo; nomeOriginal: string; mimeType: string };
type Relatorio = {
  documentoLegivel: boolean;
  numeroMaquininha: string;
  dataEmissao: string;
  credito: string;
  debito: string;
  pix: string;
  voucher: string;
  total: string;
  trocaInicial: string;
  saldoFinalDinheiro: string;
  camposDuvidosos: string[];
  observacoes: string[];
};
type RespostaRelatorio = { turnoNome: string; relatorio: { dadosRevisados: unknown } | null };
type RespostaAnalise = { turnoNome: string; sugestao: unknown; anexosConsiderados: string[] };

const props = defineProps<{ caixaId: string | null }>();
const emit = defineEmits<{
  (event: "folha-enviada", valor: boolean): void;
  (
    event: "anexos-atualizados",
    anexos: Array<{ id: string; tipo: TipoAnexo; nomeOriginal: string; relatorio: unknown }>
  ): void;
}>();
const { apiUrl, apiGet, apiPost, apiPut } = useApi();
const anexos = ref<Anexo[]>([]);
const previas = ref<Record<string, string>>({});
const relatorio = ref<Relatorio>(novoRelatorio(null));
const sugestao = ref<Relatorio | null>(null);
const anexosConsiderados = ref<string[]>([]);
const relatorioRegistrado = ref(false);
const turnoNome = ref("Turno da abertura não informado");
const erro = ref("");
const enviando = ref(false);
const analisando = ref(false);
const salvandoRelatorio = ref(false);
const removendoId = ref<string | null>(null);
const anexoAmpliado = ref<Anexo | null>(null);
const cameraAberta = ref(false);
const cameraErro = ref("");
const tipoFoto = ref<TipoAnexo>("folha_fechamento");
const folhaArquivo = useTemplateRef<HTMLInputElement>("folhaArquivo");
const cartaoArquivo = useTemplateRef<HTMLInputElement>("cartaoArquivo");
const videoCamera = useTemplateRef<HTMLVideoElement>("videoCamera");
let transmissaoCamera: MediaStream | null = null;

const folhas = computed(() => anexos.value.filter((anexo) => anexo.tipo === "folha_fechamento"));
const cartoes = computed(() => anexos.value.filter((anexo) => anexo.tipo === "comprovante_cartao"));
const dialogAnexoAmpliado = computed({
  get: () => Boolean(anexoAmpliado.value),
  set: (aberto: boolean) => {
    if (!aberto) anexoAmpliado.value = null;
  }
});

function texto(valor: unknown) {
  return typeof valor === "string" ? valor : "";
}

function valor(valor: unknown) {
  return typeof valor === "number" && Number.isFinite(valor) ? String(valor) : "";
}

function novoRelatorio(resultado: unknown): Relatorio {
  const dados = resultado && typeof resultado === "object" ? (resultado as Record<string, unknown>) : {};
  return {
    documentoLegivel: dados.documentoLegivel === true,
    numeroMaquininha: texto(dados.numeroMaquininha),
    dataEmissao: texto(dados.dataEmissao),
    credito: valor(dados.credito),
    debito: valor(dados.debito),
    pix: valor(dados.pix),
    voucher: valor(dados.voucher),
    total: valor(dados.total),
    trocaInicial: valor(dados.trocaInicial),
    saldoFinalDinheiro: valor(dados.saldoFinalDinheiro),
    camposDuvidosos: Array.isArray(dados.camposDuvidosos)
      ? dados.camposDuvidosos.filter((item): item is string => typeof item === "string")
      : [],
    observacoes: Array.isArray(dados.observacoes)
      ? dados.observacoes.filter((item): item is string => typeof item === "string")
      : []
  };
}

function dadosParaSalvar() {
  const numero = (valorTexto: string) => {
    const numeroLido = Number(valorTexto.replace(",", "."));
    return valorTexto.trim() && Number.isFinite(numeroLido) && numeroLido >= 0 ? numeroLido : null;
  };
  return {
    documentoLegivel: relatorio.value.documentoLegivel,
    numeroMaquininha: relatorio.value.numeroMaquininha.trim() || null,
    dataEmissao: relatorio.value.dataEmissao.trim() || null,
    credito: numero(relatorio.value.credito),
    debito: numero(relatorio.value.debito),
    pix: numero(relatorio.value.pix),
    voucher: numero(relatorio.value.voucher),
    total: numero(relatorio.value.total),
    trocaInicial: numero(relatorio.value.trocaInicial),
    saldoFinalDinheiro: numero(relatorio.value.saldoFinalDinheiro),
    camposDuvidosos: relatorio.value.camposDuvidosos,
    observacoes: relatorio.value.observacoes,
    anexosConsiderados: anexosConsiderados.value.length
      ? anexosConsiderados.value
      : cartoes.value.map((anexo) => anexo.id)
  };
}

function atualizarEvento() {
  const dados = relatorioRegistrado.value ? dadosParaSalvar() : null;
  emit("folha-enviada", folhas.value.length > 0);
  emit(
    "anexos-atualizados",
    anexos.value.map((anexo) => ({ ...anexo, relatorio: anexo.tipo === "comprovante_cartao" ? dados : null }))
  );
}

function ehImagem(anexo: Anexo) {
  return anexo.mimeType.startsWith("image/");
}

function limparPrevia(id: string) {
  const url = previas.value[id];
  if (url) URL.revokeObjectURL(url);
  const { [id]: _, ...restantes } = previas.value;
  previas.value = restantes;
}

async function carregarPrevias(lista: Anexo[]) {
  const ids = new Set(lista.map((anexo) => anexo.id));
  Object.keys(previas.value)
    .filter((id) => !ids.has(id))
    .forEach(limparPrevia);
  await Promise.all(
    lista
      .filter((anexo) => ehImagem(anexo) && !previas.value[anexo.id])
      .map(async (anexo) => {
        try {
          const resposta = await fetch(`${apiUrl}/api/caixa/${props.caixaId}/anexos/${anexo.id}`, {
            credentials: "include"
          });
          if (resposta.ok) previas.value = { ...previas.value, [anexo.id]: URL.createObjectURL(await resposta.blob()) };
        } catch {
          /* A prova continua salva; somente a prévia desta sessão ficou indisponível. */
        }
      })
  );
}

async function carregar() {
  if (!props.caixaId) {
    anexos.value = [];
    atualizarEvento();
    return;
  }
  try {
    const [lista, respostaRelatorio] = await Promise.all([
      apiGet<Anexo[]>(`/api/caixa/${props.caixaId}/anexos`),
      apiGet<RespostaRelatorio>(`/api/caixa/${props.caixaId}/relatorio-maquininha`)
    ]);
    anexos.value = lista ?? [];
    turnoNome.value = respostaRelatorio.turnoNome;
    relatorio.value = novoRelatorio(respostaRelatorio.relatorio?.dadosRevisados);
    anexosConsiderados.value = respostaRelatorio.relatorio ? cartoes.value.map((anexo) => anexo.id) : [];
    relatorioRegistrado.value = Boolean(respostaRelatorio.relatorio);
    sugestao.value = null;
    await carregarPrevias(anexos.value);
    atualizarEvento();
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não foi possível carregar os anexos.";
  }
}

async function enviarArquivo(arquivo: File, tipo: TipoAnexo) {
  if (!props.caixaId) return;
  enviando.value = true;
  erro.value = "";
  try {
    const corpo = new FormData();
    corpo.append("tipo", tipo);
    corpo.append("arquivo", arquivo);
    const resposta = await fetch(`${apiUrl}/api/caixa/${props.caixaId}/anexos`, {
      method: "POST",
      credentials: "include",
      body: corpo
    });
    if (!resposta.ok) throw new Error("Não foi possível anexar a foto.");
    await carregar();
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não foi possível anexar a foto.";
  } finally {
    enviando.value = false;
  }
}

async function enviar(evento: Event, tipo: TipoAnexo) {
  const entrada = evento.target as HTMLInputElement;
  const arquivo = entrada.files?.[0];
  if (arquivo) await enviarArquivo(arquivo, tipo);
  entrada.value = "";
}

async function remover(anexo: Anexo) {
  if (!props.caixaId) return;
  removendoId.value = anexo.id;
  try {
    const resposta = await fetch(`${apiUrl}/api/caixa/${props.caixaId}/anexos/${anexo.id}`, {
      method: "DELETE",
      credentials: "include"
    });
    if (!resposta.ok) throw new Error("Não foi possível excluir o anexo.");
    limparPrevia(anexo.id);
    if (anexoAmpliado.value?.id === anexo.id) anexoAmpliado.value = null;
    await carregar();
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não foi possível excluir o anexo.";
  } finally {
    removendoId.value = null;
  }
}

async function lerComIa() {
  if (!props.caixaId || !cartoes.value.length) return;
  analisando.value = true;
  erro.value = "";
  try {
    const resposta = await apiPost<RespostaAnalise>(`/api/caixa/${props.caixaId}/relatorio-maquininha/analisar`, {});
    turnoNome.value = resposta.turnoNome;
    sugestao.value = novoRelatorio(resposta.sugestao);
    anexosConsiderados.value = resposta.anexosConsiderados;
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não foi possível ler as fotos.";
  } finally {
    analisando.value = false;
  }
}

function usarSugestao() {
  if (!sugestao.value) return;
  relatorio.value = { ...sugestao.value };
  sugestao.value = null;
}

async function salvarDadosRevisados() {
  if (!props.caixaId || !cartoes.value.length) return;
  salvandoRelatorio.value = true;
  erro.value = "";
  try {
    await apiPut(`/api/caixa/${props.caixaId}/relatorio-maquininha`, dadosParaSalvar());
    await carregar();
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não foi possível salvar o relatório.";
  } finally {
    salvandoRelatorio.value = false;
  }
}

function encerrarCamera() {
  transmissaoCamera?.getTracks().forEach((trilha) => trilha.stop());
  transmissaoCamera = null;
  if (videoCamera.value) videoCamera.value.srcObject = null;
  cameraAberta.value = false;
}

async function abrirCamera(tipo: TipoAnexo) {
  cameraErro.value = "";
  try {
    transmissaoCamera = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" } }
    });
    tipoFoto.value = tipo;
    cameraAberta.value = true;
    await nextTick();
    if (videoCamera.value) {
      videoCamera.value.srcObject = transmissaoCamera;
      await videoCamera.value.play();
    }
  } catch {
    cameraErro.value = "Não foi possível acessar a câmera. Autorize o navegador ou anexe uma foto.";
  }
}

async function tirarFoto() {
  const video = videoCamera.value;
  if (!video?.videoWidth || !video.videoHeight) return;
  const quadro = document.createElement("canvas");
  quadro.width = video.videoWidth;
  quadro.height = video.videoHeight;
  quadro.getContext("2d")?.drawImage(video, 0, 0, quadro.width, quadro.height);
  const foto = await new Promise<Blob | null>((resolver) => quadro.toBlob(resolver, "image/jpeg", 0.9));
  if (!foto) return;
  await enviarArquivo(new File([foto], `fechamento-${Date.now()}.jpg`, { type: "image/jpeg" }), tipoFoto.value);
  encerrarCamera();
}

watch(
  () => props.caixaId,
  () => void carregar(),
  { immediate: true }
);
onBeforeUnmount(() => {
  encerrarCamera();
  Object.keys(previas.value).forEach(limparPrevia);
});
</script>

<template>
  <section class="mt-4" aria-label="Anexos do fechamento">
    <v-sheet class="folha-fechamento pa-4" rounded="lg" border>
      <div class="text-subtitle-2">Folha de fechamento <span class="text-error">(obrigatória)</span></div>
      <div class="d-flex flex-wrap ga-2 mt-2">
        <v-btn
          variant="outlined"
          prepend-icon="mdi-camera"
          :loading="enviando"
          :disabled="!caixaId"
          @click="abrirCamera('folha_fechamento')"
          >Tirar foto</v-btn
        >
        <v-btn
          variant="outlined"
          prepend-icon="mdi-paperclip"
          :loading="enviando"
          :disabled="!caixaId"
          @click="folhaArquivo?.click()"
          >Anexar arquivo</v-btn
        >
      </div>
      <input
        ref="folhaArquivo"
        class="d-none"
        type="file"
        accept="image/*,application/pdf"
        @change="enviar($event, 'folha_fechamento')"
      />
      <div v-if="folhas.length" class="anexos-enviados mt-3">
        <div v-for="anexo in folhas" :key="anexo.id" class="anexo-miniatura">
          <button
            v-if="ehImagem(anexo)"
            class="anexo-miniatura__foto"
            type="button"
            :disabled="!previas[anexo.id]"
            @click="anexoAmpliado = anexo"
          >
            <img v-if="previas[anexo.id]" :src="previas[anexo.id]" :alt="`Prévia de ${anexo.nomeOriginal}`" /><v-icon
              v-else
              icon="mdi-image-outline"
            />
          </button>
          <div v-else class="anexo-miniatura__arquivo"><v-icon icon="mdi-file-document-outline" /></div>
          <span class="anexo-miniatura__nome">{{ anexo.nomeOriginal }}</span>
          <v-btn
            icon="mdi-close"
            size="x-small"
            variant="text"
            color="error"
            :loading="removendoId === anexo.id"
            @click="remover(anexo)"
          />
        </div>
      </div>
    </v-sheet>

    <v-sheet class="relatorio-maquininha pa-4 mt-5" rounded="lg" border>
      <div class="d-flex flex-wrap align-center ga-2">
        <v-icon color="info" icon="mdi-credit-card-outline" />
        <div>
          <div class="text-subtitle-1 font-weight-bold">Relatório da maquininha</div>
          <div class="text-caption">
            Turno da abertura: {{ turnoNome }} · Envie os dois comprovantes desta única maquininha.
          </div>
        </div>
      </div>
      <div class="d-flex flex-wrap ga-2 mt-3">
        <v-btn
          color="info"
          variant="flat"
          prepend-icon="mdi-camera"
          :loading="enviando"
          :disabled="!caixaId"
          @click="abrirCamera('comprovante_cartao')"
          >Tirar foto</v-btn
        >
        <v-btn
          color="info"
          variant="outlined"
          prepend-icon="mdi-paperclip"
          :loading="enviando"
          :disabled="!caixaId"
          @click="cartaoArquivo?.click()"
          >Anexar foto</v-btn
        >
        <v-btn
          v-if="cartoes.length"
          color="info"
          variant="tonal"
          prepend-icon="mdi-auto-fix"
          :loading="analisando"
          @click="lerComIa"
          >Ler fotos com IA</v-btn
        >
      </div>
      <input
        ref="cartaoArquivo"
        class="d-none"
        type="file"
        accept="image/*,application/pdf"
        @change="enviar($event, 'comprovante_cartao')"
      />
      <div v-if="cartoes.length" class="anexos-enviados mt-3">
        <div v-for="anexo in cartoes" :key="anexo.id" class="anexo-miniatura">
          <button
            v-if="ehImagem(anexo)"
            class="anexo-miniatura__foto"
            type="button"
            :disabled="!previas[anexo.id]"
            @click="anexoAmpliado = anexo"
          >
            <img v-if="previas[anexo.id]" :src="previas[anexo.id]" :alt="`Prévia de ${anexo.nomeOriginal}`" /><v-icon
              v-else
              icon="mdi-image-outline"
            />
          </button>
          <div v-else class="anexo-miniatura__arquivo"><v-icon icon="mdi-file-pdf-box" /></div>
          <span class="anexo-miniatura__nome">{{ anexo.nomeOriginal }}</span>
          <v-btn
            icon="mdi-close"
            size="x-small"
            variant="text"
            color="error"
            :loading="removendoId === anexo.id"
            @click="remover(anexo)"
          />
        </div>
      </div>
      <v-alert v-if="sugestao" type="info" variant="tonal" class="mt-4"
        >Leitura sugerida pronta. Revise os dados abaixo e clique em <strong>Usar sugestão</strong>; nada é salvo
        automaticamente.<template #append
          ><v-btn size="small" variant="flat" color="info" @click="usarSugestao">Usar sugestão</v-btn></template
        ></v-alert
      >
      <v-row v-if="cartoes.length" class="mt-2" dense>
        <v-col cols="12" md="4"><v-text-field v-model="relatorio.numeroMaquininha" label="Nº da maquininha" /></v-col>
        <v-col cols="12" md="4"><v-text-field v-model="relatorio.dataEmissao" label="Data/hora lida" /></v-col>
        <v-col cols="12" md="4"
          ><v-checkbox v-model="relatorio.documentoLegivel" label="Documento legível" hide-details
        /></v-col>
        <v-col
          v-for="campo in [
            ['credito', 'Crédito'],
            ['debito', 'Débito'],
            ['pix', 'Pix'],
            ['voucher', 'Voucher'],
            ['total', 'Total'],
            ['trocaInicial', 'Troca inicial'],
            ['saldoFinalDinheiro', 'Saldo final em dinheiro']
          ] as const"
          :key="campo[0]"
          cols="12"
          sm="6"
          md="3"
          ><v-text-field v-model="relatorio[campo[0]]" :label="campo[1]" inputmode="decimal" prefix="R$"
        /></v-col>
        <v-col cols="12"
          ><v-btn
            color="info"
            variant="flat"
            prepend-icon="mdi-content-save"
            :loading="salvandoRelatorio"
            @click="salvarDadosRevisados"
            >Salvar dados revisados</v-btn
          ></v-col
        >
      </v-row>
    </v-sheet>
    <v-alert v-if="erro" type="error" density="compact" class="mt-3">{{ erro }}</v-alert>

    <v-dialog v-model="cameraAberta" persistent max-width="680"
      ><v-card
        ><v-card-title>Tirar foto</v-card-title
        ><v-card-text
          ><video ref="videoCamera" class="camera-video" autoplay playsinline /><v-alert
            v-if="cameraErro"
            type="error"
            density="compact"
            class="mt-2"
            >{{ cameraErro }}</v-alert
          ></v-card-text
        ><v-card-actions
          ><v-spacer /><v-btn @click="encerrarCamera">Cancelar</v-btn
          ><v-btn color="primary" prepend-icon="mdi-camera" @click="tirarFoto">Usar foto</v-btn></v-card-actions
        ></v-card
      ></v-dialog
    >
    <v-dialog v-model="dialogAnexoAmpliado" persistent max-width="900"
      ><v-card
        ><v-card-title class="d-flex"
          >{{ anexoAmpliado?.nomeOriginal }}<v-spacer /><v-btn
            icon="mdi-close"
            variant="text"
            @click="anexoAmpliado = null" /></v-card-title
        ><v-card-text
          ><img
            v-if="anexoAmpliado && ehImagem(anexoAmpliado)"
            class="anexo-ampliado"
            :src="previas[anexoAmpliado.id]"
            :alt="anexoAmpliado.nomeOriginal" /></v-card-text></v-card
    ></v-dialog>
  </section>
</template>

<style scoped>
.folha-fechamento {
  border-color: rgb(var(--v-theme-warning)) !important;
  background: rgba(var(--v-theme-warning), 0.1);
}
.relatorio-maquininha {
  border-color: rgb(var(--v-theme-info)) !important;
  background: rgba(var(--v-theme-info), 0.1);
}
.anexos-enviados {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.anexo-miniatura {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 180px;
  max-width: 290px;
  padding: 6px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
}
.anexo-miniatura__foto,
.anexo-miniatura__arquivo {
  width: 78px;
  height: 62px;
  flex: 0 0 auto;
  overflow: hidden;
  border: 0;
  border-radius: 5px;
  background: rgb(var(--v-theme-surface-variant));
  cursor: pointer;
}
.anexo-miniatura__foto img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.anexo-miniatura__arquivo {
  display: grid;
  place-items: center;
}
.anexo-miniatura__nome {
  overflow: hidden;
  flex: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.78rem;
}
.camera-video,
.anexo-ampliado {
  display: block;
  width: 100%;
  max-height: 70vh;
  object-fit: contain;
}
</style>
