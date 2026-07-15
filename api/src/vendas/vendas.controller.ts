import { mensagemDominioOuRelancar } from "../erros.js";
import type { FastifyInstance } from "fastify";
import { vendaParamsSchema, vendaPayloadSchema, vendasQuerySchema } from "@padaria/shared/vendas";
import { exigirPermissao } from "../auth/guards.js";
import { empresasPermitidas, escopoEmpresaAtiva, podeAcessarEmpresa } from "../auth/empresa.js";
import { criadoId, erro, ok, paginadoDeArray } from "@padaria/shared/api";
import { PermissaoLancamentoInsuficienteError } from "../lancamentos/lancamentos.dominio.js";
import { atualizarVenda, criarVenda, listarVendas, obterVenda, totaisVendas } from "./vendas.service.js";
import { statusErroValidacao } from "../utils.js";
import { resolverEscopoListagemPorCaixa } from "../caixa/caixa.service.js";

export async function registrarRotasVendas(app: FastifyInstance): Promise<void> {
  app.get("/api/vendas", { preHandler: exigirPermissao("entradas_visualizar") }, async (request, reply) => {
    const query = vendasQuerySchema.parse(request.query);
    const empresasLiberadas = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
    let escopoDados: string[];
    try {
      escopoDados = escopoEmpresaAtiva(empresasLiberadas, query.empresaId);
    } catch {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }

    const escopoCaixa = await resolverEscopoListagemPorCaixa(
      request.perfilUsuario,
      "entradas",
      query.empresaId,
      query.caixaId
    );
    if (escopoCaixa.bloquear) return paginadoDeArray([], query.page, query.pageSize);
    const queryComCaixa = { ...query, caixaId: escopoCaixa.caixaId };
    return paginadoDeArray(await listarVendas(queryComCaixa, escopoDados), query.page, query.pageSize);
  });

  app.get(
    "/api/relatorios/vendas",
    { preHandler: exigirPermissao("relatorio_vendas_visualizar") },
    async (request, reply) => {
      const query = vendasQuerySchema.parse(request.query);
      const empresasLiberadas = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
      let escopoDados: string[];
      try {
        escopoDados = escopoEmpresaAtiva(empresasLiberadas, query.empresaId);
      } catch {
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      }

      // Relatorios consultam o historico da empresa inteira. A regra operacional de
      // "somente caixa aberto" pertence a /api/vendas e nao pode ocultar vendas antigas.
      return paginadoDeArray(await listarVendas(query, escopoDados), query.page, query.pageSize);
    }
  );

  // Rodape do relatorio: total geral + subtotais por forma de pagamento sobre TODO o filtro.
  app.get(
    "/api/relatorios/vendas/totais",
    { preHandler: exigirPermissao("relatorio_vendas_visualizar") },
    async (request, reply) => {
      const query = vendasQuerySchema.parse(request.query);
      const empresasLiberadas = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
      let escopoDados: string[];
      try {
        escopoDados = escopoEmpresaAtiva(empresasLiberadas, query.empresaId);
      } catch {
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      }
      return ok(await totaisVendas(query, escopoDados));
    }
  );

  app.post("/api/vendas", { preHandler: exigirPermissao("entradas_criar") }, async (request, reply) => {
    const dados = vendaPayloadSchema.parse(request.body);
    const perfil = request.perfilUsuario;
    if (!perfil) return erro(reply, 401, "Nao autenticado", "UNAUTHENTICATED");

    if (!podeAcessarEmpresa(perfil, dados.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }

    try {
      const venda = await criarVenda(dados, perfil);
      return criadoId(reply, venda.id);
    } catch (error) {
      if (error instanceof PermissaoLancamentoInsuficienteError) {
        return erro(reply, 403, error.message, "INSUFFICIENT_PERMISSION", { permissao: error.permissao });
      }
      return erro(reply, 400, mensagemDominioOuRelancar(error));
    }
  });

  app.get("/api/vendas/:vendaId", { preHandler: exigirPermissao("entradas_visualizar") }, async (request, reply) => {
    const { vendaId } = vendaParamsSchema.parse(request.params);
    try {
      return ok(await obterVenda(vendaId, request.perfilUsuario!));
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });

  app.put("/api/vendas/:vendaId", { preHandler: exigirPermissao("entradas_editar") }, async (request, reply) => {
    const { vendaId } = vendaParamsSchema.parse(request.params);
    const dados = vendaPayloadSchema.parse(request.body);
    const perfil = request.perfilUsuario;
    if (!perfil) return erro(reply, 401, "Nao autenticado", "UNAUTHENTICATED");
    if (!podeAcessarEmpresa(perfil, dados.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    try {
      return ok(await atualizarVenda(vendaId, dados, perfil));
    } catch (error) {
      if (error instanceof PermissaoLancamentoInsuficienteError) {
        return erro(reply, 403, error.message, "INSUFFICIENT_PERMISSION", { permissao: error.permissao });
      }
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });
}
