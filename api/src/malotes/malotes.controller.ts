import type { FastifyInstance } from "fastify";
import { exigirAlgumaPermissao, exigirPermissao } from "../autorizacao.js";
import { escopoEmpresaAtiva, empresasPermitidas, podeAcessarEmpresa } from "../autorizacao/empresa.js";
import { criadoId, erro, ok, paginadoDeArray, semConteudo } from "../respostas.js";
import {
  atualizarMalote,
  criarMalote,
  listarLacresMalote,
  listarMalotes,
  mensagemErroMalote,
  validarLacre
} from "./malotes.service.js";
import {
  atualizarMaloteSchema,
  criarMaloteSchema,
  malotesQuerySchema,
  maloteParamsSchema,
  validarLacreQuerySchema
} from "@padaria/shared/malotes";

export async function registrarRotasMalotes(app: FastifyInstance): Promise<void> {
  app.get("/api/malotes", { preHandler: exigirAlgumaPermissao(["cadastro_malotes_visualizar", "transferencias_visualizar"]) }, async (request, reply) => {
    const query = malotesQuerySchema.parse(request.query);
    const empresasLiberadas = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
    try {
      return paginadoDeArray(
        await listarMalotes(escopoEmpresaAtiva(empresasLiberadas, query.empresaId)),
        query.page,
        query.pageSize
      );
    } catch (error) {
      return erro(reply, 403, error instanceof Error ? error.message : "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
  });

  app.get("/api/malotes/:maloteId/lacres", { preHandler: exigirPermissao("transferencias_visualizar") }, async (request) => {
    const { maloteId } = maloteParamsSchema.parse(request.params);
    const query = malotesQuerySchema.parse(request.query);
    return paginadoDeArray(
      await listarLacresMalote(maloteId, request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : []),
      query.page,
      query.pageSize
    );
  });

  app.get("/api/lacres/validar", { preHandler: exigirPermissao("transferencias_visualizar") }, async (request, reply) => {
    const { numero, empresaId } = validarLacreQuerySchema.parse(request.query);
    const empresasLiberadas = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
    try {
      return ok(await validarLacre(numero, escopoEmpresaAtiva(empresasLiberadas, empresaId)));
    } catch (error) {
      return erro(reply, 403, error instanceof Error ? error.message : "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
  });

  app.post("/api/malotes", { preHandler: exigirPermissao("cadastro_malotes_criar") }, async (request, reply) => {
    const body = criarMaloteSchema.parse(request.body);
    if (request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }

    try {
      const criado = await criarMalote(body, request.usuarioId);
      if (!criado?.id) return erro(reply, 400, "Malote invalido");
      return criadoId(reply, criado.id);
    } catch (error) {
      return erro(reply, 400, mensagemErroMalote(error instanceof Error ? error : new Error("Malote invalido")));
    }
  });

  app.put("/api/malotes/:maloteId", { preHandler: exigirPermissao("cadastro_malotes_editar") }, async (request, reply) => {
    const { maloteId } = maloteParamsSchema.parse(request.params);
    const body = atualizarMaloteSchema.parse(request.body);

    try {
      await atualizarMalote(maloteId, body, request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : []);
      return semConteudo(reply);
    } catch (error) {
      const mensagem = mensagemErroMalote(error instanceof Error ? error : new Error("Malote invalido"));
      if (mensagem === "Empresa nao permitida") return erro(reply, 403, mensagem, "FORBIDDEN_COMPANY");
      return erro(reply, 400, mensagem);
    }
  });
}
