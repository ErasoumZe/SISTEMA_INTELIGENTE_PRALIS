import type { FastifyInstance } from "fastify";
import { movimentacaoPayloadSchema, movimentacaoQuerySchema } from "@padaria/shared/movimentacao";
import { exigirAutenticacao } from "../autorizacao.js";
import { empresasPermitidas, escopoEmpresaAtiva, podeAcessarEmpresa } from "../autorizacao/empresa.js";
import {
  criarMovimentacao,
  listarMovimentacoes,
  PermissaoMovimentacaoInsuficienteError
} from "./movimentacao.service.js";

export async function registrarRotasMovimentacao(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/movimentacoes",
    {
      preHandler: async (request, reply) => {
        await exigirAutenticacao(request, reply);
      }
    },
    async (request, reply) => {
      const query = movimentacaoQuerySchema.parse(request.query);
      const empresasLiberadas = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
      let escopoDados: string[] | null;
      try {
        escopoDados = escopoEmpresaAtiva(empresasLiberadas, query.empresaId);
      } catch (error) {
        return reply.status(403).send({ erro: "Empresa nao permitida" });
      }

      return listarMovimentacoes(query, escopoDados);
    }
  );

  app.post("/api/movimentacoes", async (request, reply) => {
    const dados = movimentacaoPayloadSchema.parse(request.body);
    const perfil = await exigirAutenticacao(request, reply);
    if (!perfil) return;

    if (!podeAcessarEmpresa(perfil, dados.empresaId)) {
      return reply.status(403).send({ erro: "Empresa nao permitida" });
    }

    try {
      const movimentacao = await criarMovimentacao(dados, perfil);
      return reply.status(201).send(movimentacao);
    } catch (error) {
      if (error instanceof PermissaoMovimentacaoInsuficienteError) {
        return reply.status(403).send({ erro: error.message, permissao: error.permissao });
      }

      return reply.status(400).send({ erro: error instanceof Error ? error.message : "Movimentacao invalida" });
    }
  });
}
