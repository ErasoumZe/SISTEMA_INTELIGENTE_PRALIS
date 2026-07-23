import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

// M2 (R3/R4/R6): sangria (turno) e retorno (fechamento) = caixa -> cofre, mesma entidade com tipo.
// Cobre: (a) a fórmula do déficit NAO descontar em dobro apos sangria; (b) retorno proposto pela
// sobra zera o saldo e libera o fechamento; (c) agregacao "aba TRANSFERENCIAS" por caixa+dia.
describe("caixa - retorno/sangria (M2)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  const empresaId = idsTeste.empresaA;

  async function usuarioAdminId() {
    const u = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
      usuariosTeste.admin.email
    ]);
    if (!u) throw new Error("Usuario admin nao encontrado");
    return u.id;
  }

  function post(url: string, payload: object) {
    return contexto.app.inject({ method: "POST", url, headers: { cookie: cookieAdmin }, payload });
  }

  async function criar(url: string, payload: object) {
    const r = await post(url, payload);
    expect(r.statusCode, `${url} -> ${r.body}`).toBe(201);
    return json<{ data: { id: string } }>(r).data.id;
  }

  async function criarMalote(codigo: string, valor: number, lacres: string[]) {
    return criar("/api/malotes", { empresaId, codigo, valor, lacres });
  }

  async function abrir(nome: string, dataHora: string, maloteId?: string) {
    const contaId = await criar("/api/contas", { empresaId, nome: `Conta ${nome}` });
    const pdvId = await criar("/api/pdvs", { empresaId, nome: `PDV ${nome}`, contaId, ativo: true });
    const abrirResp = await post("/api/caixa/abrir", {
      empresaId,
      pdvId,
      usuarioCaixaId: await usuarioAdminId(),
      dataHoraAbertura: dataHora,
      ...(maloteId ? { maloteId } : {})
    });
    expect(abrirResp.statusCode, abrirResp.body).toBe(201);
    return { contaId, pdvId, caixaId: json<{ data: { id: string } }>(abrirResp).data.id };
  }

  async function venda(contaId: string, pdvId: string, dataReferencia: string, valor: number) {
    await criar("/api/vendas", {
      empresaId,
      dataReferencia,
      dataPagamento: dataReferencia,
      descricao: "Venda",
      valorOriginal: valor,
      contaOrigemId: contaId,
      pdvId,
      colaboradorId: idsTeste.colaboradorAdmin,
      itensVenda: [
        { produtoId: idsTeste.produto, descricaoProduto: "Pao", quantidade: 1, valorUnitario: valor, valorTotal: valor }
      ],
      tiposPagamento: [{ formaPagamentoId: idsTeste.formaPagamentoDinheiro, numeroVendas: 1, totalPago: valor }]
    });
  }

  function transferenciaCofre(caixaId: string, tipo: "sangria" | "retorno", valor: number) {
    return post(`/api/caixa/${caixaId}/transferencia-cofre`, { tipo, valor });
  }

  async function resumoAtual() {
    const r = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${empresaId}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(r);
    return json<{ data: { resumo: Record<string, number> } }>(r).data.resumo;
  }

  async function agregado(caixaId: string) {
    const r = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/${caixaId}/transferencias`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(r);
    return json<{
      data: {
        itens: { tipo: string; ordem: number; valor: number; sentido: string }[];
        totalSaida: number;
        totalEntrada: number;
        saldo: number;
      };
    }>(r).data;
  }

  it("Sangria NAO desconta o deficit em dobro (saldoProprio correto)", async () => {
    const maloteId = await criarMalote("MAL-SANGRIA", 490, ["LAC-SANGRIA"]);
    const { contaId, pdvId, caixaId } = await abrir("sangria", "2026-08-01T08:00", maloteId);

    await venda(contaId, pdvId, "2026-08-01", 490);
    // Divida quitada: saldoProprio == 0, saldo fisico == 980 (490 abertura + 490 vendas).
    expect(await resumoAtual()).toMatchObject({ dividaCofre: 490, saldoProprio: 0, saldo: 980 });

    // Sangria de 200: so MOVE dinheiro -> saldoProprio continua 0; saldo fisico cai 200.
    const sangria = await transferenciaCofre(caixaId, "sangria", 200);
    expect(sangria.statusCode, sangria.body).toBe(200);
    expect(await resumoAtual()).toMatchObject({ dividaCofre: 490, saldoProprio: 0, saldo: 780 });
  });

  it("Retorno da sobra zera o saldo e libera o fechamento", async () => {
    // Abertura no passado (o fechamento usa "agora" e precisa ser posterior a abertura).
    const { contaId, pdvId, caixaId } = await abrir("retorno", "2026-07-20T08:00");
    await venda(contaId, pdvId, "2026-07-20", 300);

    const resumo = await resumoAtual();
    expect(resumo).toMatchObject({ saldo: 300, propostaRetorno: 300 });

    const retorno = await transferenciaCofre(caixaId, "retorno", resumo["propostaRetorno"] ?? 0);
    expect(retorno.statusCode, retorno.body).toBe(200);
    expect(await resumoAtual()).toMatchObject({ saldo: 0, propostaRetorno: 0 });

    const fechar = await post(`/api/caixa/${caixaId}/fechar`, { observacao: "Fechamento com retorno" });
    expect(fechar.statusCode, fechar.body).toBe(204);
  });

  it("Agrega por caixa+dia: 1a/2a saida (abertura+suprimento) e 1a/2a entrada (sangria+retorno)", async () => {
    const maloteId = await criarMalote("MAL-AGREGA", 490, ["LAC-AGREGA"]);
    const { contaId, caixaId } = await abrir("agrega", "2026-08-03T08:00", maloteId);

    // 2o suprimento (cofre -> caixa) pela rota manual de transferencias.
    await criar("/api/transferencias", {
      empresaId,
      dataReferencia: "2026-08-03",
      descricao: "Suprimento reforco",
      valorOriginal: 100,
      contaOrigemId: idsTeste.contaCofre,
      contaDestinoId: contaId
    });
    // Duas entradas (caixa -> cofre): sangria 200 + retorno 150.
    expect((await transferenciaCofre(caixaId, "sangria", 200)).statusCode).toBe(200);
    expect((await transferenciaCofre(caixaId, "retorno", 150)).statusCode).toBe(200);

    const agg = await agregado(caixaId);
    // SAIDA do cofre = abertura(490) + suprimento(100) = 590; ENTRADA = sangria(200)+retorno(150) = 350.
    expect(agg.totalSaida).toBe(590);
    expect(agg.totalEntrada).toBe(350);
    expect(agg.saldo).toBe(350 - 590); // -240

    const saidas = agg.itens.filter((i) => i.sentido === "saida");
    const entradas = agg.itens.filter((i) => i.sentido === "entrada");
    expect(saidas.map((i) => i.ordem)).toEqual([1, 2]); // abertura, suprimento
    expect(entradas.map((i) => i.ordem)).toEqual([1, 2]); // sangria, retorno
    expect(saidas.map((i) => i.tipo)).toEqual(["abertura", "suprimento"]);
    expect(entradas.map((i) => i.tipo)).toEqual(["sangria", "retorno"]);
  });
});
