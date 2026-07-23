import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

// M1 / R8: abertura de caixa com MALOTE. O malote e um emprestimo do cofre — ao seleciona-lo na
// abertura, o servidor cria a transferencia cofre->caixa (tipo 'abertura') e o caixa NASCE devendo
// esse valor (deficit). As vendas em dinheiro quitam a divida. Formula canonica (saldo fisico)
// intacta (ADR-001); o deficit vive em divida_cofre + saldoProprio derivado (Opcao A / Lente B).
describe("caixa - abertura com malote (deficit do cofre, R8)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  async function usuarioAdminId() {
    const usuario = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
      usuariosTeste.admin.email
    ]);
    if (!usuario) throw new Error("Usuario admin nao encontrado");
    return usuario.id;
  }

  function post(url: string, payload: object) {
    return contexto.app.inject({ method: "POST", url, headers: { cookie: cookieAdmin }, payload });
  }

  async function criar(url: string, payload: object) {
    const resposta = await post(url, payload);
    expect(resposta.statusCode, `${url} -> ${resposta.body}`).toBe(201);
    return resposta;
  }

  // Conta + PDV proprios (o PDV nao pode ter caixa aberto). Devolve a conta do caixa e o PDV.
  async function criarContaEPdv(nome: string) {
    const conta = await criar("/api/contas", { empresaId: idsTeste.empresaA, nome: `Conta ${nome}` });
    const contaId = json<{ data: { id: string } }>(conta).data.id;
    const pdv = await criar("/api/pdvs", { empresaId: idsTeste.empresaA, nome: `PDV ${nome}`, contaId, ativo: true });
    const pdvId = json<{ data: { id: string } }>(pdv).data.id;
    return { contaId, pdvId };
  }

  // O malote E o lacre (D3): a identidade e o numero do lacre + o valor.
  async function criarMalote(numeroLacre: string, valor: number) {
    const resposta = await criar("/api/malotes", { empresaId: idsTeste.empresaA, numeroLacre, valor });
    return json<{ data: { id: string } }>(resposta).data.id;
  }

  async function abrir(payload: Record<string, unknown>) {
    const resposta = await criar("/api/caixa/abrir", { empresaId: idsTeste.empresaA, ...payload });
    return json<{ data: { id: string } }>(resposta).data.id;
  }

  async function resumoAtual() {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(resposta);
    return json<{ data: { caixaAberto: { id: string }; resumo: Record<string, number> } }>(resposta).data;
  }

  it("Deve nascer em deficit -490, criar a transferencia de abertura e consumir o malote (lacre)", async () => {
    const maloteId = await criarMalote("LAC-ABE-1", 490);
    const { contaId, pdvId } = await criarContaEPdv("abertura-malote");

    const caixaId = await abrir({
      pdvId,
      usuarioCaixaId: await usuarioAdminId(),
      dataHoraAbertura: "2026-05-10T08:00",
      maloteId
    });

    // Saldo fisico segue +490 (o dinheiro esta na gaveta); o deficit vive em dividaCofre/saldoProprio.
    const status = await resumoAtual();
    expect(status.caixaAberto.id).toBe(caixaId);
    expect(status.resumo).toMatchObject({ dividaCofre: 490, saldo: 490, saldoProprio: -490 });

    // Transferencia de abertura: cofre -> caixa, tipo 'abertura', vinculada ao caixa/malote.
    const transferencia = await consultarUm<{
      tipo: string;
      valor_original: string;
      conta_origem_id: string;
      conta_destino_id: string;
      malote_id: string;
    }>(
      `select tipo, valor_original, conta_origem_id, conta_destino_id, malote_id
         from transferencias where caixa_id = $1 and tipo = 'abertura'`,
      [caixaId]
    );
    expect(transferencia).toMatchObject({
      tipo: "abertura",
      valor_original: "490.00",
      conta_origem_id: idsTeste.contaCofre,
      conta_destino_id: contaId,
      malote_id: maloteId
    });

    // Malote (lacre) vira em_uso.
    const malote = await consultarUm<{ status: string }>("select status from malotes where id = $1", [maloteId]);
    expect(malote?.status).toBe("em_uso");

    // Fechamento guarda o vinculo da abertura + a divida.
    const caixa = await consultarUm<{ divida_cofre: string; lacre_abertura: string; malote_abertura_id: string }>(
      "select divida_cofre, lacre_abertura, malote_abertura_id from fechamentos_caixa where id = $1",
      [caixaId]
    );
    expect(caixa).toMatchObject({
      divida_cofre: "490.00",
      lacre_abertura: "LAC-ABE-1",
      malote_abertura_id: maloteId
    });
  });

  it("Deve quitar a divida (saldo proprio = 0) quando as vendas em dinheiro igualam o malote", async () => {
    const maloteId = await criarMalote("LAC-ABE-2", 490);
    const { contaId, pdvId } = await criarContaEPdv("quita-divida");
    const caixaId = await abrir({
      pdvId,
      usuarioCaixaId: await usuarioAdminId(),
      dataHoraAbertura: "2026-05-11T08:00",
      maloteId
      // lacreAbertura omitido: opcional por enquanto (D5).
    });

    // R$490 em vendas dinheiro.
    await criar("/api/vendas", {
      empresaId: idsTeste.empresaA,
      dataReferencia: "2026-05-11",
      dataPagamento: "2026-05-11",
      descricao: "Vendas do turno",
      valorOriginal: 490,
      contaOrigemId: contaId,
      pdvId,
      colaboradorId: idsTeste.colaboradorAdmin,
      itensVenda: [
        { produtoId: idsTeste.produto, descricaoProduto: "Pao", quantidade: 1, valorUnitario: 490, valorTotal: 490 }
      ],
      tiposPagamento: [{ formaPagamentoId: idsTeste.formaPagamentoDinheiro, numeroVendas: 1, totalPago: 490 }]
    });

    const status = await resumoAtual();
    expect(status.caixaAberto.id).toBe(caixaId);
    // Fisico = 490 (abertura) + 490 (vendas) = 980; divida = 490; saldo proprio = 0 (divida quitada).
    expect(status.resumo).toMatchObject({ dividaCofre: 490, saldo: 980, saldoProprio: 0 });
  });

  it("Deve abrir SEM malote com o comportamento atual intacto (retrocompat)", async () => {
    const { pdvId } = await criarContaEPdv("sem-malote");
    const caixaId = await abrir({
      pdvId,
      usuarioCaixaId: await usuarioAdminId(),
      dataHoraAbertura: "2026-05-12T08:00"
    });

    const status = await resumoAtual();
    expect(status.caixaAberto.id).toBe(caixaId);
    expect(status.resumo).toMatchObject({ dividaCofre: 0, saldo: 0, saldoProprio: 0 });

    const caixa = await consultarUm<{ divida_cofre: string; malote_abertura_id: string | null }>(
      "select divida_cofre, malote_abertura_id from fechamentos_caixa where id = $1",
      [caixaId]
    );
    expect(caixa).toMatchObject({ divida_cofre: "0.00", malote_abertura_id: null });
    const transferencia = await consultarUm("select id from transferencias where caixa_id = $1", [caixaId]);
    expect(transferencia).toBeNull();
  });

  it("Deve recusar um malote que ja esta em_uso", async () => {
    const maloteId = await criarMalote("LAC-ABE-4", 300);
    const primeiro = await criarContaEPdv("malote-uso-1");
    await abrir({
      pdvId: primeiro.pdvId,
      usuarioCaixaId: await usuarioAdminId(),
      dataHoraAbertura: "2026-05-13T08:00",
      maloteId
    });

    // Segundo caixa (outro PDV) tentando o MESMO malote, agora em_uso.
    const segundo = await criarContaEPdv("malote-uso-2");
    const resposta = await post("/api/caixa/abrir", {
      empresaId: idsTeste.empresaA,
      pdvId: segundo.pdvId,
      usuarioCaixaId: await usuarioAdminId(),
      dataHoraAbertura: "2026-05-13T09:00",
      maloteId
    });
    assertProblem(resposta, 400);
    expect(resposta.body).toContain("Malote indisponivel");
  });

  it("Deve PARAR (Regra 5) quando a empresa nao tem conta de cofre configurada", async () => {
    const maloteId = await criarMalote("LAC-ABE-5", 200);
    const { pdvId } = await criarContaEPdv("sem-cofre");
    await executarSql("update empresas set conta_cofre_id = null where id = $1", [idsTeste.empresaA]);
    try {
      const resposta = await post("/api/caixa/abrir", {
        empresaId: idsTeste.empresaA,
        pdvId,
        usuarioCaixaId: await usuarioAdminId(),
        dataHoraAbertura: "2026-05-14T08:00",
        maloteId
      });
      assertProblem(resposta, 400);
      expect(resposta.body).toContain("conta de cofre");
    } finally {
      await executarSql("update empresas set conta_cofre_id = $1 where id = $2", [
        idsTeste.contaCofre,
        idsTeste.empresaA
      ]);
    }
  });
});
