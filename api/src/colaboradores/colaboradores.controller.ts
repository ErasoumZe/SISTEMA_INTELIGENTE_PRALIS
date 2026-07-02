import { mensagemDominioOuRelancar } from "../erros.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
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
import {
  cargoParamsSchema,
  colaboradoresQuerySchema as empresaQuerySchema,
  exportarCargoSchema,
  exportarColaboradorSchema,
  importarCargosSchema,
  importarColaboradoresSchema
} from "@padaria/shared/colaboradores";
import { exigirPermissao } from "../auth/guards.js";
import { empresasPermitidas, escopoEmpresaAtiva, podeAcessarEmpresa } from "../auth/empresa.js";
import { criadoId, erro, ok, paginadoDeArray, semConteudo } from "@padaria/shared/api";
import {
  atualizarCargo,
  atualizarStatusCargoColaborador,
  criarCargo,
  criarCargoColaborador,
  criarFaltaJustificada,
  criarJornadasColaborador,
  exportarCargo,
  exportarColaborador,
  importarCargos,
  importarColaboradores,
  listarColaboradores,
  listarCargos,
  listarCargosColaborador,
  listarFaltasJustificadas,
  listarJornadasColaborador,
  salvarColaborador
} from "./colaboradores.service.js";
import { statusErroValidacao } from "../utils.js";

async function escopoDaQuery(request: FastifyRequest, reply: FastifyReply) {
  const query = empresaQuerySchema.parse(request.query);
  const perfil = request.perfilUsuario;
  const empresasLiberadas = perfil ? empresasPermitidas(perfil) : [];
  try {
    return { query, empresasLiberadas, escopoDados: escopoEmpresaAtiva(empresasLiberadas, query.empresaId) };
  } catch (error) {
    erro(reply, 403, mensagemDominioOuRelancar(error), "FORBIDDEN_COMPANY");
    return null;
  }
}

function empresaPermitida(request: FastifyRequest, empresaId: string) {
  return !request.perfilUsuario || podeAcessarEmpresa(request.perfilUsuario, empresaId);
}

function erro400(reply: FastifyReply, error: Error, fallback: string) {
  return erro(reply, 400, error.message || fallback);
}

export async function registrarRotasColaboradores(app: FastifyInstance) {
  app.get(
    "/api/colaboradores",
    { preHandler: exigirPermissao("cadastro_colaboradores_visualizar") },
    async (request, reply) => {
      const escopo = await escopoDaQuery(request, reply);
      return escopo
        ? paginadoDeArray(await listarColaboradores(escopo.escopoDados), escopo.query.page, escopo.query.pageSize)
        : undefined;
    }
  );

  app.post(
    "/api/colaboradores",
    { preHandler: exigirPermissao("cadastro_colaboradores_criar") },
    async (request, reply) => {
      const body = request.body as { empresaId?: string };
      if (body.empresaId && !empresaPermitida(request, body.empresaId))
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      try {
        const criado = await salvarColaborador(null, request.body);
        return criadoId(reply, criado?.id ?? "colaboradores");
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.put(
    "/api/colaboradores/:id",
    { preHandler: exigirPermissao("cadastro_colaboradores_editar") },
    async (request, reply) => {
      const { id } = cargoParamsSchema.parse(request.params);
      const body = request.body as { empresaId?: string };
      if (body.empresaId && !empresaPermitida(request, body.empresaId))
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      try {
        await salvarColaborador(id, request.body);
        return semConteudo(reply);
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.post(
    "/api/colaboradores/importar",
    { preHandler: exigirPermissao("cadastro_colaboradores_criar") },
    async (request, reply) => {
      try {
        return ok(await importarColaboradores(importarColaboradoresSchema.parse(request.body), request.perfilUsuario));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, mensagem === "Empresa nao permitida" ? 403 : 400, mensagem);
      }
    }
  );

  app.post(
    "/api/colaboradores/:id/exportar",
    { preHandler: exigirPermissao("cadastro_colaboradores_criar") },
    async (request, reply) => {
      const { id } = cargoParamsSchema.parse(request.params);
      try {
        return ok(await exportarColaborador(id, exportarColaboradorSchema.parse(request.body), request.perfilUsuario));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, mensagem === "Empresa nao permitida" ? 403 : 400, mensagem);
      }
    }
  );

  app.get(
    "/api/cargos",
    { preHandler: exigirPermissao("cadastro_colaboradores_visualizar") },
    async (request, reply) => {
      const escopo = await escopoDaQuery(request, reply);
      return escopo
        ? paginadoDeArray(await listarCargos(escopo.escopoDados), escopo.query.page, escopo.query.pageSize)
        : undefined;
    }
  );

  app.post("/api/cargos", { preHandler: exigirPermissao("cadastro_colaboradores_criar") }, async (request, reply) => {
    const body = cargoPayloadSchema.parse(request.body);
    if (!empresaPermitida(request, body.empresaId))
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    try {
      const criado = await criarCargo(body);
      if (!criado) return erro(reply, 400, "Cargo invalido", "INVALID_CARGO");
      return criadoId(reply, criado.id);
    } catch (error) {
      return erro400(reply, new Error(mensagemDominioOuRelancar(error)), "Cargo invalido");
    }
  });

  app.put(
    "/api/cargos/:id",
    { preHandler: exigirPermissao("cadastro_colaboradores_editar") },
    async (request, reply) => {
      const { id } = idParamsSchema.parse(request.params);
      const body = cargoPayloadSchema.parse(request.body);
      if (!empresaPermitida(request, body.empresaId))
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      await atualizarCargo(id, body);
      return semConteudo(reply);
    }
  );

  app.post(
    "/api/cargos/importar",
    { preHandler: exigirPermissao("cadastro_colaboradores_criar") },
    async (request, reply) => {
      try {
        return ok(await importarCargos(importarCargosSchema.parse(request.body), request.perfilUsuario));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, mensagem === "Empresa nao permitida" ? 403 : 400, mensagem);
      }
    }
  );

  app.post(
    "/api/cargos/:id/exportar",
    { preHandler: exigirPermissao("cadastro_colaboradores_criar") },
    async (request, reply) => {
      const { id } = cargoParamsSchema.parse(request.params);
      try {
        return ok(await exportarCargo(id, exportarCargoSchema.parse(request.body), request.perfilUsuario));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, mensagem === "Empresa nao permitida" ? 403 : 400, mensagem);
      }
    }
  );

  app.get(
    "/api/colaboradores/:colaboradorId/cargos",
    { preHandler: exigirPermissao("cadastro_colaboradores_visualizar") },
    async (request) => {
      const { colaboradorId } = colaboradorParamsSchema.parse(request.params);
      const query = empresaQuerySchema.parse(request.query);
      return paginadoDeArray(
        await listarCargosColaborador(
          colaboradorId,
          request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : []
        ),
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
      if (!empresaPermitida(request, body.empresaId))
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      try {
        const criado = await criarCargoColaborador(colaboradorId, body);
        if (!criado) return erro(reply, 400, "Cargo do colaborador invalido", "INVALID_COLLABORATOR_ROLE");
        return criadoId(reply, criado.id);
      } catch (error) {
        return erro400(reply, new Error(mensagemDominioOuRelancar(error)), "Cargo do colaborador invalido");
      }
    }
  );

  app.put(
    "/api/colaboradores/:colaboradorId/cargos/:cargoColaboradorId",
    { preHandler: exigirPermissao("cadastro_colaboradores_editar") },
    async (request, reply) => {
      const { colaboradorId, cargoColaboradorId } = colaboradorCargoParamsSchema.parse(request.params);
      const body = colaboradorCargoStatusPayloadSchema.parse(request.body);
      if (!empresaPermitida(request, body.empresaId))
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
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
        await listarJornadasColaborador(
          colaboradorId,
          request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : []
        ),
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
      if (!empresaPermitida(request, body.empresaId))
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      try {
        const criado = await criarJornadasColaborador(colaboradorId, body);
        return criadoId(reply, (criado as { ids?: string[] }).ids?.[0] ?? colaboradorId);
      } catch (error) {
        return erro400(reply, new Error(mensagemDominioOuRelancar(error)), "Jornada invalida");
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
        await listarFaltasJustificadas(
          colaboradorId,
          request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : []
        ),
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
      if (!empresaPermitida(request, body.empresaId))
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      try {
        const criado = await criarFaltaJustificada(colaboradorId, body);
        if (!criado) return erro(reply, 400, "Falta justificada invalida", "INVALID_ABSENCE");
        return criadoId(reply, criado.id);
      } catch (error) {
        return erro400(reply, new Error(mensagemDominioOuRelancar(error)), "Falta justificada invalida");
      }
    }
  );
}
