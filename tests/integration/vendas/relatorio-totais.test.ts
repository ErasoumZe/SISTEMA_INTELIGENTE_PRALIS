import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

// PR2 Parte 1b: rodape do Relatorio de Vendas com total geral + subtotais por forma de pagamento
// sobre TODO o conjunto filtrado (necessario para homologacao contra o CREARE).
describe("relatorio de vendas: totais (geral + por forma de pagamento)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  const DIA = "2026-08-01"; // dia isolado (sem vendas do seed)
  const DIA_LIQUIDO = "2026-08-02"; // dia isolado para desconto/acrescimo
  const DIA_MULTI = "2026-08-03"; // dia isolado para a venda multi-forma
  const DIA_PAGINADO = "2026-08-04"; // paginação no banco, sem carregar o filtro inteiro
  const FORMA_PIX = "11111111-1111-4111-8111-111111111718";
  let vendaMultiId = "";

  async function totaisDoDia(dia: string, formaPagamentoId?: string) {
    const filtroForma = formaPagamentoId ? `&formaPagamentoId=${formaPagamentoId}` : "";
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/relatorios/vendas/totais?empresaId=${idsTeste.empresaA}&dataInicio=${dia}&dataFim=${dia}${filtroForma}`,
      headers: { cookie: cookieAdmin }
    });
    expect(resposta.statusCode).toBe(200);
    return json<{
      data: {
        totalGeral: number;
        quantidade: number;
        porFormaPagamento: Array<{ formaPagamento: string; total: number }>;
      };
    }>(resposta).data;
  }

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    const venda = await consultarUm<{ id: string }>(
      `insert into vendas (empresa_id, data_referencia, descricao, valor_original, status, computar)
       values ($1, $2, 'Venda totais teste', '100.00', 'aprovado', true) returning id`,
      [idsTeste.empresaA, DIA]
    );
    // Dois pagamentos: 60 em Dinheiro + 40 sem forma (forma_pagamento_id NULL -> "Sem forma").
    await executarSql(
      `insert into vendas_pagamentos (venda_id, forma_pagamento_id, numero_vendas, total_pago)
       values ($1,$2,1,'60.00'),($1,null,1,'40.00')`,
      [venda!.id, idsTeste.formaPagamentoDinheiro]
    );

    // BUG A: valor_original guarda o SUBTOTAL. Uma venda com desconto (100 - 10 = 90) e outra com
    // acrescimo (50 + 5 = 55) — o total tem de ser 145, nao 150 (soma dos subtotais).
    await executarSql(
      `insert into vendas (empresa_id, data_referencia, descricao, valor_original, valor_desconto,
         valor_acrescimo, status, computar)
       values ($1,$2,'Venda com desconto','100.00','10.00','0','aprovado',true),
              ($1,$2,'Venda com acrescimo','50.00','0','5.00','aprovado',true)`,
      [idsTeste.empresaA, DIA_LIQUIDO]
    );

    // Venda multi-forma ("CREDITO, PIX"): 70 em Dinheiro + 30 em PIX = 100.
    await executarSql(`insert into formas_pagamento (id, empresa_id, nome) values ($1,$2,'PIX Manual')`, [
      FORMA_PIX,
      idsTeste.empresaA
    ]);
    const multi = await consultarUm<{ id: string }>(
      `insert into vendas (empresa_id, data_referencia, descricao, valor_original, status, computar)
       values ($1, $2, 'Venda multi-forma', '100.00', 'aprovado', true) returning id`,
      [idsTeste.empresaA, DIA_MULTI]
    );
    vendaMultiId = multi!.id;
    await executarSql(
      `insert into vendas_produtos (venda_id, descricao_produto, quantidade, valor_unitario, valor_total)
       values ($1, 'Cafe coado', '2', '20.00', '40.00'),
              ($1, 'Pao de queijo', '3', '20.00', '60.00')`,
      [vendaMultiId]
    );
    await executarSql(
      `insert into vendas_pagamentos (venda_id, forma_pagamento_id, numero_vendas, total_pago)
       values ($1,$2,1,'70.00'),($1,$3,1,'30.00')`,
      [multi!.id, idsTeste.formaPagamentoDinheiro, FORMA_PIX]
    );

    await executarSql(
      `insert into vendas (empresa_id, data_referencia, descricao, valor_original, status, computar)
       values ($1,$2,'Venda paginada 1','10.00','aprovado',true),
              ($1,$2,'Venda paginada 2','20.00','aprovado',true),
              ($1,$2,'Venda paginada 3','30.00','aprovado',true)`,
      [idsTeste.empresaA, DIA_PAGINADO]
    );
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("soma o total geral e agrupa por forma de pagamento", async () => {
    const totais = await totaisDoDia(DIA);

    expect(totais.totalGeral).toBe(100);
    expect(totais.quantidade).toBe(1);
    const porForma = Object.fromEntries(totais.porFormaPagamento.map((f) => [f.formaPagamento, f.total]));
    expect(porForma["Dinheiro"]).toBe(60);
    expect(porForma["Sem forma"]).toBe(40);
  });

  // BUG A: somar valor_original puro superestimava venda com desconto e subestimava com acrescimo.
  it("total geral soma o LIQUIDO: desconta desconto e soma acrescimo", async () => {
    const totais = await totaisDoDia(DIA_LIQUIDO);

    // 90,00 (100 - 10) + 55,00 (50 + 5). Somar o subtotal puro daria 150,00.
    expect(totais.totalGeral).toBe(145);
    expect(totais.quantidade).toBe(2);
  });

  describe("venda multi-forma", () => {
    it("sem filtro, o total geral conta a venda UMA vez (nao soma por pagamento)", async () => {
      const totais = await totaisDoDia(DIA_MULTI);

      expect(totais.totalGeral).toBe(100); // nao 200 (nao duplica por causa dos 2 pagamentos)
      expect(totais.quantidade).toBe(1);
    });

    it("os chips repartem o valor entre as formas", async () => {
      const totais = await totaisDoDia(DIA_MULTI);
      const porForma = Object.fromEntries(totais.porFormaPagamento.map((f) => [f.formaPagamento, f.total]));

      expect(porForma["Dinheiro"]).toBe(70);
      expect(porForma["PIX Manual"]).toBe(30);
      // As parcelas somam o valor da venda.
      expect(porForma["Dinheiro"]! + porForma["PIX Manual"]!).toBe(totais.totalGeral);
    });

    it("filtrado por uma forma, o total geral e a PARCELA daquela forma", async () => {
      const soPix = await totaisDoDia(DIA_MULTI, FORMA_PIX);
      const soDinheiro = await totaisDoDia(DIA_MULTI, idsTeste.formaPagamentoDinheiro);

      // Antes somava a venda inteira (100) ao filtrar por PIX, inflando o relatorio com dinheiro
      // que entrou por outra forma.
      expect(soPix.totalGeral).toBe(30);
      expect(soDinheiro.totalGeral).toBe(70);
      // A contagem continua sendo "vendas com a forma".
      expect(soPix.quantidade).toBe(1);
      expect(soDinheiro.quantidade).toBe(1);
    });

    it("lista produtos e detalha cada parcela de uma venda dividida", async () => {
      const resposta = await contexto.app.inject({
        method: "GET",
        url: `/api/relatorios/vendas?empresaId=${idsTeste.empresaA}&dataInicio=${DIA_MULTI}&dataFim=${DIA_MULTI}`,
        headers: { cookie: cookieAdmin }
      });
      expect(resposta.statusCode, resposta.body).toBe(200);
      const corpo = json<{
        data: Array<{
          id: string;
          itensVenda: Array<{ descricaoProduto: string; quantidade: number; valorTotal: number }>;
          pagamentos: Array<{ formaPagamentoNome: string | null; totalPago: string }>;
        }>;
      }>(resposta);
      const venda = corpo.data.find((item) => item.id === vendaMultiId);
      expect(venda?.itensVenda).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ descricaoProduto: "Cafe coado", quantidade: 2, valorTotal: 40 }),
          expect.objectContaining({ descricaoProduto: "Pao de queijo", quantidade: 3, valorTotal: 60 })
        ])
      );
      expect(venda?.pagamentos).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ formaPagamentoNome: "Dinheiro", totalPago: "70.00" }),
          expect.objectContaining({ formaPagamentoNome: "PIX Manual", totalPago: "30.00" })
        ])
      );
    });
  });

  it("pagina a listagem no banco e preserva a contagem total do filtro", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/relatorios/vendas?empresaId=${idsTeste.empresaA}&dataInicio=${DIA_PAGINADO}&dataFim=${DIA_PAGINADO}&page=2&pageSize=2`,
      headers: { cookie: cookieAdmin }
    });

    expect(resposta.statusCode, resposta.body).toBe(200);
    const corpo = json<{ data: Array<{ descricao: string }>; meta: { pagination: { total: number; page: number } } }>(
      resposta
    );
    expect(corpo.meta.pagination).toMatchObject({ total: 3, page: 2 });
    expect(corpo.data).toHaveLength(1);
    expect(corpo.data[0]?.descricao).toMatch(/^Venda paginada/u);
  });
});
