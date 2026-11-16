import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../api/src/env.js";
import {
  esquecerEstadoWhatsapp,
  estadoConexaoWhatsapp,
  estadoDetalhadoWhatsapp,
  urlEstadoEvolution,
  whatsappSegurandoFila
} from "../../api/src/whatsapp/whatsapp-provedor.js";

// 13/11/2026: a instancia da Evolution caiu ("Connection Closed") e a cotacao gastou as 5 tentativas sem ninguem
// saber. O estado da conexao alimenta o aviso das telas de Compras e segura a fila enquanto estiver desconectado.
describe("estado da conexao do WhatsApp (Evolution)", () => {
  const anterior = {
    provedor: env.WHATSAPP_PROVEDOR,
    url: env.WHATSAPP_EVOLUTION_URL,
    chave: env.WHATSAPP_EVOLUTION_API_KEY,
    instancia: env.WHATSAPP_EVOLUTION_INSTANCIA
  };

  beforeEach(() => {
    env.WHATSAPP_PROVEDOR = "evolution";
    env.WHATSAPP_EVOLUTION_URL = "https://evolution.exemplo.com.br/";
    env.WHATSAPP_EVOLUTION_API_KEY = "chave-ficticia";
    env.WHATSAPP_EVOLUTION_INSTANCIA = "compras tnp";
    esquecerEstadoWhatsapp();
  });

  afterEach(() => {
    env.WHATSAPP_PROVEDOR = anterior.provedor;
    env.WHATSAPP_EVOLUTION_URL = anterior.url;
    env.WHATSAPP_EVOLUTION_API_KEY = anterior.chave;
    env.WHATSAPP_EVOLUTION_INSTANCIA = anterior.instancia;
    esquecerEstadoWhatsapp();
    vi.unstubAllGlobals();
  });

  const responder = (estado: string, status = 200) =>
    vi.fn(
      async () => new Response(JSON.stringify({ instance: { instanceName: "compras tnp", state: estado } }), { status })
    );

  it("pergunta a rota de estado da instancia com a apikey", async () => {
    const chamada = responder("open");
    vi.stubGlobal("fetch", chamada);
    await expect(estadoConexaoWhatsapp()).resolves.toBe("conectado");
    const [url, opcoes] = chamada.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(urlEstadoEvolution("https://evolution.exemplo.com.br/", "compras tnp"));
    expect(url).toBe("https://evolution.exemplo.com.br/instance/connectionState/compras%20tnp");
    expect((opcoes.headers as Record<string, string>)["apikey"]).toBe("chave-ficticia");
  });

  it("so a instancia fechada conta como desconectado, com o estado no detalhe", async () => {
    vi.stubGlobal("fetch", responder("close"));
    await expect(estadoDetalhadoWhatsapp()).resolves.toEqual({
      estado: "desconectado",
      detalhe: "Estado na Evolution: close"
    });
    expect(whatsappSegurandoFila("desconectado")).toBe(true);
  });

  // 16/11/2026: com o painel em Connected, a consulta respondia "connecting" e o aviso aparecia; as mensagens saiam
  // atrasadas porque a fila esperava. "connecting" nao e queda: nao segura a fila nem mostra aviso.
  it("instancia conectando fica indefinida e nao segura a fila", async () => {
    vi.stubGlobal("fetch", responder("connecting"));
    await expect(estadoDetalhadoWhatsapp()).resolves.toEqual({
      estado: "indefinido",
      detalhe: "Estado na Evolution: connecting"
    });
    expect(whatsappSegurandoFila("indefinido")).toBe(false);
  });

  // 16/11/2026: o aviso apareceu com a instância Connected. Consulta que falha não prova queda: não segura a fila
  // nem acusa desconexão, mas devolve o motivo para o diagnóstico.
  it("consulta que falha fica indefinida e nao segura a fila", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("fetch failed");
      })
    );
    await expect(estadoDetalhadoWhatsapp()).resolves.toEqual({
      estado: "indefinido",
      detalhe: "Sem resposta da Evolution"
    });
    esquecerEstadoWhatsapp();
    vi.stubGlobal("fetch", responder("open", 401));
    await expect(estadoDetalhadoWhatsapp()).resolves.toEqual({
      estado: "indefinido",
      detalhe: "Evolution respondeu HTTP 401"
    });
    esquecerEstadoWhatsapp();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    );
    await expect(estadoConexaoWhatsapp()).resolves.toBe("indefinido");
    expect(whatsappSegurandoFila("indefinido")).toBe(false);
  });

  it("guarda o estado por 30s e pergunta de novo depois", async () => {
    const chamada = responder("open");
    vi.stubGlobal("fetch", chamada);
    await estadoConexaoWhatsapp(1_000);
    await estadoConexaoWhatsapp(20_000);
    expect(chamada).toHaveBeenCalledTimes(1);
    await estadoConexaoWhatsapp(31_001);
    expect(chamada).toHaveBeenCalledTimes(2);
  });

  it("sem provedor configurado fica desligado, sem chamar a rede", async () => {
    const chamada = responder("open");
    vi.stubGlobal("fetch", chamada);
    env.WHATSAPP_EVOLUTION_INSTANCIA = undefined;
    await expect(estadoConexaoWhatsapp()).resolves.toBe("desligado");
    env.WHATSAPP_PROVEDOR = "desligado";
    await expect(estadoConexaoWhatsapp()).resolves.toBe("desligado");
    expect(chamada).not.toHaveBeenCalled();
  });

  it("falha de envio pela Evolution faz o proximo tick perguntar o estado de novo", async () => {
    const { enviarWhatsapp } = await import("../../api/src/whatsapp/whatsapp-provedor.js");
    const chamada = vi.fn(async (url: string) =>
      url.includes("/instance/connectionState/")
        ? new Response(JSON.stringify({ instance: { state: "open" } }), { status: 200 })
        : new Response(JSON.stringify({ response: { message: ["Error: Connection Closed"] } }), { status: 400 })
    );
    vi.stubGlobal("fetch", chamada);
    await estadoConexaoWhatsapp(1_000);
    await enviarWhatsapp({ telefone: "5532999998888", tipo: "convite", texto: "Olá" });
    await estadoConexaoWhatsapp(2_000);
    expect(chamada.mock.calls.filter(([url]) => String(url).includes("connectionState"))).toHaveLength(2);
  });
});
