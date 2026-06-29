import type { FastifyInstance } from "fastify";
import { transferenciaPayloadSchema, transferenciasQuerySchema } from "@padaria/shared/transferencias";
import { exigirAutenticacao } from "../autorizacao.js";
import { empresasPermitidas, escopoEmpresaAtiva, podeAcessarEmpresa } from "../autorizacao/empresa.js";
import { criadoId, erro, paginadoDeArray } from "../respostas.js";
import { PermissaoLancamentoInsuficienteError } from "../lancamentos/service-utils.js";
import { criarTransferencia, listarTransferencias } from "./transferencias.service.js";

export async function registrarRotasTransferencias(app: FastifyInstance): Promise<void> {
  app.get("/api/transferencias", { preHandler: exigirAutenticacao }, async (request, reply) => {
    const query = transferenciasQuerySchema.parse(request.query);
    const empresasLiberadas = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
    let escopoDados: string[] | null;
    try {
      escopoDados = escopoEmpresaAtiva(empresasLiberadas, query.empresaId);
    } catch {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    return paginadoDeArray(await listarTransferencias(query, escopoDados), query.page, query.pageSize);
  });

  app.post("/api/transferencias", async (request, reply) => {
    const dados = transferenciaPayloadSchema.parse(request.body);
    const perfil = await exigirAutenticacao(request, reply);
    if (!perfil) return;
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
      return erro(reply, 400, error instanceof Error ? error.message : "Transferencia invalida");
    }
  });
}
