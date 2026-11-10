import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../api/src/env.js";
import {
  enviarWhatsapp,
  erroDaEvolution,
  provedorConfigurado,
  urlEnvioEvolution
} from "../../api/src/whatsapp/whatsapp-provedor.js";

// R-235: o WhatsApp de Compras sai pela Evolution API v2 (POST /message/sendText/{instancia}, cabecalho apikey).
describe("provedor Evolution do WhatsApp", () => {
  const anterior = {
    provedor: env.WHATSAPP_PROVEDOR,
    url: env.WHATSAPP_EVOLUTION_URL,
    chave: env.WHATSAPP_EVOLUTION_API_KEY,
    instancia: env.WHATSAPP_EVOLUTION_INSTANCIA
  };
  const mensagem = {
    telefone: "5531999998888",
    tipo: "convite" as const,
    texto: "Olá!\n\nResponda até 10/11: https://x/rodada#t=abc"
  };

  beforeEach(() => {
    env.WHATSAPP_PROVEDOR = "evolution";
    env.WHATSAPP_EVOLUTION_URL = "https://evolution.exemplo.com.br/";
    env.WHATSAPP_EVOLUTION_API_KEY = "chave-ficticia";
    env.WHATSAPP_EVOLUTION_INSTANCIA = "padaria tnp";
  });

  afterEach(() => {
    env.WHATSAPP_PROVEDOR = anterior.provedor;
    env.WHATSAPP_EVOLUTION_URL = anterior.url;
    env.WHATSAPP_EVOLUTION_API_KEY = anterior.chave;
    env.WHATSAPP_EVOLUTION_INSTANCIA = anterior.instancia;
    vi.unstubAllGlobals();
  });

  it("so fica conectado com URL, chave e instancia", () => {
    expect(provedorConfigurado()).toBe(true);
    for (const campo of [
      "WHATSAPP_EVOLUTION_URL",
      "WHATSAPP_EVOLUTION_API_KEY",
      "WHATSAPP_EVOLUTION_INSTANCIA"
    ] as const) {
      const valor = env[campo];
      env[campo] = undefined;
      expect(provedorConfigurado(), campo).toBe(false);
      env[campo] = valor;
    }
  });

  it("monta a rota sem barra dupla e com a instancia codificada", () => {
    expect(urlEnvioEvolution("https://evo.com.br/", "padaria tnp")).toBe(
      "https://evo.com.br/message/sendText/padaria%20tnp"
    );
    expect(urlEnvioEvolution("https://evo.com.br", "tnp")).toBe("https://evo.com.br/message/sendText/tnp");
  });

  it("manda o texto pronto com apikey e devolve o id da mensagem", async () => {
    const chamada = vi.fn(
      async () => new Response(JSON.stringify({ key: { id: "3EB0XYZ" }, status: "PENDING" }), { status: 201 })
    );
    vi.stubGlobal("fetch", chamada);
    await expect(enviarWhatsapp(mensagem)).resolves.toEqual({ ok: true, idExterno: "3EB0XYZ" });
    const [url, opcoes] = chamada.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://evolution.exemplo.com.br/message/sendText/padaria%20tnp");
    expect((opcoes.headers as Record<string, string>)["apikey"]).toBe("chave-ficticia");
    expect(JSON.parse(opcoes.body as string)).toEqual({ number: "5531999998888", text: mensagem.texto });
  });

  it("numero sem WhatsApp vira motivo legivel, sem o telefone", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              status: 400,
              error: "Bad Request",
              response: { message: [{ exists: false, jid: "5531999998888@s.whatsapp.net", number: "5531999998888" }] }
            }),
            { status: 400 }
          )
      )
    );
    const resultado = await enviarWhatsapp(mensagem);
    expect(resultado).toEqual({ ok: false, erro: "Número sem WhatsApp" });
  });

  it("erro de rede vira falha registravel, sem derrubar a fila", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("fetch failed");
      })
    );
    await expect(enviarWhatsapp(mensagem)).resolves.toEqual({ ok: false, erro: "fetch failed" });
  });

  it("le as mensagens de erro da Evolution e cai no HTTP quando nao ha texto", () => {
    expect(erroDaEvolution(401, { response: { message: ["Unauthorized"] } })).toBe("Evolution: Unauthorized");
    expect(erroDaEvolution(404, { message: "Instance not found" })).toBe("Evolution: Instance not found");
    expect(erroDaEvolution(500, null)).toBe("Evolution respondeu HTTP 500");
  });
});
