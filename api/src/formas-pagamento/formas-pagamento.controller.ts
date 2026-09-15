import { mensagemDominioOuRelancar } from "../erros.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { formasPagamentoQuerySchema as empresaQuerySchema } from "@padaria/shared/formas-pagamento";
import { criadoId, erro, paginadoDeArray, semConteudo } from "@padaria/shared/api";
import { temPermissao } from "@padaria/shared/autenticacao";
import { exigirAlgumaPermissao, exigirPermissao } from "../auth/guards.js";
import { escopoEmpresaAtiva, empresasPermitidas, podeAcessarEmpresa } from "../auth/empresa.js";
import { statusErroValidacao } from "../utils.js";
import {
  listarFormasPagamento,
  listarRegrasRecebimento,
  salvarFormaPagamento,
  salvarRegraRecebimento
} from "./formas-pagamento.service.js";

// A permissao dedicada da R-176 e o autor da mudanca, lidos uma vez so. O POST importa tanto quanto
// o PUT: o Financeiro tem `cadastro_formas_pagamento_criar` e, sem este corte, o roteamento entraria
// de carona na CRIACAO da forma.
function contextoRoteamento(request: FastifyRequest): { podeRotear: boolean; usuarioId: string | null } {
  return {
    podeRotear: temPermissao(request.perfilUsuario?.permissoes, "cadastro_formas_pagamento_roteamento"),
    usuarioId: request.perfilUsuario?.usuarioId ?? null
  };
}

export async function registrarRotasFormasPagamento(app: FastifyInstance): Promise<void> {
  // Lista consumida como OPCAO/filtro (relatorio de vendas) e para RESOLVER o nome da forma no
  // detalhe da venda na tela de Entradas. Por isso aceita entradas_visualizar (o operador de caixa
  // ve as entradas e precisa do nome da forma) e relatorio_vendas_visualizar, alem do cadastro.
  app.get(
    "/api/formas_pagamento",
    {
      preHandler: exigirAlgumaPermissao([
        "cadastro_formas_pagamento_visualizar",
        "relatorio_vendas_visualizar",
        "entradas_visualizar"
      ])
    },
    async (request, reply) => {
      const query = empresaQuerySchema.parse(request.query);
      try {
        const escopo = escopoEmpresaAtiva(
          request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [],
          query.empresaId
        );
        // R-176: as colunas de roteamento carregam id de CONTA e so saem para quem tem a permissao
        // dedicada. Esta rota tambem atende `entradas_visualizar` (o operador precisa do NOME da
        // forma no detalhe da venda) — sem o corte, o destino do dinheiro vazaria para ele.
        const podeVerRoteamento = temPermissao(
          request.perfilUsuario?.permissoes,
          "cadastro_formas_pagamento_roteamento"
        );
        return paginadoDeArray(await listarFormasPagamento(escopo, podeVerRoteamento), query.page, query.pageSize);
      } catch (error) {
        return erro(reply, 403, mensagemDominioOuRelancar(error), "FORBIDDEN_COMPANY");
      }
    }
  );

  app.post(
    "/api/formas-pagamento",
    { preHandler: exigirPermissao("cadastro_formas_pagamento_criar") },
    async (request, reply) => {
      const body = request.body as { empresaId?: string };
      if (body.empresaId && request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId)) {
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      }
      try {
        const salvo = await salvarFormaPagamento(null, request.body, contextoRoteamento(request));
        return criadoId(reply, salvo?.id ?? "formas-pagamento");
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  // Regras de teste ficam sob a forma de pagamento: nao ha segunda area que possa divergir do
  // roteamento. Elas ainda nao produzem efeito em venda, saldo ou liquidacao.
  app.get(
    "/api/formas-pagamento/:id/regras-recebimento",
    { preHandler: exigirPermissao("cadastro_formas_pagamento_roteamento") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const query = empresaQuerySchema.parse(request.query);
      try {
        const escopo = escopoEmpresaAtiva(
          request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [],
          query.empresaId
        );
        const empresaId = query.empresaId;
        if (!empresaId || !escopo.includes(empresaId)) {
          return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
        }
        return await listarRegrasRecebimento(id, empresaId);
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.post(
    "/api/formas-pagamento/:id/regras-recebimento",
    { preHandler: exigirPermissao("cadastro_formas_pagamento_roteamento") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { empresaId?: string };
      if (!body.empresaId || (request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId))) {
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      }
      try {
        const criada = await salvarRegraRecebimento(null, id, request.body, request.perfilUsuario?.usuarioId ?? null);
        return criadoId(reply, criada?.id ?? "regras-recebimento");
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.put(
    "/api/formas-pagamento/:id/regras-recebimento/:regraId",
    { preHandler: exigirPermissao("cadastro_formas_pagamento_roteamento") },
    async (request, reply) => {
      const { id, regraId } = request.params as { id: string; regraId: string };
      const body = request.body as { empresaId?: string };
      if (!body.empresaId || (request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId))) {
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      }
      try {
        await salvarRegraRecebimento(regraId, id, request.body, request.perfilUsuario?.usuarioId ?? null);
        return semConteudo(reply);
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.put(
    "/api/formas-pagamento/:id",
    { preHandler: exigirPermissao("cadastro_formas_pagamento_editar") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { empresaId?: string };
      if (body.empresaId && request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId)) {
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      }
      try {
        await salvarFormaPagamento(id, request.body, contextoRoteamento(request));
        return semConteudo(reply);
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );
}
