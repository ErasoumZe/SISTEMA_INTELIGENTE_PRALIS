import type { FastifyInstance, FastifyRequest } from "fastify";
import { erro, ok, type DadosExternos, type ReplyHttp } from "@padaria/shared/api";
import { z } from "zod";
import { mensagemDominioOuRelancar } from "../erros.js";
import { exigirPermissao } from "../auth/guards.js";
import { empresasPermitidas } from "../auth/empresa.js";
import { statusErroValidacao } from "../utils.js";
import { aplicarDeParaSia, DeParaSiaError, previaDeParaSia, type ArquivoDoSia } from "./produtos-sia-depara.service.js";

/** A exportacao do SIA tem ~4 mil linhas e 340 colunas: 20 MB sobra. */
const TAMANHO_MAXIMO_DO_ARQUIVO = 20 * 1024 * 1024;

const querySia = z.object({
  empresaId: z.string().uuid(),
  confirmacao: z.string().trim().max(80).optional()
});

function ator(request: FastifyRequest) {
  const perfil = request.perfilUsuario;
  return {
    administrador: perfil?.role === "usuario_admin",
    empresasPermitidas: perfil ? empresasPermitidas(perfil) : []
  };
}

async function arquivoDaRequisicao(request: FastifyRequest): Promise<ArquivoDoSia | null> {
  const arquivo = await request.file({ limits: { fileSize: TAMANHO_MAXIMO_DO_ARQUIVO, files: 1 } });
  if (!arquivo) return null;
  return { nome: arquivo.filename, bytes: await arquivo.toBuffer() };
}

function responderErro(reply: ReplyHttp, error: DadosExternos) {
  if (error instanceof DeParaSiaError) return erro(reply, error.status, error.message, error.code);
  const mensagem = mensagemDominioOuRelancar(error);
  return erro(reply, statusErroValidacao(mensagem), mensagem);
}

/**
 * De-para do SIA por loja (oficial `/admin/creare/depara`): a previa confere sem gravar; aplicar
 * substitui o de-para da loja inteiro. So o administrador (conferido no servico).
 */
export async function registrarRotasDeParaSia(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/produtos/sia-depara/previa",
    { preHandler: exigirPermissao("cadastro_produtos_editar") },
    async (request, reply) => {
      const { empresaId } = querySia.parse(request.query);
      try {
        const arquivo = await arquivoDaRequisicao(request);
        if (!arquivo) return erro(reply, 400, "Envie a exportação do SIA.", "FILE_REQUIRED");
        return ok(await previaDeParaSia(empresaId, arquivo, ator(request)));
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );

  app.post(
    "/api/produtos/sia-depara",
    { preHandler: exigirPermissao("cadastro_produtos_editar") },
    async (request, reply) => {
      const { empresaId, confirmacao } = querySia.parse(request.query);
      try {
        const arquivo = await arquivoDaRequisicao(request);
        if (!arquivo) return erro(reply, 400, "Envie a exportação do SIA.", "FILE_REQUIRED");
        const resultado = await aplicarDeParaSia(empresaId, arquivo, confirmacao ?? "", ator(request));
        request.log.info({
          evento: "produtos.sia_depara.substituido",
          usuarioId: request.usuarioId,
          empresaId,
          gravadas: resultado.gravadas,
          substituidas: resultado.substituidas
        });
        return ok(resultado);
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );
}
