import type { FastifyInstance } from "fastify";
import { clientePayloadSchema, clientesQuerySchema as empresaQuerySchema } from "@padaria/shared/clientes";
import { apiIdParamsSchema, criadoId, erro, paginadoDeResultado, semConteudo } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import { escopoEmpresaAtiva, empresasPermitidas, podeAcessarEmpresa } from "../auth/empresa.js";
import { statusErroValidacao } from "../utils.js";
import { listarClientes, salvarCliente } from "./clientes.service.js";

export async function registrarRotasClientes(app: FastifyInstance): Promise<void> {
  app.get("/api/clientes", { preHandler: exigirPermissao("cadastro_clientes_visualizar") }, async (request, reply) => {
    const query = empresaQuerySchema.parse(request.query);
    try {
      const escopo = escopoEmpresaAtiva(
        request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [],
        query.empresaId
      );
      return paginadoDeResultado(await listarClientes(query, escopo));
    } catch (error) {
      return erro(reply, 403, error instanceof Error ? error.message : "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
  });

  app.post("/api/clientes", { preHandler: exigirPermissao("cadastro_clientes_criar") }, async (request, reply) => {
    const body = clientePayloadSchema.parse(request.body);
    if (body.empresaId && request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    try {
      const salvo = await salvarCliente(null, request.body);
      return criadoId(reply, salvo?.id ?? "clientes");
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : "Dados invalidos";
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });

  app.put("/api/clientes/:id", { preHandler: exigirPermissao("cadastro_clientes_editar") }, async (request, reply) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    const body = clientePayloadSchema.parse(request.body);
    if (body.empresaId && request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    try {
      await salvarCliente(id, request.body);
      return semConteudo(reply);
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : "Dados invalidos";
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });
}
