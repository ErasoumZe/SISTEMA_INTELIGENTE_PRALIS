import type { FastifyInstance } from "fastify";
import { processoParamsSchema } from "@padaria/shared/admissoes";
import { ok, type DadosExternos } from "@padaria/shared/api";
import { ROTAS_EXPORTACAO_QUESTOR } from "@padaria/shared/conplus";
import { exigirPermissao } from "../auth/guards.js";
import { entregarArquivoQuestor } from "./questor-exportacao.controller.js";
import {
  atualizarEventoVariavel,
  cancelarLancamentoVariavel,
  criarEventoVariavel,
  criarLancamentoVariavel,
  gerarArquivoTecnicoEventosVariaveis,
  gerarCsvEventosVariaveis,
  importarCatalogoEventos,
  listarEventosVariaveis,
  listarLancamentosVariaveis,
  removerLancamentoVariavel,
  validarPreviaEventosVariaveis
} from "./questor-eventos.service.js";

export async function registrarRotasQuestorEventos(app: FastifyInstance): Promise<void> {
  const opcoes = { preHandler: exigirPermissao("conplus_exportar_eventos") };
  const id = (params: DadosExternos) => processoParamsSchema.parse(params).id;

  app.get(ROTAS_EXPORTACAO_QUESTOR.eventos, opcoes, async (request) =>
    ok(await listarEventosVariaveis(request.perfilUsuario))
  );
  app.post(ROTAS_EXPORTACAO_QUESTOR.eventos, opcoes, async (request, reply) =>
    reply.status(201).send({ data: await criarEventoVariavel(request.body ?? {}, request.perfilUsuario) })
  );
  app.patch(ROTAS_EXPORTACAO_QUESTOR.evento, opcoes, async (request) =>
    ok(await atualizarEventoVariavel(id(request.params), request.body ?? {}, request.perfilUsuario))
  );
  app.get(ROTAS_EXPORTACAO_QUESTOR.lancamentos, opcoes, async (request) =>
    ok(await listarLancamentosVariaveis(request.query ?? {}, request.perfilUsuario))
  );
  app.post(ROTAS_EXPORTACAO_QUESTOR.lancamentos, opcoes, async (request, reply) =>
    reply.status(201).send({ data: await criarLancamentoVariavel(request.body ?? {}, request.perfilUsuario) })
  );
  app.delete(ROTAS_EXPORTACAO_QUESTOR.lancamento, opcoes, async (request, reply) => {
    await removerLancamentoVariavel(id(request.params), request.perfilUsuario);
    return reply.status(204).send();
  });
  app.post(ROTAS_EXPORTACAO_QUESTOR.eventosPrevia, opcoes, async (request) =>
    ok(await validarPreviaEventosVariaveis(request.body ?? {}, request.perfilUsuario))
  );
  app.post(ROTAS_EXPORTACAO_QUESTOR.eventosImportar, opcoes, async (request) =>
    ok(await importarCatalogoEventos(request.body ?? {}, request.perfilUsuario))
  );
  app.post(ROTAS_EXPORTACAO_QUESTOR.eventosTecnico, opcoes, async (request, reply) =>
    entregarArquivoQuestor(
      reply,
      request.perfilUsuario,
      await gerarArquivoTecnicoEventosVariaveis(request.body ?? {}, request.perfilUsuario),
      "geracao",
      true
    )
  );
  app.post(ROTAS_EXPORTACAO_QUESTOR.lancamentoCancelar, opcoes, async (request, reply) => {
    await cancelarLancamentoVariavel(id(request.params), request.body ?? {}, request.perfilUsuario);
    return reply.status(204).send();
  });
  app.post(ROTAS_EXPORTACAO_QUESTOR.eventosDownload, opcoes, async (request, reply) =>
    entregarArquivoQuestor(
      reply,
      request.perfilUsuario,
      await gerarCsvEventosVariaveis(request.body ?? {}, request.perfilUsuario),
      "geracao"
    )
  );
}
