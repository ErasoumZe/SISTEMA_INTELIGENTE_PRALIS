import { mensagemDominioOuRelancar } from "../erros.js";
import type { FastifyInstance } from "fastify";
import {
  abrirCaixaPayloadSchema,
  alterarHorarioCaixaPayloadSchema,
  autorizacaoCaixaParamsSchema,
  autorizacoesCaixaQuerySchema,
  caixaParamsSchema,
  caixaStatusQuerySchema,
  cancelarSolicitacaoCofrePayloadSchema,
  editarAberturaCaixaPayloadSchema,
  executarSolicitacaoCofrePayloadSchema,
  fecharCaixaPayloadSchema,
  historicoCaixaQuerySchema,
  programarSolicitacaoCofrePayloadSchema,
  solicitacaoCofreParamsSchema,
  solicitarAutorizacaoCaixaPayloadSchema,
  transferenciaCofrePayloadSchema
} from "@padaria/shared/caixa";
import { exigirAlgumaPermissao, exigirPermissao } from "../auth/guards.js";
import { criadoId, erro, ok, paginadoDeResultado, semConteudo } from "@padaria/shared/api";
import {
  abrirCaixa,
  alterarHorarioCaixa,
  cancelarSolicitacaoCofre,
  criarTransferenciaCofreCaixa,
  editarAberturaCaixa,
  executarSolicitacaoCofre,
  fecharCaixa,
  listarCaixasAbertos,
  listarHistoricoCaixa,
  listarSolicitacoesCofre,
  obterDetalheCaixa,
  obterStatusCaixa,
  obterTransferenciasCaixa,
  programarSolicitacaoCofre
} from "./caixa.service.js";
import {
  gerarTokenAutorizacao,
  listarAutorizacoesPendentes,
  listarAutorizadoresCaixa,
  solicitarAutorizacaoCaixa
} from "./autorizacoes.service.js";

function statusErro(mensagem: string) {
  if (
    mensagem === "Empresa nao permitida" ||
    mensagem === "Caixa nao permitido" ||
    // D4: programar e cancelar sao atos da retaguarda. Recusa por PAPEL e 403, nao 400 — o payload
    // estava certo, quem nao pode e o usuario.
    mensagem === "Programar entrega ao cofre e exclusivo da retaguarda" ||
    mensagem === "Cancelar entrega ao cofre e exclusivo da retaguarda"
  ) {
    return 403;
  }
  if (mensagem === "Caixa nao encontrado" || mensagem === "Solicitacao nao encontrada") return 404;
  return 400;
}

export async function registrarRotasCaixa(app: FastifyInstance): Promise<void> {
  app.get("/api/caixa/status", { preHandler: exigirPermissao("caixa_operar") }, async (request, reply) => {
    const query = caixaStatusQuerySchema.parse(request.query);
    try {
      return ok(await obterStatusCaixa(query.empresaId, request.perfilUsuario!));
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErro(mensagem), mensagem);
    }
  });

  app.post("/api/caixa/abrir", { preHandler: exigirPermissao("caixa_operar") }, async (request, reply) => {
    const body = abrirCaixaPayloadSchema.parse(request.body);
    try {
      const status = await abrirCaixa(body, request.perfilUsuario!);
      return criadoId(reply, status.caixaAberto?.id ?? body.pdvId);
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErro(mensagem), mensagem);
    }
  });

  app.put("/api/caixa/:caixaId/abertura", { preHandler: exigirPermissao("caixa_operar") }, async (request, reply) => {
    const { caixaId } = caixaParamsSchema.parse(request.params);
    const body = editarAberturaCaixaPayloadSchema.parse(request.body);
    try {
      await editarAberturaCaixa(caixaId, body, request.perfilUsuario!);
      return semConteudo(reply);
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErro(mensagem), mensagem);
    }
  });

  app.post("/api/caixa/:caixaId/fechar", { preHandler: exigirPermissao("caixa_operar") }, async (request, reply) => {
    const { caixaId } = caixaParamsSchema.parse(request.params);
    const body = fecharCaixaPayloadSchema.parse(request.body);
    try {
      await fecharCaixa(caixaId, body, request.perfilUsuario!);
      return semConteudo(reply);
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErro(mensagem), mensagem);
    }
  });

  // M2 (R3/R4): sangria (turno) / retorno (fechamento) — caixa -> cofre, mesma entidade com tipo.
  app.post(
    "/api/caixa/:caixaId/transferencia-cofre",
    { preHandler: exigirPermissao("caixa_operar") },
    async (request, reply) => {
      const { caixaId } = caixaParamsSchema.parse(request.params);
      const body = transferenciaCofrePayloadSchema.parse(request.body);
      try {
        return ok(await criarTransferenciaCofreCaixa(caixaId, body, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  // D4: quais caixas estao abertos agora. A retaguarda precisa disso para escolher o destino da
  // solicitacao — e `/api/caixa/historico` nao serve, porque e gated por `caixas_gerenciar`, que a
  // Tesouraria nao tem. Devolve so o minimo para escolher (PDV, operador, dia).
  app.get(
    "/api/caixa/abertos",
    { preHandler: exigirAlgumaPermissao(["transferencias_criar", "caixas_gerenciar"]) },
    async (request, reply) => {
      const query = caixaStatusQuerySchema.parse(request.query);
      try {
        return ok(await listarCaixasAbertos(query.empresaId, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  // D4: a retaguarda PROGRAMA a entrega ligada ao caixa aberto. Nasce 'agendada' e nao movimenta
  // saldo nenhum.
  //
  // A permissao e `transferencias_criar` porque programar uma entrega ao cofre E criar uma
  // transferencia — a mesma entidade, o mesmo direito. `caixas_gerenciar` seria errado: a
  // Tesouraria, que e justamente quem programa, nao a tem (e nem deve ter, ela nao opera caixa).
  // O gate de permissao nao basta sozinho: o operador de caixa tambem tem `transferencias_criar`,
  // entao o PAPEL e conferido no servico por `podeLancarSemCaixa` — as duas camadas, porque uma
  // responde "pode criar transferencia?" e a outra "e retaguarda?".
  app.post(
    "/api/caixa/:caixaId/solicitacoes-cofre",
    { preHandler: exigirPermissao("transferencias_criar") },
    async (request, reply) => {
      const { caixaId } = caixaParamsSchema.parse(request.params);
      const body = programarSolicitacaoCofrePayloadSchema.parse(request.body);
      try {
        return ok(await programarSolicitacaoCofre(caixaId, body, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  // D4: o operador precisa VER o que a Tesouraria pediu. Sem isto a solicitacao existiria so no
  // banco — campo que nao aparece na tela e campo que nao existe para quem opera.
  app.get(
    "/api/caixa/:caixaId/solicitacoes-cofre",
    { preHandler: exigirAlgumaPermissao(["caixa_operar", "caixas_gerenciar", "transferencias_visualizar"]) },
    async (request, reply) => {
      const { caixaId } = caixaParamsSchema.parse(request.params);
      try {
        return ok(await listarSolicitacoesCofre(caixaId, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  // D4/decisao 2: a retaguarda CANCELA uma solicitacao ainda `agendada`, com motivo obrigatorio.
  // Mesmo par de camadas da programacao: `transferencias_criar` no gate, papel de retaguarda no
  // servico. Nao apaga a linha — grava autoria, data e motivo.
  app.post(
    "/api/caixa/:caixaId/solicitacoes-cofre/:solicitacaoId/cancelar",
    { preHandler: exigirPermissao("transferencias_criar") },
    async (request, reply) => {
      const { caixaId, solicitacaoId } = solicitacaoCofreParamsSchema.parse(request.params);
      const body = cancelarSolicitacaoCofrePayloadSchema.parse(request.body);
      try {
        return ok(await cancelarSolicitacaoCofre(caixaId, solicitacaoId, body, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  // D4: o operador EXECUTA — e so aqui o dinheiro sai do caixa, virando 'pendente' de conferencia.
  app.post(
    "/api/caixa/:caixaId/solicitacoes-cofre/:solicitacaoId/executar",
    { preHandler: exigirPermissao("caixa_operar") },
    async (request, reply) => {
      const { caixaId, solicitacaoId } = solicitacaoCofreParamsSchema.parse(request.params);
      const body = executarSolicitacaoCofrePayloadSchema.parse(request.body);
      try {
        return ok(await executarSolicitacaoCofre(caixaId, solicitacaoId, body, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  // M2 (item 4): agregacao "aba TRANSFERENCIAS" por caixa+dia (1a/2a/3a, TOTAL SAIDA/ENTRADA, SALDO).
  app.get(
    "/api/caixa/:caixaId/transferencias",
    { preHandler: exigirAlgumaPermissao(["caixa_operar", "caixas_gerenciar"]) },
    async (request, reply) => {
      const { caixaId } = caixaParamsSchema.parse(request.params);
      try {
        return ok(await obterTransferenciasCaixa(caixaId, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  // Alteracao de horario (novo fluxo): gerente/admin direto; operador via token de autorizacao.
  app.put(
    "/api/caixa/:caixaId/horario",
    { preHandler: exigirAlgumaPermissao(["caixa_operar", "caixa_alterar_horario"]) },
    async (request, reply) => {
      const { caixaId } = caixaParamsSchema.parse(request.params);
      const body = alterarHorarioCaixaPayloadSchema.parse(request.body);
      try {
        return ok(await alterarHorarioCaixa(caixaId, body, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  // Operador solicita alteracao, escolhendo o autorizador.
  app.post(
    "/api/caixa/:caixaId/autorizacoes",
    { preHandler: exigirPermissao("caixa_operar") },
    async (request, reply) => {
      const { caixaId } = caixaParamsSchema.parse(request.params);
      const body = solicitarAutorizacaoCaixaPayloadSchema.parse(request.body);
      try {
        const solicitacao = await solicitarAutorizacaoCaixa(caixaId, body, request.perfilUsuario!);
        return criadoId(reply, solicitacao.id);
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  // Fila do autorizador (badge de pendencias).
  app.get(
    "/api/caixa/autorizacoes/pendentes",
    { preHandler: exigirPermissao("caixa_alterar_horario") },
    async (request, reply) => {
      const query = autorizacoesCaixaQuerySchema.parse(request.query);
      try {
        return ok(await listarAutorizacoesPendentes(query.empresaId, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  // Autorizador gera o token (retornado UMA vez).
  app.post(
    "/api/caixa/autorizacoes/:autorizacaoId/token",
    { preHandler: exigirPermissao("caixa_alterar_horario") },
    async (request, reply) => {
      const { autorizacaoId } = autorizacaoCaixaParamsSchema.parse(request.params);
      try {
        return ok(await gerarTokenAutorizacao(autorizacaoId, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  // Lista de autorizadores da empresa (para o operador escolher).
  app.get("/api/caixa/autorizadores", { preHandler: exigirPermissao("caixa_operar") }, async (request, reply) => {
    const query = autorizacoesCaixaQuerySchema.parse(request.query);
    try {
      return ok(await listarAutorizadoresCaixa(query.empresaId, request.perfilUsuario!));
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErro(mensagem), mensagem);
    }
  });

  // Paginacao e filtros sao do banco (nao mais paginadoDeArray sobre a empresa inteira); os totais
  // do rodape acompanham o FILTRO, nao a pagina, e viajam no meta ao lado da paginacao.
  app.get("/api/caixa/historico", { preHandler: exigirPermissao("caixas_gerenciar") }, async (request, reply) => {
    const query = historicoCaixaQuerySchema.parse(request.query);
    try {
      const { itens, total, page, pageSize, totais } = await listarHistoricoCaixa(query, request.perfilUsuario!);
      const resposta = paginadoDeResultado({ itens, total, page, pageSize });
      return { ...resposta, meta: { ...resposta.meta, totais } };
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErro(mensagem), mensagem);
    }
  });

  // Detalhe de auditoria de um caixa: alteracoes de horario e acerto de saldo.
  app.get(
    "/api/caixa/:caixaId/detalhe",
    { preHandler: exigirPermissao("caixas_gerenciar") },
    async (request, reply) => {
      const params = caixaParamsSchema.parse(request.params);
      try {
        return ok(await obterDetalheCaixa(params.caixaId, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );
}
