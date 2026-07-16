import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarTodos, executarSql, json } from "../../setup/integracao.js";
import { emailsCapturados } from "../../../api/src/auth/email.js";

// Conciliacao diaria sistema x CREARE. Autenticada pela MESMA chave da ingestao (x-api-key).
// So le: nao cria vinculo nem persiste resultado — o e-mail aos admins e o registro da divergencia.
// No seed, "PDV-EXT" ja tem vinculo resolvido para o pdvA da empresaA.
type ConciliacaoJson = {
  data: {
    data: string;
    ok: boolean;
    alertasEnviados: number;
    porPdv: Array<{
      pdvIdentificador: string;
      pdvId: string | null;
      sistema: { quantidadeVendas: number; valorTotal: number };
      creare: { quantidadeVendas: number; valorTotal: number };
      diferenca: number;
      ok: boolean;
      pdvNaoVinculado: boolean;
    }>;
  };
};

const DIA = "2026-08-10";

describe("conciliacao diaria da integracao de vendas", () => {
  let contexto: ContextoApiTeste;

  async function conciliar(payload: object, chave: string | null = idsTeste.integracaoCodigo) {
    return await contexto.app.inject({
      method: "POST",
      url: "/api/integracoes/conciliacao",
      headers: chave ? { "x-api-key": chave } : {},
      payload
    });
  }

  function alertasDoDia(dia: string) {
    return emailsCapturados.filter((email) => email.assunto.includes("Divergencia") && email.assunto.includes(dia));
  }

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    // Vendas do pdvA em DIA: 30.00 aprovada + 12.50 aguardando = 42.50. A CANCELADA nao entra
    // (espelho da regra combinada: status != cancelado).
    await executarSql(
      `insert into vendas (empresa_id, pdv_id, data_referencia, descricao, valor_original, status)
       values ($1,$2,$3,'Venda conciliacao 1','30.00','aprovado'),
              ($1,$2,$3,'Venda conciliacao 2','12.50','aguardando_aprovacao'),
              ($1,$2,$3,'Venda cancelada','99.00','cancelado')`,
      [idsTeste.empresaA, idsTeste.pdvA, DIA]
    );
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_Retornar401_Quando_ChaveAusenteOuInvalida", async () => {
    const semChave = await conciliar({ data: DIA, porPdv: [] }, null);
    const chaveErrada = await conciliar({ data: DIA, porPdv: [] }, "chave-que-nao-existe");

    assertProblem(semChave, 401, "INVALID_INTEGRATION_KEY");
    assertProblem(chaveErrada, 401, "INVALID_INTEGRATION_KEY");
  });

  it("Deve_Retornar400_Quando_PayloadInvalido", async () => {
    const dataErrada = await conciliar({ data: "10/08/2026", porPdv: [] });
    assertProblem(dataErrada, 400);
  });

  it("Deve_ConciliarSemAlerta_Quando_CreareBateComOSistema", async () => {
    // O CREARE reporta exatamente o que o sistema tem: 2 vendas, 42.50. A cancelada nao conta.
    const resposta = await conciliar({
      data: DIA,
      porPdv: [{ pdvIdentificador: "PDV-EXT", quantidadeVendas: 2, valorTotal: 42.5 }]
    });

    assertOk(resposta);
    const corpo = json<ConciliacaoJson>(resposta).data;
    expect(corpo.ok).toBe(true);
    expect(corpo.alertasEnviados).toBe(0);
    expect(corpo.porPdv[0]).toMatchObject({
      pdvIdentificador: "PDV-EXT",
      pdvId: idsTeste.pdvA,
      sistema: { quantidadeVendas: 2, valorTotal: 42.5 },
      creare: { quantidadeVendas: 2, valorTotal: 42.5 },
      diferenca: 0,
      ok: true,
      pdvNaoVinculado: false
    });
    expect(alertasDoDia(DIA)).toHaveLength(0);
  });

  it("Deve_AceitarDiferencaDeAteUmCentavo_Quando_ForArredondamento", async () => {
    const resposta = await conciliar({
      data: DIA,
      porPdv: [{ pdvIdentificador: "PDV-EXT", quantidadeVendas: 2, valorTotal: 42.51 }]
    });

    assertOk(resposta);
    const corpo = json<ConciliacaoJson>(resposta).data;
    expect(corpo.ok).toBe(true); // 1 centavo e ruido, nao divergencia
    expect(corpo.porPdv[0]?.diferenca).toBe(-0.01);
    expect(alertasDoDia(DIA)).toHaveLength(0);
  });

  it("Deve_DispararEmailAosAdmins_Quando_HouverDivergencia", async () => {
    const diaDivergente = "2026-08-11"; // dia sem venda no sistema; CREARE diz que teve 100.00
    const resposta = await conciliar({
      data: diaDivergente,
      porPdv: [{ pdvIdentificador: "PDV-EXT", quantidadeVendas: 3, valorTotal: 100 }]
    });

    assertOk(resposta);
    const corpo = json<ConciliacaoJson>(resposta).data;
    expect(corpo.ok).toBe(false);
    expect(corpo.porPdv[0]).toMatchObject({
      sistema: { quantidadeVendas: 0, valorTotal: 0 },
      creare: { quantidadeVendas: 3, valorTotal: 100 },
      diferenca: -100,
      ok: false
    });

    // Mesma infra do alerta de silencio: um e-mail por admin da empresa (admin + multiempresa).
    const alertas = alertasDoDia(diaDivergente);
    expect(corpo.alertasEnviados).toBe(2);
    expect(new Set(alertas.map((email) => email.para))).toEqual(
      new Set([usuariosTeste.admin.email, usuariosTeste.multiempresa.email])
    );
  });

  it("Deve_MarcarComoNaoOk_Quando_PdvDoCreareNaoTemVinculo", async () => {
    // Sem vinculo nao da para comparar — e conciliacao NAO cria vinculo (isso e regra da ingestao).
    const resposta = await conciliar({
      data: "2026-08-12",
      porPdv: [{ pdvIdentificador: "PDV-SEM-VINCULO", quantidadeVendas: 1, valorTotal: 10 }]
    });

    assertOk(resposta);
    const corpo = json<ConciliacaoJson>(resposta).data;
    expect(corpo.ok).toBe(false);
    expect(corpo.porPdv[0]).toMatchObject({ pdvId: null, pdvNaoVinculado: true, ok: false });

    // E o vinculo continua inexistente: a rota nao pode ter criado nada.
    const vinculos = await consultarTodos<{ id: string }>(
      `select id from integracoes_vinculos where identificador_externo = $1`,
      ["PDV-SEM-VINCULO"]
    );
    expect(vinculos).toHaveLength(0);
  });
});
