import { mensagemDominioOuRelancar } from "../erros.js";
import type { FastifyInstance } from "fastify";
import { mercadoriaPayloadSchema, mercadoriasQuerySchema } from "@padaria/shared/mercadorias";
import { exigirPermissao } from "../auth/guards.js";
import { empresasPermitidas, escopoEmpresaAtiva, podeAcessarEmpresa } from "../auth/empresa.js";
import { apiIdParamsSchema, criadoId, erro, ok, paginadoDeArray } from "@padaria/shared/api";
import { PermissaoLancamentoInsuficienteError } from "../lancamentos/lancamentos.dominio.js";
import { atualizarMercadoria, criarMercadoria, listarMercadorias, obterMercadoria } from "./mercadorias.service.js";
import { statusErroValidacao } from "../utils.js";
import { resolverEscopoListagemPorCaixa } from "../caixa/caixa.service.js";

export async function registrarRotasMercadorias(app: FastifyInstance): Promise<void> {
  app.get("/api/mercadorias", { preHandler: exigirPermissao("mercadorias_visualizar") }, async (request, reply) => {
    const query = mercadoriasQuerySchema.parse(request.query);
    const empresasLiberadas = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
    let escopoDados: string[];
    try {
      escopoDados = escopoEmpresaAtiva(empresasLiberadas, query.empresaId);
    } catch {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    const escopoCaixa = await resolverEscopoListagemPorCaixa(
      request.perfilUsuario,
      "mercadorias",
      query.empresaId,
      query.caixaId
    );
    if (escopoCaixa.bloquear) return paginadoDeArray([], query.page, query.pageSize);
    const queryComCaixa = { ...query, caixaId: escopoCaixa.caixaId };
    return paginadoDeArray(await listarMercadorias(queryComCaixa, escopoDados), query.page, query.pageSize);
  });

  app.post("/api/mercadorias", { preHandler: exigirPermissao("mercadorias_criar") }, async (request, reply) => {
    const dados = mercadoriaPayloadSchema.parse(request.body);
    const perfil = request.perfilUsuario;
    if (!perfil) return erro(reply, 401, "Nao autenticado", "UNAUTHENTICATED");
    if (!podeAcessarEmpresa(perfil, dados.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    try {
      const mercadoria = await criarMercadoria(dados, perfil);
      return criadoId(reply, mercadoria.id);
    } catch (error) {
      if (error instanceof PermissaoLancamentoInsuficienteError) {
        return erro(reply, 403, error.message, "INSUFFICIENT_PERMISSION", { permissao: error.permissao });
      }
      return erro(reply, 400, mensagemDominioOuRelancar(error));
    }
  });

  app.get("/api/mercadorias/:id", { preHandler: exigirPermissao("mercadorias_visualizar") }, async (request, reply) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    try {
      return ok(await obterMercadoria(id, request.perfilUsuario!));
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });

  app.put("/api/mercadorias/:id", { preHandler: exigirPermissao("mercadorias_editar") }, async (request, reply) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    const dados = mercadoriaPayloadSchema.parse(request.body);
    const perfil = request.perfilUsuario;
    if (!perfil) return erro(reply, 401, "Nao autenticado", "UNAUTHENTICATED");
    if (!podeAcessarEmpresa(perfil, dados.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    try {
      return ok(await atualizarMercadoria(id, dados, perfil));
    } catch (error) {
      if (error instanceof PermissaoLancamentoInsuficienteError) {
        return erro(reply, 403, error.message, "INSUFFICIENT_PERMISSION", { permissao: error.permissao });
      }
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });
}
