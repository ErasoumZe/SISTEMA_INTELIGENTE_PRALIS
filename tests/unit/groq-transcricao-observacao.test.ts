import { describe, expect, it, vi } from "vitest";
import { transcreverObservacaoComGroq } from "../../api/src/caixa/groq-transcricao-observacao.js";

const config = { chave: "gsk_teste", modelo: "whisper-large-v3-turbo" as const, timeoutMs: 5_000 };

function textoDoFormData(valor: FormDataEntryValue | null) {
  return typeof valor === "string" ? valor : "";
}

describe("transcrição de observação de fechamento pela Groq", () => {
  it("envia áudio, idioma e chave somente para o endpoint da Groq", async () => {
    let autorizacao = "";
    let modelo = "";
    let idioma = "";
    let arquivo: FormDataEntryValue | null = null;
    const fetchMock = vi.fn(async (url: string | URL | Request, opcoes?: RequestInit) => {
      const urlTexto = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      expect(urlTexto).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
      autorizacao = String((opcoes?.headers as Record<string, string> | undefined)?.["Authorization"] ?? "");
      if (!(opcoes?.body instanceof FormData)) throw new Error("corpo não é FormData");
      modelo = textoDoFormData(opcoes.body.get("model"));
      idioma = textoDoFormData(opcoes.body.get("language"));
      arquivo = opcoes.body.get("file");
      return new Response(JSON.stringify({ text: "Lacre 123 conferido sem divergência." }), { status: 200 });
    });

    const texto = await transcreverObservacaoComGroq(Buffer.from("audio de teste"), "audio/webm", config, fetchMock);

    expect(texto).toBe("Lacre 123 conferido sem divergência.");
    expect(autorizacao).toBe("Bearer gsk_teste");
    expect(modelo).toBe("whisper-large-v3-turbo");
    expect(idioma).toBe("pt");
    expect(arquivo).toBeInstanceOf(Blob);
  });

  it("não expõe a falha da chave e orienta a revisão da configuração", async () => {
    const fetchMock = vi.fn(async () => new Response("não autorizado", { status: 401 }));

    await expect(
      transcreverObservacaoComGroq(Buffer.from("audio"), "audio/mp4", config, fetchMock)
    ).rejects.toMatchObject({
      code: "TRANSCRICAO_NAO_CONFIGURADA",
      status: 503
    });
  });
});
