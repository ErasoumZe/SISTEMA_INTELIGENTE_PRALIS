import type { FastifyInstance } from "fastify";
import { erro, ok } from "@padaria/shared/api";
import { bancoResponde, obterSaude } from "./saude.service.js";

export async function registrarRotasSaude(app: FastifyInstance) {
  // G-04 / D-21: o health TOCA O BANCO. Antes devolvia um objeto estático, e com o Postgres fora do
  // ar o container seguia verde no Compose e no Coolify — e o agente CREARE seguia disparando ciclo
  // atrás de ciclo contra uma API que não tinha como gravar nada.
  //
  // 503 e não 500: "estou de pé, mas sem a minha dependência" é indisponibilidade temporária, e é o
  // que faz o `r.ok` do healthcheck virar falso e o `verificarApi()` do agente abortar o ciclo. Um
  // 500 diria "bug na API", que é outra investigação.
  app.get("/health", async (_requisicao, resposta) => {
    if (!(await bancoResponde())) {
      return erro(resposta, 503, "Banco de dados indisponivel", "DATABASE_UNAVAILABLE", {
        service: "api",
        banco: "indisponivel"
      });
    }
    return ok(obterSaude());
  });
}
