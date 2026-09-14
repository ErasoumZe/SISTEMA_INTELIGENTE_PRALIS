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
    { preHandler: exigirAlgumaPermissao(["cadastro_formas_pagamento_roteamento", "relatorio_vendas_visualizar"]) },
    async (request, reply) => {
      const query = empresaQuerySchema.parse(request.query);
      try {
        const escopo = escopoEmpresaAtiva(
          request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [],
          query.empresaId
        );
        const pendencias = await listarPendenciasRoteamento(escopo, {
          podeConfigurar: temPermissao(request.perfilUsuario?.permissoes, "cadastro_formas_pagamento_roteamento"),
          // `relatorio_vendas_visualizar`, e NAO `entradas_visualizar`. A diferenca e grande: quem tem
          // `entradas_visualizar` e o OPERADOR DE CAIXA, e a permissao dele vem acompanhada de
          // `menu_entradas_somente_caixa_aberto` — em `GET /api/vendas` o servidor o prende ao dia
          // contabil do caixa que ele tem aberto. Esta rota nao tem esse recorte, entao usar a mesma
          // permissao aqui entregaria a ele o faturamento pendente da EMPRESA INTEIRA, de todos os
          // PDVs e de todos os dias, numa tela que ele ja abre. E o que o doc 32 §13 mandou desde o
          // inicio: o valor fica atras da permissao de relatorio de vendas.
          podeVerFinanceiro: temPermissao(request.perfilUsuario?.permissoes, "relatorio_vendas_visualizar")
        });
        return ok(pendencias);
      } catch (error) {
        return erro(reply, 403, mensagemDominioOuRelancar(error), "FORBIDDEN_COMPANY");
      }
    }
  );
}
