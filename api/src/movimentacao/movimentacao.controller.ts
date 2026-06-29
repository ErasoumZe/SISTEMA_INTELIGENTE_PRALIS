import type { FastifyInstance } from "fastify";
import { movimentacaoPayloadSchema, movimentacaoQuerySchema, type TipoMovimentacao } from "@padaria/shared/movimentacao";
import { exigirAutenticacao } from "../autorizacao.js";
import { empresasPermitidas, escopoEmpresaAtiva, podeAcessarEmpresa } from "../autorizacao/empresa.js";
import {
  criarMovimentacao,
  listarMovimentacoes,
  PermissaoMovimentacaoInsuficienteError
} from "./movimentacao.service.js";

const rotasPorTipo: Array<{ path: string; tipo: TipoMovimentacao }> = [
  { path: "/api/entradas", tipo: "entrada" },
  { path: "/api/despesas", tipo: "despesa" },
  { path: "/api/mercadorias", tipo: "mercadoria" },
  { path: "/api/retiradas", tipo: "retirada" },
  { path: "/api/transferencias", tipo: "transferencia" }
];

export async function registrarRotasMovimentacao(app: FastifyInstance): Promise<void> {
  for (const rota of rotasPorTipo) {
    app.get(
      rota.path,
      {
        preHandler: async (request, reply) => {
          await exigirAutenticacao(request, reply);
        }
      },
      async (request, reply) => {
        const query = movimentacaoQuerySchema.omit({ tipo: true }).parse(request.query);
        const empresasLiberadas = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
        let escopoDados: string[] | null;
        try {
          escopoDados = escopoEmpresaAtiva(empresasLiberadas, query.empresaId);
        } catch (error) {
          return reply.status(403).send({ erro: "Empresa nao permitida" });
        }

        return listarMovimentacoes({ ...query, tipo: rota.tipo }, escopoDados);
      }
    );

    app.post(rota.path, async (request, reply) => {
      const corpo = typeof request.body === "object" && request.body !== null ? request.body : {};
      const dados = movimentacaoPayloadSchema.parse({ ...corpo, tipo: rota.tipo });
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
}
