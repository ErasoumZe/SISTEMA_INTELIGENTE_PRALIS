import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { abrirCaixaDoOperador, multipartAnexoFechamento } from "../../setup/caixa.js";
import { usuariosTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";

type Lado = { antes: string; depois: string; daFolha: boolean; motivo: string | null };
type Relatorio = {
  periodoInicio: string;
  periodoFim: string;
  dados: {
    creare: {
      alinhamento: { inicio: Lado; fim: Lado; vendasAnexadas?: number; vendasDesanexadas?: number };
      horario: { inicio: { situacao: string } };
    };
  };
};

// R-244: ao gerar o relatorio de vendas do fechamento, o periodo do caixa passa a ser o da folha do CREARE
// ("Periodo de" ate a "Data da emissao"), sem invadir os caixas vizinhos do mesmo PDV.
describe("Caixa - periodo das vendas alinhado a folha do CREARE (R-244)", () => {
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

  it("puxa as vendas do periodo da folha, tira as de fora e guarda o log", async () => {
    const caixa = await abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieCaixa,
      emailOperador: usuariosTeste.caixa.email,
      nome: "Caixa periodo da folha",
      dataHoraAbertura: "2026-07-31T13:18"
    });
    // Abertura oficial fixa (13:18 em Sao Paulo) para o teste nao depender da hora em que roda.
    const oficial = "2026-07-31T16:18:00.000Z";
    await executarSql("update fechamentos_caixa set aberto_em = $2, data_hora_abertura = $2 where id = $1", [
      caixa.caixaId,
      oficial
    ]);
    const linha = await consultarUm<{ empresa_id: string; pdv_id: string }>(
      "select empresa_id, pdv_id from fechamentos_caixa where id = $1",
      [caixa.caixaId]
    );
    if (!linha) throw new Error("caixa nao encontrado");

    // So venda do CREARE (com chave de integracao) e revinculada por horario.
    const chave = await consultarUm<{ id: string }>(
      "insert into integracoes_chaves (empresa_id, tipo, codigo, ativa) values ($1, 'vendas', $2, true) returning id",
      [linha.empresa_id, `TESTE-PERIODO-${caixa.caixaId}`]
    );
    const inserirVenda = (identificador: string, instante: string, caixaId: string | null) =>
      executarSql(
        `insert into vendas (empresa_id, pdv_id, caixa_id, identificador_externo, descricao, data_referencia, data_venda,
                             valor_original, status, computar, integracao_chave_id)
         values ($1, $2, $3, $4, 'Venda do turno', '2026-07-31', $5, 10.00, 'aprovado', true, $6)`,
        [linha.empresa_id, linha.pdv_id, caixaId, identificador, instante, chave?.id ?? null]
      );
    // 13:05: o CREARE ja vendia antes da abertura no sistema; a venda ficou sem caixa.
    await inserirVenda("CREARE:PERIODO-ANTES", "2026-07-31T16:05:00.000Z", null);
    // 17:00: depois da emissao da folha (16:30), mas antes do corte do sistema.
    await inserirVenda("CREARE:PERIODO-DEPOIS", "2026-07-31T20:00:00.000Z", caixa.caixaId);

    const inicio = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixa.caixaId}/iniciar-fechamento`,
      headers: { cookie: cookieCaixa },
      payload: {}
    });
    expect(inicio.statusCode, inicio.body).toBe(200);
    const corte = await consultarUm<{ fechamento_iniciado_em: Date }>(
      "select fechamento_iniciado_em from fechamentos_caixa where id = $1",
      [caixa.caixaId]
    );

    const { boundary, corpo } = multipartAnexoFechamento("relatorio_vendas_creare");
    const anexo = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixa.caixaId}/anexos`,
      headers: { cookie: cookieCaixa, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: corpo
    });
    expect(anexo.statusCode, anexo.body).toBe(201);
    const anexoId = json<{ data: { id: string } }>(anexo).data.id;

    async function gerar() {
      const resposta = await contexto.app.inject({
        method: "POST",
        url: `/api/caixa/${caixa.caixaId}/relatorio-vendas`,
        headers: { cookie: cookieCaixa },
        payload: {
          anexoId,
          leituraCreare: {
            documentoLegivel: true,
            periodoInicio: "31/07/2026 13:01:30",
            dataEmissao: "31/07/2026 16:30:00"
          },
          contagemFisica: { valorEspecie: 0, valorMoedas: 0 }
        }
      });
      expect(resposta.statusCode, resposta.body).toBe(200);
      const completo = await contexto.app.inject({
        method: "GET",
        url: `/api/caixa/${caixa.caixaId}/relatorio-vendas`,
        headers: { cookie: cookieAdmin }
      });
      expect(completo.statusCode, completo.body).toBe(200);
      return json<{ data: Relatorio }>(completo).data;
    }
    const caixaDaVenda = async (identificador: string) =>
      (
        await consultarUm<{ caixa_id: string | null }>(
          "select caixa_id from vendas where identificador_externo = $1 and empresa_id = $2",
          [identificador, linha.empresa_id]
        )
      )?.caixa_id ?? null;

    // Um caixa do mesmo PDV abriu as 16:00, antes da emissao da folha: o fim nao invade ele.
    const proximo = await consultarUm<{ id: string }>(
      `insert into fechamentos_caixa (id, empresa_id, pdv_id, usuario_id, usuario_caixa_id, colaborador_id,
              data_movimento, data_hora_abertura, aberto_em, data_hora_fechamento, fechado_em, token_edicao, status, criado_por)
       select gen_random_uuid(), empresa_id, pdv_id, usuario_id, usuario_caixa_id, colaborador_id,
              data_movimento, '2026-07-31T19:00:00Z', '2026-07-31T19:00:00Z', '2026-07-31T21:00:00Z',
              '2026-07-31T21:00:00Z', 'TOKEN-PROX-' || gen_random_uuid(), 'fechado', criado_por
         from fechamentos_caixa where id = $1
       returning id`,
      [caixa.caixaId]
    );
    const comVizinho = await gerar();
    expect(comVizinho.dados.creare.alinhamento.inicio).toMatchObject({
      depois: "2026-07-31T16:01:30.000Z",
      daFolha: true
    });
    expect(comVizinho.dados.creare.alinhamento.fim).toMatchObject({
      daFolha: false,
      motivo: "depois_do_proximo_caixa"
    });
    expect(comVizinho.dados.creare.horario.inicio.situacao).toBe("ok");
    expect(await caixaDaVenda("CREARE:PERIODO-ANTES")).toBe(caixa.caixaId);

    // Sem o vizinho, o fim vira a emissao da folha e a venda das 17:00 sai do caixa.
    await executarSql("delete from fechamentos_caixa where id = $1", [proximo?.id]);
    const relatorio = await gerar();
    expect(relatorio.periodoInicio).toBe("2026-07-31T16:01:30.000Z");
    expect(relatorio.periodoFim).toBe("2026-07-31T19:30:00.000Z");
    expect(relatorio.dados.creare.alinhamento.fim).toMatchObject({ depois: "2026-07-31T19:30:00.000Z", daFolha: true });
    expect(await caixaDaVenda("CREARE:PERIODO-DEPOIS")).toBeNull();

    // A abertura oficial e o corte real nao mudam; so o periodo das vendas.
    const depois = await consultarUm<{ aberto_em: Date; fechamento_iniciado_em: Date }>(
      "select aberto_em, fechamento_iniciado_em from fechamentos_caixa where id = $1",
      [caixa.caixaId]
    );
    expect(new Date(depois!.aberto_em).toISOString()).toBe(oficial);
    expect(new Date(depois!.fechamento_iniciado_em).toISOString()).toBe(
      new Date(corte!.fechamento_iniciado_em).toISOString()
    );

    // Cada mudanca de periodo fica no log; gerar de novo sem mudanca nao grava outro.
    await gerar();
    const log = await consultarTodos<{ observacao: string; valores_novos: Record<string, unknown> }>(
      "select observacao, valores_novos from edicoes_caixa where caixa_id = $1 order by editado_em",
      [caixa.caixaId]
    );
    expect(log).toHaveLength(2);
    expect(log[0]?.observacao).toMatch(/R-244/);
    expect(log[1]?.valores_novos).toMatchObject({ dataHoraFechamento: "2026-07-31T19:30:00.000Z" });
  });
});
