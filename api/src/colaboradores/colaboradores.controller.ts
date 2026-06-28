import type { FastifyReply, FastifyRequest } from "fastify";
import {
  cargoPayloadSchema,
  colaboradorCargoParamsSchema,
  colaboradorCargoPayloadSchema,
  colaboradorCargoStatusPayloadSchema,
  colaboradorParamsSchema,
  faltaJustificadaPayloadSchema,
  feriadoPayloadSchema,
  idParamsSchema,
  jornadaPayloadSchema
} from "@padaria/shared/colaboradores";
import { empresaQuerySchema } from "@padaria/shared/catalogos";
import { exigirPermissao } from "../autorizacao.js";
import { empresasPermitidas, escopoEmpresaAtiva, podeAcessarEmpresa } from "../autorizacao/empresa.js";
import type { AplicacaoFastify } from "../tipos/fastify.js";
import {
  atualizarCargo,
  atualizarStatusCargoColaborador,
  criarCargo,
  criarCargoColaborador,
  criarFaltaJustificada,
  criarFeriado,
  criarJornadasColaborador,
  listarCargos,
  listarCargosColaborador,
  listarFaltasJustificadas,
  listarFeriados,
  listarJornadasColaborador
} from "./colaboradores.service.js";

async function escopoDaQuery(request: FastifyRequest, reply: FastifyReply) {
  const query = empresaQuerySchema.parse(request.query);
  const perfil = request.perfilUsuario;
  const empresasLiberadas = perfil ? empresasPermitidas(perfil) : [];
  try {
    return { query, empresasLiberadas, escopoDados: escopoEmpresaAtiva(empresasLiberadas, query.empresaId) };
  } catch (error) {
    reply.status(403).send({ erro: error instanceof Error ? error.message : "Empresa nao permitida" });
    return null;
  }
}

function empresaPermitida(request: FastifyRequest, empresaId: string) {
  return !request.perfilUsuario || podeAcessarEmpresa(request.perfilUsuario, empresaId);
}

function erro400(reply: FastifyReply, error: Error, fallback: string) {
  return reply.status(400).send({ erro: error.message || fallback });
}

export async function registrarRotasColaboradores(app: AplicacaoFastify) {
  app.get("/api/cargos", { preHandler: exigirPermissao("cadastro_colaboradores") }, async (request, reply) => {
    const escopo = await escopoDaQuery(request, reply);
    return escopo ? listarCargos(escopo.escopoDados) : undefined;
  });

  app.post("/api/cargos", { preHandler: exigirPermissao("cadastro_colaboradores") }, async (request, reply) => {
    const body = cargoPayloadSchema.parse(request.body);
    if (!empresaPermitida(request, body.empresaId)) return reply.status(403).send({ erro: "Empresa nao permitida" });
    try {
      return await criarCargo(body);
    } catch (error) {
      return erro400(reply, error instanceof Error ? error : new Error("Cargo invalido"), "Cargo invalido");
    }
  });

  app.put("/api/cargos/:id", { preHandler: exigirPermissao("cadastro_colaboradores") }, async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = cargoPayloadSchema.parse(request.body);
    if (!empresaPermitida(request, body.empresaId)) return reply.status(403).send({ erro: "Empresa nao permitida" });
    return atualizarCargo(id, body);
  });

  app.get(
    "/api/colaboradores/:colaboradorId/cargos",
    { preHandler: exigirPermissao("cadastro_colaboradores") },
    async (request) => {
      const { colaboradorId } = colaboradorParamsSchema.parse(request.params);
      return listarCargosColaborador(
        colaboradorId,
        request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : []
      );
    }
  );

  app.post(
    "/api/colaboradores/:colaboradorId/cargos",
    { preHandler: exigirPermissao("cadastro_colaboradores") },
    async (request, reply) => {
      const { colaboradorId } = colaboradorParamsSchema.parse(request.params);
      const body = colaboradorCargoPayloadSchema.parse(request.body);
      if (!empresaPermitida(request, body.empresaId)) return reply.status(403).send({ erro: "Empresa nao permitida" });
      try {
        return await criarCargoColaborador(colaboradorId, body);
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
    { preHandler: exigirPermissao("cadastro_colaboradores") },
    async (request, reply) => {
      const { colaboradorId, cargoColaboradorId } = colaboradorCargoParamsSchema.parse(request.params);
      const body = colaboradorCargoStatusPayloadSchema.parse(request.body);
      if (!empresaPermitida(request, body.empresaId)) return reply.status(403).send({ erro: "Empresa nao permitida" });
      return atualizarStatusCargoColaborador(colaboradorId, cargoColaboradorId, body);
    }
  );

  app.get(
    "/api/colaboradores/:colaboradorId/jornadas",
    { preHandler: exigirPermissao("cadastro_colaboradores") },
    async (request) => {
      const { colaboradorId } = colaboradorParamsSchema.parse(request.params);
      return listarJornadasColaborador(
        colaboradorId,
        request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : []
      );
    }
  );

  app.post(
    "/api/colaboradores/:colaboradorId/jornadas",
    { preHandler: exigirPermissao("cadastro_colaboradores") },
    async (request, reply) => {
      const { colaboradorId } = colaboradorParamsSchema.parse(request.params);
      const body = jornadaPayloadSchema.parse(request.body);
      if (!empresaPermitida(request, body.empresaId)) return reply.status(403).send({ erro: "Empresa nao permitida" });
      try {
        return await criarJornadasColaborador(colaboradorId, body);
      } catch (error) {
        return erro400(reply, error instanceof Error ? error : new Error("Jornada invalida"), "Jornada invalida");
      }
    }
  );

  app.get(
    "/api/colaboradores/:colaboradorId/faltas-justificadas",
    { preHandler: exigirPermissao("cadastro_colaboradores") },
    async (request) => {
      const { colaboradorId } = colaboradorParamsSchema.parse(request.params);
      return listarFaltasJustificadas(
        colaboradorId,
        request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : []
      );
    }
  );

  app.post(
    "/api/colaboradores/:colaboradorId/faltas-justificadas",
    { preHandler: exigirPermissao("cadastro_colaboradores") },
    async (request, reply) => {
      const { colaboradorId } = colaboradorParamsSchema.parse(request.params);
      const body = faltaJustificadaPayloadSchema.parse(request.body);
      if (!empresaPermitida(request, body.empresaId)) return reply.status(403).send({ erro: "Empresa nao permitida" });
      try {
        return await criarFaltaJustificada(colaboradorId, body);
      } catch (error) {
        return erro400(
          reply,
          error instanceof Error ? error : new Error("Falta justificada invalida"),
          "Falta justificada invalida"
        );
      }
    }
  );

  app.get("/api/feriados", { preHandler: exigirPermissao("cadastro_colaboradores") }, async (request, reply) => {
    const escopo = await escopoDaQuery(request, reply);
    return escopo ? listarFeriados(escopo.escopoDados) : undefined;
  });

  app.post("/api/feriados", { preHandler: exigirPermissao("cadastro_colaboradores") }, async (request, reply) => {
    const body = feriadoPayloadSchema.parse(request.body);
    if (!empresaPermitida(request, body.empresaId)) return reply.status(403).send({ erro: "Empresa nao permitida" });
    try {
      return await criarFeriado(body);
    } catch (error) {
      return erro400(reply, error instanceof Error ? error : new Error("Feriado invalido"), "Feriado invalido");
    }
  });
}
