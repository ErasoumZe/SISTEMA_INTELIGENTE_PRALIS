import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../env.js";

const eventoSchema = z.object({
  entry: z
    .array(
      z.object({
        changes: z
          .array(
            z.object({
              value: z.object({
                statuses: z
                  .array(
                    z.object({
                      id: z.string(),
                      status: z.string(),
                      errors: z.array(z.object({ code: z.number().optional() })).optional()
                    })
                  )
                  .optional()
              })
            })
          )
          .optional()
      })
    )
    .optional()
});

function mesmoSegredo(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

function assinaturaValida(corpo: Buffer, assinatura: string | undefined, segredo: string): boolean {
  if (!assinatura || !/^sha256=[0-9a-f]{64}$/iu.test(assinatura)) return false;
  const esperado = createHmac("sha256", segredo).update(corpo).digest();
  const recebido = Buffer.from(assinatura.slice(7), "hex");
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

/** A Meta exige corpo bruto para HMAC. O parser fica isolado nesta rota. */
export async function registrarRotasWebhookMeta(app: FastifyInstance): Promise<void> {
  await app.register(async (webhook) => {
    webhook.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, corpo, done) => {
      done(null, corpo);
    });

    webhook.get("/api/whatsapp/meta/webhook", async (request, reply) => {
      if (!env.WHATSAPP_META_WEBHOOK_VERIFY_TOKEN) return reply.code(503).send();
      const query = request.query as Record<string, string | undefined>;
      if (
        query["hub.mode"] !== "subscribe" ||
        !query["hub.verify_token"] ||
        !query["hub.challenge"] ||
        !mesmoSegredo(query["hub.verify_token"], env.WHATSAPP_META_WEBHOOK_VERIFY_TOKEN)
      ) {
        return reply.code(403).send();
      }
      return reply.type("text/plain").send(query["hub.challenge"]);
    });

    webhook.post("/api/whatsapp/meta/webhook", async (request, reply) => {
      if (!env.WHATSAPP_META_APP_SECRET) return reply.code(503).send();
      const corpo = request.body;
      if (
        !Buffer.isBuffer(corpo) ||
        !assinaturaValida(
          corpo,
          request.headers["x-hub-signature-256"] as string | undefined,
          env.WHATSAPP_META_APP_SECRET
        )
      ) {
        return reply.code(403).send();
      }

      let evento;
      try {
        evento = eventoSchema.safeParse(JSON.parse(corpo.toString("utf8")));
      } catch {
        return reply.code(400).send();
      }
      if (!evento.success) return reply.code(400).send();
      for (const entrada of evento.data.entry ?? []) {
        for (const mudanca of entrada.changes ?? []) {
          for (const item of mudanca.value.statuses ?? []) {
            const codigo = item.errors?.[0]?.code;
            // Nunca registra telefone, conteudo da mensagem nem link de cotacao no log.
            request.log.info(
              {
                mensagemExternaId: item.id,
                status: item.status,
                codigoErro: typeof codigo === "number" ? codigo : undefined
              },
              "whatsapp meta status"
            );
          }
        }
      }
      return reply.code(200).send({ ok: true });
    });
  });
}
