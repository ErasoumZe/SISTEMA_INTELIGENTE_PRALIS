import type { FastifyReply, FastifyRequest } from "fastify";
import {
  cargoPayloadSchema,
  colaboradorCargoParamsSchema,
  colaboradorCargoPayloadSchema,
  colaboradorCargoStatusPayloadSchema,
  colaboradorParamsSchema,
  faltaJustificadaPayloadSchema,
  idParamsSchema,
  jornadaPayloadSchema
} from "@padaria/shared/colaboradores";
import { empresaQuerySchema } from "@padaria/shared/catalogos";
import { exigirPermissao } from "../autorizacao.js";
import { empresasPermitidas, escopoEmpresaAtiva, podeAcessarEmpresa } from "../autorizacao/empresa.js";
import { criadoId, erro, paginadoDeArray, semConteudo } from "../respostas.js";
import type { AplicacaoFastify } from "../tipos/fastify.js";
import {
  atualizarCargo,
  atualizarStatusCargoColaborador,
  criarCargo,
  criarCargoColaborador,
  criarFaltaJustificada,
  criarJornadasColaborador,
  listarCargos,
  listarCargosColaborador,
  listarFaltasJustificadas,
  listarJornadasColaborador
} from "./colaboradores.service.js";

async function escopoDaQuery(request: FastifyRequest, reply: FastifyReply) {
  const query = empresaQuerySchema.parse(request.query);
  const perfil = request.perfilUsuario;
  const empresasLiberadas = perfil ? empresasPermitidas(perfil) : [];
  try {
    return { query, empresasLiberadas, escopoDados: escopoEmpresaAtiva(empresasLiberadas, query.empresaId) };
  } catch (error) {
    erro(reply, 403, error instanceof Error ? error.message : "Empresa nao permitida", "FORBIDDEN_COMPANY");
    return null;
  }
}

function empresaPermitida(request: FastifyRequest, empresaId: string) {
  return !request.perfilUsuario || podeAcessarEmpresa(request.perfilUsuario, empresaId);
}

function erro400(reply: FastifyReply, error: Error, fallback: string) {
  return erro(reply, 400, error.message || fallback);
}

export async function registrarRotasColaboradores(app: AplicacaoFastify) {
  app.get("/api/cargos", { preHandler: exigirPermissao("cadastro_colaboradores_visualizar") }, async (request, reply) => {
    const escopo = await escopoDaQuery(request, reply);
    return escopo ? paginadoDeArray(await listarCargos(escopo.escopoDados), escopo.query.page, escopo.query.pageSize) : undefined;
  });

  app.post("/api/cargos", { preHandler: exigirPermissao("cadastro_colaboradores_criar") }, async (request, reply) => {
    const body = cargoPayloadSchema.parse(request.body);
    if (!empresaPermitida(request, body.empresaId)) return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    try {
      const criado = await criarCargo(body);
      if (!criado) return erro(reply, 400, "Cargo invalido", "INVALID_CARGO");
      return criadoId(reply, criado.id);
    } catch (error) {
      return erro400(reply, error instanceof Error ? error : new Error("Cargo invalido"), "Cargo invalido");
    }
  });

  app.put("/api/cargos/:id", { preHandler: exigirPermissao("cadastro_colaboradores_editar") }, async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = cargoPayloadSchema.parse(request.body);
    if (!empresaPermitida(request, body.empresaId)) return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    await atualizarCargo(id, body);
    return semConteudo(reply);
  });

  app.get(
    "/api/colaboradores/:colaboradorId/cargos",
    { preHandler: exigirPermissao("cadastro_colaboradores_visualizar") },
    async (request, reply) => {
      const { colaboradorId } = colaboradorParamsSchema.parse(request.params);
      const query = empresaQuerySchema.parse(request.query);
      return paginadoDeArray(
        await listarCargosColaborador(colaboradorId, request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : []),
        query.page,
        query.pageSize
      );
    }
  );

  app.post(
    "/api/colaboradores/:colaboradorId/cargos",
    { preHandler: exigirPermissao("cadastro_colaboradores_criar") },
    async (request, reply) => {
      const { colaboradorId } = colaboradorParamsSchema.parse(request.params);
      const body = colaboradorCargoPayloadSchema.parse(request.body);
      if (!empresaPermitida(request, body.empresaId)) return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      try {
        const criado = await criarCargoColaborador(colaboradorId, body);
        if (!criado) return erro(reply, 400, "Cargo do colaborador invalido", "INVALID_COLLABORATOR_ROLE");
        return criadoId(reply, criado.id);
      } catch (error) {
        return erro400(
          reply,
          error instanceof Error ? error : new Error("Cargo do colaborador invalido"),
          "Cargo do colaborador invalido"
        );
      }
    }
  );

  app.put(
    "/api/colaboradores/:colaboradorId/cargos/:cargoColaboradorId",
    { preHandler: exigirPermissao("cadastro_colaboradores_editar") },
    async (request, reply) => {
      const { colaboradorId, cargoColaboradorId } = colaboradorCargoParamsSchema.parse(request.params);
      const body = colaboradorCargoStatusPayloadSchema.parse(request.body);
      if (!empresaPermitida(request, body.empresaId)) return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      await atualizarStatusCargoColaborador(colaboradorId, cargoColaboradorId, body);
      return semConteudo(reply);
    }
  );

  app.get(
    "/api/colaboradores/:colaboradorId/jornadas",
    { preHandler: exigirPermissao("cadastro_colaboradores_visualizar") },
    async (request) => {
      const { colaboradorId } = colaboradorParamsSchema.parse(request.params);
      const query = empresaQuerySchema.parse(request.query);
      return paginadoDeArray(
        await listarJornadasColaborador(colaboradorId, request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : []),
        query.page,
        query.pageSize
      );
    }
  );

  app.post(
    "/api/colaboradores/:colaboradorId/jornadas",
    { preHandler: exigirPermissao("cadastro_colaboradores_criar") },
    async (request, reply) => {
      const { colaboradorId } = colaboradorParamsSchema.parse(request.params);
      const body = jornadaPayloadSchema.parse(request.body);
      if (!empresaPermitida(request, body.empresaId)) return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      try {
        const criado = await criarJornadasColaborador(colaboradorId, body);
        return criadoId(reply, (criado as { ids?: string[] }).ids?.[0] ?? colaboradorId);
      } catch (error) {
        return erro400(reply, error instanceof Error ? error : new Error("Jornada invalida"), "Jornada invalida");
      }
    }
  );

  app.get(
    "/api/colaboradores/:colaboradorId/faltas-justificadas",
    { preHandler: exigirPermissao("cadastro_colaboradores_visualizar") },
    async (request) => {
      const { colaboradorId } = colaboradorParamsSchema.parse(request.params);
      const query = empresaQuerySchema.parse(request.query);
      return paginadoDeArray(
        await listarFaltasJustificadas(colaboradorId, request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : []),
        query.page,
        query.pageSize
      );
    }
  );

  app.post(
    "/api/colaboradores/:colaboradorId/faltas-justificadas",
    { preHandler: exigirPermissao("cadastro_colaboradores_criar") },
    async (request, reply) => {
      const { colaboradorId } = colaboradorParamsSchema.parse(request.params);
      const body = faltaJustificadaPayloadSchema.parse(request.body);
      if (!empresaPermitida(request, body.empresaId)) return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      try {
        const criado = await criarFaltaJustificada(colaboradorId, body);
        if (!criado) return erro(reply, 400, "Falta justificada invalida", "INVALID_ABSENCE");
        return criadoId(reply, criado.id);
      } catch (error) {
        return erro400(
          reply,
          error instanceof Error ? error : new Error("Falta justificada invalida"),
          "Falta justificada invalida"
        );
      }
    }
  );
}
