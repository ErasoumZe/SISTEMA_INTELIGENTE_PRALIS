import type { FastifyInstance } from "fastify";
import {
  agendamentoPayloadSchema,
  agendamentosQuerySchema,
  editarAgendamentoSchema,
  encerrarAgendamentoSchema,
  moverOcorrenciaSchema,
  ocorrenciaAgendamentoSchema,
  produtosAgendamentoQuerySchema
} from "@padaria/shared/compras";
import { apiIdParamsSchema, criadoId, ok, semConteudo } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import {
  cancelarOcorrencia,
  criarAgendamento,
  editarAgendamento,
  encerrarAgendamento,
  listarAgendamentos,
  listarProdutosDoAgendamento,
  moverOcorrencia
} from "./compras-agendamento.service.js";

// Agendamento de pedido (PROJECT_BRAIN/56 e 57). Ver = `agendamento_pedidos_visualizar`; mexer na agenda =
// `agendamento_pedidos_gerir`. Na data, o agendador abre a cotacao sozinho (doc 57 §2).
const BASE = "/api/compras/agendamentos";
const ver = { preHandler: exigirPermissao("agendamento_pedidos_visualizar") };
const gerir = { preHandler: exigirPermissao("agendamento_pedidos_gerir") };

export async function registrarRotasComprasAgendamento(app: FastifyInstance): Promise<void> {
  app.get(BASE, ver, async (request) => {
    const { empresaId } = agendamentosQuerySchema.parse(request.query);
    return ok(await listarAgendamentos(empresaId, request.perfilUsuario!));
  });
  app.get(`${BASE}/produtos`, ver, async (request) => {
    const { empresaId } = produtosAgendamentoQuerySchema.parse(request.query);
    return ok(await listarProdutosDoAgendamento(empresaId, request.perfilUsuario!));
  });

  app.post(BASE, gerir, async (request, reply) => {
    const criado = await criarAgendamento(agendamentoPayloadSchema.parse(request.body), request.perfilUsuario!);
    return criadoId(reply, criado.id);
  });
  app.put(`${BASE}/:id`, gerir, async (request) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    return ok(await editarAgendamento(id, editarAgendamentoSchema.parse(request.body), request.perfilUsuario!));
  });
  app.post(`${BASE}/:id/encerrar`, gerir, async (request, reply) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    const { empresaId } = encerrarAgendamentoSchema.parse(request.body);
    await encerrarAgendamento(id, empresaId, request.perfilUsuario!);
    return semConteudo(reply);
  });
  app.post(`${BASE}/:id/ocorrencias/cancelar`, gerir, async (request, reply) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    await cancelarOcorrencia(id, ocorrenciaAgendamentoSchema.parse(request.body), request.perfilUsuario!);
    return semConteudo(reply);
  });
  app.post(`${BASE}/:id/ocorrencias/mover`, gerir, async (request, reply) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    await moverOcorrencia(id, moverOcorrenciaSchema.parse(request.body), request.perfilUsuario!);
    return semConteudo(reply);
  });
}
