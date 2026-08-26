// A 6a consulta do saldo, amarra por amarra (#152).
//
// A revisão de QA apontou que as três condições que o comentário do código chama de "todas
// necessárias" não tinham teste: remover qualquer uma delas deixava a suíte verde. Cada caso aqui
// mata uma mutação específica — se a amarra sair, o número muda e o caso fica vermelho.
//
//   `vendas.conta_origem_id IS NULL`     -> impede DUPLA CONTAGEM
//   `contas.empresa_id = vendas.empresa_id` -> o TENANT no proprio SQL
//   `vendas.status <> 'cancelado'`       -> venda cancelada nao credita
//   `vendas.computar = true`             -> venda fora do computo nao credita
//
// Tudo escrito direto no banco: montar estes estados pela API exigiria caminhos que a aplicação
// (corretamente) não oferece — é justamente por isso que a amarra existe no SQL do saldo, e não
// apenas na confiança de que o escritor fez certo.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

describe("6a consulta do saldo — cada amarra tem o seu caso", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  const carimbo = Date.now();

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  async function criarConta(nome: string, empresaId: string = idsTeste.empresaA, cookie = cookieAdmin) {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie },
      payload: { empresaId, nome: `${nome} ${carimbo}`, saldoInicial: 0 }
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    return json<{ data: { id: string } }>(resposta).data.id;
  }

  // Uma venda + um pagamento ROTEADO E DISPONIVEL, escritos direto. Os parametros sao exatamente as
  // colunas que as amarras leem.
  async function semearVendaRoteada(opcoes: {
    sufixo: string;
    contaFinalId: string;
    empresaVenda?: string;
    contaOrigemId?: string | null;
    status?: string;
    computar?: boolean;
  }) {
    const venda = await consultarUm<{ id: string }>(
      `insert into vendas (empresa_id, data_referencia, data_venda, descricao, valor_original,
                           conta_origem_id, status, computar)
       values ($1, '2026-08-12', '2026-08-12T12:00:00Z', $2, 100, $3, $4, $5)
       returning id`,
      [
        opcoes.empresaVenda ?? idsTeste.empresaA,
        `Venda amarra ${opcoes.sufixo} ${carimbo}`,
        opcoes.contaOrigemId ?? null,
        opcoes.status ?? "aprovado",
        opcoes.computar ?? true
      ]
    );
    await executarSql(
      `insert into vendas_pagamentos (venda_id, numero_vendas, total_pago, roteamento_status,
                                      conta_recebivel_id, conta_final_id, disponivel_em)
       values ($1, 1, 100, 'roteado', $2, $2, '2026-08-12T12:00:00Z')`,
      [venda?.id, opcoes.contaFinalId]
    );
    return venda?.id ?? "";
  }

  async function saldo(contaId: string, empresaId: string = idsTeste.empresaA, cookie = cookieAdmin) {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/contas/saldos?empresaId=${empresaId}`,
      headers: { cookie }
    });
    assertOk(resposta);
    return (
      json<{ data: Array<{ id: string; saldoAtual: number }> }>(resposta).data.find((linha) => linha.id === contaId)
        ?.saldoAtual ?? null
    );
  }

  it("o caso base credita: roteado, disponivel, empresa certa, nao cancelado, computavel", async () => {
    const contaId = await criarConta("Amarra base");
    await semearVendaRoteada({ sufixo: "base", contaFinalId: contaId });
    expect(await saldo(contaId)).toBe(100);
  });

  // Mata a mutação "remover `isNull(vendas.contaOrigemId)`". Sem a amarra, esta venda somaria DUAS
  // vezes na mesma conta: uma pelo termo antigo (venda pelo liquido) e outra pelo pagamento roteado.
  it("venda com conta de origem NAO soma de novo pelo pagamento roteado", async () => {
    const contaId = await criarConta("Amarra dupla contagem");
    await semearVendaRoteada({ sufixo: "dupla", contaFinalId: contaId, contaOrigemId: contaId });
    // 100 do termo antigo (a venda credita pelo liquido). Se a amarra sumir, viram 200.
    expect(await saldo(contaId), "uma venda soma por UM caminho, nunca por dois").toBe(100);
  });

  // Mata a mutação "remover `eq(contas.empresaId, vendas.empresaId)`". A FK de `conta_final_id` e
  // SIMPLES, entao o banco aceita a linha — a amarra vive no SQL do saldo, e este caso a prova.
  it("pagamento apontando para conta de OUTRA empresa nao credita", async () => {
    const cookieMulti = await cookieSessao(contexto.app, "multiempresa");
    const contaDaEmpresaB = await criarConta("Amarra tenant B", idsTeste.empresaB, cookieMulti);
    // Venda da empresa A creditando conta da empresa B: so possivel escrevendo direto.
    await semearVendaRoteada({ sufixo: "tenant", contaFinalId: contaDaEmpresaB, empresaVenda: idsTeste.empresaA });
    expect(
      await saldo(contaDaEmpresaB, idsTeste.empresaB, cookieMulti),
      "dinheiro de uma empresa nao pode aparecer no saldo de outra"
    ).toBe(0);
  });

  it("venda CANCELADA nao credita, mesmo com pagamento roteado e disponivel", async () => {
    const contaId = await criarConta("Amarra cancelada");
    await semearVendaRoteada({ sufixo: "cancelada", contaFinalId: contaId, status: "cancelado" });
    expect(await saldo(contaId)).toBe(0);
  });

  it("venda com computar=false nao credita", async () => {
    const contaId = await criarConta("Amarra computar");
    await semearVendaRoteada({ sufixo: "computar", contaFinalId: contaId, computar: false });
    expect(await saldo(contaId)).toBe(0);
  });

  // As duas metades da R-169, no mesmo lugar: roteado sem `disponivel_em` e recebivel, e recebivel
  // nao e saldo. Mata a mutação "remover `isNotNull(disponivelEm)`".
  it("roteado SEM disponivel_em e recebivel: nao entra no saldo", async () => {
    const contaId = await criarConta("Amarra recebivel");
    const venda = await consultarUm<{ id: string }>(
      `insert into vendas (empresa_id, data_referencia, data_venda, descricao, valor_original, status, computar)
       values ($1, '2026-08-12', '2026-08-12T12:00:00Z', $2, 100, 'aprovado', true) returning id`,
      [idsTeste.empresaA, `Venda recebivel ${carimbo}`]
    );
    await executarSql(
      `insert into vendas_pagamentos (venda_id, numero_vendas, total_pago, roteamento_status,
                                      conta_recebivel_id, conta_final_id, disponivel_em)
       values ($1, 1, 100, 'roteado', $2, $2, null)`,
      [venda?.id, contaId]
    );
    expect(await saldo(contaId), "recebivel existe no financeiro, nao no saldo gastavel").toBe(0);
  });

  it("pagamento PENDENTE nao credita", async () => {
    const contaId = await criarConta("Amarra pendente");
    const venda = await consultarUm<{ id: string }>(
      `insert into vendas (empresa_id, data_referencia, data_venda, descricao, valor_original, status, computar)
       values ($1, '2026-08-12', '2026-08-12T12:00:00Z', $2, 100, 'aprovado', true) returning id`,
      [idsTeste.empresaA, `Venda pendente amarra ${carimbo}`]
    );
    await executarSql(
      `insert into vendas_pagamentos (venda_id, numero_vendas, total_pago, roteamento_status)
       values ($1, 1, 100, 'pendente')`,
      [venda?.id]
    );
    expect(await saldo(contaId)).toBe(0);
  });
});
