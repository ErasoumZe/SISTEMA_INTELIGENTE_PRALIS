import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { abrirCaixaDoOperador, encerrarCaixaSeedAdminParaTeste } from "../../setup/caixa.js";
import { usuariosTeste } from "../../setup/contexto.js";

// Ultima etapa da Tesouraria (Marco, 12/11/2026): previa e envio para a planilha. So quem confere o fechamento, so
// depois de fechar, e o PDV das linhas e sempre o do caixa. A gravacao em si e coberta no teste unitario com uma
// planilha em memoria (sob teste o cliente real do Google e travado).
describe("planilha da Tesouraria", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieCaixa: string;
  let caixaId: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    await encerrarCaixaSeedAdminParaTeste();
    [cookieAdmin, cookieCaixa] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "caixa")
    ]);
    const caixa = await abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieCaixa,
      emailOperador: usuariosTeste.caixa.email,
      nome: "Planilha Tesouraria",
      registrarLimpeza: false
    });
    caixaId = caixa.caixaId;
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  const chamar = (rota: "previa" | "enviar", cookie: string, payload: object = {}) =>
    contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixaId}/planilha-tesouraria/${rota}`,
      headers: { cookie },
      payload
    });

  it("quem nao confere o fechamento nao le nem envia", async () => {
    expect((await chamar("previa", cookieCaixa)).statusCode).toBe(403);
    expect((await chamar("enviar", cookieCaixa, { cartao: null, relatorioPdv: null })).statusCode).toBe(403);
  });

  it("caixa ainda aberto: o relatorio so vai para a planilha depois do fechamento", async () => {
    const resposta = await chamar("previa", cookieAdmin);
    expect(resposta.statusCode).toBe(409);
    expect(resposta.body).toContain("PLANILHA_CAIXA_ABERTO");
  });

  it("linha com dados invalidos e recusada antes de tocar na planilha", async () => {
    const resposta = await chamar("enviar", cookieAdmin, {
      cartao: [
        {
          data: "10-11-2026",
          numeroSerie: "J9BB07936155",
          pdv: "VND CAIXA PDV - 9M",
          modalidade: "CRÉDITO",
          bandeira: "ELO",
          transacoes: 6,
          valor: 96.22
        }
      ],
      relatorioPdv: null
    });
    expect(resposta.statusCode).toBe(400);
  });
});
