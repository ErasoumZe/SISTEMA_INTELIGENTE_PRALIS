import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";

describe("discriminacao de operacoes integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieDiscriminador: string;
  let cookieCaixa: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    cookieDiscriminador = await cookieSessao(contexto.app, "discriminador");
    cookieCaixa = await cookieSessao(contexto.app, "caixa");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  // Cabecalho de mercadoria sem itens (lancado pelo gerente): fica pendente de discriminacao.
  async function criarMercadoriaPendente(valorOriginal: number): Promise<string> {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/mercadorias",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-06-30",
        dataVencimento: "2026-07-10",
        descricao: "Mercadoria pendente discriminacao",
        valorOriginal,
        contaOrigemId: idsTeste.contaCaixa,
        fornecedorId: idsTeste.fornecedor,
        grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
        temNotaFiscal: false
      }
    });
    expect(resposta.statusCode).toBe(201);
    return json<{ data: { id: string } }>(resposta).data.id;
  }

  async function criarDespesaPendente(valorOriginal: number): Promise<string> {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/despesas",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-06-30",
        dataVencimento: "2026-07-10",
        descricao: "Despesa pendente discriminacao",
        valorOriginal,
        contaOrigemId: idsTeste.contaCaixa,
        grupoDespesaId: idsTeste.grupoDespesaOperacional
      }
    });
    expect(resposta.statusCode).toBe(201);
    return json<{ data: { id: string } }>(resposta).data.id;
  }

  function listar(url: string, cookie: string) {
    return contexto.app.inject({ method: "GET", url, headers: { cookie } });
  }

  it("Mercadoria: aparece na fila, some ao discriminar e o servidor recalcula o desconto", async () => {
    const mercadoriaId = await criarMercadoriaPendente(100);

    const filaAntes = await listar(
      `/api/mercadorias?empresaId=${idsTeste.empresaA}&pendenteDiscriminacao=true`,
      cookieDiscriminador
    );
    assertOk(filaAntes);
    expect(JSON.stringify(filaAntes.json())).toContain(mercadoriaId);

    // qtd 10 x unit 12.5 = 125 bruto; 20% de desconto = 25; liquido = 100 (= valorOriginal).
    // valorTotal enviado errado de proposito: o servidor recalcula a partir de qtd/unit/desconto.
    const discriminar = await contexto.app.inject({
      method: "PATCH",
      url: `/api/mercadorias/${mercadoriaId}/discriminar`,
      headers: { cookie: cookieDiscriminador },
      payload: {
        empresaId: idsTeste.empresaA,
        itensMercadoria: [
          {
            produtoId: idsTeste.produto,
            grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
            unidadeMedidaId: idsTeste.unidade,
            descricao: "Farinha discriminada",
            quantidade: 10,
            valorUnitario: 12.5,
            descontoTipo: "percentual",
            descontoValor: 20,
            valorTotal: 999
          }
        ]
      }
    });
    assertOk(discriminar);

    const item = await consultarUm<{ valor_total: string; desconto_tipo: string; desconto_valor: string }>(
      "select valor_total, desconto_tipo, desconto_valor from mercadorias_itens where mercadoria_id = $1",
      [mercadoriaId]
    );
    expect(Number(item?.valor_total)).toBe(100);
    expect(item?.desconto_tipo).toBe("percentual");
    expect(Number(item?.desconto_valor)).toBe(20);

    const filaDepois = await listar(
      `/api/mercadorias?empresaId=${idsTeste.empresaA}&pendenteDiscriminacao=true`,
      cookieDiscriminador
    );
    expect(JSON.stringify(filaDepois.json())).not.toContain(mercadoriaId);
  });

  it("Mercadoria: soma divergente por 1 centavo retorna 422 (D5) e nao grava itens", async () => {
    const mercadoriaId = await criarMercadoriaPendente(50);

    const resposta = await contexto.app.inject({
      method: "PATCH",
      url: `/api/mercadorias/${mercadoriaId}/discriminar`,
      headers: { cookie: cookieDiscriminador },
      payload: {
        empresaId: idsTeste.empresaA,
        itensMercadoria: [{ descricao: "Item A", quantidade: 1, valorUnitario: 49.99, valorTotal: 49.99 }]
      }
    });

    // D5 (§5): divergencia BLOQUEIA com 422 e detalhe de onde diverge (antes era um 400 seco).
    assertProblem(resposta, 422, "DISCRIMINACAO_DIVERGENTE");
    const itens = await consultarTodos("select id from mercadorias_itens where mercadoria_id = $1", [mercadoriaId]);
    expect(itens).toHaveLength(0);
  });

  it("Mercadoria: sem a permissao de discriminar retorna 403", async () => {
    const mercadoriaId = await criarMercadoriaPendente(20);

    const resposta = await contexto.app.inject({
      method: "PATCH",
      url: `/api/mercadorias/${mercadoriaId}/discriminar`,
      headers: { cookie: cookieCaixa },
      payload: {
        empresaId: idsTeste.empresaA,
        itensMercadoria: [{ descricao: "Item", quantidade: 1, valorUnitario: 20, valorTotal: 20 }]
      }
    });

    assertProblem(resposta, 403);
  });

  it("Mercadoria: discrimina mesmo com o caixa fechado (desacoplado do caixa aberto)", async () => {
    const mercadoriaId = "11111111-1111-4111-8111-1111119a0001";
    await executarSql(
      `insert into mercadorias (id, empresa_id, caixa_id, fornecedor_id, data_referencia, data_vencimento, descricao, valor_original)
       values ($1, $2, $3, $4, '2026-06-29', '2026-07-10', 'Mercadoria em caixa fechado', '30.00')`,
      [mercadoriaId, idsTeste.empresaA, idsTeste.caixaFechado, idsTeste.fornecedor]
    );

    const resposta = await contexto.app.inject({
      method: "PATCH",
      url: `/api/mercadorias/${mercadoriaId}/discriminar`,
      headers: { cookie: cookieDiscriminador },
      payload: {
        empresaId: idsTeste.empresaA,
        itensMercadoria: [
          { descricao: "Parte 1", quantidade: 2, valorUnitario: 10, valorTotal: 20 },
          { descricao: "Parte 2", quantidade: 1, valorUnitario: 10, valorTotal: 10 }
        ]
      }
    });

    assertOk(resposta);
    const itens = await consultarTodos("select id from mercadorias_itens where mercadoria_id = $1", [mercadoriaId]);
    expect(itens).toHaveLength(2);
  });

  it("Despesa: aparece na fila, discrimina com soma correta e sai da fila", async () => {
    const despesaId = await criarDespesaPendente(15);

    const filaAntes = await listar(
      `/api/despesas?empresaId=${idsTeste.empresaA}&pendenteDiscriminacao=true`,
      cookieDiscriminador
    );
    assertOk(filaAntes);
    expect(JSON.stringify(filaAntes.json())).toContain(despesaId);

    const discriminar = await contexto.app.inject({
      method: "PATCH",
      url: `/api/despesas/${despesaId}/discriminar`,
      headers: { cookie: cookieDiscriminador },
      payload: {
        empresaId: idsTeste.empresaA,
        // R-135: linha NOVA de discriminacao vem do cadastro — uma por Patrimonio, outra por
        // Colaborador, que sao as duas origens que a tela oferece.
        itensDespesa: [
          {
            descricao: "Energia",
            valor: 10,
            grupoDespesaId: idsTeste.grupoDespesaOperacional,
            colaboradorId: idsTeste.colaboradorAdmin
          },
          { descricao: "Agua", valor: 5, patrimonioItemId: idsTeste.patrimonioItemForno }
        ]
      }
    });
    assertOk(discriminar);

    const itens = await consultarTodos("select id from despesas_itens where despesa_id = $1", [despesaId]);
    expect(itens).toHaveLength(2);

    const filaDepois = await listar(
      `/api/despesas?empresaId=${idsTeste.empresaA}&pendenteDiscriminacao=true`,
      cookieDiscriminador
    );
    expect(JSON.stringify(filaDepois.json())).not.toContain(despesaId);
  });

  it("Despesa: soma divergente retorna 422 (D5) e nao grava itens", async () => {
    const despesaId = await criarDespesaPendente(40);

    const resposta = await contexto.app.inject({
      method: "PATCH",
      url: `/api/despesas/${despesaId}/discriminar`,
      headers: { cookie: cookieDiscriminador },
      payload: {
        empresaId: idsTeste.empresaA,
        itensDespesa: [{ descricao: "Item", valor: 39.5 }]
      }
    });

    assertProblem(resposta, 422, "DISCRIMINACAO_DIVERGENTE");
    const itens = await consultarTodos("select id from despesas_itens where despesa_id = $1", [despesaId]);
    expect(itens).toHaveLength(0);
  });
});
