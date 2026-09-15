import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { encerrarCaixaSeedAdminParaTeste } from "../../setup/caixa.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";
import { diaNegocio } from "@padaria/shared/datas";
import { notificarCampanhasNaAberturaDeCaixa } from "../../../api/src/campanhas/campanhas.service.js";
import { banco } from "../../../api/src/banco/conexao.js";

type CampanhaResposta = {
  id: string;
  totalVendido: number;
  naoAtribuido: number;
  percentualDaMeta: number;
  pdvs: { pdvId: string; vendidoNoPeriodo: number }[];
};

// R-197..R-200 — campanhas de bonificacao.
//
// O que estes testes protegem:
//   - o progresso e AO VIVO: nao existe coluna de saldo, entao cancelar uma venda muda o numero na
//     leitura seguinte, sem recalculo nenhum;
//   - a apuracao e literalmente a R-197: so CREARE, so `aprovado` ESTRITO, so o periodo, so os PDVs
//     participantes. Cada exclusao tem um caso proprio, porque cada uma delas foi uma decisao;
//   - venda sem PDV aparece como "nao atribuido" e NUNCA entra na meta (R-198);
//   - o servidor exige as permissoes, e nao apenas esconde o menu (R-200).
describe("campanhas de bonificacao", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieSemPermissao: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    await encerrarCaixaSeedAdminParaTeste();
    [cookieAdmin, cookieSemPermissao] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "semPermissao")
    ]);
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  const empresaId = idsTeste.empresaA;
  const INICIO = "2026-03-01";
  const FIM = "2026-03-31";

  async function criarCampanha(over: Record<string, unknown> = {}) {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/campanhas",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId,
        titulo: "Meta de marco",
        mensagem: "Bata a meta e ganhe a bonificacao.",
        inicio: INICIO,
        fim: FIM,
        metaValor: 1000,
        bonificacaoTipo: "dinheiro",
        bonificacaoValor: 100,
        pdvIds: [idsTeste.pdvA],
        ...over
      }
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    return json<{ data: { id: string } }>(resposta).data.id;
  }

  async function lerCampanha(campanhaId: string) {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/campanhas?empresaId=${empresaId}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(resposta);
    const campanha = json<{ data: CampanhaResposta[] }>(resposta).data.find((item) => item.id === campanhaId);
    if (!campanha) throw new Error("Campanha nao encontrada na listagem");
    return campanha;
  }

  /** Venda crua: o teste precisa controlar origem, status e PDV, que a rota de ingestao nao expoe. */
  async function inserirVenda(entrada: {
    referencia: string;
    valor: number;
    pdvId?: string | null;
    status?: string;
    computar?: boolean;
    integrada?: boolean;
    data?: string;
    empresa?: string;
  }) {
    await executarSql(
      `insert into vendas (empresa_id, integracao_chave_id, data_referencia, descricao, valor_original,
                           valor_desconto, valor_acrescimo, pdv_id, computar, status, identificador_externo)
       values ($1, $2, $3, $4, $5, 0, 0, $6, $7, $8, $9)`,
      [
        entrada.empresa ?? empresaId,
        entrada.integrada === false ? null : idsTeste.integracaoChave,
        entrada.data ?? "2026-03-10",
        `Venda ${entrada.referencia}`,
        entrada.valor,
        entrada.pdvId === undefined ? idsTeste.pdvA : entrada.pdvId,
        entrada.computar ?? true,
        entrada.status ?? "aprovado",
        `CAMPANHA-${entrada.referencia}`
      ]
    );
  }

  it("soma ao vivo apenas a venda que a R-197 manda contar", async () => {
    const campanhaId = await criarCampanha();

    await inserirVenda({ referencia: "vale-1", valor: 300 });
    await inserirVenda({ referencia: "vale-2", valor: 200 });

    // Cada linha abaixo e uma exclusao decidida, com um motivo diferente.
    await inserirVenda({ referencia: "fora-periodo", valor: 900, data: "2026-04-02" });
    await inserirVenda({ referencia: "cancelada", valor: 900, status: "cancelado" });
    await inserirVenda({ referencia: "aguardando", valor: 900, status: "aguardando_aprovacao" });
    await inserirVenda({ referencia: "nao-computa", valor: 900, computar: false });
    await inserirVenda({ referencia: "retaguarda", valor: 900, integrada: false });
    await inserirVenda({ referencia: "outro-pdv", valor: 900, pdvId: idsTeste.pdvLivre });

    const campanha = await lerCampanha(campanhaId);
    expect(campanha.totalVendido).toBe(500);
    expect(campanha.pdvs.find((pdv) => pdv.pdvId === idsTeste.pdvA)?.vendidoNoPeriodo).toBe(500);
    // 500 de 1000 = 50% da meta.
    expect(campanha.percentualDaMeta).toBe(50);
  });

  it("mostra a venda sem PDV como nao atribuida, fora da meta", async () => {
    const campanhaId = await criarCampanha({ titulo: "Meta com orfa", inicio: "2026-05-01", fim: "2026-05-31" });
    await inserirVenda({ referencia: "com-pdv", valor: 100, data: "2026-05-10" });
    await inserirVenda({ referencia: "orfa", valor: 700, pdvId: null, data: "2026-05-10" });

    const campanha = await lerCampanha(campanhaId);
    expect(campanha.totalVendido, "a orfa nao soma na meta").toBe(100);
    expect(campanha.naoAtribuido, "mas continua visivel para auditoria").toBe(700);
  });

  // R-199: sem tabela de progresso, o cancelamento posterior do CREARE reflete sozinho. Se um dia
  // alguem materializar o saldo, este teste quebra — que e exatamente o aviso desejado.
  it("reflete o cancelamento da venda na leitura seguinte, sem recalculo", async () => {
    const campanhaId = await criarCampanha({ titulo: "Meta que encolhe", inicio: "2026-06-01", fim: "2026-06-30" });
    await inserirVenda({ referencia: "fica", valor: 100, data: "2026-06-10" });
    await inserirVenda({ referencia: "some-depois", valor: 400, data: "2026-06-10" });
    expect((await lerCampanha(campanhaId)).totalVendido).toBe(500);

    await executarSql("update vendas set status = 'cancelado' where identificador_externo = $1", [
      "CAMPANHA-some-depois"
    ]);

    expect((await lerCampanha(campanhaId)).totalVendido, "sem coluna de saldo, o numero muda sozinho").toBe(100);
  });

  it("nao conta venda de outra empresa", async () => {
    const campanhaId = await criarCampanha({ titulo: "Meta isolada", inicio: "2026-07-01", fim: "2026-07-31" });
    await inserirVenda({ referencia: "empresa-a", valor: 100, data: "2026-07-10" });
    await inserirVenda({
      referencia: "empresa-b",
      valor: 5000,
      empresa: idsTeste.empresaB,
      pdvId: null,
      data: "2026-07-10"
    });

    const campanha = await lerCampanha(campanhaId);
    expect(campanha.totalVendido).toBe(100);
    expect(campanha.naoAtribuido, "a orfa da empresa B nao entra nem na auditoria da empresa A").toBe(0);
  });

  it("recusa bonificacao incoerente antes de chegar ao banco", async () => {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/campanhas",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId,
        titulo: "Incoerente",
        mensagem: "Dinheiro com texto de recompensa.",
        inicio: INICIO,
        fim: FIM,
        metaValor: 1000,
        bonificacaoTipo: "dinheiro",
        bonificacaoTexto: "uma folga",
        pdvIds: [idsTeste.pdvA]
      }
    });
    assertProblem(resposta, 400);
  });

  it("nao deixa editar campanha ja encerrada", async () => {
    const campanhaId = await criarCampanha({ titulo: "Meta encerrada" });
    const encerrar = await contexto.app.inject({
      method: "PUT",
      url: `/api/campanhas/${campanhaId}/status?empresaId=${empresaId}`,
      headers: { cookie: cookieAdmin },
      payload: { status: "encerrada" }
    });
    expect(encerrar.statusCode, encerrar.body).toBe(204);

    const edicao = await contexto.app.inject({
      method: "PUT",
      url: `/api/campanhas/${campanhaId}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId,
        titulo: "Tentando reabrir",
        mensagem: "Nao deveria passar.",
        inicio: INICIO,
        fim: FIM,
        metaValor: 5,
        bonificacaoTipo: "dinheiro",
        bonificacaoValor: 1,
        pdvIds: [idsTeste.pdvA]
      }
    });
    assertProblem(edicao, 400);
  });

  it("exige permissao no servidor, e nao apenas esconde o menu (R-200)", async () => {
    const leitura = await contexto.app.inject({
      method: "GET",
      url: `/api/campanhas?empresaId=${empresaId}`,
      headers: { cookie: cookieSemPermissao }
    });
    assertProblem(leitura, 403);

    const criacao = await contexto.app.inject({
      method: "POST",
      url: "/api/campanhas",
      headers: { cookie: cookieSemPermissao },
      payload: {
        empresaId,
        titulo: "Sem permissao",
        mensagem: "Nao deveria passar.",
        inicio: INICIO,
        fim: FIM,
        metaValor: 10,
        bonificacaoTipo: "dinheiro",
        bonificacaoValor: 1,
        pdvIds: [idsTeste.pdvA]
      }
    });
    assertProblem(criacao, 403);
  });

  it("avisa uma vez quem abre depois, apenas para campanha ativa do seu PDV, empresa e periodo", async () => {
    const hoje = diaNegocio(new Date());
    const campanhaId = await criarCampanha({ titulo: "Campanha para abertura posterior", inicio: hoje, fim: hoje });
    const ativacao = await contexto.app.inject({
      method: "PUT",
      url: `/api/campanhas/${campanhaId}/status?empresaId=${empresaId}`,
      headers: { cookie: cookieAdmin },
      payload: { status: "ativa" }
    });
    expect(ativacao.statusCode, ativacao.body).toBe(204);

    const usuarioCaixa = await consultarUm<{ id: string }>(
      'select id from "user" where lower(email) = lower($1)',
      ["caixa.integracao@padaria.local"]
    );
    if (!usuarioCaixa) throw new Error("operador de caixa nao encontrado na fixture");
    const usuarioCaixaId = usuarioCaixa.id;

    // A abertura real e a prova do caminho de producao: a campanha ja estava ativa e o operador
    // ainda nao tinha caixa aberto quando ela foi ativada.
    const conta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId, nome: "Conta campanha abertura posterior", saldoInicial: 0 }
    });
    expect(conta.statusCode, conta.body).toBe(201);
    const contaId = json<{ data: { id: string } }>(conta).data.id;
    const pdv = await contexto.app.inject({
      method: "POST",
      url: "/api/pdvs",
      headers: { cookie: cookieAdmin },
      payload: { empresaId, nome: "PDV campanha abertura posterior", contaId, ativo: true }
    });
    expect(pdv.statusCode, pdv.body).toBe(201);
    const pdvId = json<{ data: { id: string } }>(pdv).data.id;

    // A campanha foi criada antes deste PDV apenas para garantir que a atualizacao de participantes
    // tambem seja validada pelo servidor, como ocorreria na tela do administrador.
    const atualizacao = await contexto.app.inject({
      method: "PUT",
      url: `/api/campanhas/${campanhaId}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId,
        titulo: "Campanha para abertura posterior",
        mensagem: "Bata a meta e ganhe a bonificacao.",
        inicio: hoje,
        fim: hoje,
        metaValor: 1000,
        bonificacaoTipo: "dinheiro",
        bonificacaoValor: 100,
        pdvIds: [pdvId]
      }
    });
    expect(atualizacao.statusCode, atualizacao.body).toBe(204);

    const abertura = await contexto.app.inject({
      method: "POST",
      url: "/api/caixa/abrir",
      headers: { cookie: await cookieSessao(contexto.app, "caixa") },
      payload: { empresaId, pdvId, usuarioCaixaId }
    });
    expect(abertura.statusCode, abertura.body).toBe(201);

    const notificacoes = await consultarTodos<{ id: string }>(
      `select id from notificacoes
       where empresa_id = $1 and tipo = 'campanha' and destinatario_usuario_id = $2 and referencia_id = $3`,
      [empresaId, usuarioCaixaId, campanhaId]
    );
    expect(notificacoes).toHaveLength(1);

    // Repetir a materializacao nao cria segunda linha; o unique e a barreira tambem sob corrida.
    await notificarCampanhasNaAberturaDeCaixa({ empresaId, pdvId, usuarioId: usuarioCaixaId, dia: hoje }, banco);
    const repetidas = await consultarTodos<{ id: string }>(
      `select id from notificacoes
       where empresa_id = $1 and tipo = 'campanha' and destinatario_usuario_id = $2 and referencia_id = $3`,
      [empresaId, usuarioCaixaId, campanhaId]
    );
    expect(repetidas, "uma campanha nao duplica o sino do mesmo usuario").toHaveLength(1);

    // Mesmo usuario em outro PDV, outra empresa ou fora da data da campanha nao recebe nada.
    await notificarCampanhasNaAberturaDeCaixa({
      empresaId,
      pdvId: idsTeste.pdvLivre,
      usuarioId: usuarioCaixaId,
      dia: hoje
    }, banco);
    await notificarCampanhasNaAberturaDeCaixa({
      empresaId: idsTeste.empresaB,
      pdvId,
      usuarioId: usuarioCaixaId,
      dia: hoje
    }, banco);
    await notificarCampanhasNaAberturaDeCaixa({
      empresaId,
      pdvId,
      usuarioId: usuarioCaixaId,
      dia: "2000-01-01"
    }, banco);
    const foraDoEscopo = await consultarTodos<{ id: string }>(
      `select id from notificacoes
       where empresa_id = $1 and tipo = 'campanha' and destinatario_usuario_id = $2 and referencia_id = $3`,
      [empresaId, usuarioCaixaId, campanhaId]
    );
    expect(foraDoEscopo).toHaveLength(1);
  });
});
