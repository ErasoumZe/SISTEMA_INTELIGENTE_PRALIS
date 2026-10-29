import { createHmac } from "node:crypto";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../api/src/env.js";
import { registrarRotasWebhookMeta } from "../../api/src/whatsapp/meta-webhook.controller.js";

describe("callback de status da Meta", () => {
  const app = Fastify();
  const tokenAnterior = env.WHATSAPP_META_WEBHOOK_VERIFY_TOKEN;
  const segredoAnterior = env.WHATSAPP_META_APP_SECRET;

  beforeAll(async () => {
    env.WHATSAPP_META_WEBHOOK_VERIFY_TOKEN = "token-teste";
    env.WHATSAPP_META_APP_SECRET = "segredo-teste";
    await registrarRotasWebhookMeta(app);
    await app.ready();
  });

  afterAll(async () => {
    env.WHATSAPP_META_WEBHOOK_VERIFY_TOKEN = tokenAnterior;
    env.WHATSAPP_META_APP_SECRET = segredoAnterior;
    await app.close();
  });

  it("confirma apenas o token de verificacao correto", async () => {
    const correto = await app.inject({
      method: "GET",
      url: "/api/whatsapp/meta/webhook?hub.mode=subscribe&hub.verify_token=token-teste&hub.challenge=123"
    });
    expect(correto.statusCode).toBe(200);
    expect(correto.body).toBe("123");
    const incorreto = await app.inject({
      method: "GET",
      url: "/api/whatsapp/meta/webhook?hub.mode=subscribe&hub.verify_token=outro&hub.challenge=123"
    });
    expect(incorreto.statusCode).toBe(403);
  });

  it("rejeita corpo sem assinatura e aceita HMAC do corpo exato", async () => {
    const corpo = JSON.stringify({
      entry: [
        { changes: [{ value: { statuses: [{ id: "wamid.teste", status: "failed", errors: [{ code: 131042 }] }] } }] }
      ]
    });
    const semAssinatura = await app.inject({
      method: "POST",
      url: "/api/whatsapp/meta/webhook",
      headers: { "content-type": "application/json" },
      payload: corpo
    });
    expect(semAssinatura.statusCode).toBe(403);
    const assinatura = `sha256=${createHmac("sha256", "segredo-teste").update(corpo).digest("hex")}`;
    const assinado = await app.inject({
      method: "POST",
      url: "/api/whatsapp/meta/webhook",
      headers: { "content-type": "application/json", "x-hub-signature-256": assinatura },
      payload: corpo
    });
    expect(assinado.statusCode).toBe(200);
    const adulterado = await app.inject({
      method: "POST",
      url: "/api/whatsapp/meta/webhook",
      headers: { "content-type": "application/json", "x-hub-signature-256": assinatura },
      payload: `${corpo} `
    });
    expect(adulterado.statusCode).toBe(403);
  });
});
