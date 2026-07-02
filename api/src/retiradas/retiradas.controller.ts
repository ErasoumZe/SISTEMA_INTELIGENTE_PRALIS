import { mensagemDominioOuRelancar } from "../erros.js";
import type { FastifyInstance } from "fastify";
import { retiradaPayloadSchema, retiradasQuerySchema } from "@padaria/shared/retiradas";
import { exigirPermissao } from "../auth/guards.js";
import { empresasPermitidas, escopoEmpresaAtiva, podeAcessarEmpresa } from "../auth/empresa.js";
import { apiIdParamsSchema, criadoId, erro, ok, paginadoDeArray } from "@padaria/shared/api";
import { PermissaoLancamentoInsuficienteError } from "../lancamentos/lancamentos.dominio.js";
import { atualizarRetirada, criarRetirada, listarRetiradas, obterRetirada } from "./retiradas.service.js";
import { statusErroValidacao } from "../utils.js";
import { resolverEscopoListagemPorCaixa } from "../caixa/caixa.service.js";

export async function registrarRotasRetiradas(app: FastifyInstance): Promise<void> {
  app.get("/api/retiradas", { preHandler: exigirPermissao("retiradas_visualizar") }, async (request, reply) => {
    const query = retiradasQuerySchema.parse(request.query);
    const empresasLiberadas = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
    let escopoDados: string[];
    try {
      escopoDados = escopoEmpresaAtiva(empresasLiberadas, query.empresaId);
    } catch {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    const escopoCaixa = await resolverEscopoListagemPorCaixa(
      request.perfilUsuario,
      "retiradas",
      query.empresaId,
      query.caixaId
    );
    if (escopoCaixa.bloquear) return paginadoDeArray([], query.page, query.pageSize);
    const queryComCaixa = { ...query, caixaId: escopoCaixa.caixaId };
    return paginadoDeArray(await listarRetiradas(queryComCaixa, escopoDados), query.page, query.pageSize);
  });

  app.post("/api/retiradas", { preHandler: exigirPermissao("retiradas_criar") }, async (request, reply) => {
    const dados = retiradaPayloadSchema.parse(request.body);
    const perfil = request.perfilUsuario;
    if (!perfil) return erro(reply, 401, "Nao autenticado", "UNAUTHENTICATED");
    if (!podeAcessarEmpresa(perfil, dados.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    try {
      const retirada = await criarRetirada(dados, perfil);
      return criadoId(reply, retirada.id);
    } catch (error) {
      if (error instanceof PermissaoLancamentoInsuficienteError) {
        return erro(reply, 403, error.message, "INSUFFICIENT_PERMISSION", { permissao: error.permissao });
      }
      return erro(reply, 400, mensagemDominioOuRelancar(error));
    }
  });

  app.get("/api/retiradas/:id", { preHandler: exigirPermissao("retiradas_visualizar") }, async (request, reply) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    try {
      return ok(await obterRetirada(id, request.perfilUsuario!));
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });

  app.put("/api/retiradas/:id", { preHandler: exigirPermissao("retiradas_editar") }, async (request, reply) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    const dados = retiradaPayloadSchema.parse(request.body);
    const perfil = request.perfilUsuario;
    if (!perfil) return erro(reply, 401, "Nao autenticado", "UNAUTHENTICATED");
    if (!podeAcessarEmpresa(perfil, dados.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    try {
      return ok(await atualizarRetirada(id, dados, perfil));
    } catch (error) {
      if (error instanceof PermissaoLancamentoInsuficienteError) {
        return erro(reply, 403, error.message, "INSUFFICIENT_PERMISSION", { permissao: error.permissao });
      }
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });
}
