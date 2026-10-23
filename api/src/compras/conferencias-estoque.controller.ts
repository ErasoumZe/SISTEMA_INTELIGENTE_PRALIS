import type { FastifyInstance } from "fastify";
import {
  conferenciaAgendaPayloadSchema,
  conferenciaEmpresaSchema,
  conferenciasQuerySchema,
  contagemConferenciaPayloadSchema
} from "@padaria/shared/compras";
import { apiIdParamsSchema, criadoId, ok, semConteudo } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import {
  concluirConferencia,
  criarAgendaConferencia,
  detalharConferencia,
  editarAgendaConferencia,
  encerrarAgendaConferencia,
  listarAgendasConferencia,
  listarConferencias,
  opcoesConferencia,
  registrarContagem
} from "./conferencias-estoque.service.js";

// Conferencia de estoque agendada (doc 57 §1). Ver e contar = `conferencias_estoque_visualizar` (o servico
// confere se e o responsavel); agendar = `conferencias_estoque_agendar`.
const BASE = "/api/compras/conferencias";
const ver = { preHandler: exigirPermissao("conferencias_estoque_visualizar") };
const agendar = { preHandler: exigirPermissao("conferencias_estoque_agendar") };

export async function registrarRotasConferenciasEstoque(app: FastifyInstance): Promise<void> {
  app.get(BASE, ver, async (request) => {
    const { empresaId } = conferenciasQuerySchema.parse(request.query);
    return ok(await listarConferencias(empresaId, request.perfilUsuario!));
  });
  app.get(`${BASE}/agendas`, ver, async (request) => {
    const { empresaId } = conferenciasQuerySchema.parse(request.query);
    return ok(await listarAgendasConferencia(empresaId, request.perfilUsuario!));
  });
  app.get(`${BASE}/opcoes`, agendar, async (request) => {
    const { empresaId } = conferenciasQuerySchema.parse(request.query);
    return ok(await opcoesConferencia(empresaId, request.perfilUsuario!));
  });
  app.post(`${BASE}/agendas`, agendar, async (request, reply) => {
    const criada = await criarAgendaConferencia(
      conferenciaAgendaPayloadSchema.parse(request.body),
      request.perfilUsuario!
    );
    return criadoId(reply, criada.id);
  });
  app.put(`${BASE}/agendas/:id`, agendar, async (request) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    return ok(
      await editarAgendaConferencia(id, conferenciaAgendaPayloadSchema.parse(request.body), request.perfilUsuario!)
    );
  });
  app.post(`${BASE}/agendas/:id/encerrar`, agendar, async (request, reply) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    const { empresaId } = conferenciaEmpresaSchema.parse(request.body);
    await encerrarAgendaConferencia(id, empresaId, request.perfilUsuario!);
    return semConteudo(reply);
  });
  app.get(`${BASE}/:id`, ver, async (request) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    const { empresaId } = conferenciasQuerySchema.parse(request.query);
    return ok(await detalharConferencia(id, empresaId, request.perfilUsuario!));
  });
  app.put(`${BASE}/:id/contagem`, ver, async (request, reply) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    await registrarContagem(id, contagemConferenciaPayloadSchema.parse(request.body), request.perfilUsuario!);
    return semConteudo(reply);
  });
  app.post(`${BASE}/:id/concluir`, ver, async (request, reply) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    const { empresaId } = conferenciaEmpresaSchema.parse(request.body);
    await concluirConferencia(id, empresaId, request.perfilUsuario!);
    return semConteudo(reply);
  });
}
