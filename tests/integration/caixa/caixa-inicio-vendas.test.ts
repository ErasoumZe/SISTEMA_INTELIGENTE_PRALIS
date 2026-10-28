import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { abrirCaixaDoOperador } from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, consultarTodos, executarSql, json } from "../../setup/integracao.js";

// R-224: o operador recua o inicio das vendas do caixa (abriu no sistema depois de ja vender no PDV).
describe("Caixa - ajustar o inicio das vendas (R-224)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieCaixa: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    [cookieAdmin, cookieCaixa] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "caixa")
    ]);
  }, 120_000);

  afterAll(async () => contexto.fechar());

  function ajustar(caixaId: string, payload: Record<string, unknown>) {
    return contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixaId}/inicio-vendas`,
      headers: { cookie: cookieCaixa },
      payload
    });
  }

  it("recua ate 60 min com motivo, puxa as vendas sem caixa e guarda a abertura oficial no log", async () => {
    const caixa = await abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieCaixa,
      emailOperador: usuariosTeste.caixa.email,
      nome: "Caixa inicio vendas",
      dataHoraAbertura: "2026-07-30T13:18"
    });
    const linha = await consultarUm<{ aberto_em: Date; data_hora_abertura: Date; pdv_id: string; empresa_id: string }>(
      "select aberto_em, data_hora_abertura, pdv_id, empresa_id from fechamentos_caixa where id = $1",
      [caixa.caixaId]
    );
    if (!linha) throw new Error("caixa nao encontrado");
    const oficial = new Date(linha.aberto_em);

    // Uma venda do CREARE 10 min ANTES da abertura oficial ficou sem caixa (antes da regra nova ela nunca entrava).
    const vendaAntes = new Date(oficial.getTime() - 10 * 60_000);
    // A venda precisa ter vindo da integracao (so venda do CREARE e revinculada por horario).
    const chave = await consultarUm<{ id: string }>(
      "insert into integracoes_chaves (empresa_id, tipo, codigo, ativa) values ($1, 'vendas', $2, true) returning id",
      [linha.empresa_id, `TESTE-INICIO-${caixa.caixaId}`]
    );
    await executarSql(
      `insert into vendas (empresa_id, pdv_id, caixa_id, identificador_externo, descricao, data_referencia, data_venda,
                           valor_original, status, computar, integracao_chave_id)
       values ($1, $2, null, 'CREARE:INICIO-1', 'Venda antes da abertura', $3::date, $4, 12.50, 'aprovado', true, $5)`,
      [
        linha.empresa_id,
        linha.pdv_id,
        vendaAntes.toISOString().slice(0, 10),
        vendaAntes.toISOString(),
        chave?.id ?? null
      ]
    );

    // Sem motivo: 400 (validacao). Mais de 60 min: 422. Depois da abertura oficial: 422.
    expect((await ajustar(caixa.caixaId, { inicio: vendaAntes.toISOString() })).statusCode).toBe(400);
    const muitoAntes = await ajustar(caixa.caixaId, {
      inicio: new Date(oficial.getTime() - 61 * 60_000).toISOString(),
      motivo: "Muito antes"
    });
    expect(muitoAntes.statusCode, muitoAntes.body).toBe(422);
    const depois = await ajustar(caixa.caixaId, {
      inicio: new Date(oficial.getTime() + 60_000).toISOString(),
      motivo: "Depois da abertura"
    });
    expect(depois.statusCode, depois.body).toBe(422);

    // Valido: 18 min antes.
    const novoInicio = new Date(oficial.getTime() - 18 * 60_000);
    const resposta = await ajustar(caixa.caixaId, {
      inicio: novoInicio.toISOString(),
      motivo: "Abri o caixa no sistema depois de comecar a vender"
    });
    expect(resposta.statusCode, resposta.body).toBe(200);
    const dados = json<{ data: { inicioVendas: string; aberturaOficial: string; vendasAnexadas: number } }>(
      resposta
    ).data;
    expect(dados.aberturaOficial).toBe(oficial.toISOString());
    expect(dados.inicioVendas).toBe(novoInicio.toISOString());

    const depoisDoAjuste = await consultarUm<{ aberto_em: Date; data_hora_abertura: Date }>(
      "select aberto_em, data_hora_abertura from fechamentos_caixa where id = $1",
      [caixa.caixaId]
    );
    // A abertura oficial NAO muda; so o inicio das vendas.
    expect(new Date(depoisDoAjuste!.aberto_em).toISOString()).toBe(oficial.toISOString());
    expect(new Date(depoisDoAjuste!.data_hora_abertura).toISOString()).toBe(novoInicio.toISOString());

    // A venda de 10 min antes da abertura oficial (sem caixa) passou a ser deste caixa.
    const venda = await consultarUm<{ caixa_id: string | null }>(
      "select caixa_id from vendas where identificador_externo = 'CREARE:INICIO-1' and empresa_id = $1",
      [linha.empresa_id]
    );
    expect(venda?.caixa_id).toBe(caixa.caixaId);
    expect(dados.vendasAnexadas).toBeGreaterThanOrEqual(1);

    // O log guarda quem, quando, o motivo e as duas horas.
    const log = await consultarTodos<{
      observacao: string;
      valores_antigos: Record<string, string>;
      valores_novos: Record<string, string>;
    }>("select observacao, valores_antigos, valores_novos from edicoes_caixa where caixa_id = $1", [caixa.caixaId]);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      observacao: "Abri o caixa no sistema depois de comecar a vender",
      valores_antigos: { aberturaOficial: oficial.toISOString() },
      valores_novos: { inicioVendas: novoInicio.toISOString() }
    });
  });

  it("nao recua para dentro do caixa anterior do mesmo PDV", async () => {
    const primeiro = await abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieCaixa,
      emailOperador: usuariosTeste.caixa.email,
      nome: "Caixa anterior",
      dataHoraAbertura: "2026-07-30T08:00"
    });
    const linha = await consultarUm<{ pdv_id: string; aberto_em: Date }>(
      "select pdv_id, aberto_em from fechamentos_caixa where id = $1",
      [primeiro.caixaId]
    );
    if (!linha) throw new Error("caixa nao encontrado");
    const oficial = new Date(linha.aberto_em);
    // Um caixa do mesmo PDV que fechou 5 min antes desta abertura.
    await executarSql(
      `insert into fechamentos_caixa (id, empresa_id, pdv_id, usuario_id, usuario_caixa_id, colaborador_id,
              data_movimento, data_hora_abertura, aberto_em, data_hora_fechamento, fechado_em, token_edicao, status, criado_por)
       select gen_random_uuid(), empresa_id, pdv_id, usuario_id, usuario_caixa_id, colaborador_id,
              data_movimento, $2::timestamptz - interval '3 hours', $2::timestamptz - interval '3 hours',
              $2::timestamptz - interval '5 minutes', $2::timestamptz - interval '5 minutes', 'TOKEN-ANT-' || gen_random_uuid(), 'fechado', criado_por
         from fechamentos_caixa where id = $1`,
      [primeiro.caixaId, oficial.toISOString()]
    );
    const invade = await ajustar(primeiro.caixaId, {
      inicio: new Date(oficial.getTime() - 20 * 60_000).toISOString(),
      motivo: "Tentando invadir o caixa anterior"
    });
    expect(invade.statusCode, invade.body).toBe(422);
    expect(invade.body).toMatch(/caixa anterior/i);

    const dentro = await ajustar(primeiro.caixaId, {
      inicio: new Date(oficial.getTime() - 4 * 60_000).toISOString(),
      motivo: "Depois do fechamento anterior"
    });
    expect(dentro.statusCode, dentro.body).toBe(200);
  });

  it("idsTeste carregado (guarda contra fixture vazia)", () => {
    expect(idsTeste.empresaA).toBeTruthy();
  });
});
