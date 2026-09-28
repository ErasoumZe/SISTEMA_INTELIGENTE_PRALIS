import type { FastifyInstance, FastifyReply } from "fastify";
import type { DadosExternos } from "@padaria/shared/api";
import { processoParamsSchema } from "@padaria/shared/admissoes";
import { exigirPermissao } from "../auth/guards.js";
import { criadoId, erro, ok, paginadoDeResultado, semConteudo } from "@padaria/shared/api";
import { mensagemDominioOuRelancar } from "../erros.js";
import { statusErroValidacao } from "../utils.js";
import {
  atualizarExame,
  cancelarProcesso,
  criarProcessoDireto,
  listarHistoricoProcesso,
  listarProcessos,
  listarTurnosParaAdmissao,
  obterProcesso,
  revelarCpfDoProcesso,
  salvarDadosInternos
} from "./processos.service.js";
import { efetivarProcesso } from "./efetivacao.service.js";

function responderErro(reply: FastifyReply, error: DadosExternos) {
  const mensagem = mensagemDominioOuRelancar(error);
  return erro(reply, statusErroValidacao(mensagem), mensagem);
}

/**
 * ADM-002 V0 — rotas do processo de admissao.
 *
 * NAO existe `POST /api/admissoes/processos` nem rota de "iniciar": o processo nasce dentro da
 * transacao que encerra o teste com `aprovado_para_admissao`. Um segundo caminho para o mesmo ato e
 * o defeito que a regra-mae do PROJECT_BRAIN/16 proibe.
 *
 * NAO existe `GET /api/admissoes/processos` (lista). A V0 nao tem listagem, pagina de lista nem
 * entrada de menu — chega-se ao processo so pelo teste efetivado. Lista sem filtro, sem paginacao e
 * sem dono definido seria superficie criada antes de existir necessidade.
 */
export async function registrarRotasAdmissoesProcessos(app: FastifyInstance) {
  // ADM-003 V1A: a UNICA rota que cria processo, e ela cria SO admissao direta. O contrato Zod nao
  // tem `testeId`, entao pedir origem teste por aqui e impossivel, nao apenas proibido — quem tem
  // teste continua chegando pela efetivacao, que e o unico caminho daquela origem.
  app.post(
    "/api/admissoes/processos",
    { preHandler: exigirPermissao("admissoes_processos_criar_direta") },
    async (request, reply) => {
      try {
        const criado = await criarProcessoDireto(request.body ?? {}, request.perfilUsuario);
        return criadoId(reply, criado.id);
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );

  // LISTA. Existe desde a V1A porque a admissao direta nao tem teste de onde ser alcancada. E
  // consulta: nao ha aqui nenhuma acao de iniciar, efetivar ou criar.
  app.get(
    "/api/admissoes/processos",
    { preHandler: exigirPermissao("admissoes_processos_visualizar") },
    async (request, reply) => {
      try {
        return paginadoDeResultado(await listarProcessos(request.query, request.perfilUsuario));
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );

  /**
   * Turnos da empresa para o seletor da admissao. Espelha `/api/admissoes/funcoes`, e pelo mesmo
   * motivo: `GET /api/turnos` exige `empresaId` na query e `cadastro_turnos_visualizar`, permissao
   * de outro dominio — e este modulo nao le empresa do cliente.
   */
  app.get(
    "/api/admissoes/turnos",
    { preHandler: exigirPermissao("admissoes_processos_criar_direta") },
    async (request, reply) => {
      try {
        return ok(await listarTurnosParaAdmissao(request.perfilUsuario));
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );

  app.get(
    "/api/admissoes/processos/:id",
    { preHandler: exigirPermissao("admissoes_processos_visualizar") },
    async (request, reply) => {
      try {
        const { id } = processoParamsSchema.parse(request.params);
        return ok(await obterProcesso(id, request.perfilUsuario));
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );

  app.get(
    "/api/admissoes/processos/:id/historico",
    { preHandler: exigirPermissao("admissoes_processos_visualizar") },
    async (request, reply) => {
      try {
        const { id } = processoParamsSchema.parse(request.params);
        return ok(await listarHistoricoProcesso(id, request.query, request.perfilUsuario));
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );

  app.put(
    "/api/admissoes/processos/:id/internos",
    { preHandler: exigirPermissao("admissoes_processos_editar_internos") },
    async (request, reply) => {
      try {
        const { id } = processoParamsSchema.parse(request.params);
        await salvarDadosInternos(id, request.body ?? {}, request.perfilUsuario);
        return semConteudo(reply);
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );

  // Exame admissional: permissao do BLOCO INTERNO, nao uma terceira. Quem preenche CTPS e quem
  // acompanha o exame sao a mesma pessoa; separar aqui seria permissao sem dono.
  app.put(
    "/api/admissoes/processos/:id/exame",
    { preHandler: exigirPermissao("admissoes_processos_editar_internos") },
    async (request, reply) => {
      try {
        const { id } = processoParamsSchema.parse(request.params);
        await atualizarExame(id, request.body ?? {}, request.perfilUsuario);
        return semConteudo(reply);
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );

  /**
   * REVELAR o CPF. POST, e nao GET: documento nunca entra em URL, e o ato grava trilha — as duas
   * coisas que a ADM-001 ja decidiu, no D-4 do PROJECT_BRAIN/42.
   *
   * A permissao e a de VISUALIZAR: quem pode abrir o processo pode ver o documento de quem esta
   * sendo admitido; o que muda e que agora fica registrado quem viu e quando.
   */
  app.post(
    "/api/admissoes/processos/:id/cpf",
    { preHandler: exigirPermissao("admissoes_processos_visualizar") },
    async (request, reply) => {
      try {
        const { id } = processoParamsSchema.parse(request.params);
        return ok(await revelarCpfDoProcesso(id, request.perfilUsuario));
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );

  app.post(
    "/api/admissoes/processos/:id/efetivar",
    { preHandler: exigirPermissao("admissoes_processos_efetivar") },
    async (request, reply) => {
      try {
        const { id } = processoParamsSchema.parse(request.params);
        return ok(await efetivarProcesso(id, request.perfilUsuario));
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );

  app.post(
    "/api/admissoes/processos/:id/cancelar",
    { preHandler: exigirPermissao("admissoes_processos_cancelar") },
    async (request, reply) => {
      try {
        const { id } = processoParamsSchema.parse(request.params);
        return ok(await cancelarProcesso(id, request.body, request.perfilUsuario));
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );
}
