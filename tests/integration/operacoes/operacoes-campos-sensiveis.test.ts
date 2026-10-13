import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { abrirCaixaDoOperador } from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

describe("operacoes campos sensiveis integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieCaixa: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    cookieCaixa = await cookieSessao(contexto.app, "caixa");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_ForcarComputarEDataPendente_Quando_ClienteComumTentaBurlar", async () => {
    // ADR-004: perfil caixa (sem caixas_gerenciar) nao esconde movimento do saldo
    // nem cria despesa/venda ja "paga" — o servidor decide os dois campos.
    const conta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Conta campos sensiveis" }
    });
    expect(conta.statusCode).toBe(201);
    const contaId = json<{ data: { id: string } }>(conta).data.id;
    const pdv = await contexto.app.inject({
      method: "POST",
      url: "/api/pdvs",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "PDV campos sensiveis", contaId, ativo: true }
    });
    expect(pdv.statusCode).toBe(201);
    const pdvId = json<{ data: { id: string } }>(pdv).data.id;

    await abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieCaixa,
      emailOperador: usuariosTeste.caixa.email,
      nome: "Caixa campos sensiveis",
      dataHoraAbertura: "2026-05-02T08:00",
      contaId,
      pdvId
    });

    const venda = await contexto.app.inject({
      method: "POST",
      url: "/api/vendas",
      headers: { cookie: cookieCaixa },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-05-02",
        dataPagamento: "2026-05-02",
        descricao: "Venda tentando burlar",
        valorOriginal: 10,
        contaOrigemId: contaId,
        pdvId,
        computar: false,
        itensVenda: [],
        tiposPagamento: []
      }
    });
    expect(venda.statusCode, venda.body).toBe(201);
    const vendaId = json<{ data: { id: string } }>(venda).data.id;

    const linha = await consultarUm<{ computar: boolean; data_pagamento: string | null }>(
      "select computar, data_pagamento from vendas where id = $1",
      [vendaId]
    );
    expect(linha?.computar).toBe(true);
    expect(linha?.data_pagamento).toBeNull();
  });

  it("Deve_AceitarComputarFalse_Quando_PerfilTemCaixasGerenciar", async () => {
    // Admin (todas as permissoes, caixa aberto do seed) pode marcar nao-computavel.
    const venda = await contexto.app.inject({
      method: "POST",
      url: "/api/vendas",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-06-30",
        descricao: "Venda gerencial nao computavel",
        valorOriginal: 5,
        contaOrigemId: idsTeste.contaCaixa,
        pdvId: idsTeste.pdvA,
        computar: false,
        itensVenda: [],
        tiposPagamento: []
      }
    });
    expect(venda.statusCode, venda.body).toBe(201);
    const vendaId = json<{ data: { id: string } }>(venda).data.id;

    const linha = await consultarUm<{ computar: boolean }>("select computar from vendas where id = $1", [vendaId]);
    expect(linha?.computar).toBe(false);
  });
});
