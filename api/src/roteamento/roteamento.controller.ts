import type { FastifyInstance } from "fastify";
import { temPermissao } from "@padaria/shared/autenticacao";
import { erro, ok } from "@padaria/shared/api";
import { formasPagamentoQuerySchema as empresaQuerySchema } from "@padaria/shared/formas-pagamento";
import { mensagemDominioOuRelancar } from "../erros.js";
import { exigirAlgumaPermissao } from "../auth/guards.js";
import { empresasPermitidas, escopoEmpresaAtiva } from "../auth/empresa.js";
import { listarPendenciasRoteamento } from "./roteamento.service.js";

export async function registrarRotasRoteamento(app: FastifyInstance): Promise<void> {
  // UM caminho para "o que esta pendente no roteamento financeiro". A rota atende dois publicos
  // diferentes com o MESMO endereco, porque e a mesma pergunta: quem configura ve o que falta
  // configurar; quem cuida do dinheiro ve quanto esta parado. Cada metade atras da sua permissao.
  app.get(
    "/api/roteamento/pendencias",
    { preHandler: exigirAlgumaPermissao(["cadastro_formas_pagamento_roteamento", "entradas_visualizar"]) },
    async (request, reply) => {
      const query = empresaQuerySchema.parse(request.query);
      try {
        const escopo = escopoEmpresaAtiva(
          request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [],
          query.empresaId
        );
        const pendencias = await listarPendenciasRoteamento(escopo, {
          podeConfigurar: temPermissao(request.perfilUsuario?.permissoes, "cadastro_formas_pagamento_roteamento"),
          // Faturamento agregado exige permissao FINANCEIRA. Quem so tem a permissao cadastral de
          // roteamento e configurador: ve o que falta configurar, nunca quanto a loja vendeu.
          podeVerFinanceiro: temPermissao(request.perfilUsuario?.permissoes, "entradas_visualizar")
        });
        return ok(pendencias);
      } catch (error) {
        return erro(reply, 403, mensagemDominioOuRelancar(error), "FORBIDDEN_COMPANY");
      }
    }
  );
}
