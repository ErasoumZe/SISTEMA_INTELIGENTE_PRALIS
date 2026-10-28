import type { FastifyInstance, FastifyRequest } from "fastify";
import { erro, ok, type DadosExternos, type ReplyHttp } from "@padaria/shared/api";
import { z } from "zod";
import { exigirPermissao } from "../auth/guards.js";
import { empresasPermitidas } from "../auth/empresa.js";
import { mensagemDominioOuRelancar } from "../erros.js";
import { statusErroValidacao } from "../utils.js";
import { aplicarCustoMer, CustoMerError, previaCustoMer } from "./produtos-custo-mer.service.js";

const corpo = z.object({
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
  if (error instanceof CustoMerError) return erro(reply, error.status, error.message, error.code);
  const mensagem = mensagemDominioOuRelancar(error);
  return erro(reply, statusErroValidacao(mensagem), mensagem);
}

/**
 * Custo pela discriminacao (oficial `/admin/produtos/custo-discriminacao/previa` e `/custo-discriminacao`,
 * R-222/DB-05). So o administrador; so a TNP; aplicar exige a frase.
 */
export async function registrarRotasCustoMer(app: FastifyInstance): Promise<void> {
  const guarda = { preHandler: exigirPermissao("cadastro_produtos_editar") };

  app.get("/api/produtos/custo-discriminacao/previa", guarda, async (request, reply) => {
    try {
      return ok(await previaCustoMer(ator(request)));
    } catch (error) {
      return responderErro(reply, error);
    }
  });

  app.post("/api/produtos/custo-discriminacao", guarda, async (request, reply) => {
    try {
      const { confirmacao, hashPlano } = corpo.parse(request.body);
      const resultado = await aplicarCustoMer(ator(request), confirmacao, hashPlano);
      request.log.info({ evento: "produtos.custo_mer.aplicado", usuarioId: request.usuarioId, ...resultado });
      return ok(resultado);
    } catch (error) {
      return responderErro(reply, error);
    }
  });
}
