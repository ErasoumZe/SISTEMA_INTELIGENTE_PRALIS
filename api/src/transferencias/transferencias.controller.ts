import { mensagemDominioOuRelancar } from "../erros.js";
import type { FastifyInstance } from "fastify";
import { transferenciaPayloadSchema, transferenciasQuerySchema } from "@padaria/shared/transferencias";
import { exigirPermissao } from "../auth/guards.js";
import { empresasPermitidas, escopoEmpresaAtiva, podeAcessarEmpresa } from "../auth/empresa.js";
import { criadoId, erro, paginadoDeArray } from "@padaria/shared/api";
import { PermissaoLancamentoInsuficienteError } from "../lancamentos/lancamentos.dominio.js";
import { criarTransferencia, listarTransferencias } from "./transferencias.service.js";
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
}
