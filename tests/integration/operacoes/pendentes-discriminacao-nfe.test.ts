import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { executarSql, json } from "../../setup/integracao.js";

// Bug de producao (PR2 Parte 1a): mercadorias criadas pela importacao de NF-e nascem com caixa_id
// NULL. A fila "somente pendentes de discriminacao" estava presa ao filtro do caixa aberto, entao
// essas mercadorias ficavam INVISIVEIS. Com o toggle ligado, a listagem deve ignorar o caixa.
describe("mercadorias: fila de pendentes de discriminacao ignora o filtro de caixa", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string; // admin tem menu_mercadorias_somente_caixa_aberto E um caixa aberto no seed

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    // Mercadoria "de NF-e": caixa_id NULL, sem itens -> pendente de discriminacao.
    await executarSql(
      `insert into mercadorias
         (empresa_id, caixa_id, fornecedor_id, data_referencia, data_vencimento, descricao, valor_original,
          status, computar, tem_nota_fiscal)
       values ($1, null, $2, '2026-07-10', '2026-07-10', 'NF-E-PENDENTE-TESTE', '100.00',
               'aguardando_aprovacao', false, true)`,
      [idsTeste.empresaA, idsTeste.fornecedor]
    );
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  function listar(pendente: boolean) {
    const url = `/api/mercadorias?empresaId=${idsTeste.empresaA}${pendente ? "&pendenteDiscriminacao=true" : ""}`;
    return contexto.app.inject({ method: "GET", url, headers: { cookie: cookieAdmin } });
  }

  it("com o toggle ligado, a mercadoria de NF-e (caixa_id NULL) aparece na fila", async () => {
    const resposta = await listar(true);
    expect(resposta.statusCode).toBe(200);
    const linhas = json<{ data: Array<{ descricao: string; pendenteDiscriminacao: boolean }> }>(resposta).data;
    const alvo = linhas.find((m) => m.descricao === "NF-E-PENDENTE-TESTE");
    expect(alvo, "mercadoria de NF-e deveria aparecer na fila de pendentes").toBeDefined();
    expect(alvo!.pendenteDiscriminacao).toBe(true);
  });

  it("sem o toggle, ela fica presa ao filtro do caixa aberto (nao aparece) — comportamento contrastante", async () => {
    const resposta = await listar(false);
    expect(resposta.statusCode).toBe(200);
    const linhas = json<{ data: Array<{ descricao: string }> }>(resposta).data;
    expect(linhas.find((m) => m.descricao === "NF-E-PENDENTE-TESTE")).toBeUndefined();
  });
});
