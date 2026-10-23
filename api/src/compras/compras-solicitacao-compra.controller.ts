import type { FastifyInstance } from "fastify";
import { enviarSolicitacaoCompraSchema, solicitacoesCompraQuerySchema } from "@padaria/shared/compras";
import { apiIdParamsSchema, ok } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import { listarResponsaveis } from "./compras-responsaveis.service.js";
import {
  detalharSolicitacaoCompra,
  enviarSolicitacaoCompra,
  listarSolicitacoesCompra
} from "./compras-solicitacao-compra.service.js";

// Solicitacao de compra (doc 58 §2). Ver = `pedidos_visualizar` (o servico mostra so os pedidos do responsavel);
// enviar abre a cotacao = `pedidos_editar`. A lista de responsaveis serve ao card do agendamento.
const BASE = "/api/compras/solicitacoes-compra";

export async function registrarRotasSolicitacaoCompra(app: FastifyInstance): Promise<void> {
  app.get(BASE, { preHandler: exigirPermissao("pedidos_visualizar") }, async (request) => {
    const { empresaId } = solicitacoesCompraQuerySchema.parse(request.query);
    return ok(await listarSolicitacoesCompra(empresaId, request.perfilUsuario!));
  });
  app.get(`${BASE}/responsaveis`, { preHandler: exigirPermissao("agendamento_pedidos_gerir") }, async (request) => {
    const { empresaId } = solicitacoesCompraQuerySchema.parse(request.query);
    return ok(await listarResponsaveis(empresaId, "pedidos_editar", request.perfilUsuario!));
  });
  app.get(`${BASE}/:id`, { preHandler: exigirPermissao("pedidos_visualizar") }, async (request) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    const { empresaId } = solicitacoesCompraQuerySchema.parse(request.query);
    return ok(await detalharSolicitacaoCompra(id, empresaId, request.perfilUsuario!));
  });
  app.post(`${BASE}/:id/enviar`, { preHandler: exigirPermissao("pedidos_editar") }, async (request, reply) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    const rodada = await enviarSolicitacaoCompra(
      id,
      enviarSolicitacaoCompraSchema.parse(request.body),
      request.perfilUsuario!
    );
    reply.code(201);
    return ok(rodada);
  });
}
