import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { executarSql, json } from "../../setup/integracao.js";

// O historico de integracao agrupa os ciclos por diaNegocio(criadoEm): um ciclo ingerido as
// 22:00 BRT (01:00Z do dia SEGUINTE) tem de aparecer no dia LOCAL, nao no de UTC. Era o "23/07".
describe("integracoes - historico agrupa pelo dia LOCAL (nao UTC)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve agrupar um ciclo das 22:00 BRT (01:00Z) no dia LOCAL do negocio", async () => {
    // Ciclo ingerido as 01:00Z de 17/07 = 22:00 BRT de 16/07.
    await executarSql(
      `insert into integracoes_historico (empresa_id, integracao_chave_id, tipo, status, payload, criado_em)
       values ($1, $2, 'vendas', 'criado', '{}'::jsonb, '2026-07-17T01:00:00Z')`,
      [idsTeste.empresaA, idsTeste.integracaoChave]
    );

    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/integracoes/historico?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(resposta);

    const dias = json<{ data: { dia: string; tipo: string; recebidos: number }[] }>(resposta).data.map((d) => d.dia);
    expect(dias).toContain("2026-07-16"); // nao "2026-07-17" (UTC)
    expect(dias).not.toContain("2026-07-17");
  });
});
