// PROJECT_BRAIN/17 §5, item 6: o campo Grupo da discriminacao tem DUAS origens — o cadastro
// proprio (despesas/mercadorias) e o de PATRIMONIO, quando o item e maquinario/manutencao.
//
// Sao colunas separadas porque sao FKs de tabelas diferentes, e sao MUTUAMENTE EXCLUSIVAS: no
// maximo uma preenchida. Nenhuma preenchida continua valido (item sem grupo sempre foi aceito e o
// historico esta cheio deles) — por isso o CHECK e num_nonnulls(...) <= 1, e nao "= 1".
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, json } from "../../setup/integracao.js";

describe("discriminacao: grupo de patrimonio no item (§5 item 6) integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieDiscriminador: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    cookieDiscriminador = await cookieSessao(contexto.app, "discriminador");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  async function criarMercadoriaPendente(valorOriginal: number): Promise<string> {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/mercadorias",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-06-30",
        dataVencimento: "2026-07-10",
        descricao: "Mercadoria com item de patrimonio",
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

  function discriminarMercadoria(mercadoriaId: string, itensMercadoria: unknown[]) {
    return contexto.app.inject({
      method: "PATCH",
      url: `/api/mercadorias/${mercadoriaId}/discriminar`,
      headers: { cookie: cookieDiscriminador },
      payload: { empresaId: idsTeste.empresaA, itensMercadoria }
    });
  }

  it("grava o grupo de patrimonio no item e NAO herda o grupo do cabecalho", async () => {
    const mercadoriaId = await criarMercadoriaPendente(300);

    // O cabecalho tem grupoMercadoriaId (Insumos). O item escolhe PATRIMONIO: a heranca do
    // cabecalho precisa ser desligada, senao o item nasceria com as duas origens e o banco
    // recusaria (mercadorias_itens_grupo_unico_check).
    const resposta = await discriminarMercadoria(mercadoriaId, [
      {
        descricao: "Manutencao do forno",
        quantidade: 1,
        valorUnitario: 300,
        valorTotal: 300,
        grupoPatrimonioId: idsTeste.grupoPatrimonioMaquinas
      }
    ]);
    assertOk(resposta);

    const item = await consultarUm<{ grupo_mercadoria_id: string | null; grupo_patrimonio_id: string | null }>(
      "select grupo_mercadoria_id, grupo_patrimonio_id from mercadorias_itens where mercadoria_id = $1",
      [mercadoriaId]
    );
    expect(item?.grupo_patrimonio_id).toBe(idsTeste.grupoPatrimonioMaquinas);
    expect(item?.grupo_mercadoria_id).toBeNull();
  });

  it("item SEM grupo nenhum continua valido (a regra e 'no maximo um', nao 'exatamente um')", async () => {
    const mercadoriaId = await criarMercadoriaPendente(80);

    const resposta = await discriminarMercadoria(mercadoriaId, [
      { descricao: "Item sem classificacao", quantidade: 1, valorUnitario: 80, valorTotal: 80 }
    ]);
    assertOk(resposta);

    const item = await consultarUm<{ grupo_mercadoria_id: string | null; grupo_patrimonio_id: string | null }>(
      "select grupo_mercadoria_id, grupo_patrimonio_id from mercadorias_itens where mercadoria_id = $1",
      [mercadoriaId]
    );
    // Sem grupo no item, o do cabecalho desce (comportamento que ja existia e nao mudou).
    expect(item?.grupo_mercadoria_id).toBe(idsTeste.grupoMercadoriaInsumos);
    expect(item?.grupo_patrimonio_id).toBeNull();
  });

  it("as DUAS origens no mesmo item sao recusadas (400) e nada e gravado", async () => {
    const mercadoriaId = await criarMercadoriaPendente(120);

    const resposta = await discriminarMercadoria(mercadoriaId, [
      {
        descricao: "Item com duas origens",
        quantidade: 1,
        valorUnitario: 120,
        valorTotal: 120,
        grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
        grupoPatrimonioId: idsTeste.grupoPatrimonioMaquinas
      }
    ]);

    // Barrado no contrato (zod), antes de chegar ao banco: 400, nao 500 vindo do CHECK.
    expect(resposta.statusCode).toBe(400);
    const itens = await consultarTodos("select id from mercadorias_itens where mercadoria_id = $1", [mercadoriaId]);
    expect(itens).toHaveLength(0);
  });

  it("grupo de patrimonio de OUTRA empresa e recusado", async () => {
    const mercadoriaId = await criarMercadoriaPendente(60);

    const resposta = await discriminarMercadoria(mercadoriaId, [
      {
        descricao: "Item apontando para outra empresa",
        quantidade: 1,
        valorUnitario: 60,
        valorTotal: 60,
        grupoPatrimonioId: idsTeste.grupoPatrimonioOutraEmpresa
      }
    ]);

    // 400, como as demais referencias de outra empresa (o servico lanca Error e o handler mapeia).
    assertProblem(resposta, 400);
    const itens = await consultarTodos("select id from mercadorias_itens where mercadoria_id = $1", [mercadoriaId]);
    expect(itens).toHaveLength(0);
  });

  it("Despesa: item aceita grupo de patrimonio e ele volta no detalhe (round-trip da edicao)", async () => {
    const criar = await contexto.app.inject({
      method: "POST",
      url: "/api/despesas",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-06-30",
        dataVencimento: "2026-07-10",
        descricao: "Despesa com item de patrimonio",
        valorOriginal: 150,
        contaOrigemId: idsTeste.contaCaixa,
        // R-135: a linha traz o ITEM do cadastro (patrimonioItemId) alem do grupo. Sem ele o
        // servico recusa — e o que este arquivo passou a exercitar depois da auditoria de 04/08.
        itensDespesa: [
          {
            descricao: "Troca de correia",
            valor: 150,
            grupoPatrimonioId: idsTeste.grupoPatrimonioMaquinas,
            patrimonioItemId: idsTeste.patrimonioItemForno
          }
        ]
      }
    });
    expect(criar.statusCode).toBe(201);
    const despesaId = json<{ data: { id: string } }>(criar).data.id;

    const item = await consultarUm<{ grupo_despesa_id: string | null; grupo_patrimonio_id: string | null }>(
      "select grupo_despesa_id, grupo_patrimonio_id from despesas_itens where despesa_id = $1",
      [despesaId]
    );
    expect(item?.grupo_patrimonio_id).toBe(idsTeste.grupoPatrimonioMaquinas);
    expect(item?.grupo_despesa_id).toBeNull();

    // O detalhe precisa devolver o campo, senao a edicao abriria o item com o Grupo em branco e
    // salvaria por cima apagando a classificacao.
    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/despesas/${despesaId}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(detalhe);
    const dados = json<{ data: { itensDespesa: Array<{ grupoPatrimonioId: string | null }> } }>(detalhe).data;
    expect(dados.itensDespesa[0]?.grupoPatrimonioId).toBe(idsTeste.grupoPatrimonioMaquinas);
  });
});
