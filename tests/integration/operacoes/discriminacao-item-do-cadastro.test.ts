// E6 / R-135 — o ITEM da discriminacao de despesa vem de um CADASTRO (Patrimonio ou Colaborador).
//
// Este arquivo nasceu da auditoria da PR #26 (04/08/2026), que apontou dois furos na entrega:
//
//   1) `patrimonioItemId` era gravado sem NENHUMA checagem de empresa. A FK garante que o id
//      existe, nao que ele e da empresa do lancamento — os vizinhos (grupoDespesaId,
//      grupoPatrimonioId, colaboradorId) sempre tiveram essa checagem e este nao.
//   2) A R-135 estava escrita no PROJECT_BRAIN e implementada SO NA TELA. O contrato zod continuava
//      aceitando `{descricao, valor}` sem vinculo, entao qualquer cliente que nao fosse aquela tela
//      repunha texto solto no banco.
//
// O que este arquivo trava: o round-trip do vinculo, o isolamento por empresa, a regra no servidor
// e — o mais importante — que o REGISTRO HISTORICO sem vinculo continua abrindo e salvando. Uma
// regra nova que invalida o passado nao e regra, e perda de dado.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";

type ItemDespesa = {
  descricao: string;
  valor: number;
  patrimonioItemId?: string;
  colaboradorId?: string;
  grupoPatrimonioId?: string;
};

describe("discriminacao de despesa: o item vem do cadastro (R-135) integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieDiscriminador: string;
  let cookieSemPermissao: string;
  let cookieCaixa: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    cookieDiscriminador = await cookieSessao(contexto.app, "discriminador");
    cookieSemPermissao = await cookieSessao(contexto.app, "semPermissao");
    cookieCaixa = await cookieSessao(contexto.app, "caixa");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  function criarDespesa(valorOriginal: number, itensDespesa: ItemDespesa[]) {
    return contexto.app.inject({
      method: "POST",
      url: "/api/despesas",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-06-30",
        dataVencimento: "2026-07-10",
        descricao: "Despesa da R-135",
        valorOriginal,
        contaOrigemId: idsTeste.contaCaixa,
        itensDespesa
      }
    });
  }

  function obterDetalhe(despesaId: string) {
    return contexto.app.inject({
      method: "GET",
      url: `/api/despesas/${despesaId}`,
      headers: { cookie: cookieAdmin }
    });
  }

  // ------------------------------------------------------------------------------------------
  // 1) Round-trip: o vinculo escolhido na tela chega ao banco E volta no detalhe
  // ------------------------------------------------------------------------------------------
  it("grava patrimonioItemId e devolve no detalhe (round-trip da edicao)", async () => {
    const criar = await criarDespesa(150, [
      { descricao: "Troca de resistencia", valor: 150, patrimonioItemId: idsTeste.patrimonioItemForno }
    ]);
    expect(criar.statusCode).toBe(201);
    const despesaId = json<{ data: { id: string } }>(criar).data.id;

    const linha = await consultarUm<{ patrimonio_item_id: string | null }>(
      "select patrimonio_item_id from despesas_itens where despesa_id = $1",
      [despesaId]
    );
    expect(linha?.patrimonio_item_id).toBe(idsTeste.patrimonioItemForno);

    // Sem o campo no DETALHE a edicao reabriria o item "sem vinculo" e salvaria por cima — o mesmo
    // erro que a retirada teve com o credor (R-128).
    const detalhe = await obterDetalhe(despesaId);
    assertOk(detalhe);
    const dados = json<{ data: { itensDespesa: Array<{ patrimonioItemId: string | null }> } }>(detalhe).data;
    expect(dados.itensDespesa[0]?.patrimonioItemId).toBe(idsTeste.patrimonioItemForno);
  });

  it("aceita o vinculo por COLABORADOR (a segunda origem que a tela oferece)", async () => {
    const criar = await criarDespesa(90, [
      { descricao: "Vale transporte", valor: 90, colaboradorId: idsTeste.colaboradorAdmin }
    ]);
    expect(criar.statusCode).toBe(201);

    const despesaId = json<{ data: { id: string } }>(criar).data.id;
    const linha = await consultarUm<{ colaborador_id: string | null; patrimonio_item_id: string | null }>(
      "select colaborador_id, patrimonio_item_id from despesas_itens where despesa_id = $1",
      [despesaId]
    );
    expect(linha?.colaborador_id).toBe(idsTeste.colaboradorAdmin);
    expect(linha?.patrimonio_item_id).toBeNull();
  });

  // ------------------------------------------------------------------------------------------
  // 2) Isolamento multiempresa — o furo que a auditoria achou
  // ------------------------------------------------------------------------------------------
  it("RECUSA item de patrimonio de OUTRA empresa na criacao e nao grava nada", async () => {
    // Id valido, existente, com FK que resolve — e da empresa B. So a checagem por empresa pega.
    const resposta = await criarDespesa(70, [
      { descricao: "Item da empresa vizinha", valor: 70, patrimonioItemId: idsTeste.patrimonioItemOutraEmpresa }
    ]);

    assertProblem(resposta, 400);
    expect(JSON.stringify(resposta.json())).toContain("Item de patrimonio");

    const vazou = await consultarTodos("select id from despesas_itens where patrimonio_item_id = $1", [
      idsTeste.patrimonioItemOutraEmpresa
    ]);
    expect(vazou).toHaveLength(0);
  });

  it("RECUSA item de patrimonio de OUTRA empresa tambem pela tela de Discriminacao", async () => {
    // A discriminacao e outro caminho de escrita (validarReferenciasItensDespesa). Se o isolamento
    // so existisse na criacao, esta seria a porta aberta.
    const cabecalho = await criarDespesa(70, []);
    expect(cabecalho.statusCode).toBe(201);
    const despesaId = json<{ data: { id: string } }>(cabecalho).data.id;

    const resposta = await contexto.app.inject({
      method: "PATCH",
      url: `/api/despesas/${despesaId}/discriminar`,
      headers: { cookie: cookieDiscriminador },
      payload: {
        empresaId: idsTeste.empresaA,
        itensDespesa: [
          { descricao: "Item da empresa vizinha", valor: 70, patrimonioItemId: idsTeste.patrimonioItemOutraEmpresa }
        ]
      }
    });

    assertProblem(resposta, 400);
    expect(JSON.stringify(resposta.json())).toContain("Item de patrimonio");
    const itens = await consultarTodos("select id from despesas_itens where despesa_id = $1", [despesaId]);
    expect(itens).toHaveLength(0);
  });

  // ------------------------------------------------------------------------------------------
  // 3) R-135 no servidor: linha NOVA precisa de vinculo
  // ------------------------------------------------------------------------------------------
  it("RECUSA linha nova com descricao livre (400 ITEM_DISCRIMINACAO_SEM_VINCULO) e aponta a linha", async () => {
    const resposta = await criarDespesa(30, [
      { descricao: "Alguma coisa digitada a mao", valor: 10, patrimonioItemId: idsTeste.patrimonioItemForno },
      { descricao: "Texto solto", valor: 20 }
    ]);

    assertProblem(resposta, 400, "ITEM_DISCRIMINACAO_SEM_VINCULO");
    // A mensagem diz QUAL linha — sem isso a pessoa fica procurando numa tabela de 8 colunas.
    expect(JSON.stringify(resposta.json())).toContain("linha 2");
  });

  it("RECUSA linha que aponta Patrimonio E Colaborador ao mesmo tempo (ambiguidade)", async () => {
    const resposta = await criarDespesa(40, [
      {
        descricao: "Item com duas identidades",
        valor: 40,
        patrimonioItemId: idsTeste.patrimonioItemForno,
        colaboradorId: idsTeste.colaboradorAdmin
      }
    ]);

    assertProblem(resposta, 400, "ITEM_DISCRIMINACAO_AMBIGUO");
  });

  it("RECUSA discriminar um cabecalho pendente com linha sem vinculo (aqui tudo e linha nova)", async () => {
    const cabecalho = await criarDespesa(25, []);
    expect(cabecalho.statusCode).toBe(201);
    const despesaId = json<{ data: { id: string } }>(cabecalho).data.id;

    const resposta = await contexto.app.inject({
      method: "PATCH",
      url: `/api/despesas/${despesaId}/discriminar`,
      headers: { cookie: cookieDiscriminador },
      payload: {
        empresaId: idsTeste.empresaA,
        itensDespesa: [{ descricao: "Digitado na mao", valor: 25 }]
      }
    });

    assertProblem(resposta, 400, "ITEM_DISCRIMINACAO_SEM_VINCULO");
    const itens = await consultarTodos("select id from despesas_itens where despesa_id = $1", [despesaId]);
    expect(itens).toHaveLength(0);
  });

  // ------------------------------------------------------------------------------------------
  // 4) O HISTORICO continua abrindo e salvando — a parte que nao pode quebrar
  // ------------------------------------------------------------------------------------------
  describe("registro legado (item gravado antes da R-135, sem vinculo nenhum)", () => {
    // Gravado por SQL direto de proposito: pela API nao da mais para criar um item assim, e e
    // exatamente esse o registro que existe aos milhares em producao.
    async function criarDespesaLegada(valorOriginal: number, descricoes: string[]): Promise<string> {
      const cabecalho = await criarDespesa(valorOriginal, []);
      expect(cabecalho.statusCode).toBe(201);
      const despesaId = json<{ data: { id: string } }>(cabecalho).data.id;

      const valorPorItem = valorOriginal / descricoes.length;
      for (const descricao of descricoes) {
        await executarSql(
          `insert into despesas_itens
             (despesa_id, descricao, quantidade, valor_unitario, valor,
              valor_unitario_com_desconto, valor_total_com_desconto)
           values ($1, $2, '1', $3, $3, $3, $3)`,
          [despesaId, descricao, String(valorPorItem)]
        );
      }
      return despesaId;
    }

    it("reabre com a descricao gravada visivel (a tela nao apaga o historico)", async () => {
      const despesaId = await criarDespesaLegada(60, ["Conta de luz de marco"]);

      const detalhe = await obterDetalhe(despesaId);
      assertOk(detalhe);
      const item = json<{
        data: { itensDespesa: Array<{ descricao: string; patrimonioItemId: string | null }> };
      }>(detalhe).data.itensDespesa[0];
      expect(item?.descricao).toBe("Conta de luz de marco");
      expect(item?.patrimonioItemId ?? null).toBeNull();
    });

    it("SALVA de volta sem vinculo — a regra nova nao invalida o passado", async () => {
      const despesaId = await criarDespesaLegada(60, ["Conta de luz de marco"]);

      const resposta = await contexto.app.inject({
        method: "PUT",
        url: `/api/despesas/${despesaId}`,
        headers: { cookie: cookieAdmin },
        payload: {
          empresaId: idsTeste.empresaA,
          dataReferencia: "2026-06-30",
          dataVencimento: "2026-07-10",
          descricao: "Despesa legada reeditada",
          valorOriginal: 60,
          contaOrigemId: idsTeste.contaCaixa,
          itensDespesa: [{ descricao: "Conta de luz de marco", valor: 60 }]
        }
      });

      assertOk(resposta);
      const linha = await consultarUm<{ descricao: string }>(
        "select descricao from despesas_itens where despesa_id = $1",
        [despesaId]
      );
      expect(linha?.descricao).toBe("Conta de luz de marco");
    });

    it("mas RECUSA acrescentar uma linha nova sem vinculo ao lado da legada", async () => {
      const despesaId = await criarDespesaLegada(60, ["Conta de luz de marco"]);

      const resposta = await contexto.app.inject({
        method: "PUT",
        url: `/api/despesas/${despesaId}`,
        headers: { cookie: cookieAdmin },
        payload: {
          empresaId: idsTeste.empresaA,
          dataReferencia: "2026-06-30",
          dataVencimento: "2026-07-10",
          descricao: "Despesa legada com linha nova",
          valorOriginal: 100,
          contaOrigemId: idsTeste.contaCaixa,
          itensDespesa: [
            { descricao: "Conta de luz de marco", valor: 60 },
            { descricao: "Linha nova digitada a mao", valor: 40 }
          ]
        }
      });

      assertProblem(resposta, 400, "ITEM_DISCRIMINACAO_SEM_VINCULO");
      expect(JSON.stringify(resposta.json())).toContain("linha 2");
    });

    it("RECUSA duplicar a linha legada para injetar texto livre (cada gravada casa uma vez so)", async () => {
      const despesaId = await criarDespesaLegada(60, ["Conta de luz de marco"]);

      const resposta = await contexto.app.inject({
        method: "PUT",
        url: `/api/despesas/${despesaId}`,
        headers: { cookie: cookieAdmin },
        payload: {
          empresaId: idsTeste.empresaA,
          dataReferencia: "2026-06-30",
          dataVencimento: "2026-07-10",
          descricao: "Despesa legada duplicada",
          valorOriginal: 120,
          contaOrigemId: idsTeste.contaCaixa,
          itensDespesa: [
            { descricao: "Conta de luz de marco", valor: 60 },
            { descricao: "Conta de luz de marco", valor: 60 }
          ]
        }
      });

      assertProblem(resposta, 400, "ITEM_DISCRIMINACAO_SEM_VINCULO");
    });

    it("RECUSA reescrever o TEXTO da linha legada (preservar historico != poder editar a mao)", async () => {
      const despesaId = await criarDespesaLegada(60, ["Conta de luz de marco"]);

      const resposta = await contexto.app.inject({
        method: "PUT",
        url: `/api/despesas/${despesaId}`,
        headers: { cookie: cookieAdmin },
        payload: {
          empresaId: idsTeste.empresaA,
          dataReferencia: "2026-06-30",
          dataVencimento: "2026-07-10",
          descricao: "Despesa legada com texto trocado",
          valorOriginal: 60,
          contaOrigemId: idsTeste.contaCaixa,
          itensDespesa: [{ descricao: "Conta de luz de ABRIL", valor: 60 }]
        }
      });

      assertProblem(resposta, 400, "ITEM_DISCRIMINACAO_SEM_VINCULO");
    });

    it("ACEITA trocar a linha legada por um item do cadastro (o caminho de regularizacao)", async () => {
      const despesaId = await criarDespesaLegada(60, ["Conta de luz de marco"]);

      const resposta = await contexto.app.inject({
        method: "PUT",
        url: `/api/despesas/${despesaId}`,
        headers: { cookie: cookieAdmin },
        payload: {
          empresaId: idsTeste.empresaA,
          dataReferencia: "2026-06-30",
          dataVencimento: "2026-07-10",
          descricao: "Despesa legada regularizada",
          valorOriginal: 60,
          contaOrigemId: idsTeste.contaCaixa,
          itensDespesa: [{ descricao: "Forno de lastro", valor: 60, patrimonioItemId: idsTeste.patrimonioItemForno }]
        }
      });

      assertOk(resposta);
      const linha = await consultarUm<{ patrimonio_item_id: string | null }>(
        "select patrimonio_item_id from despesas_itens where despesa_id = $1",
        [despesaId]
      );
      expect(linha?.patrimonio_item_id).toBe(idsTeste.patrimonioItemForno);
    });
  });

  // ------------------------------------------------------------------------------------------
  // 5) A rota que alimenta o campo de item — e quem pode ver
  // ------------------------------------------------------------------------------------------
  describe("GET /api/patrimonio/opcoes-itens", () => {
    it("devolve a lista ENXUTA (id, nome, grupo) e nada alem", async () => {
      const resposta = await contexto.app.inject({
        method: "GET",
        url: `/api/patrimonio/opcoes-itens?empresaId=${idsTeste.empresaA}`,
        headers: { cookie: cookieAdmin }
      });

      assertOk(resposta);
      type OpcaoItem = { id: string; nome: string; grupoPatrimonioId: string };
      const itens = json<{ data: OpcaoItem[] }>(resposta).data;
      const forno = itens.find((item) => item.id === idsTeste.patrimonioItemForno);
      expect(forno).toBeTruthy();
      expect(forno?.nome).toBe("Forno de lastro");
      expect(forno?.grupoPatrimonioId).toBe(idsTeste.grupoPatrimonioMaquinas);
      // Enxuta de proposito: quem lanca despesa nao precisa (nem deve) receber o cadastro inteiro.
      expect(Object.keys(forno ?? {}).sort()).toEqual(["grupoPatrimonioId", "id", "nome"]);
    });

    it("NAO vaza item de outra empresa", async () => {
      const resposta = await contexto.app.inject({
        method: "GET",
        url: `/api/patrimonio/opcoes-itens?empresaId=${idsTeste.empresaA}`,
        headers: { cookie: cookieAdmin }
      });

      assertOk(resposta);
      expect(JSON.stringify(resposta.json())).not.toContain(idsTeste.patrimonioItemOutraEmpresa);
    });

    it("o operador de CAIXA enxerga (lanca despesa, precisa discriminar) mesmo sem o cadastro", async () => {
      // A razao de a rota existir separada de /api/patrimonio: exigir cadastro_patrimonio_visualizar
      // daria ao caixa o cadastro inteiro (e a tela no menu) so para ele escolher um item.
      const resposta = await contexto.app.inject({
        method: "GET",
        url: `/api/patrimonio/opcoes-itens?empresaId=${idsTeste.empresaA}`,
        headers: { cookie: cookieCaixa }
      });

      assertOk(resposta);
    });

    it("quem nao lanca despesa nem ve patrimonio recebe 403", async () => {
      const resposta = await contexto.app.inject({
        method: "GET",
        url: `/api/patrimonio/opcoes-itens?empresaId=${idsTeste.empresaA}`,
        headers: { cookie: cookieSemPermissao }
      });

      expect(resposta.statusCode).toBe(403);
    });

    it("sem sessao, 401 (default-deny vale aqui como em qualquer rota)", async () => {
      const resposta = await contexto.app.inject({
        method: "GET",
        url: `/api/patrimonio/opcoes-itens?empresaId=${idsTeste.empresaA}`
      });

      expect(resposta.statusCode).toBe(401);
    });
  });
});
