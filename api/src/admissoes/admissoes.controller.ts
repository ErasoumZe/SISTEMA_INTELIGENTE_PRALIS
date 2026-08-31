import type { FastifyInstance, FastifyReply } from "fastify";
import type { DadosExternos } from "@padaria/shared/api";
import {
  historicoQuerySchema,
  testeParamsSchema,
  testesQuerySchema
} from "@padaria/shared/admissoes";
import { criadoId, erro, ok, paginadoDeResultado, semConteudo } from "@padaria/shared/api";
import { exigirAlgumaPermissao, exigirPermissao } from "../auth/guards.js";
import { mensagemDominioOuRelancar } from "../erros.js";
import { statusErroValidacao } from "../utils.js";
import {
  cancelarTeste,
  criarTeste,
  editarTeste,
  encerrarTeste,
  listarFuncoesAdmissoes,
  listarHistorico,
  listarTestes,
  obterTeste,
  revelarCpf,
  verificarCpf
} from "./admissoes.service.js";

// Traduz o `new Error` das validacoes de regra (`falharValidacao`) em 4xx. `ErroDominio` NAO passa
// por aqui: `mensagemDominioOuRelancar` o relanca e o handler global de app.ts responde com o status
// e o `code` proprios. Falha tecnica tambem e relancada e vira 500 logado, nunca 400 com texto cru.
function responderErro(reply: FastifyReply, error: DadosExternos) {
  const mensagem = mensagemDominioOuRelancar(error);
  return erro(reply, statusErroValidacao(mensagem), mensagem);
}

export async function registrarRotasAdmissoes(app: FastifyInstance) {
  // NENHUMA rota deste modulo le empresa do cliente. Nao ha `?empresaId=`, nao ha `empresaId` no
  // corpo e nao ha seletor na tela: o service deriva de `perfil.empresaId` e recusa com 403 se ela
  // nao existir ou estiver fora do escopo do ator.
  //
  // As permissoes sao PROPRIAS da admissao. `cadastro_colaboradores_*` nao abre nada aqui, e estas
  // nao abrem nada no cadastro operacional.

  app.get(
    "/api/admissoes/testes",
    { preHandler: exigirPermissao("admissoes_testes_visualizar") },
    async (request, reply) => {
      const query = testesQuerySchema.parse(request.query);
      try {
        return paginadoDeResultado(await listarTestes(query, request.perfilUsuario));
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );

  // FUNCOES OPERACIONAIS da empresa derivada. Nao e `GET /api/cargos`: aquilo lista cargo de ACESSO
  // e exige `cadastro_colaboradores_visualizar`, permissao de outro dominio. Catalogos distintos.
  //
  // Catalogo COMPARTILHADO: a mesma funcao e campo obrigatorio do teste (ADM-001) e do processo
  // direto (ADM-003). Exigir so `admissoes_testes_visualizar` invertia a fronteira que este modulo
  // declara — o processo passava a depender de testes — e deixava um perfil com direito de criar
  // admissao direta sem conseguir carregar o proprio formulario. Mesmo motivo e mesma forma do
  // `GET /api/turnos`, que aceita `caixa_operar` alem do cadastro. Quem nao tem nenhuma das duas
  // continua recebendo 403.
  app.get(
    "/api/admissoes/funcoes",
    {
      preHandler: exigirAlgumaPermissao([
        "admissoes_testes_visualizar",
        "admissoes_processos_criar_direta"
      ])
    },
    async (request, reply) => {
      try {
        return ok(await listarFuncoesAdmissoes(request.perfilUsuario));
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );

  // POST, e nao GET com `?cpf=`: query string entra em log de acesso, historico do navegador e
  // cabecalho `referer`. Responde dois booleanos, sem id, nome ou vinculo.
  app.post(
    "/api/admissoes/testes/verificar-cpf",
    { preHandler: exigirAlgumaPermissao(["admissoes_testes_criar", "admissoes_testes_editar"]) },
    async (request, reply) => {
      try {
        return ok(await verificarCpf(request.body ?? {}, request.perfilUsuario));
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );

  app.post(
    "/api/admissoes/testes",
    { preHandler: exigirPermissao("admissoes_testes_criar") },
    async (request, reply) => {
      try {
        // `?? {}`: corpo JSON `null` faria o Zod receber `null` e estourar antes da mensagem util.
        const criado = await criarTeste(request.body ?? {}, request.perfilUsuario);
        return criadoId(reply, criado.id);
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );

  app.get(
    "/api/admissoes/testes/:id",
    { preHandler: exigirPermissao("admissoes_testes_visualizar") },
    async (request, reply) => {
      const { id } = testeParamsSchema.parse(request.params);
      try {
        return ok(await obterTeste(id, request.perfilUsuario));
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );

  app.get(
    "/api/admissoes/testes/:id/historico",
    { preHandler: exigirPermissao("admissoes_testes_visualizar") },
    async (request, reply) => {
      const { id } = testeParamsSchema.parse(request.params);
      const query = historicoQuerySchema.parse(request.query);
      try {
        return paginadoDeResultado(await listarHistorico(id, query, request.perfilUsuario));
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );

  // Revelar o CPF do detalhe e POST porque TEM efeito: grava o evento `cpf_revelado` na trilha, na
  // mesma transacao da leitura. Se a auditoria falhar, o CPF nao sai.
  app.post(
    "/api/admissoes/testes/:id/cpf",
    { preHandler: exigirPermissao("admissoes_testes_visualizar") },
    async (request, reply) => {
      const { id } = testeParamsSchema.parse(request.params);
      try {
        return ok(await revelarCpf(id, request.perfilUsuario));
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );

  app.put(
    "/api/admissoes/testes/:id",
    { preHandler: exigirPermissao("admissoes_testes_editar") },
    async (request, reply) => {
      const { id } = testeParamsSchema.parse(request.params);
      try {
        await editarTeste(id, request.body ?? {}, request.perfilUsuario);
        return semConteudo(reply);
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );

  app.post(
    "/api/admissoes/testes/:id/encerrar",
    { preHandler: exigirPermissao("admissoes_testes_encerrar") },
    async (request, reply) => {
      const { id } = testeParamsSchema.parse(request.params);
      try {
        // Unica rota de escrita deste modulo que NAO responde 204: a efetivacao precisa devolver o
        // processo que nasceu dela. E o que faz "Efetivar para admissao" ser o caminho unico — o
        // processo nasce na mesma transacao, sem segundo passo manual. Com 204 a resposta vinha sem
        // corpo e `processoId` era sempre undefined.
        //
        // A TELA nao navega para o processo ao efetivar: `AdmissoesTestesPage.encerrar` reabre o
        // detalhe do proprio teste e avisa. Chegar ao processo e ato separado, pelo "Ver processo"
        // do painel do teste — quem acabou de decidir o desfecho nem sempre vai tratar da admissao
        // agora.
        //
        // So `processoId` sai daqui: o resto do teste (CPF inclusive) volta pelo GET de detalhe,
        // que ja tem a projecao certa.
        const { processoId } = await encerrarTeste(id, request.body ?? {}, request.perfilUsuario);
        return ok({ processoId });
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );

  // "Excluir" da tela chama ESTA rota. Nao existe DELETE fisico nesta vertical: o historico
  // referencia a raiz com `on delete cascade`, entao apagar a linha apagaria a auditoria junto.
  app.post(
    "/api/admissoes/testes/:id/cancelar",
    { preHandler: exigirPermissao("admissoes_testes_cancelar") },
    async (request, reply) => {
      const { id } = testeParamsSchema.parse(request.params);
      try {
        await cancelarTeste(id, request.body ?? {}, request.perfilUsuario);
        return semConteudo(reply);
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );
}
