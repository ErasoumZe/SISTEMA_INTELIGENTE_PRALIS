import type { FastifyInstance, FastifyReply } from "fastify";
import type { DadosExternos } from "@padaria/shared/api";
import { criadoId, erro, ok, semConteudo } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { mensagemDominioOuRelancar } from "../erros.js";
import { statusErroValidacao } from "../utils.js";
import { listarClinicasOcupacionais, salvarClinicaOcupacional, salvarUnidadeClinica } from "./clinicas.service.js";

function responderErro(reply: FastifyReply, error: DadosExternos) {
  const mensagem = mensagemDominioOuRelancar(error);
  return erro(reply, statusErroValidacao(mensagem), mensagem);
}

function empresaPermitida(request: { perfilUsuario?: Parameters<typeof podeAcessarEmpresa>[0] }, empresaId?: string) {
  return Boolean(empresaId && request.perfilUsuario && podeAcessarEmpresa(request.perfilUsuario, empresaId));
}

export async function registrarRotasClinicasOcupacionais(app: FastifyInstance): Promise<void> {
  app.get("/api/clinicas-ocupacionais", { preHandler: exigirPermissao("admissoes_clinicas_ocupacionais_visualizar") }, async (request, reply) => {
    const empresaId = (request.query as { empresaId?: string }).empresaId;
    if (!empresaPermitida(request, empresaId)) return erro(reply, 403, "Empresa não permitida", "FORBIDDEN_COMPANY");
    try { return ok(await listarClinicasOcupacionais(request.query)); } catch (error) { return responderErro(reply, error); }
  });

  app.post("/api/clinicas-ocupacionais", { preHandler: exigirPermissao("admissoes_clinicas_ocupacionais_criar") }, async (request, reply) => {
    const empresaId = (request.body as { empresaId?: string } | undefined)?.empresaId;
    if (!empresaPermitida(request, empresaId)) return erro(reply, 403, "Empresa não permitida", "FORBIDDEN_COMPANY");
    try { return criadoId(reply, (await salvarClinicaOcupacional(null, request.body ?? {})).id); } catch (error) { return responderErro(reply, error); }
  });

  app.put("/api/clinicas-ocupacionais/:id", { preHandler: exigirPermissao("admissoes_clinicas_ocupacionais_editar") }, async (request, reply) => {
    const empresaId = (request.body as { empresaId?: string } | undefined)?.empresaId;
    if (!empresaPermitida(request, empresaId)) return erro(reply, 403, "Empresa não permitida", "FORBIDDEN_COMPANY");
    try { await salvarClinicaOcupacional((request.params as { id: string }).id, request.body ?? {}); return semConteudo(reply); } catch (error) { return responderErro(reply, error); }
  });

  app.post("/api/clinicas-ocupacionais/:id/unidades", { preHandler: exigirPermissao("admissoes_clinicas_ocupacionais_criar") }, async (request, reply) => {
    const empresaId = (request.body as { empresaId?: string } | undefined)?.empresaId;
    if (!empresaPermitida(request, empresaId)) return erro(reply, 403, "Empresa não permitida", "FORBIDDEN_COMPANY");
    try { return criadoId(reply, (await salvarUnidadeClinica((request.params as { id: string }).id, null, request.body ?? {})).id); } catch (error) { return responderErro(reply, error); }
  });

  app.put("/api/clinicas-ocupacionais/:id/unidades/:unidadeId", { preHandler: exigirPermissao("admissoes_clinicas_ocupacionais_editar") }, async (request, reply) => {
    const empresaId = (request.body as { empresaId?: string } | undefined)?.empresaId;
    if (!empresaPermitida(request, empresaId)) return erro(reply, 403, "Empresa não permitida", "FORBIDDEN_COMPANY");
    try { await salvarUnidadeClinica((request.params as { id: string }).id, (request.params as { unidadeId: string }).unidadeId, request.body ?? {}); return semConteudo(reply); } catch (error) { return responderErro(reply, error); }
  });
}
