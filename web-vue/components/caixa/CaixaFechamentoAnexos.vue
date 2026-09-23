<script setup lang="ts">
const props = defineProps<{ caixaId: string | null }>();
const emit = defineEmits<{
  (event: "folha-enviada", valor: boolean): void;
  (
    event: "anexos-atualizados",
    anexos: Array<{
      id: string;
      tipo: "folha_fechamento" | "comprovante_cartao";
      nomeOriginal: string;
      relatorio: unknown;
    }>
  ): void;
}>();
const { apiUrl, apiGet } = useApi();
const enviando = ref(false);
const erro = ref("");
type Anexo = {
  id: string;
  tipo: "folha_fechamento" | "comprovante_cartao";
  nomeOriginal: string;
  mimeType: string;
  iaStatus?: "desativada" | "processando" | "concluida" | "falhou";
  iaResultado?: unknown;
  iaErro?: string | null;
};
type RelatorioMaquininhaFormulario = {
  documentoLegivel: boolean;
  numeroMaquininha: string;
  periodo: "manha" | "tarde" | "noite" | "nao_identificado";
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
type TipoAnexo = Anexo["tipo"];
const anexos = ref<Anexo[]>([]);
const previas = ref<Record<string, string>>({});
const anexoAmpliado = ref<Anexo | null>(null);
const removendoId = ref<string | null>(null);
const analisandoId = ref<string | null>(null);
const salvandoRelatorioId = ref<string | null>(null);
const relatorios = ref<Record<string, RelatorioMaquininhaFormulario>>({});
const folhaArquivo = useTemplateRef<HTMLInputElement>("folhaArquivo");
const cartaoArquivo = useTemplateRef<HTMLInputElement>("cartaoArquivo");
const videoCamera = useTemplateRef<HTMLVideoElement>("videoCamera");
const cameraAberta = ref(false);
const cameraErro = ref("");
const tipoFoto = ref<TipoAnexo>("folha_fechamento");
let transmissaoCamera: MediaStream | null = null;
let versaoPrevia = 0;
const folhas = computed(() => anexos.value.filter((anexo) => anexo.tipo === "folha_fechamento"));
const cartoes = computed(() => anexos.value.filter((anexo) => anexo.tipo === "comprovante_cartao"));
const dialogAnexoAmpliado = computed({
  get: () => Boolean(anexoAmpliado.value),
  set: (aberto: boolean) => {
    if (!aberto) anexoAmpliado.value = null;
  }
});

function ehImagem(anexo: Anexo) {
  return anexo.mimeType.startsWith("image/");
}

function texto(valor: unknown) {
  return typeof valor === "string" ? valor : "";
}

function valor(valor: unknown) {
  return typeof valor === "number" && Number.isFinite(valor) ? String(valor) : "";
}

function relatorioFormulario(resultado: unknown): RelatorioMaquininhaFormulario {
  const dados = resultado && typeof resultado === "object" ? (resultado as Record<string, unknown>) : {};
  const periodo = dados.periodo;
  return {
    documentoLegivel: dados.documentoLegivel === true,
    numeroMaquininha: texto(dados.numeroMaquininha),
    periodo: periodo === "manha" || periodo === "tarde" || periodo === "noite" ? periodo : "nao_identificado",
    dataEmissao: texto(dados.dataEmissao),
    credito: valor(dados.credito),
    debito: valor(dados.debito),
    pix: valor(dados.pix),
    voucher: valor(dados.voucher),
    total: valor(dados.total),
    trocaInicial: valor(dados.trocaInicial),
    saldoFinalDinheiro: valor(dados.saldoFinalDinheiro),
    camposDuvidosos: Array.isArray(dados.camposDuvidosos) ? dados.camposDuvidosos.filter((item): item is string => typeof item === "string") : [],
    observacoes: Array.isArray(dados.observacoes) ? dados.observacoes.filter((item): item is string => typeof item === "string") : []
  };
}

function sincronizarRelatorios(lista: Anexo[]) {
  const ativos = new Set(lista.filter((anexo) => anexo.tipo === "comprovante_cartao").map((anexo) => anexo.id));
  const proximos: Record<string, RelatorioMaquininhaFormulario> = {};
  for (const anexo of lista.filter((item) => item.tipo === "comprovante_cartao")) {
    // `carregar` so roda apos upload, leitura, salvamento ou remocao. Nesses atos, o banco e a
    // fonte de verdade: manter o formulario vazio anterior esconderia a resposta nova da IA.
    proximos[anexo.id] = relatorioFormulario(anexo.iaResultado);
  }
  for (const id of Object.keys(proximos)) if (!ativos.has(id)) delete proximos[id];
  relatorios.value = proximos;
}

function urlPrevia(anexo: Anexo) {
  return previas.value[anexo.id] ?? "";
}

function limparPrevia(anexoId: string) {
  const url = previas.value[anexoId];
  if (url) URL.revokeObjectURL(url);
  const { [anexoId]: _, ...restantes } = previas.value;
  previas.value = restantes;
}

async function carregarPrevias(lista: Anexo[]) {
  const versao = ++versaoPrevia;
  const idsAtuais = new Set(lista.map((anexo) => anexo.id));
  Object.keys(previas.value)
    .filter((anexoId) => !idsAtuais.has(anexoId))
    .forEach(limparPrevia);

  await Promise.all(
    lista
      .filter((anexo) => ehImagem(anexo) && !previas.value[anexo.id])
      .map(async (anexo) => {
        try {
          const resposta = await fetch(`${apiUrl}/api/caixa/${props.caixaId}/anexos/${anexo.id}`, {
            credentials: "include"
          });
          if (!resposta.ok) return;
          const url = URL.createObjectURL(await resposta.blob());
          if (versao !== versaoPrevia || !idsAtuais.has(anexo.id)) {
            URL.revokeObjectURL(url);
            return;
          }
          previas.value = { ...previas.value, [anexo.id]: url };
        } catch {
          // A foto continua registrada; apenas a miniatura fica indisponível nesta sessão.
        }
      })
  );
}

async function carregar() {
  if (!props.caixaId) {
    anexos.value = [];
    emit("folha-enviada", false);
    emit("anexos-atualizados", []);
    return;
  }
  try {
    anexos.value = (await apiGet<Anexo[]>(`/api/caixa/${props.caixaId}/anexos`)) ?? [];
    sincronizarRelatorios(anexos.value);
    await carregarPrevias(anexos.value);
    emit("folha-enviada", folhas.value.length > 0);
    emit(
      "anexos-atualizados",
      anexos.value.map(({ id, tipo, nomeOriginal, iaResultado }) => ({ id, tipo, nomeOriginal, relatorio: iaResultado }))
    );
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Nao foi possivel carregar os anexos.";
  }
}

function numeroOuNulo(valor: string) {
  const numero = Number(valor.replace(",", "."));
  return valor.trim() && Number.isFinite(numero) && numero >= 0 ? numero : null;
}

function payloadRelatorio(anexoId: string) {
  const relatorio = relatorios.value[anexoId] ?? relatorioFormulario(null);
  return {
    documentoLegivel: relatorio.documentoLegivel,
    numeroMaquininha: relatorio.numeroMaquininha.trim() || null,
    periodo: relatorio.periodo,
    dataEmissao: relatorio.dataEmissao.trim() || null,
    credito: numeroOuNulo(relatorio.credito),
    debito: numeroOuNulo(relatorio.debito),
    pix: numeroOuNulo(relatorio.pix),
    voucher: numeroOuNulo(relatorio.voucher),
    total: numeroOuNulo(relatorio.total),
    trocaInicial: numeroOuNulo(relatorio.trocaInicial),
    saldoFinalDinheiro: numeroOuNulo(relatorio.saldoFinalDinheiro),
    camposDuvidosos: relatorio.camposDuvidosos,
    observacoes: relatorio.observacoes
  };
}

async function analisarComprovante(anexo: Anexo) {
  if (!props.caixaId || analisandoId.value) return;
  analisandoId.value = anexo.id;
  erro.value = "";
  try {
    const resposta = await fetch(`${apiUrl}/api/caixa/${props.caixaId}/anexos/${anexo.id}/analisar-comprovante`, {
      method: "POST",
      credentials: "include"
    });
    if (!resposta.ok) {
      const falha = (await resposta.json().catch(() => null)) as { title?: string } | null;
      throw new Error(falha?.title ?? "Não foi possível ler o comprovante.");
    }
    await carregar();
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não foi possível ler o comprovante.";
  } finally {
    analisandoId.value = null;
  }
}

async function salvarRelatorio(anexo: Anexo) {
  if (!props.caixaId || salvandoRelatorioId.value) return;
  salvandoRelatorioId.value = anexo.id;
  erro.value = "";
  try {
    const resposta = await fetch(`${apiUrl}/api/caixa/${props.caixaId}/anexos/${anexo.id}/relatorio-maquininha`, {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payloadRelatorio(anexo.id))
    });
    if (!resposta.ok) {
      const falha = (await resposta.json().catch(() => null)) as { title?: string } | null;
      throw new Error(falha?.title ?? "Não foi possível salvar o relatório da maquininha.");
    }
    await carregar();
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não foi possível salvar o relatório da maquininha.";
  } finally {
    salvandoRelatorioId.value = null;
  }
}

async function remover(anexo: Anexo) {
  if (!props.caixaId) return;
  removendoId.value = anexo.id;
  erro.value = "";
  try {
    const resposta = await fetch(`${apiUrl}/api/caixa/${props.caixaId}/anexos/${anexo.id}`, {
      method: "DELETE",
      credentials: "include"
    });
    if (!resposta.ok) {
      const falha = (await resposta.json().catch(() => null)) as { title?: string } | null;
      throw new Error(falha?.title ?? "Não foi possível remover o anexo.");
    }
    if (anexoAmpliado.value?.id === anexo.id) anexoAmpliado.value = null;
    limparPrevia(anexo.id);
    await carregar();
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não foi possível remover o anexo.";
  } finally {
    removendoId.value = null;
  }
}

watch(
  () => props.caixaId,
  () => void carregar(),
  { immediate: true }
);

async function enviarArquivo(arquivo: File, tipo: TipoAnexo): Promise<boolean> {
  if (!props.caixaId) return false;
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
    if (!resposta.ok) {
      const falha = (await resposta.json().catch(() => null)) as { title?: string } | null;
      throw new Error(falha?.title ?? "Nao foi possivel enviar o anexo.");
    }
    await carregar();
    if (tipo === "comprovante_cartao") {
      const novo = anexos.value.find((anexo) => anexo.tipo === "comprovante_cartao" && anexo.iaStatus === "desativada");
      if (novo) void analisarComprovante(novo);
    }
    return true;
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Nao foi possivel enviar o anexo.";
    return false;
  } finally {
    enviando.value = false;
  }
}

async function enviar(evento: Event, tipo: TipoAnexo) {
  const entrada = evento.target as HTMLInputElement;
  const arquivo = entrada.files?.[0];
  if (!arquivo) return;
  await enviarArquivo(arquivo, tipo);
  entrada.value = "";
}

function encerrarCamera() {
  transmissaoCamera?.getTracks().forEach((trilha) => trilha.stop());
  transmissaoCamera = null;
  if (videoCamera.value) videoCamera.value.srcObject = null;
  cameraAberta.value = false;
}

async function abrirCamera(tipo: TipoAnexo) {
  cameraErro.value = "";
  if (!globalThis.navigator.mediaDevices?.getUserMedia) {
    cameraErro.value = "A câmera não está disponível neste navegador. Use Anexar arquivo.";
    return;
  }

  try {
    transmissaoCamera = await globalThis.navigator.mediaDevices.getUserMedia({
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
    encerrarCamera();
    cameraErro.value = "Não foi possível acessar a câmera. Autorize o navegador ou use Anexar arquivo.";
  }
}

async function tirarFoto() {
  const video = videoCamera.value;
  if (!video || !video.videoWidth || !video.videoHeight) {
    cameraErro.value = "A câmera ainda não está pronta. Aguarde um instante e tente novamente.";
    return;
  }

  const quadro = document.createElement("canvas");
  quadro.width = video.videoWidth;
  quadro.height = video.videoHeight;
  quadro.getContext("2d")?.drawImage(video, 0, 0, quadro.width, quadro.height);
  const foto = await new Promise<Blob | null>((resolver) => quadro.toBlob(resolver, "image/jpeg", 0.9));
  if (!foto) {
    cameraErro.value = "Não foi possível registrar a foto. Tente novamente.";
    return;
  }

  const nome = tipoFoto.value === "folha_fechamento" ? "folha-fechamento" : "comprovante-cartao";
  const enviada = await enviarArquivo(
    new File([foto], `${nome}-${Date.now()}.jpg`, { type: "image/jpeg" }),
    tipoFoto.value
  );
  if (enviada) encerrarCamera();
}

watch(cameraAberta, (aberta) => {
  if (!aberta && transmissaoCamera) encerrarCamera();
});

onBeforeUnmount(() => {
  encerrarCamera();
  Object.keys(previas.value).forEach(limparPrevia);
});
</script>

<template>
  <section class="mt-4" aria-label="Anexos do fechamento">
    <div class="text-subtitle-2">Folha de fechamento <span class="text-error">(obrigatoria)</span></div>
    <div class="d-flex flex-wrap ga-2 mt-2">
      <v-btn
        variant="outlined"
        prepend-icon="mdi-camera"
        :loading="enviando"
        :disabled="!caixaId"
        @click="abrirCamera('folha_fechamento')"
      >
        Tirar foto
      </v-btn>
      <v-btn
        variant="outlined"
        prepend-icon="mdi-paperclip"
        :loading="enviando"
        :disabled="!caixaId"
        @click="folhaArquivo?.click()"
      >
        Anexar arquivo
      </v-btn>
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
          type="button"
          class="anexo-miniatura__foto"
          :disabled="!urlPrevia(anexo)"
          :aria-label="`Ver foto ${anexo.nomeOriginal}`"
          @click="anexoAmpliado = anexo"
        >
          <img v-if="urlPrevia(anexo)" :src="urlPrevia(anexo)" :alt="`Prévia de ${anexo.nomeOriginal}`" />
          <v-icon v-else icon="mdi-image-outline" />
        </button>
        <div v-else class="anexo-miniatura__arquivo"><v-icon icon="mdi-file-document-outline" /></div>
        <span class="anexo-miniatura__nome" :title="anexo.nomeOriginal">{{ anexo.nomeOriginal }}</span>
        <v-btn
          icon="mdi-close"
          size="x-small"
          variant="text"
          color="error"
          :loading="removendoId === anexo.id"
          :aria-label="`Remover ${anexo.nomeOriginal}`"
          @click="remover(anexo)"
        />
      </div>
    </div>
    <div class="text-subtitle-2 mt-4">Comprovantes de cartao <span class="text-medium-emphasis">(opcional)</span></div>
    <div class="d-flex flex-wrap ga-2 mt-2">
      <v-btn
        variant="outlined"
        prepend-icon="mdi-camera"
        :loading="enviando"
        :disabled="!caixaId"
        @click="abrirCamera('comprovante_cartao')"
      >
        Tirar foto
      </v-btn>
      <v-btn
        variant="outlined"
        prepend-icon="mdi-paperclip"
        :loading="enviando"
        :disabled="!caixaId"
        @click="cartaoArquivo?.click()"
      >
        Anexar comprovante
      </v-btn>
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
          type="button"
          class="anexo-miniatura__foto"
          :disabled="!urlPrevia(anexo)"
          :aria-label="`Ver foto ${anexo.nomeOriginal}`"
          @click="anexoAmpliado = anexo"
        >
          <img v-if="urlPrevia(anexo)" :src="urlPrevia(anexo)" :alt="`Prévia de ${anexo.nomeOriginal}`" />
          <v-icon v-else icon="mdi-image-outline" />
        </button>
        <div v-else class="anexo-miniatura__arquivo"><v-icon icon="mdi-file-document-outline" /></div>
        <span class="anexo-miniatura__nome" :title="anexo.nomeOriginal">{{ anexo.nomeOriginal }}</span>
        <v-btn
          icon="mdi-close"
          size="x-small"
          variant="text"
          color="error"
          :loading="removendoId === anexo.id"
          :aria-label="`Remover ${anexo.nomeOriginal}`"
          @click="remover(anexo)"
        />
      </div>
    </div>
    <v-expansion-panels v-if="cartoes.length" class="mt-3" variant="accordion">
      <v-expansion-panel v-for="(anexo, indice) in cartoes" :key="anexo.id">
        <v-expansion-panel-title>
          <v-icon class="mr-2" icon="mdi-credit-card-outline" />
          Relatório da maquininha {{ indice + 1 }}
          <v-chip v-if="anexo.iaStatus === 'concluida'" class="ml-3" color="success" size="x-small">Lido</v-chip>
          <v-chip v-else-if="anexo.iaStatus === 'processando'" class="ml-3" color="warning" size="x-small">Lendo</v-chip>
          <v-chip v-else-if="anexo.iaStatus === 'falhou'" class="ml-3" color="warning" size="x-small">Revisar manualmente</v-chip>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-alert v-if="anexo.iaStatus === 'falhou'" type="warning" density="compact" class="mb-3">
            {{ anexo.iaErro || 'A foto segue válida como prova; preencha ou corrija os campos manualmente.' }}
          </v-alert>
          <v-alert v-else-if="anexo.iaStatus === 'processando'" type="info" density="compact" class="mb-3">
            Lendo a foto da maquininha. Você pode aguardar ou preencher manualmente.
          </v-alert>
          <v-row v-if="relatorios[anexo.id]" dense>
            <v-col cols="12" md="5">
              <v-text-field v-model="relatorios[anexo.id]!.numeroMaquininha" label="Nº maquininha" />
            </v-col>
            <v-col cols="12" md="3">
              <v-select
                v-model="relatorios[anexo.id]!.periodo"
                :items="[
                  { title: 'Não identificado', value: 'nao_identificado' },
                  { title: 'Manhã', value: 'manha' },
                  { title: 'Tarde', value: 'tarde' },
                  { title: 'Noite', value: 'noite' }
                ]"
                label="Período"
              />
            </v-col>
            <v-col cols="12" md="4"><v-text-field v-model="relatorios[anexo.id]!.dataEmissao" label="Data/hora lida" /></v-col>
            <v-col cols="12" sm="6" md="3"><v-text-field v-model="relatorios[anexo.id]!.credito" label="Crédito" inputmode="decimal" prefix="R$" /></v-col>
            <v-col cols="12" sm="6" md="3"><v-text-field v-model="relatorios[anexo.id]!.debito" label="Débito" inputmode="decimal" prefix="R$" /></v-col>
            <v-col cols="12" sm="6" md="3"><v-text-field v-model="relatorios[anexo.id]!.pix" label="Pix" inputmode="decimal" prefix="R$" /></v-col>
            <v-col cols="12" sm="6" md="3"><v-text-field v-model="relatorios[anexo.id]!.voucher" label="Voucher" inputmode="decimal" prefix="R$" /></v-col>
            <v-col cols="12" sm="6" md="4"><v-text-field v-model="relatorios[anexo.id]!.total" label="Total" inputmode="decimal" prefix="R$" /></v-col>
            <v-col cols="12" sm="6" md="4"><v-text-field v-model="relatorios[anexo.id]!.trocaInicial" label="Troca inicial" inputmode="decimal" prefix="R$" /></v-col>
            <v-col cols="12" sm="6" md="4"><v-text-field v-model="relatorios[anexo.id]!.saldoFinalDinheiro" label="Saldo final dinheiro" inputmode="decimal" prefix="R$" /></v-col>
            <v-col cols="12" class="d-flex flex-wrap ga-2">
              <v-btn
                color="primary"
                variant="outlined"
                prepend-icon="mdi-content-save-outline"
                :loading="salvandoRelatorioId === anexo.id"
                @click="salvarRelatorio(anexo)"
              >
                Salvar dados lidos
              </v-btn>
              <v-btn
                variant="text"
                prepend-icon="mdi-refresh"
                :loading="analisandoId === anexo.id"
                @click="analisarComprovante(anexo)"
              >
                Ler foto com IA
              </v-btn>
            </v-col>
          </v-row>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
    <v-alert v-if="erro" type="error" density="compact" class="mt-2">{{ erro }}</v-alert>

    <v-dialog v-model="cameraAberta" max-width="720" persistent no-click-animation @after-leave="encerrarCamera">
      <v-card>
        <v-card-title class="d-flex align-center justify-space-between">
          Tirar foto
          <v-btn icon="mdi-close" variant="text" aria-label="Fechar câmera" @click="encerrarCamera" />
        </v-card-title>
        <v-card-text>
          <video ref="videoCamera" class="camera-preview" autoplay playsinline muted aria-label="Prévia da câmera" />
          <v-alert v-if="cameraErro" type="error" density="compact" class="mt-3">{{ cameraErro }}</v-alert>
        </v-card-text>
        <v-card-actions class="px-6 pb-5">
          <v-spacer />
          <v-btn variant="text" @click="encerrarCamera">Cancelar</v-btn>
          <v-btn color="primary" prepend-icon="mdi-camera" :loading="enviando" @click="tirarFoto">Usar foto</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="dialogAnexoAmpliado" max-width="960" persistent no-click-animation>
      <v-card v-if="anexoAmpliado">
        <v-card-title class="d-flex align-center justify-space-between">
          Visualizar foto
          <v-btn icon="mdi-close" variant="text" aria-label="Fechar visualização" @click="anexoAmpliado = null" />
        </v-card-title>
        <v-card-text>
          <img
            v-if="urlPrevia(anexoAmpliado)"
            class="anexo-ampliado"
            :src="urlPrevia(anexoAmpliado)"
            :alt="`Foto completa de ${anexoAmpliado.nomeOriginal}`"
          />
        </v-card-text>
      </v-card>
    </v-dialog>
  </section>
</template>

<style scoped>
.camera-preview {
  display: block;
  width: 100%;
  max-height: min(64vh, 520px);
  background: rgb(var(--v-theme-surface-variant));
  border-radius: 8px;
  object-fit: contain;
}

.anexos-enviados {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.anexo-miniatura {
  display: grid;
  grid-template-columns: 88px minmax(0, 120px) auto;
  align-items: center;
  gap: 6px;
  max-width: 250px;
  padding: 6px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.2);
  border-radius: 8px;
}

.anexo-miniatura__foto,
.anexo-miniatura__arquivo {
  display: grid;
  width: 88px;
  height: 64px;
  place-items: center;
  overflow: hidden;
  border: 0;
  border-radius: 5px;
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.anexo-miniatura__foto {
  cursor: zoom-in;
}

.anexo-miniatura__foto:disabled {
  cursor: wait;
}

.anexo-miniatura__foto img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.anexo-miniatura__nome {
  overflow: hidden;
  font-size: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.anexo-ampliado {
  display: block;
  width: 100%;
  max-height: 75vh;
  object-fit: contain;
}
</style>
