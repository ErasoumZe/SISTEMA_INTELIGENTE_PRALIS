import { mensagemDominioOuRelancar } from "../erros.js";
import type { FastifyInstance } from "fastify";
import { transferenciaPayloadSchema, transferenciasQuerySchema } from "@padaria/shared/transferencias";
import { exigirPermissao } from "../auth/guards.js";
import { empresasPermitidas, escopoEmpresaAtiva, podeAcessarEmpresa } from "../auth/empresa.js";
import { apiIdParamsSchema, criadoId, erro, ok, paginadoDeArray } from "@padaria/shared/api";
import { PermissaoLancamentoInsuficienteError } from "../lancamentos/lancamentos.dominio.js";
import {
  atualizarTransferencia,
  criarTransferencia,
  listarTransferencias,
  obterTransferencia
} from "./transferencias.service.js";
import { statusErroValidacao } from "../utils.js";
import { resolverEscopoListagemPorCaixa } from "../caixa/caixa.service.js";

export async function registrarRotasTransferencias(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/transferencias",
    { preHandler: exigirPermissao("transferencias_visualizar") },
    async (request, reply) => {
      const query = transferenciasQuerySchema.parse(request.query);
      const empresasLiberadas = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
      let escopoDados: string[];
      try {
        escopoDados = escopoEmpresaAtiva(empresasLiberadas, query.empresaId);
      } catch {
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      }
      const escopoCaixa = await resolverEscopoListagemPorCaixa(
        request.perfilUsuario,
        "transferencias",
        query.empresaId,
        query.caixaId
      );
      if (escopoCaixa.bloquear) return paginadoDeArray([], query.page, query.pageSize);
      const queryComCaixa = { ...query, caixaId: escopoCaixa.caixaId };
      return paginadoDeArray(await listarTransferencias(queryComCaixa, escopoDados), query.page, query.pageSize);
    }
  );

  app.post("/api/transferencias", { preHandler: exigirPermissao("transferencias_criar") }, async (request, reply) => {
    const dados = transferenciaPayloadSchema.parse(request.body);
    const perfil = request.perfilUsuario;
    if (!perfil) return erro(reply, 401, "Nao autenticado", "UNAUTHENTICATED");
    if (!podeAcessarEmpresa(perfil, dados.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    try {
      const transferencia = await criarTransferencia(dados, perfil);
      return criadoId(reply, transferencia.id);
    } catch (error) {
      if (error instanceof PermissaoLancamentoInsuficienteError) {
        return erro(reply, 403, error.message, "INSUFFICIENT_PERMISSION", { permissao: error.permissao });
      }
      return erro(reply, 400, mensagemDominioOuRelancar(error));
    }
  });

  app.get(
    "/api/transferencias/:id",
    { preHandler: exigirPermissao("transferencias_visualizar") },
    async (request, reply) => {
      const { id } = apiIdParamsSchema.parse(request.params);
      try {
        return ok(await obterTransferencia(id, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.put(
    "/api/transferencias/:id",
    { preHandler: exigirPermissao("transferencias_editar") },
    async (request, reply) => {
      const { id } = apiIdParamsSchema.parse(request.params);
      const dados = transferenciaPayloadSchema.parse(request.body);
      const perfil = request.perfilUsuario;
      if (!perfil) return erro(reply, 401, "Nao autenticado", "UNAUTHENTICATED");
      if (!podeAcessarEmpresa(perfil, dados.empresaId)) {
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      }
      try {
        return ok(await atualizarTransferencia(id, dados, perfil));
      } catch (error) {
        if (error instanceof PermissaoLancamentoInsuficienteError) {
          return erro(reply, 403, error.message, "INSUFFICIENT_PERMISSION", { permissao: error.permissao });
        }
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );
}
