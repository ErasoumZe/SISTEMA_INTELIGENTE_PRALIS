import type { FastifyInstance } from "fastify";
import { dependenteParamsSchema } from "@padaria/shared/admissoes";
import { ok } from "@padaria/shared/api";
import { TETO_PUBLICO, tokenDoCabecalho } from "./convite-http.js";
import { atualizarDependente, criarDependente, excluirDependente, listarDependentes } from "./dependentes.service.js";

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
}
