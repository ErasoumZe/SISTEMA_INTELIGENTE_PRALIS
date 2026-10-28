import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { erro, ok, type DadosExternos, type ReplyHttp } from "@padaria/shared/api";
import { z } from "zod";
import { mensagemDominioOuRelancar } from "../erros.js";
import { exigirAutenticacao } from "../auth/guards.js";
import { empresasPermitidas } from "../auth/empresa.js";
import { statusErroValidacao } from "../utils.js";
import { env } from "../env.js";
import {
  confirmarLoteCreare,
  CreareIndisponivelError,
  LoteCreareError,
  empresaDaLojaCreare,
  gerarTxtCompleto,
  loteAbertoCreare,
  loteDePendentes,
  registrarEntregaCreare,
  saudeCreare
} from "./produtos-creare.service.js";

/**
 * TXT do PDV CREARE (porte de `creare.routes.ts` do app oficial, R-222). O robo da loja autentica por
 * `Authorization: Bearer <CREARE_EXPORT_TOKEN>` e informa `?loja=TNP`; sem bearer vale a sessao, e a
 * empresa tem de estar no escopo de quem pede. Estas rotas estao na allowlist de autenticacao propria
 * do `app.ts`. Tudo DESLIGADO ate a virada (`CREARE_EXPORT_ENABLED=false`).
 */
export const ROTAS_CREARE_COM_TOKEN = [
  "/api/creare/produtos.txt",
  "/api/creare/lotes/pendente",
  "/api/creare/lotes/:id/entrega",
  "/api/creare/lotes/:id/confirmar"
] as const;

const queryLoja = z.object({
  loja: z.string().trim().max(8).optional(),
  empresaId: z.string().uuid().optional(),
  limite: z.coerce.number().int().min(1).max(10_000).optional(),
  modo: z.enum(["completo", "pendentes"]).default("completo")
});
const paramsLote = z.object({ id: z.string().uuid() });
const corpoHash = z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/u) });

function mesmoToken(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Resolve a empresa da requisicao (token do robo ou sessao) ou responde o erro e devolve null. */
async function empresaDaRequisicao(request: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  const { loja, empresaId } = queryLoja.parse(request.query);
  const bearer = /^Bearer\s+(.+)$/iu.exec(request.headers.authorization ?? "")?.[1]?.trim();
  if (bearer) {
    if (env.CREARE_EXPORT_TOKEN.length < 32) {
      erro(reply, 503, "Download por token não configurado.", "CREARE_TOKEN_DISABLED");
      return null;
    }
    if (!mesmoToken(bearer, env.CREARE_EXPORT_TOKEN)) {
      erro(reply, 401, "Token de exportação inválido.", "CREARE_TOKEN_INVALID");
      return null;
    }
    if (!loja) {
      erro(reply, 400, "Informe a loja (?loja=TNP).", "CREARE_STORE_REQUIRED");
      return null;
    }
    return empresaDaLojaCreare(loja);
  }
  const perfil = await exigirAutenticacao(request, reply);
  if (!perfil) return null;
  const alvo = empresaId ?? (loja ? await empresaDaLojaCreare(loja) : perfil.empresaId);
  if (!alvo || !empresasPermitidas(perfil).includes(alvo)) {
    erro(reply, 403, "Empresa não permitida.", "FORBIDDEN_COMPANY");
    return null;
  }
  return alvo;
}

function responderErro(reply: ReplyHttp, error: DadosExternos) {
  if (error instanceof CreareIndisponivelError || error instanceof LoteCreareError) {
    return erro(reply, error.status, error.message, error.code);
  }
  const mensagem = mensagemDominioOuRelancar(error);
  return erro(reply, statusErroValidacao(mensagem), mensagem);
}

const nomeDoArquivo = (loja: string) => {
  const hoje = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `produtos-${loja}-${hoje}.txt`;
};

export async function registrarRotasCreare(app: FastifyInstance): Promise<void> {
  app.get("/api/creare/produtos.txt", async (request, reply) => {
    try {
      const empresaId = await empresaDaRequisicao(request, reply);
      if (!empresaId) return reply;
      const { limite, modo, loja } = queryLoja.parse(request.query);
      reply.header("Cache-Control", "no-store");
      if (modo === "pendentes") {
        const lote = await loteDePendentes(empresaId, limite);
        if (!lote) return reply.status(204).send();
        reply.header("X-Creare-Lote-Id", lote.id);
        reply.header("X-Creare-Sha256", lote.sha256);
        reply.header("X-Creare-Registros", String(lote.itens.length));
        reply.header("Content-Type", "text/plain; charset=us-ascii");
        reply.header("Content-Disposition", `attachment; filename="${nomeDoArquivo(loja ?? "LOJA")}"`);
        return reply.send(Buffer.from(lote.conteudo, "ascii"));
      }
      const { loja: daEmpresa, txt } = await gerarTxtCompleto(empresaId, limite);
      reply.header("Content-Type", "text/plain; charset=us-ascii");
      reply.header("Content-Disposition", `attachment; filename="${nomeDoArquivo(daEmpresa)}"`);
      return reply.send(txt);
    } catch (error) {
      return responderErro(reply, error);
    }
  });

  app.get("/api/creare/lotes/pendente", async (request, reply) => {
    try {
      const empresaId = await empresaDaRequisicao(request, reply);
      if (!empresaId) return reply;
      const lote = await loteAbertoCreare(empresaId);
      if (!lote) return reply.status(204).send();
      return ok({ id: lote.id, sha256: lote.sha256, registros: lote.itens.length, criadoEm: lote.criadoEm });
    } catch (error) {
      return responderErro(reply, error);
    }
  });

  app.post("/api/creare/lotes/:id/entrega", async (request, reply) => {
    try {
      const empresaId = await empresaDaRequisicao(request, reply);
      if (!empresaId) return reply;
      const { id } = paramsLote.parse(request.params);
      const { sha256 } = corpoHash.parse(request.body);
      const resultado = await registrarEntregaCreare(empresaId, id, sha256);
      request.log.info({ evento: "produtos.creare.entrega", empresaId, loteId: id, ...resultado });
      return ok(resultado);
    } catch (error) {
      return responderErro(reply, error);
    }
  });

  app.post("/api/creare/lotes/:id/confirmar", async (request, reply) => {
    try {
      const empresaId = await empresaDaRequisicao(request, reply);
      if (!empresaId) return reply;
      const { id } = paramsLote.parse(request.params);
      const { sha256 } = corpoHash.parse(request.body);
      const resultado = await confirmarLoteCreare(empresaId, id, sha256);
      request.log.info({ evento: "produtos.creare.confirmacao", empresaId, loteId: id, ...resultado });
      return ok(resultado);
    } catch (error) {
      return responderErro(reply, error);
    }
  });

  /** Diagnostico por loja (so administrador), mesmo com a exportacao desligada. */
  app.get("/api/produtos/creare/saude", async (request, reply) => {
    const perfil = request.perfilUsuario;
    if (perfil?.role !== "usuario_admin") {
      return erro(reply, 403, "Somente administradores consultam a exportação do PDV.", "INSUFFICIENT_PERMISSION");
    }
    try {
      return ok(await saudeCreare(empresasPermitidas(perfil)));
    } catch (error) {
      return responderErro(reply, error);
    }
  });
}
