import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

// Gap de producao (ADENDO PR3): mercadorias vindas da NF-e nascem "aguardando_aprovacao"
// (computar=false, caixa_id NULL) ja com os itens do XML, mas NAO havia fluxo de aprovacao — a
// tela de Mercadorias nem as exibia (filtro de caixa). A retaguarda agora lista, aprova (definindo
// se computa) ou recusa.
describe("mercadorias: aprovacao das compras vindas de NF-e", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  async function criarMercadoriaNfe(descricao: string): Promise<string> {
    const linha = await consultarUm<{ id: string }>(
      `insert into mercadorias
         (empresa_id, caixa_id, fornecedor_id, data_referencia, data_vencimento, descricao, valor_original,
          status, computar, tem_nota_fiscal)
       values ($1, null, $2, '2026-07-10', '2026-07-10', $3, '100.00',
               'aguardando_aprovacao', false, true)
       returning id`,
      [idsTeste.empresaA, idsTeste.fornecedor, descricao]
    );
    const id = linha!.id;
    await executarSql(
      // Sem desconto: os campos com desconto repetem o total/unitario (§5).
      `insert into mercadorias_itens
         (mercadoria_id, descricao, quantidade, valor_unitario, valor_total,
          valor_unitario_com_desconto, valor_total_com_desconto)
       values ($1, 'Farinha de trigo', '10', '10.00', '100.00', '10.00', '100.00')`,
      [id]
    );
    return id;
  }

  function listarAguardando() {
    return contexto.app.inject({
      method: "GET",
      url: `/api/mercadorias/aguardando-aprovacao?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
  }

  function aprovar(id: string, computar: boolean) {
    return contexto.app.inject({
      method: "PATCH",
      url: `/api/mercadorias/${id}/aprovar`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, computar }
    });
  }

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("lista os cabecalhos aguardando aprovacao com fornecedor e itens", async () => {
    const id = await criarMercadoriaNfe("NFE-APROVAR-LISTA");
    const resposta = await listarAguardando();
    expect(resposta.statusCode).toBe(200);
    const linhas = json<{
      data: Array<{ id: string; fornecedorNome: string | null; itens: Array<{ descricao: string }> }>;
    }>(resposta).data;
    const alvo = linhas.find((m) => m.id === id);
    expect(alvo, "mercadoria aguardando aprovacao deveria aparecer").toBeDefined();
    expect(alvo!.itens.length).toBeGreaterThan(0);
    expect(alvo!.fornecedorNome).toBeTruthy();
  });

  it("aprovar com computar=true muda o status para aprovado, liga o computar e sai da fila", async () => {
    const id = await criarMercadoriaNfe("NFE-APROVAR-TRUE");
    expect((await aprovar(id, true)).statusCode).toBe(200);

    const linha = await consultarUm<{ status: string; computar: boolean }>(
      `select status, computar from mercadorias where id = $1`,
      [id]
    );
    expect(linha!.status).toBe("aprovado");
    expect(linha!.computar).toBe(true);

    const restantes = json<{ data: Array<{ id: string }> }>(await listarAguardando()).data;
    expect(restantes.find((m) => m.id === id)).toBeUndefined();
  });

  it("aprovar com computar=false mantem a nota so fiscal (decisao da reuniao)", async () => {
    const id = await criarMercadoriaNfe("NFE-APROVAR-FALSE");
    expect((await aprovar(id, false)).statusCode).toBe(200);

    const linha = await consultarUm<{ status: string; computar: boolean }>(
      `select status, computar from mercadorias where id = $1`,
      [id]
    );
    expect(linha!.status).toBe("aprovado");
    expect(linha!.computar).toBe(false);
  });

  it("recusar muda o status para cancelado", async () => {
    const id = await criarMercadoriaNfe("NFE-RECUSAR");
    const resposta = await contexto.app.inject({
      method: "PATCH",
      url: `/api/mercadorias/${id}/recusar`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA }
    });
    expect(resposta.statusCode).toBe(200);
    const linha = await consultarUm<{ status: string }>(`select status from mercadorias where id = $1`, [id]);
    expect(linha!.status).toBe("cancelado");
  });

  it("nao reaprova uma mercadoria que ja saiu de aguardando_aprovacao", async () => {
    const id = await criarMercadoriaNfe("NFE-DUPLA-APROVACAO");
    expect((await aprovar(id, true)).statusCode).toBe(200);
    expect((await aprovar(id, true)).statusCode).toBeGreaterThanOrEqual(400);
  });
});
