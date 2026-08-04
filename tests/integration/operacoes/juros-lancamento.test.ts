// R-041 (juros em % ou R$) e R-042 (Valor Total = Valor + Juros), contra banco real.
//
// O ponto central deste arquivo nao e "o juros e gravado" — e que o SERVIDOR RECALCULA. O cliente
// manda jurosTipo/jurosValorInformado; o valorAcrescimo que ele mandar junto e descartado. Sem esta
// prova, um front adulterado poderia declarar R$ 999.999 de juros sobre uma despesa de R$ 1.000 e o
// caixa, a conta e o relatorio acreditariam — porque valor_acrescimo entra em liquidoCentavos.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

type LinhaJuros = {
  valor_original: string;
  valor_acrescimo: string;
  juros_tipo: string | null;
  juros_valor_informado: string | null;
};

describe("juros do lancamento (R-041/R-042) integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  async function criarDespesa(extra: Record<string, unknown>): Promise<string> {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/despesas",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-06-30",
        dataVencimento: "2026-07-10",
        descricao: "Despesa com juros",
        valorOriginal: 1000,
        contaOrigemId: idsTeste.contaCaixa,
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        ...extra
      }
    });
    // O body entra na mensagem: 400 sem motivo visivel custa mais tempo que a linha extra.
    expect(resposta.statusCode, resposta.body).toBe(201);
    return json<{ data: { id: string } }>(resposta).data.id;
  }

  const lerJuros = (id: string) =>
    consultarUm<LinhaJuros>(
      "select valor_original, valor_acrescimo, juros_tipo, juros_valor_informado from despesas where id = $1",
      [id]
    );

  it("juros em PERCENTUAL: 1000 a 2% grava 20,00 de acrescimo e guarda que era 2%", async () => {
    const id = await criarDespesa({ jurosTipo: "percentual", jurosValorInformado: 2 });
    const linha = await lerJuros(id);

    expect(Number(linha?.valor_acrescimo)).toBe(20);
    expect(linha?.juros_tipo).toBe("percentual");
    // Reabrir tem de mostrar "2 %", nao "R$ 20,00" — por isso o informado e guardado separado.
    expect(Number(linha?.juros_valor_informado)).toBe(2);
    // R-042: total = 1000 + 20.
    expect(Number(linha?.valor_original) + Number(linha?.valor_acrescimo)).toBe(1020);
  });

  it("juros em VALOR: o informado ja e o R$", async () => {
    const id = await criarDespesa({ jurosTipo: "valor", jurosValorInformado: 35.5 });
    const linha = await lerJuros(id);

    expect(Number(linha?.valor_acrescimo)).toBe(35.5);
    expect(linha?.juros_tipo).toBe("valor");
    expect(Number(linha?.juros_valor_informado)).toBe(35.5);
  });

  it("o servidor IGNORA o valorAcrescimo que o cliente mandou junto do juros", async () => {
    // O cliente mente: diz 2% e tenta declarar R$ 999.999 de acrescimo no mesmo payload.
    const id = await criarDespesa({
      jurosTipo: "percentual",
      jurosValorInformado: 2,
      valorAcrescimo: 999_999
    });
    const linha = await lerJuros(id);

    // Vale a conta do servidor (2% de 1000), nao o numero do cliente.
    expect(Number(linha?.valor_acrescimo)).toBe(20);
    expect(Number(linha?.valor_acrescimo)).not.toBe(999_999);
  });

  it("sem jurosTipo, o acrescimo generico continua passando (venda/historico nao regridem)", async () => {
    const id = await criarDespesa({ valorAcrescimo: 12.34 });
    const linha = await lerJuros(id);

    expect(Number(linha?.valor_acrescimo)).toBe(12.34);
    expect(linha?.juros_tipo).toBeNull();
    expect(linha?.juros_valor_informado).toBeNull();
  });

  it("editar para tirar o juros ZERA as colunas — nao deixa juros fantasma", async () => {
    const id = await criarDespesa({ jurosTipo: "percentual", jurosValorInformado: 2 });
    expect(Number((await lerJuros(id))?.valor_acrescimo)).toBe(20);

    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/despesas/${id}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-06-30",
        dataVencimento: "2026-07-10",
        descricao: "Despesa sem juros agora",
        valorOriginal: 1000,
        contaOrigemId: idsTeste.contaCaixa,
        grupoDespesaId: idsTeste.grupoDespesaOperacional
      }
    });
    expect(resposta.statusCode, resposta.body).toBe(200);

    const linha = await lerJuros(id);
    expect(linha?.juros_tipo).toBeNull();
    expect(linha?.juros_valor_informado).toBeNull();
    expect(Number(linha?.valor_acrescimo)).toBe(0);
  });
});
