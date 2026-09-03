import type { FastifyInstance } from "fastify";
import { funcoesOperacionaisQuerySchema } from "@padaria/shared/funcoes";
import { criadoId, erro, paginadoDeArray, semConteudo } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import { escopoEmpresaAtiva, empresasPermitidas, podeAcessarEmpresa } from "../auth/empresa.js";
import { mensagemDominioOuRelancar } from "../erros.js";
import { statusErroValidacao } from "../utils.js";
import { listarFuncoesOperacionais, salvarFuncaoOperacional } from "./funcoes.service.js";

/**
 * Catalogo de funcoes operacionais — o que a pessoa FAZ.
 *
 * TRES rotas, e a quarta nao existe de proposito: **nao ha DELETE**. Funcao sai de circulacao por
 * `ativo = false` e volta por `ativo = true`. Excluir apagaria a leitura do periodo de teste e do
 * processo de admissao que apontam para ela, e por isso nao ha permissao `_excluir` no catalogo:
 * permissao para um ato que nao existe seria concedida hoje e usada no dia em que alguem criasse a
 * rota sem reabrir a decisao.
 *
 * A empresa vem do cliente e e validada contra o escopo do perfil, como no catalogo de Turnos —
 * este e cadastro, e a tela tem seletor de empresa. E diferente de Admissoes, onde a empresa e
 * derivada do perfil e nunca lida do cliente; as duas telas de admissao continuam consumindo a
 * propria rota (`GET /api/admissoes/funcoes`), que nao mudou.
 */
export async function registrarRotasFuncoesOperacionais(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/funcoes-operacionais",
    { preHandler: exigirPermissao("cadastro_funcoes_visualizar") },
    async (request, reply) => {
      const query = funcoesOperacionaisQuerySchema.parse(request.query);
      try {
        const escopo = escopoEmpresaAtiva(
          request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [],
          query.empresaId
        );
        return paginadoDeArray(await listarFuncoesOperacionais(escopo), query.page, query.pageSize);
      } catch (error) {
        return erro(reply, 403, mensagemDominioOuRelancar(error), "FORBIDDEN_COMPANY");
      }
    }
  );

  app.post(
    "/api/funcoes-operacionais",
    { preHandler: exigirPermissao("cadastro_funcoes_criar") },
    async (request, reply) => {
      const body = request.body as { empresaId?: string };
      if (body.empresaId && request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId)) {
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      }
      try {
        const salva = await salvarFuncaoOperacional(null, request.body);
        return criadoId(reply, salva.id);
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  /**
   * Editar cobre TRES atos que a tela apresenta separados: renomear, trocar o CBO e ligar/desligar
   * a funcao. Sao a mesma escrita na mesma linha — separar em rotas faria tres caminhos para
   * `UPDATE funcoes_operacionais`, e a regra-mae proibe o segundo, quanto mais o terceiro.
   */
  app.put(
    "/api/funcoes-operacionais/:id",
    { preHandler: exigirPermissao("cadastro_funcoes_editar") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { empresaId?: string };
      if (body.empresaId && request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId)) {
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      }
      try {
        await salvarFuncaoOperacional(id, request.body);
        return semConteudo(reply);
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );
}
