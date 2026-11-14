import type { FastifyInstance } from "fastify";
import { ok } from "@padaria/shared/api";
import { exigirAcessoRelatorioFechamento, exigirPermissao } from "../auth/guards.js";
import {
  calendarioAuditoria,
  diaAuditoria,
  gerarAuditoria,
  obterAgendaAuditoria,
  salvarAgendaAuditoria
} from "./auditoria-pdv.service.js";

// Auditoria de PDVs (Marco, 13/11/2026). Mesmo acesso do Relatorio de fechamento: Tesouraria, Diretor Geral e
// administrador.
const acesso = { preHandler: [exigirPermissao("relatorio_fechamento_visualizar"), exigirAcessoRelatorioFechamento()] };

export async function registrarRotasAuditoriaPdv(app: FastifyInstance): Promise<void> {
  app.get("/api/auditoria-pdv/calendario", acesso, async (request) =>
    ok(await calendarioAuditoria(request.query, request.perfilUsuario))
  );
  app.get("/api/auditoria-pdv/dia", acesso, async (request) => ok(await diaAuditoria(request.query, request.perfilUsuario)));
  app.post("/api/auditoria-pdv/gerar", acesso, async (request) =>
    ok(await gerarAuditoria(request.body, request.perfilUsuario))
  );
  app.get("/api/auditoria-pdv/agenda", acesso, async (request) =>
    ok(await obterAgendaAuditoria(request.query, request.perfilUsuario))
  );
  app.put("/api/auditoria-pdv/agenda", acesso, async (request) =>
    ok(await salvarAgendaAuditoria(request.body, request.perfilUsuario))
  );
}
