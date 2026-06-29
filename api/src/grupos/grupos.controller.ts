import type { FastifyInstance } from "fastify";
import {
  exportarGrupoSchema as exportarPayloadSchema,
  grupoParamsSchema as idParamsSchema,
  gruposQuerySchema as empresaQuerySchema,
  importarGruposSchema as importarPayloadSchema
} from "@padaria/shared/grupos";
import { criadoId, erro, ok, semConteudo } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import { escopoEmpresaAtiva, empresasPermitidas, podeAcessarEmpresa } from "../auth/empresa.js";
import { statusErroValidacao } from "../utils.js";
import { exportarGrupo, importarGrupos, listarGrupos, salvarGrupo } from "./grupos.service.js";

async function salvarGrupoEndpoint(tipo: string, id: string | null, request: { body: unknown; perfilUsuario?: Parameters<typeof podeAcessarEmpresa>[0] }, reply: Parameters<typeof erro>[0]) {
  const body = request.body as { empresaId?: string };
  if (body.empresaId && request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId)) {
    return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
  }
  try {
    const salvo = await salvarGrupo(tipo, id, request.body);
    return id ? semConteudo(reply) : criadoId(reply, salvo?.id ?? tipo);
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Dados invalidos";
    return erro(reply, statusErroValidacao(mensagem), mensagem);
  }
}

export async function registrarRotasGrupos(app: FastifyInstance): Promise<void> {
  app.get("/api/grupos", { preHandler: exigirPermissao("cadastro_grupos_visualizar") }, async (request, reply) => {
    const query = empresaQuerySchema.parse(request.query);
    try {
      const escopo = escopoEmpresaAtiva(request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [], query.empresaId);
      return listarGrupos(escopo);
    } catch (error) {
      return erro(reply, 403, error instanceof Error ? error.message : "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
  });

  app.post("/api/grupos-despesas", { preHandler: exigirPermissao("cadastro_grupos_criar") }, async (request, reply) =>
    salvarGrupoEndpoint("grupos-despesas", null, request, reply)
  );
  app.post("/api/grupos-mercadorias", { preHandler: exigirPermissao("cadastro_grupos_criar") }, async (request, reply) =>
    salvarGrupoEndpoint("grupos-mercadorias", null, request, reply)
  );
  app.post("/api/grupos-retiradas", { preHandler: exigirPermissao("cadastro_grupos_criar") }, async (request, reply) =>
    salvarGrupoEndpoint("grupos-retiradas", null, request, reply)
  );
  app.post("/api/grupos-vendas", { preHandler: exigirPermissao("cadastro_grupos_criar") }, async (request, reply) =>
    salvarGrupoEndpoint("grupos-vendas", null, request, reply)
  );

  app.put("/api/grupos-despesas/:id", { preHandler: exigirPermissao("cadastro_grupos_editar") }, async (request, reply) =>
    salvarGrupoEndpoint("grupos-despesas", (request.params as { id: string }).id, request, reply)
  );
  app.put("/api/grupos-mercadorias/:id", { preHandler: exigirPermissao("cadastro_grupos_editar") }, async (request, reply) =>
    salvarGrupoEndpoint("grupos-mercadorias", (request.params as { id: string }).id, request, reply)
  );
  app.put("/api/grupos-retiradas/:id", { preHandler: exigirPermissao("cadastro_grupos_editar") }, async (request, reply) =>
    salvarGrupoEndpoint("grupos-retiradas", (request.params as { id: string }).id, request, reply)
  );
  app.put("/api/grupos-vendas/:id", { preHandler: exigirPermissao("cadastro_grupos_editar") }, async (request, reply) =>
    salvarGrupoEndpoint("grupos-vendas", (request.params as { id: string }).id, request, reply)
  );

  app.post("/api/grupos/importar", { preHandler: exigirPermissao("cadastro_grupos_criar") }, async (request, reply) => {
    try {
      return ok(await importarGrupos(importarPayloadSchema.parse(request.body), request.perfilUsuario));
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : "Importacao invalida";
      return erro(reply, mensagem === "Empresa nao permitida" ? 403 : 400, mensagem);
    }
  });

  app.post("/api/grupos/:id/exportar", { preHandler: exigirPermissao("cadastro_grupos_criar") }, async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    try {
      return ok(await exportarGrupo(id, exportarPayloadSchema.parse(request.body), request.perfilUsuario));
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : "Copia invalida";
      return erro(reply, mensagem === "Empresa nao permitida" ? 403 : 400, mensagem);
    }
  });
}
