import type { FastifyInstance } from "fastify";
import { erro, ok, semConteudo } from "@padaria/shared/api";
import { menuEmpresaPayloadSchema, menuEmpresaQuerySchema } from "@padaria/shared";
import { exigirPermissao } from "../auth/guards.js";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { atualizarMenuEmpresa, carregarMenuEmpresa } from "./menu-empresa.service.js";

export async function registrarRotasMenuEmpresa(app: FastifyInstance) {
  // Ler a ordem do menu é seguro para qualquer pessoa da empresa: as permissões ainda filtram
  // cada tela antes da renderização. Exigir acesso administrativo aqui impediria o menu comum.
  app.get("/api/menu-empresa", async (request, reply) => {
    const query = menuEmpresaQuerySchema.parse(request.query);
    if (request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, query.empresaId)) {
      return erro(reply, 403, "Empresa não permitida", "FORBIDDEN_COMPANY");
    }
    return ok(await carregarMenuEmpresa(query.empresaId));
  });

  app.put("/api/menu-empresa", { preHandler: exigirPermissao("cadastro_permissoes_editar") }, async (request, reply) => {
    const payload = menuEmpresaPayloadSchema.parse(request.body);
    if (request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, payload.empresaId)) {
      return erro(reply, 403, "Empresa não permitida", "FORBIDDEN_COMPANY");
    }
    await atualizarMenuEmpresa(payload);
    return semConteudo(reply);
  });
}
