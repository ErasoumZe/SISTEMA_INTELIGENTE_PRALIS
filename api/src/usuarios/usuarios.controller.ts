import type { DadosExternos } from "@padaria/shared/api";
import type { FastifyInstance } from "fastify";
import { empresasDoUsuarioPayload, usuariosQuerySchema as empresaQuerySchema } from "@padaria/shared/usuarios";
import { criadoId, erro, paginadoDeArray, semConteudo } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import { escopoEmpresaAtiva, empresasPermitidas, podeAcessarEmpresa } from "../auth/empresa.js";
import { statusErroValidacao } from "../utils.js";
import { listarUsuarios, salvarUsuario } from "./usuarios.service.js";

function empresasNaoPermitidas(body: DadosExternos, perfil: Parameters<typeof podeAcessarEmpresa>[0] | undefined) {
  const empresasBody = empresasDoUsuarioPayload(body);
  return Boolean(perfil && empresasBody.some((empresaId) => !podeAcessarEmpresa(perfil, empresaId)));
}

export async function registrarRotasUsuarios(app: FastifyInstance): Promise<void> {
  app.get("/api/usuarios", { preHandler: exigirPermissao("cadastro_usuarios_visualizar") }, async (request, reply) => {
    const query = empresaQuerySchema.parse(request.query);
    const empresasLiberadas = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
    try {
      const escopo = escopoEmpresaAtiva(empresasLiberadas, query.empresaId);
      return paginadoDeArray(await listarUsuarios(escopo), query.page, query.pageSize);
    } catch (error) {
      return erro(reply, 403, error instanceof Error ? error.message : "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
  });

  app.post("/api/usuarios", { preHandler: exigirPermissao("cadastro_usuarios_criar") }, async (request, reply) => {
    if (empresasNaoPermitidas(request.body, request.perfilUsuario))
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    try {
      const salvo = await salvarUsuario(null, request.body, request.perfilUsuario);
      return criadoId(reply, salvo.id);
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : "Dados invalidos";
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });

  app.put("/api/usuarios/:id", { preHandler: exigirPermissao("cadastro_usuarios_editar") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (empresasNaoPermitidas(request.body, request.perfilUsuario))
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    try {
      await salvarUsuario(id, request.body, request.perfilUsuario);
      return semConteudo(reply);
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : "Dados invalidos";
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });
}
