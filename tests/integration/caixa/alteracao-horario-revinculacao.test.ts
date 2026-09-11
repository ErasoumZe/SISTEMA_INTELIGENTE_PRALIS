import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";

// R-184: o instante de abertura e log do servidor, imutavel. A rota antiga era uma segunda
// porta para alterar esse fato e para reanexar vendas por uma janela escolhida pelo operador.
describe("caixa: abertura auditavel", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("nao expoe a rota legada que permitia reescrever a abertura", async () => {
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/caixa/${idsTeste.caixaAberto}/horario`,
      headers: { cookie: cookieAdmin },
      payload: { dataHoraAbertura: "2026-07-15T08:00", observacao: "Tentativa de alterar log" }
    });

    expect(resposta.statusCode).toBe(404);
  });
});
