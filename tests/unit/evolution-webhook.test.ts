import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../api/src/env.js";
import {
  ROTA_WEBHOOK_EVOLUTION,
  registrarRotasWebhookEvolution
} from "../../api/src/whatsapp/evolution-webhook.controller.js";

// R-235: o callback de status da Evolution so registra id e status, autenticado por Bearer em tempo constante.
describe("callback de status da Evolution", () => {
  const linhasDeLog: string[] = [];
  const app = Fastify({
    logger: { level: "info", stream: { write: (linha: string) => void linhasDeLog.push(linha) } }
  });
  const segredoAnterior = env.WHATSAPP_EVOLUTION_WEBHOOK_SEGREDO;
  const autorizado = { authorization: "Bearer segredo-de-teste-evolution" };
  const atualizacao = {
    event: "messages.update",
    instance: "padaria",
    apikey: "chave-da-instancia-que-nao-pode-ir-ao-log",
    data: { keyId: "3EB0ABC123", remoteJid: "5511999990000@s.whatsapp.net", fromMe: true, status: "DELIVERY_ACK" }
  };

  beforeAll(async () => {
    env.WHATSAPP_EVOLUTION_WEBHOOK_SEGREDO = "segredo-de-teste-evolution";
    await registrarRotasWebhookEvolution(app);
    await app.ready();
  });

  afterAll(async () => {
    env.WHATSAPP_EVOLUTION_WEBHOOK_SEGREDO = segredoAnterior;
    await app.close();
  });

  it("sem segredo configurado a rota fica indisponivel", async () => {
    env.WHATSAPP_EVOLUTION_WEBHOOK_SEGREDO = undefined;
    try {
      const resposta = await app.inject({
        method: "POST",
        url: ROTA_WEBHOOK_EVOLUTION,
        headers: autorizado,
        payload: atualizacao
      });
      expect(resposta.statusCode).toBe(503);
    } finally {
      env.WHATSAPP_EVOLUTION_WEBHOOK_SEGREDO = "segredo-de-teste-evolution";
    }
  });

  it("recusa sem cabecalho, com segredo errado e sem o prefixo Bearer", async () => {
    for (const headers of [
      {},
      { authorization: "Bearer outro-segredo" },
      { authorization: "segredo-de-teste-evolution" }
    ]) {
      const resposta = await app.inject({ method: "POST", url: ROTA_WEBHOOK_EVOLUTION, headers, payload: atualizacao });
      expect(resposta.statusCode).toBe(403);
    }
  });

  it("aceita a atualizacao e registra so id e status, sem telefone nem chave", async () => {
    linhasDeLog.length = 0;
    const resposta = await app.inject({
      method: "POST",
      url: ROTA_WEBHOOK_EVOLUTION,
      headers: autorizado,
      payload: atualizacao
    });
    expect(resposta.statusCode).toBe(200);
    const log = linhasDeLog.join("\n");
    expect(log).toContain("3EB0ABC123");
    expect(log).toContain("DELIVERY_ACK");
    expect(log).not.toContain("5511999990000");
    expect(log).not.toContain("chave-da-instancia");
  });

  it("entende o formato antigo (lista com key.id e update.status) e o nome MESSAGES_UPDATE", async () => {
    linhasDeLog.length = 0;
    const resposta = await app.inject({
      method: "POST",
      url: ROTA_WEBHOOK_EVOLUTION,
      headers: autorizado,
      payload: {
        event: "MESSAGES_UPDATE",
        data: [{ key: { id: "ID-ANTIGO", remoteJid: "5511988887777@s.whatsapp.net" }, update: { status: 3 } }]
      }
    });
    expect(resposta.statusCode).toBe(200);
    const log = linhasDeLog.join("\n");
    expect(log).toContain("ID-ANTIGO");
    expect(log).not.toContain("5511988887777");
  });

  it("outros eventos sao aceitos e ignorados, sem log de status", async () => {
    linhasDeLog.length = 0;
    const resposta = await app.inject({
      method: "POST",
      url: ROTA_WEBHOOK_EVOLUTION,
      headers: autorizado,
      payload: { event: "messages.upsert", data: { key: { id: "X" }, message: { conversation: "oi" } } }
    });
    expect(resposta.statusCode).toBe(200);
    expect(linhasDeLog.join("\n")).not.toContain("whatsapp evolution status");
  });

  // 16/11/2026: a instancia cai com frequencia; o log guarda estado e motivo da queda, nunca o numero.
  it("CONNECTION_UPDATE registra estado e motivo, sem numero nem chave", async () => {
    linhasDeLog.length = 0;
    const resposta = await app.inject({
      method: "POST",
      url: ROTA_WEBHOOK_EVOLUTION,
      headers: autorizado,
      payload: {
        event: "CONNECTION_UPDATE",
        instance: "padaria",
        apikey: "chave-da-instancia-que-nao-pode-ir-ao-log",
        data: { instance: "padaria", wuid: "5511999990000@s.whatsapp.net", state: "close", statusReason: 401 }
      }
    });
    expect(resposta.statusCode).toBe(200);
    const log = linhasDeLog.join("\n");
    expect(log).toContain("whatsapp evolution conexao");
    expect(log).toContain('"estado":"close"');
    expect(log).toContain('"motivo":401');
    expect(log).not.toContain("5511999990000");
    expect(log).not.toContain("chave-da-instancia");
  });

  it("corpo fora do formato responde 400", async () => {
    const resposta = await app.inject({
      method: "POST",
      url: ROTA_WEBHOOK_EVOLUTION,
      headers: autorizado,
      payload: { event: 123 }
    });
    expect(resposta.statusCode).toBe(400);
  });
});
