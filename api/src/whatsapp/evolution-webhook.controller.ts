import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../env.js";
import { esquecerEstadoWhatsapp } from "./whatsapp-provedor.js";

// Callback de status da Evolution API (R-235). Configurado no webhook da instancia com o evento
// MESSAGES_UPDATE e o cabecalho `Authorization: Bearer <WHATSAPP_EVOLUTION_WEBHOOK_SEGREDO>`. So registra no
// log o id e o status da mensagem — o mesmo que o callback da Meta fazia. Nunca registra telefone (o
// `remoteJid` e o numero), conteudo, link de cotacao nem o `apikey` que a Evolution manda no corpo.

export const ROTA_WEBHOOK_EVOLUTION = "/api/whatsapp/evolution/webhook";

/** Item de status. A v2 manda `data` como objeto (`keyId`/`status`); versoes antigas, lista com `key.id`/`update.status`. */
const itemSchema = z
  .object({
    keyId: z.string().optional(),
    messageId: z.string().optional(),
    key: z.object({ id: z.string().optional() }).passthrough().optional(),
    status: z.union([z.string(), z.number()]).optional(),
    // CONNECTION_UPDATE: `{ state: "open" | "close" | "connecting", statusReason: 401 }`.
    state: z.string().optional(),
    statusReason: z.union([z.string(), z.number()]).optional(),
    update: z
      .object({ status: z.union([z.string(), z.number()]).optional() })
      .passthrough()
      .optional()
  })
  .passthrough();

const eventoSchema = z
  .object({
    event: z.string().optional(),
    data: z.union([itemSchema, z.array(itemSchema)]).optional()
  })
  .passthrough();

function segredoConfere(cabecalho: string | undefined, segredo: string): boolean {
  if (!cabecalho) return false;
  const recebido = Buffer.from(cabecalho);
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

/** "messages.update" e "MESSAGES_UPDATE" sao o mesmo evento (o nome muda conforme a configuracao). */
function ehAtualizacaoDeMensagem(evento: string | undefined): boolean {
  return (evento ?? "").toLowerCase().replace(/_/gu, ".") === "messages.update";
}

/** "connection.update" e "CONNECTION_UPDATE" sao o mesmo evento. */
function ehAtualizacaoDeConexao(evento: string | undefined): boolean {
  return (evento ?? "").toLowerCase().replace(/_/gu, ".") === "connection.update";
}

export async function registrarRotasWebhookEvolution(app: FastifyInstance): Promise<void> {
  app.post(ROTA_WEBHOOK_EVOLUTION, async (request, reply) => {
    const segredo = env.WHATSAPP_EVOLUTION_WEBHOOK_SEGREDO;
    if (!segredo) return reply.code(503).send();
    if (!segredoConfere(request.headers.authorization, segredo)) return reply.code(403).send();

    const evento = eventoSchema.safeParse(request.body);
    if (!evento.success) return reply.code(400).send();
    // 16/11/2026: a instancia cai com frequencia. CONNECTION_UPDATE (ligado no webhook da Evolution) deixa no log
    // cada mudanca de conexao com o codigo do motivo (401 = aparelho removido/deslogado, 440 = sessao substituida,
    // 428/515 = conexao derrubada e refeita). Nunca registra o numero.
    if (ehAtualizacaoDeConexao(evento.data.event)) {
      const dados = Array.isArray(evento.data.data) ? evento.data.data[0] : evento.data.data;
      if (dados?.state !== "open") esquecerEstadoWhatsapp();
      request.log.warn(
        { estado: dados?.state ?? null, motivo: dados?.statusReason ?? null },
        "whatsapp evolution conexao"
      );
      return reply.code(200).send({ ok: true });
    }
    // Outros eventos (se alguem ligar na Evolution) sao aceitos e ignorados: 200 evita reenvio em loop.
    if (!ehAtualizacaoDeMensagem(evento.data.event)) return reply.code(200).send({ ok: true });

    const itens = Array.isArray(evento.data.data) ? evento.data.data : evento.data.data ? [evento.data.data] : [];
    for (const item of itens) {
      request.log.info(
        {
          mensagemExternaId: item.keyId ?? item.key?.id ?? item.messageId,
          status: item.status ?? item.update?.status
        },
        "whatsapp evolution status"
      );
    }
    return reply.code(200).send({ ok: true });
  });
}
