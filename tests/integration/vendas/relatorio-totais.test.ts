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
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("soma o total geral e agrupa por forma de pagamento", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/relatorios/vendas/totais?empresaId=${idsTeste.empresaA}&dataInicio=${DIA}&dataFim=${DIA}`,
      headers: { cookie: cookieAdmin }
    });
    expect(resposta.statusCode).toBe(200);
    const totais = json<{
      data: {
        totalGeral: number;
        quantidade: number;
        porFormaPagamento: Array<{ formaPagamento: string; total: number }>;
      };
    }>(resposta).data;

    expect(totais.totalGeral).toBe(100);
    expect(totais.quantidade).toBe(1);
    const porForma = Object.fromEntries(totais.porFormaPagamento.map((f) => [f.formaPagamento, f.total]));
    expect(porForma["Dinheiro"]).toBe(60);
    expect(porForma["Sem forma"]).toBe(40);
  });
});
