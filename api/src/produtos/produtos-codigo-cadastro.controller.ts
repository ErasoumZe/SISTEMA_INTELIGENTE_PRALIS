import type { FastifyInstance, FastifyRequest } from "fastify";
import { erro, ok, type DadosExternos, type ReplyHttp } from "@padaria/shared/api";
import { z } from "zod";
import { exigirPermissao } from "../auth/guards.js";
import { empresasPermitidas } from "../auth/empresa.js";
import { mensagemDominioOuRelancar } from "../erros.js";
import { statusErroValidacao } from "../utils.js";
import {
  adotarCodigosEmLote,
  BALDES_EM_LOTE,
  CodigoCadastroError,
  decidirCodigo,
  previaCodigoCadastro
} from "./produtos-codigo-cadastro.service.js";

const corpoLote = z.object({
  confirmacao: z.string().min(1).max(80),
  balde: z.enum(BALDES_EM_LOTE).default("exato")
});
const corpoDecisao = z
  .object({
    productId: z.string().uuid(),
    codigo: z.string().trim().min(1).max(12).optional(),
    cunhar: z.boolean().optional(),
    codigoAtualEsperado: z.string().nullable(),
    confirmacao: z.string().min(1).max(80)
  })
  .refine((corpo) => Boolean(corpo.cunhar) !== Boolean(corpo.codigo), {
    message: "Escolha um código da lista OU cunhe um novo."
  });

function ator(request: FastifyRequest) {
  const perfil = request.perfilUsuario;
  return {
    administrador: perfil?.role === "usuario_admin",
    usuarioId: request.usuarioId ?? null,
    nome: perfil?.nome ?? null,
    empresasPermitidas: perfil ? empresasPermitidas(perfil) : []
  };
}

function responderErro(reply: ReplyHttp, error: DadosExternos) {
  if (error instanceof CodigoCadastroError) return erro(reply, error.status, error.message, error.code);
  const mensagem = mensagemDominioOuRelancar(error);
  return erro(reply, statusErroValidacao(mensagem), mensagem);
}

/**
 * Codigo de cadastro x SIA (oficial `/admin/produtos/codigo-cadastro/previa|adotar-exatos|decidir`, R-222).
 * So o administrador (conferido no servico). Toda troca exige a frase de confirmacao.
 */
export async function registrarRotasCodigoCadastro(app: FastifyInstance): Promise<void> {
  const guarda = { preHandler: exigirPermissao("cadastro_produtos_editar") };

  app.get("/api/produtos/codigo-cadastro/previa", guarda, async (request, reply) => {
    try {
      return ok(await previaCodigoCadastro(ator(request)));
    } catch (error) {
      return responderErro(reply, error);
    }
  });

  app.post("/api/produtos/codigo-cadastro/adotar-exatos", guarda, async (request, reply) => {
    try {
      const corpo = corpoLote.parse(request.body);
      const resultado = await adotarCodigosEmLote(ator(request), corpo.confirmacao, corpo.balde);
      request.log.info({
        evento: "produtos.codigo_cadastro.lote",
        usuarioId: request.usuarioId,
        balde: corpo.balde,
        ...resultado
      });
      return ok(resultado);
    } catch (error) {
      return responderErro(reply, error);
    }
  });

  app.post("/api/produtos/codigo-cadastro/decidir", guarda, async (request, reply) => {
    try {
      const corpo = corpoDecisao.parse(request.body);
      const resultado = await decidirCodigo(ator(request), corpo);
      request.log.info({
        evento: "produtos.codigo_cadastro.decidido",
        usuarioId: request.usuarioId,
        produtoId: corpo.productId,
        ...resultado
      });
      return ok(resultado);
    } catch (error) {
      return responderErro(reply, error);
    }
  });
}
