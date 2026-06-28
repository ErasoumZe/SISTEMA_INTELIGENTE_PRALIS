import type { FastifyInstance } from "fastify";
import { ajusteSaldoSchema, resumoCaixaQuerySchema } from "@padaria/shared/caixa";
import { exigirPermissao } from "../autorizacao.js";
import { podeAcessarEmpresa } from "../autorizacao/empresa.js";
import { acertarSaldoCaixa, obterResumoCaixa } from "./caixa.service.js";

export async function registrarRotasCaixa(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/fechamento-caixa/resumo",
    { preHandler: exigirPermissao("fechamento_com_diferenca") },
    async (request, reply) => {
      const query = resumoCaixaQuerySchema.parse(request.query);
      if (request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, query.empresaId)) {
        return reply.status(403).send({ erro: "Empresa nao permitida" });
      }

      return obterResumoCaixa(query);
    }
  );

  app.post(
    "/api/fechamento-caixa/acertar-saldo",
    { preHandler: exigirPermissao("fechamento_com_diferenca") },
    async (request, reply) => {
      const body = ajusteSaldoSchema.parse(request.body);
      if (request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId)) {
        return reply.status(403).send({ erro: "Empresa nao permitida" });
      }

      try {
        return reply.status(201).send(await acertarSaldoCaixa(body, request.usuarioId ?? ""));
      } catch (error) {
        return reply.status(400).send({ erro: error instanceof Error ? error.message : "Fechamento invalido" });
      }
    }
  );
}
