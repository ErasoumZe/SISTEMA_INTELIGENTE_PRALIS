import { computed, onBeforeUnmount, ref } from "vue";

interface RecognitionAlternative {
  transcript: string;
}

interface RecognitionResult {
  isFinal: boolean;
  [index: number]: RecognitionAlternative;
}

interface RecognitionResultList {
  length: number;
  [index: number]: RecognitionResult;
}

interface RecognitionEvent extends Event {
  resultIndex: number;
  results: RecognitionResultList;
}

interface RecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onend: (() => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

type AudioWindow = Window & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

export function useTranscricaoVoz() {
  const ouvindo = ref(false);
  const erro = ref("");
  const parcial = ref("");
  const finais = ref("");
  const nivelVoz = ref(0);
  const reconhecimentoDisponivel = ref(false);

  let reconhecimento: SpeechRecognitionLike | null = null;
  let stream: MediaStream | null = null;
  let contextoAudio: AudioContext | null = null;
  let analisador: AnalyserNode | null = null;
  let quadroAudio: number | null = null;
  let reiniciarAoTerminar = false;

  const textoReconhecido = computed(() => `${finais.value}${parcial.value}`.trim());
  const textoEditavel = computed({
    get: () => textoReconhecido.value,
    set: (value: string) => {
      finais.value = value;
      parcial.value = "";
    }
  });
  const temTexto = computed(() => textoReconhecido.value.trim().length > 0);
  const logoGlow = computed(() => (ouvindo.value ? 0.5 + nivelVoz.value * 0.9 : 0.3));
  const logoSpeed = computed(() => (ouvindo.value ? 1.1 + nivelVoz.value * 1.6 : 0.55));

  function obterReconhecimento(): SpeechRecognitionConstructor | null {
    if (typeof window === "undefined") return null;
    const navegador = window as SpeechWindow;
    return navegador.SpeechRecognition ?? navegador.webkitSpeechRecognition ?? null;
  }

  function limparAudio() {
    if (quadroAudio !== null) cancelAnimationFrame(quadroAudio);
    quadroAudio = null;
    analisador = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    if (contextoAudio) void contextoAudio.close();
    contextoAudio = null;
    nivelVoz.value = 0;
  }

  function medirVoz() {
    if (!analisador || !ouvindo.value) {
      nivelVoz.value = 0;
      return;
    }
    const dados = new Uint8Array(analisador.fftSize);
    analisador.getByteTimeDomainData(dados);
    let soma = 0;
    for (const amostra of dados) {
      const distancia = (amostra - 128) / 128;
      soma += distancia * distancia;
    }
    const rms = Math.sqrt(soma / dados.length);
    nivelVoz.value = Math.min(1, rms * 5.5);
    quadroAudio = requestAnimationFrame(medirVoz);
  }

  async function prepararMedidor() {
    if (!navigator.mediaDevices?.getUserMedia) return;
    const audioWindow = window as AudioWindow;
    const AudioContextConstructor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextConstructor) return;
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    contextoAudio = new AudioContextConstructor();
    const origem = contextoAudio.createMediaStreamSource(stream);
    analisador = contextoAudio.createAnalyser();
    analisador.fftSize = 256;
    origem.connect(analisador);
    await contextoAudio.resume();
    medirVoz();
  }

  function configurarReconhecimento() {
    const Constructor = obterReconhecimento();
    if (!Constructor) {
      reconhecimentoDisponivel.value = false;
      throw new Error("Este navegador não oferece transcrição de voz. A integração com a Groq será adicionada depois.");
    }
    reconhecimentoDisponivel.value = true;
    reconhecimento = new Constructor();
    reconhecimento.continuous = true;
    reconhecimento.interimResults = true;
    reconhecimento.lang = "pt-BR";
    reconhecimento.maxAlternatives = 1;
    reconhecimento.onresult = (event) => {
      let finaisNovos = "";
      let parcialNovo = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const resultado = event.results[index];
        if (!resultado) continue;
        const transcricao = resultado[0]?.transcript ?? "";
        if (resultado.isFinal) finaisNovos += `${transcricao.trim()} `;
        else parcialNovo += transcricao;
      }
      finais.value = `${finais.value}${finaisNovos}`;
      parcial.value = parcialNovo;
    };
    reconhecimento.onerror = (event) => {
      if (event.error === "aborted") return;
      erro.value =
        event.error === "not-allowed"
          ? "Permita o acesso ao microfone para transcrever."
          : "Não foi possível transcrever o áudio.";
      ouvindo.value = false;
      reiniciarAoTerminar = false;
      limparAudio();
    };
    reconhecimento.onend = () => {
      if (reiniciarAoTerminar && ouvindo.value) {
        try {
          reconhecimento?.start();
          return;
        } catch {
          // Alguns navegadores encerram a sessão entre duas frases; o texto já recebido permanece.
        }
      }
      ouvindo.value = false;
      limparAudio();
    };
  }

  function preparar(textoAtual: string) {
    erro.value = "";
    finais.value = textoAtual.trim() ? `${textoAtual.trim()} ` : "";
    parcial.value = "";
    reconhecimentoDisponivel.value = Boolean(obterReconhecimento());
  }

  async function iniciar() {
    erro.value = "";
    try {
      if (!reconhecimento) configurarReconhecimento();
      try {
        await prepararMedidor();
      } catch {
        // A transcrição continua mesmo se o medidor visual não puder acessar o microfone.
        limparAudio();
      }
      reiniciarAoTerminar = true;
      ouvindo.value = true;
      reconhecimento?.start();
    } catch (falha) {
      ouvindo.value = false;
      reiniciarAoTerminar = false;
      limparAudio();
      erro.value = falha instanceof Error ? falha.message : "Não foi possível acessar o microfone.";
    }
  }

  function pararReconhecimentoSeguro() {
    try {
      reconhecimento?.stop();
    } catch {
      // O reconhecimento pode já ter sido encerrado pelo navegador.
    }
  }

  function parar() {
    reiniciarAoTerminar = false;
    ouvindo.value = false;
    pararReconhecimentoSeguro();
    limparAudio();
  }

  onBeforeUnmount(() => {
    reiniciarAoTerminar = false;
    pararReconhecimentoSeguro();
    limparAudio();
  });

  return {
    erro,
    logoGlow,
    logoSpeed,
    nivelVoz,
    ouvindo,
    preparar,
    reconhecimentoDisponivel,
    iniciar,
    parar,
    temTexto,
    textoEditavel,
    textoReconhecido
  };
}
