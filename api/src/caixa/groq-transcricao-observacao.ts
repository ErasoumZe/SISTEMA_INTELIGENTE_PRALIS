import { ErroDominio } from "../erros.js";

export type ConfigGroqTranscricao = {
  chave: string;
  modelo: "whisper-large-v3" | "whisper-large-v3-turbo";
  timeoutMs: number;
};

type RespostaGroq = { text?: string };

function falha(mensagem: string, status = 503, codigo = "TRANSCRICAO_INDISPONIVEL"): never {
  throw new ErroDominio(mensagem, status, codigo);
}

function nomeDoAudio(mimeType: string) {
  if (mimeType === "audio/mp4") return "observacao.m4a";
  if (mimeType === "audio/ogg") return "observacao.ogg";
  if (mimeType === "audio/wav") return "observacao.wav";
  if (mimeType === "audio/mpeg") return "observacao.mp3";
  return "observacao.webm";
}

export async function transcreverObservacaoComGroq(
  audio: Buffer,
  mimeType: string,
  config: ConfigGroqTranscricao,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const corpo = new FormData();
    corpo.set("model", config.modelo);
    corpo.set("language", "pt");
    corpo.set("temperature", "0");
    corpo.set(
      "prompt",
      "Transcreva uma observação curta de fechamento de caixa em português brasileiro. Preserve valores, lacres e nomes quando forem falados."
    );
    corpo.set("file", new Blob([Uint8Array.from(audio)], { type: mimeType }), nomeDoAudio(mimeType));

    const resposta = await fetchImpl("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.chave}` },
      body: corpo,
      signal: controller.signal
    });
    if (!resposta.ok) {
      if (resposta.status === 401 || resposta.status === 403) {
        return falha("A chave da transcrição por voz precisa ser revisada.", 503, "TRANSCRICAO_NAO_CONFIGURADA");
      }
      if (resposta.status === 429) {
        return falha("A transcrição está ocupada. Aguarde um instante e tente de novo.", 503, "TRANSCRICAO_OCUPADA");
      }
      return falha("A transcrição por voz está indisponível. Tente novamente.");
    }
    const dados = (await resposta.json()) as RespostaGroq;
    const texto = typeof dados.text === "string" ? dados.text.trim() : "";
    if (!texto) return falha("Não foi possível identificar fala neste áudio.", 422, "TRANSCRICAO_SEM_TEXTO");
    if (texto.length > 500) {
      return falha(
        "A transcrição ficou longa demais para a observação do fechamento. Grave uma mensagem mais curta.",
        422
      );
    }
    return texto;
  } catch (erro) {
    if (erro instanceof ErroDominio) throw erro;
    if (erro instanceof Error && erro.name === "AbortError") {
      return falha("A transcrição demorou demais. Tente uma gravação mais curta.", 504, "TRANSCRICAO_TIMEOUT");
    }
    return falha("Sem conexão com a transcrição por voz. Tente novamente.");
  } finally {
    clearTimeout(timeout);
  }
}
