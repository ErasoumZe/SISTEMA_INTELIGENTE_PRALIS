import type { FastifyInstance } from "fastify";
import type { Permissao } from "@padaria/shared";
import { processoParamsSchema } from "@padaria/shared/admissoes";
import { ok, type DadosExternos } from "@padaria/shared/api";
import { ROTAS_QUESTOR } from "@padaria/shared/conplus";
import { exigirPermissao } from "../auth/guards.js";
import {
  listarFuncoesQuestor,
  listarTurnosQuestor,
  salvarFuncaoQuestor,
  salvarTurnoQuestor
} from "./questor-cadastros.service.js";
import {
  atualizarCodigoQuestor,
  criarCodigoQuestor,
  listarCodigosQuestor,
  obterConfiguracaoQuestor,
  salvarConfiguracaoQuestor
} from "./questor-configuracao.service.js";
import { obterContratoQuestor, salvarContratoQuestor } from "./questor-contrato-dp.service.js";
import { listarEstadoSincronizacaoConplus } from "./conplus-sincronizacao.service.js";
import {
  listarContratosColaboradoresQuestor,
  salvarContratoColaboradorQuestor
} from "./questor-contratos-colaboradores.service.js";

/**
 * Rotas de E2/E3/E4 (contrato em `docs/integracoes/conplus/API_QUESTOR_E2_E3_E4.md`).
 *
 * A permissão de configuração entra por PARÂMETRO: a proposta é `conplus_questor_configurar`, que
 * ainda não existe em `referencia-permissoes.ts` (arquivo sob o Codex). Quem registrar em `app.ts`
 * passa a permissão definitiva; o teste passa uma existente do DP.
 *
 * Erros de domínio (ErroDominio: 404/409/422/503) e Zod (400) seguem para o handler global.
 */
export async function registrarRotasQuestorConfiguracao(
  app: FastifyInstance,
  opcoes: { permissaoConfigurar: Permissao }
): Promise<void> {
  const configurar = { preHandler: exigirPermissao(opcoes.permissaoConfigurar) };
  const contratoDp = { preHandler: exigirPermissao("admissoes_processos_editar_internos") };
  const id = (params: DadosExternos) => processoParamsSchema.parse(params).id;

  // E2 — configuração e catálogo
  app.get(ROTAS_QUESTOR.configuracao, configurar, async (request) =>
    ok(await obterConfiguracaoQuestor(request.perfilUsuario))
  );
  app.put(ROTAS_QUESTOR.configuracao, configurar, async (request) =>
    ok(await salvarConfiguracaoQuestor(request.body ?? {}, request.perfilUsuario))
  );
  app.get(ROTAS_QUESTOR.codigos, configurar, async (request) =>
    ok(await listarCodigosQuestor(request.query ?? {}, request.perfilUsuario))
  );
  app.post(ROTAS_QUESTOR.codigos, configurar, async (request, reply) => {
    const criado = await criarCodigoQuestor(request.body ?? {}, request.perfilUsuario);
    return reply.status(201).send({ data: criado });
  });
  app.patch(ROTAS_QUESTOR.codigo, configurar, async (request) =>
    ok(await atualizarCodigoQuestor(id(request.params), request.body ?? {}, request.perfilUsuario))
  );

  // E3 — funções e turnos
  app.get(ROTAS_QUESTOR.funcoes, configurar, async (request) => ok(await listarFuncoesQuestor(request.perfilUsuario)));
  app.put(ROTAS_QUESTOR.funcao, configurar, async (request) =>
    ok(await salvarFuncaoQuestor(id(request.params), request.body ?? {}, request.perfilUsuario))
  );
  app.get(ROTAS_QUESTOR.turnos, configurar, async (request) => ok(await listarTurnosQuestor(request.perfilUsuario)));
  app.put(ROTAS_QUESTOR.turno, configurar, async (request) =>
    ok(await salvarTurnoQuestor(id(request.params), request.body ?? {}, request.perfilUsuario))
  );

  // Código do contrato Questor de cada vínculo (CSV de eventos variáveis)
  app.get(ROTAS_QUESTOR.contratosColaboradores, configurar, async (request) =>
    ok(await listarContratosColaboradoresQuestor(request.perfilUsuario))
  );
  app.put(ROTAS_QUESTOR.contratoColaborador, configurar, async (request) =>
    ok(await salvarContratoColaboradorQuestor(id(request.params), request.body ?? {}, request.perfilUsuario))
  );

  // Estado da busca automática Conplus — leitura para quem já vê as importações
  app.get(
    ROTAS_QUESTOR.sincronizacaoEstado,
    { preHandler: exigirPermissao("conplus_importacoes_visualizar") },
    async (request) => ok(await listarEstadoSincronizacaoConplus(request.perfilUsuario))
  );

  // E4 — contrato do DP no processo
  app.get(ROTAS_QUESTOR.contrato, contratoDp, async (request) =>
    ok(await obterContratoQuestor(id(request.params), request.perfilUsuario))
  );
  app.put(ROTAS_QUESTOR.contrato, contratoDp, async (request) =>
    ok(await salvarContratoQuestor(id(request.params), request.body ?? {}, request.perfilUsuario))
  );
}
