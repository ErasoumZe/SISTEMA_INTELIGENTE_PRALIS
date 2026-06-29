import type { FastifyInstance } from "fastify";
import { formasPagamentoQuerySchema as empresaQuerySchema } from "@padaria/shared/formas-pagamento";
import { criadoId, erro, paginadoDeArray, semConteudo } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import { escopoEmpresaAtiva, empresasPermitidas, podeAcessarEmpresa } from "../auth/empresa.js";
import { statusErroValidacao } from "../utils.js";
import { listarFormasPagamento, salvarFormaPagamento } from "./formas-pagamento.service.js";

export async function registrarRotasFormasPagamento(app: FastifyInstance): Promise<void> {
  app.get("/api/formas_pagamento", { preHandler: exigirPermissao("cadastro_formas_pagamento_visualizar") }, async (request, reply) => {
    const query = empresaQuerySchema.parse(request.query);
    try {
      const escopo = escopoEmpresaAtiva(request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [], query.empresaId);
      return paginadoDeArray(await listarFormasPagamento(escopo), query.page, query.pageSize);
    } catch (error) {
      return erro(reply, 403, error instanceof Error ? error.message : "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
  });

  app.post("/api/formas-pagamento", { preHandler: exigirPermissao("cadastro_formas_pagamento_criar") }, async (request, reply) => {
    const body = request.body as { empresaId?: string };
    if (body.empresaId && request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    try {
      const salvo = await salvarFormaPagamento(null, request.body);
      return criadoId(reply, salvo?.id ?? "formas-pagamento");
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : "Dados invalidos";
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });

  app.put("/api/formas-pagamento/:id", { preHandler: exigirPermissao("cadastro_formas_pagamento_editar") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { empresaId?: string };
    if (body.empresaId && request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    try {
      await salvarFormaPagamento(id, request.body);
      return semConteudo(reply);
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : "Dados invalidos";
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });
}
