import { computed, onBeforeUnmount, ref } from "vue";
import { useApi } from "~/composables/useApi";

type EstadoGravacao = "parado" | "gravando" | "transcrevendo";
type RespostaTranscricao = {
  data?: { texto?: string };
  erro?: string;
  title?: string;
};

const duracaoMaximaMs = 90_000;
const formatosPreferidos = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];

function mensagemErroApi(payload: RespostaTranscricao | undefined) {
  if (payload?.title) return payload.title;
  if (payload?.erro) return payload.erro;
  return "Não foi possível transcrever o áudio.";
}

function formatoGravacaoPreferido() {
  return formatosPreferidos.find((formato) => MediaRecorder.isTypeSupported(formato));
}

function extensaoDoAudio(tipo: string) {
  if (tipo === "audio/mp4") return "m4a";
  if (tipo === "audio/ogg") return "ogg";
  return "webm";
}

export function useTranscricaoVoz() {
  const { apiUrl } = useApi();
  const estado = ref<EstadoGravacao>("parado");
  const erro = ref("");
  const finais = ref("");
  const nivelVoz = ref(0);
  const gravacaoDisponivel = ref(false);

  let gravador: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let analisador: AnalyserNode | null = null;
  let contextoAudio: AudioContext | null = null;
  let quadroAudio: number | null = null;
  let temporizadorLimite: number | null = null;
  let requisicao: AbortController | null = null;
  let partes: BlobPart[] = [];
  let mimeType = "audio/webm";

  const ouvindo = computed(() => estado.value === "gravando");
  const transcrevendo = computed(() => estado.value === "transcrevendo");
  const textoReconhecido = computed(() => finais.value.trim());
  const textoEditavel = computed({
    get: () => textoReconhecido.value,
    set: (value: string) => {
      finais.value = value;
    }
  });
  const temTexto = computed(() => textoReconhecido.value.length > 0);
  const logoGlow = computed(() => (ouvindo.value ? 0.56 + nivelVoz.value * 0.84 : transcrevendo.value ? 0.58 : 0.3));
  const logoSpeed = computed(() => (ouvindo.value ? 1.12 + nivelVoz.value * 1.55 : transcrevendo.value ? 1.1 : 0.55));

  function limparTemporizador() {
    if (temporizadorLimite !== null) window.clearTimeout(temporizadorLimite);
    temporizadorLimite = null;
  }

  function limparMedidor() {
    if (quadroAudio !== null) cancelAnimationFrame(quadroAudio);
    quadroAudio = null;
    analisador = null;
    if (contextoAudio) void contextoAudio.close();
    contextoAudio = null;
    nivelVoz.value = 0;
  }

  function encerrarStream() {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  function medirVoz() {
    if (!analisador || !ouvindo.value) return;
    const dados = new Uint8Array(analisador.fftSize);
    analisador.getByteTimeDomainData(dados);
    let soma = 0;
    for (const amostra of dados) {
      const distancia = (amostra - 128) / 128;
      soma += distancia * distancia;
    }
    nivelVoz.value = Math.min(1, Math.sqrt(soma / dados.length) * 5.5);
    quadroAudio = requestAnimationFrame(medirVoz);
  }

  async function prepararMedidor() {
    if (!stream || !window.AudioContext) {
      nivelVoz.value = 0.18;
      return;
    }
    try {
      contextoAudio = new AudioContext();
      const origem = contextoAudio.createMediaStreamSource(stream);
      analisador = contextoAudio.createAnalyser();
      analisador.fftSize = 256;
      origem.connect(analisador);
      await contextoAudio.resume();
      medirVoz();
    } catch {
      nivelVoz.value = 0.18;
    }
  }

  async function enviarAudio(audio: Blob) {
    const corpo = new FormData();
    corpo.append("audio", audio, `observacao-${Date.now()}.${extensaoDoAudio(mimeType)}`);
    requisicao = new AbortController();
    const resposta = await fetch(`${apiUrl}/api/caixa/transcricao-observacao`, {
      method: "POST",
      credentials: "include",
      body: corpo,
      signal: requisicao.signal
    });
    const payload = (await resposta.json().catch(() => undefined)) as RespostaTranscricao | undefined;
    if (!resposta.ok) throw new Error(mensagemErroApi(payload));
    const texto = payload?.data?.texto;
    if (typeof texto !== "string" || !texto.trim()) throw new Error("A transcrição não retornou texto.");
    return texto.trim();
  }

  async function finalizarGravacao() {
    limparTemporizador();
    limparMedidor();
    encerrarStream();
    const audio = new Blob(partes, { type: mimeType });
    partes = [];
    gravador = null;
    if (audio.size < 500) {
      estado.value = "parado";
      erro.value = "Não identificamos fala. Grave novamente e fale um pouco mais perto do microfone.";
      return;
    }
    estado.value = "transcrevendo";
    try {
      const texto = await enviarAudio(audio);
      finais.value = `${finais.value.trim()} ${texto}`.trim();
      erro.value = "";
    } catch (falha) {
      if (falha instanceof DOMException && falha.name === "AbortError") return;
      erro.value = falha instanceof Error ? falha.message : "Não foi possível transcrever o áudio.";
    } finally {
      requisicao = null;
      estado.value = "parado";
    }
  }

  function interromperAoOcultar() {
    if (document.visibilityState === "hidden" && ouvindo.value) {
      erro.value = "A gravação foi finalizada ao trocar de aplicativo. Aguarde a transcrição.";
      parar();
    }
  }

  function preparar(textoAtual: string) {
    cancelar();
    erro.value = "";
    finais.value = textoAtual.trim();
    gravacaoDisponivel.value =
      typeof window !== "undefined" && Boolean(navigator.mediaDevices) && typeof MediaRecorder !== "undefined";
  }

  async function iniciar() {
    if (!gravacaoDisponivel.value || estado.value !== "parado") return;
    erro.value = "";
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      const formato = formatoGravacaoPreferido();
      gravador = formato ? new MediaRecorder(stream, { mimeType: formato }) : new MediaRecorder(stream);
      mimeType = gravador.mimeType || formato || "audio/webm";
      partes = [];
      gravador.ondataavailable = (evento) => {
        if (evento.data.size > 0) partes.push(evento.data);
      };
      gravador.onerror = () => {
        erro.value = "O navegador interrompeu a gravação. Tente novamente.";
        const gravadorComErro = gravador;
        if (gravadorComErro) gravadorComErro.onstop = null;
        if (gravadorComErro?.state === "recording" || gravadorComErro?.state === "paused") gravadorComErro.stop();
        gravador = null;
        partes = [];
        limparTemporizador();
        limparMedidor();
        encerrarStream();
        estado.value = "parado";
      };
      gravador.onstop = () => void finalizarGravacao();
      estado.value = "gravando";
      await prepararMedidor();
      document.addEventListener("visibilitychange", interromperAoOcultar);
      temporizadorLimite = window.setTimeout(() => {
        erro.value = "A gravação atingiu 1 minuto e 30 segundos e será transcrita agora.";
        parar();
      }, duracaoMaximaMs);
      gravador.start(250);
    } catch (falha) {
      limparMedidor();
      encerrarStream();
      estado.value = "parado";
      erro.value =
        falha instanceof DOMException && falha.name === "NotAllowedError"
          ? "Permita o microfone para gravar a observação."
          : "Não foi possível iniciar a gravação. Feche outros aplicativos que usam o microfone e tente novamente.";
    }
  }

  function parar() {
    limparTemporizador();
    document.removeEventListener("visibilitychange", interromperAoOcultar);
    if (!gravador || gravador.state === "inactive") {
      limparMedidor();
      encerrarStream();
      estado.value = "parado";
      return;
    }
    gravador.stop();
  }

  function cancelar() {
    requisicao?.abort();
    requisicao = null;
    document.removeEventListener("visibilitychange", interromperAoOcultar);
    limparTemporizador();
    if (gravador) {
      gravador.onstop = null;
      if (gravador.state !== "inactive") gravador.stop();
    }
    gravador = null;
    partes = [];
    limparMedidor();
    encerrarStream();
    estado.value = "parado";
  }

  onBeforeUnmount(() => cancelar());

  return {
    cancelar,
    erro,
    gravacaoDisponivel,
    iniciar,
    logoGlow,
    logoSpeed,
    nivelVoz,
    ouvindo,
    parar,
    preparar,
    temTexto,
    textoEditavel,
    textoReconhecido,
    transcrevendo
  };
}
