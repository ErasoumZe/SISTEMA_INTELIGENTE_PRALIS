import type { FastifyInstance, FastifyRequest } from "fastify";
import { erro, ok, type DadosExternos, type ReplyHttp } from "@padaria/shared/api";
import { z } from "zod";
import { exigirPermissao } from "../auth/guards.js";
import { empresasPermitidas } from "../auth/empresa.js";
import { mensagemDominioOuRelancar } from "../erros.js";
import { statusErroValidacao } from "../utils.js";
import { aplicarGruposOficiais, previaGruposOficiais } from "./produtos-grupos-oficiais.service.js";
import { aplicarVinculoBase, previaVinculoBase, VinculoBaseError } from "./produtos-vinculo-base.service.js";

const empresa = z.object({ empresaId: z.string().uuid() });
const corpo = empresa.extend({
  confirmacao: z.string().min(1).max(80),
  hashPlano: z.string().regex(/^[a-f0-9]{64}$/u)
});

function ator(request: FastifyRequest) {
  const perfil = request.perfilUsuario;
  return {
    administrador: perfil?.role === "usuario_admin",
    empresasPermitidas: perfil ? empresasPermitidas(perfil) : []
  };
}

function responderErro(reply: ReplyHttp, error: DadosExternos) {
  if (error instanceof VinculoBaseError) return erro(reply, error.status, error.message, error.code);
  const mensagem = mensagemDominioOuRelancar(error);
  return erro(reply, statusErroValidacao(mensagem), mensagem);
}

/**
 * Passos da virada do cadastro (R-222), so administrador, sempre previa + frase + hash:
 * ligar os produtos da loja a BASE e criar na loja os grupos oficiais e as unidades (fase B1).
 */
export async function registrarRotasVinculoBase(app: FastifyInstance): Promise<void> {
  const guarda = { preHandler: exigirPermissao("cadastro_produtos_editar") };

  app.get("/api/produtos/vinculo-base/previa", guarda, async (request, reply) => {
    try {
      const { empresaId } = empresa.parse(request.query);
      return ok(await previaVinculoBase(empresaId, ator(request)));
    } catch (error) {
      return responderErro(reply, error);
    }
  });

  app.post("/api/produtos/vinculo-base", guarda, async (request, reply) => {
    try {
      const { empresaId, ...entrada } = corpo.parse(request.body);
      const resultado = await aplicarVinculoBase(empresaId, entrada, ator(request));
      request.log.info({
        evento: "produtos.vinculo_base.aplicado",
        usuarioId: request.usuarioId,
        empresaId,
        ...resultado
      });
      return ok(resultado);
    } catch (error) {
      return responderErro(reply, error);
    }
  });

  app.get("/api/produtos/grupos-oficiais/previa", guarda, async (request, reply) => {
    try {
      const { empresaId } = empresa.parse(request.query);
      return ok(await previaGruposOficiais(empresaId, ator(request)));
    } catch (error) {
      return responderErro(reply, error);
    }
  });

  app.post("/api/produtos/grupos-oficiais", guarda, async (request, reply) => {
    try {
      const { empresaId, ...entrada } = corpo.parse(request.body);
      const resultado = await aplicarGruposOficiais(empresaId, entrada, ator(request));
      request.log.info({
        evento: "produtos.grupos_oficiais.aplicado",
        usuarioId: request.usuarioId,
        empresaId,
        ...resultado
      });
      return ok(resultado);
    } catch (error) {
      return responderErro(reply, error);
    }
  });
}
