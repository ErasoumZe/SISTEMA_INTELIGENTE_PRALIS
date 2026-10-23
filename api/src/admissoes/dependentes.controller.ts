import type { FastifyInstance, FastifyReply } from "fastify";
import { dependenteParamsSchema } from "@padaria/shared/admissoes";
import { ok, type DadosExternos } from "@padaria/shared/api";
import { TETO_PUBLICO, tokenDoCabecalho } from "./convite-http.js";
import { atualizarDependente, criarDependente, excluirDependente, listarDependentes } from "./dependentes.service.js";
import {
  enviarAnexoDependente,
  lerAnexoDependentePublico,
  removerAnexoDependentePublico
} from "./dependentes-anexos.service.js";
import { erro } from "@padaria/shared/api";
import { mensagemDominioOuRelancar } from "../erros.js";
import { statusErroValidacao } from "../utils.js";

function responderErro(reply: FastifyReply, error: DadosExternos) {
  const mensagem = mensagemDominioOuRelancar(error);
  return erro(reply, statusErroValidacao(mensagem), mensagem);
}

/**
 * ADM-003 V4 — as rotas publicas de dependente.
 *
 * Arquivo proprio, e nao dentro de `ficha.controller.ts`, por um motivo concreto: aquele arquivo e
 * varrido por um teste que proibe QUALQUER `:` em rota `/api/admissao*`, para provar que o token
 * nunca vira parametro de caminho. Aqui existe `:id` — que e o id do dependente, nao um segredo —, e
 * relaxar a varredura la enfraqueceria a garantia que ela existe para dar. O teste passou a varrer
 * os dois arquivos com a regra certa: o unico parametro de caminho permitido e `:id`.
 *
 * As quatro rotas devolvem o MESMO objeto: lista, declaracao e versao da ficha. Cadastrar um
 * dependente move `sem_dependentes`, e mover `sem_dependentes` sobe a versao — devolver so o item
 * criado deixaria o formulario aberto com versao velha, e o proximo rascunho morreria em 409 sem o
 * candidato ter feito nada errado.
 */
export async function registrarRotasAdmissaoDependentes(app: FastifyInstance): Promise<void> {
  app.get("/api/admissao/dependentes", TETO_PUBLICO, async (request) => {
    return ok(await listarDependentes(tokenDoCabecalho(request) ?? undefined));
  });

  app.post("/api/admissao/dependentes", TETO_PUBLICO, async (request) => {
    return ok(await criarDependente(tokenDoCabecalho(request) ?? undefined, request.body ?? {}));
  });

  app.put("/api/admissao/dependentes/:id", TETO_PUBLICO, async (request) => {
    const { id } = dependenteParamsSchema.parse(request.params);
    return ok(await atualizarDependente(tokenDoCabecalho(request) ?? undefined, id, request.body ?? {}));
  });

  app.delete("/api/admissao/dependentes/:id", TETO_PUBLICO, async (request) => {
    const { id } = dependenteParamsSchema.parse(request.params);
    return ok(await excluirDependente(tokenDoCabecalho(request) ?? undefined, id));
  });

  app.post("/api/admissao/dependentes/:id/anexos", TETO_PUBLICO, async (request, reply) => {
    try {
      const { id } = dependenteParamsSchema.parse(request.params);
      const arquivo = await request.file({ limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 1, parts: 2 } });
      const campoTipo = arquivo?.fields["tipo"];
      const tipo = campoTipo && !Array.isArray(campoTipo) && "value" in campoTipo ? String(campoTipo.value) : "";
      if (!arquivo) throw new Error("Arquivo obrigatorio");
      return reply
        .status(201)
        .send(ok(await enviarAnexoDependente(tokenDoCabecalho(request) ?? undefined, id, tipo, arquivo)));
    } catch (error) {
      return responderErro(reply, error);
    }
  });

  app.delete("/api/admissao/dependentes/:id/anexos/:anexoId", TETO_PUBLICO, async (request, reply) => {
    try {
      const { id, anexoId } = request.params as { id: string; anexoId: string };
      await removerAnexoDependentePublico(tokenDoCabecalho(request) ?? undefined, id, anexoId);
      return reply.status(204).send();
    } catch (error) {
      return responderErro(reply, error);
    }
  });

  app.get("/api/admissao/dependentes/:id/anexos/:anexoId", TETO_PUBLICO, async (request, reply) => {
    try {
      const { id, anexoId } = request.params as { id: string; anexoId: string };
      const anexo = await lerAnexoDependentePublico(tokenDoCabecalho(request) ?? undefined, id, anexoId);
      return reply
        .type(anexo.mimeType)
        .header("Content-Disposition", `inline; filename="${anexo.nomeOriginal.replace(/[^a-zA-Z0-9._-]/g, "_")}"`)
        .send(anexo.dados);
    } catch (error) {
      return responderErro(reply, error);
    }
  });
}
