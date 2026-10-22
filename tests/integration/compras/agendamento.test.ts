import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";
import { materializarAgendamentos } from "../../../api/src/compras/compras-agendamento-agendador.js";

// Agendamento de pedido (PROJECT_BRAIN/56 e 57): agenda -> na data, a cotacao abre sozinha e cada fornecedor
// do catalogo (com WhatsApp) recebe SO os seus produtos pela fila; produto sem fornecedor fica "A fazer" e o
// responsavel e avisado. O agendador nunca cria a mesma data duas vezes.

const FORNECEDOR = "11111111-1111-4111-8111-11111111a601";
const SEGUNDO = "11111111-1111-4111-8111-11111111a602";
const FUSO = "America/Sao_Paulo";

type AgendamentoDto = {
  id: string;
  resumo: string;
  proximas: Array<{ previstoPara: string; dataAtual: string; situacao: string }>;
  produtos: Array<{ produtoId: string; quantidadePadrao: string | null }>;
};

/** `AAAA-MM-DD` local (Sao Paulo) daqui a N dias. */
function diaLocal(dias: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date(Date.now() + dias * 86_400_000));
}

describe("agendamento de pedido integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  const corpo = (extra: Record<string, unknown> = {}) => ({
    empresaId: idsTeste.empresaA,
    grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
    inicioData: diaLocal(1),
    inicioHora: "08:00",
    regra: { tipo: "padrao", frequencia: "semanal", intervalo: 1 },
    termino: { tipo: "nunca" },
    prazoRespostaHoras: 12,
    produtos: [{ produtoId: idsTeste.produto, quantidadePadrao: 3 }],
    ...extra
  });
  const pedir = (method: "GET" | "POST" | "PUT", url: string, payload?: object, cookie = cookieAdmin) =>
    contexto.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
  const listar = async () =>
    json<{ data: AgendamentoDto[] }>(await pedir("GET", `/api/compras/agendamentos?empresaId=${idsTeste.empresaA}`))
      .data;
  const criar = async (extra: Record<string, unknown> = {}) => {
    const resposta = await pedir("POST", "/api/compras/agendamentos", corpo(extra));
    expect(resposta.statusCode, resposta.body).toBe(201);
    return json<{ data: { id: string } }>(resposta).data.id;
  };

  const limpar = async () => {
    await executarSql("delete from notificacoes where tipo = 'compras_agendamento_conferir'", []);
    await executarSql("delete from pedidos_agendas where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from compras_rodadas_convites where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from compras_rodadas_itens where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from compras_rodadas where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from compras_solicitacoes where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from fornecedores_produtos where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from fornecedores where id = any($1)", [[FORNECEDOR, SEGUNDO]]);
  };

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    await limpar();
    await executarSql(
      "insert into fornecedores (id, empresa_id, nome, whatsapp, situacao) values ($1,$3,'Agenda Bebidas','11999995501','ativo'),($2,$3,'Agenda Atacado','11999995502','ativo')",
      [FORNECEDOR, SEGUNDO, idsTeste.empresaA]
    );
    // Os dois vendem o produto (catalogo aprovado): a cotacao vai para os dois (doc 56 §7, decisao 3).
    await executarSql(
      "insert into fornecedores_produtos (empresa_id, fornecedor_id, produto_id, status, origem, preco_ofertado) values ($1,$2,$4,'aprovado','compras','9.5000'),($1,$3,$4,'aprovado','compras',null)",
      [idsTeste.empresaA, FORNECEDOR, SEGUNDO, idsTeste.produto]
    );
  }, 120_000);

  afterAll(async () => {
    await limpar();
    await contexto.fechar();
  });

  it("cria o agendamento e calcula as proximas datas e o resumo", async () => {
    const id = await criar({ regra: { tipo: "padrao", frequencia: "semanal", intervalo: 1, diasSemana: [1, 4] } });
    const agenda = (await listar()).find((linha) => linha.id === id)!;
    expect(agenda.resumo).toBe("Toda semana na(s) segunda e quinta");
    expect(agenda.proximas).toHaveLength(6);
    expect(agenda.proximas.every((ocorrencia) => ocorrencia.situacao === "prevista")).toBe(true);
    // A primeira e o inicio, as 08:00 de Sao Paulo (11:00 UTC).
    expect(agenda.proximas[0]?.previstoPara).toBe(`${diaLocal(1)}T11:00:00.000Z`);
    expect(Number(agenda.produtos[0]?.quantidadePadrao)).toBe(3);
  });

  it("recusa inicio no passado, produto e grupo de fora, e prazo fora de 1-720 h", async () => {
    const passado = await pedir("POST", "/api/compras/agendamentos", corpo({ inicioData: diaLocal(-2) }));
    expect(passado.statusCode).toBe(400);
    expect(json<{ code?: string }>(passado).code).toBe("START_IN_THE_PAST");
    const produto = await pedir(
      "POST",
      "/api/compras/agendamentos",
      corpo({ produtos: [{ produtoId: "11111111-1111-4111-8111-11111111dead" }] })
    );
    expect(produto.statusCode).toBe(400);
    const prazo = await pedir("POST", "/api/compras/agendamentos", corpo({ prazoRespostaHoras: 721 }));
    expect(prazo.statusCode).toBe(400);
  });

  const depoisDoInicio = () => new Date(new Date(`${diaLocal(1)}T11:00:00.000Z`).getTime() + 60_000);
  const materializar = (agora: Date) =>
    materializarAgendamentos(agora, (_, erro) => {
      throw erro;
    });

  it("na data, abre a cotacao sozinha: cada fornecedor do catalogo entra na fila do WhatsApp, uma vez so", async () => {
    await executarSql("delete from pedidos_agendas where empresa_id = $1", [idsTeste.empresaA]);
    const id = await criar({ margemVariacaoPercentual: 20 });

    await materializar(depoisDoInicio());
    await materializar(depoisDoInicio());

    const ocorrencias = await consultarTodos<{ situacao: string; solicitacao_id: string; enviada_por: string | null }>(
      "select situacao, solicitacao_id, enviada_por from pedidos_agenda_ocorrencias where agenda_id = $1",
      [id]
    );
    expect(ocorrencias).toHaveLength(1);
    expect(ocorrencias[0]).toMatchObject({ situacao: "enviada" });
    expect(ocorrencias[0]?.enviada_por).toBeTruthy();
    const solicitacao = await consultarUm<{ origem: string; status: string }>(
      "select origem, status from compras_solicitacoes where id = $1",
      [ocorrencias[0]!.solicitacao_id]
    );
    expect(solicitacao).toEqual({ origem: "agendamento", status: "em_cotacao" });
    // O prazo e a margem que o fornecedor ve sao os do agendamento.
    const rodada = await consultarUm<{ id: string; prazo_resposta_horas: number; margem_variacao_percentual: number }>(
      "select id, prazo_resposta_horas, margem_variacao_percentual from compras_rodadas where solicitacao_id = $1",
      [ocorrencias[0]!.solicitacao_id]
    );
    expect(rodada).toMatchObject({ prazo_resposta_horas: 12, margem_variacao_percentual: 20 });
    // Os dois fornecedores aprovados no catalogo recebem o produto, cada um com o seu convite na fila.
    const envios = await consultarTodos<{ fornecedor_id: string; tipo: string; status: string; telefone: string }>(
      "select c.fornecedor_id, e.tipo, e.status, e.telefone from compras_whatsapp_envios e join compras_rodadas_convites c on c.id = e.convite_id where c.rodada_id = $1 order by e.telefone",
      [rodada!.id]
    );
    expect(envios.map((envio) => envio.fornecedor_id).sort()).toEqual([FORNECEDOR, SEGUNDO].sort());
    expect(envios.every((envio) => envio.tipo === "convite" && envio.status === "pendente")).toBe(true);
    expect(envios[0]?.telefone).toBe("5511999995501");
    // Todo produto tinha fornecedor: nada ficou "A fazer", ninguem precisou ser avisado.
    const sino = await consultarTodos("select id from notificacoes where tipo = 'compras_agendamento_conferir'", []);
    expect(sino).toHaveLength(0);
  });

  it("produto sem fornecedor no catalogo fica A fazer em Pedidos e o responsavel e avisado no sino", async () => {
    await executarSql("delete from pedidos_agendas where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("update fornecedores_produtos set status = 'pendente' where empresa_id = $1", [
      idsTeste.empresaA
    ]);
    try {
      await criar();
      await materializar(depoisDoInicio());
      const painel = json<{ data: { semFornecedor: Array<{ produtoId: string; quantidade: string }> } }>(
        await pedir("GET", `/api/compras/painel?empresaId=${idsTeste.empresaA}`)
      ).data;
      expect(painel.semFornecedor).toEqual([expect.objectContaining({ produtoId: idsTeste.produto })]);
      expect(Number(painel.semFornecedor[0]?.quantidade)).toBe(3);
      const sino = await consultarTodos<{ titulo: string }>(
        "select titulo from notificacoes where tipo = 'compras_agendamento_conferir'",
        []
      );
      expect(sino).toHaveLength(1);
      expect(sino[0]?.titulo).toContain("A fazer");
    } finally {
      await executarSql("update fornecedores_produtos set status = 'aprovado' where empresa_id = $1", [
        idsTeste.empresaA
      ]);
      await executarSql("delete from notificacoes where tipo = 'compras_agendamento_conferir'", []);
    }
  });

  it("produto sem quantidade nao entra; sem nada a pedir, a data passa sem abrir cotacao", async () => {
    await executarSql("delete from pedidos_agendas where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("update produtos set estoque_max = null where id = $1", [idsTeste.produto]);
    const id = await criar({ produtos: [{ produtoId: idsTeste.produto, quantidadePadrao: null }] });
    await materializar(depoisDoInicio());
    const ocorrencia = await consultarUm<{ situacao: string; solicitacao_id: string }>(
      "select situacao, solicitacao_id from pedidos_agenda_ocorrencias where agenda_id = $1",
      [id]
    );
    expect(ocorrencia?.situacao).toBe("cancelada");
    const solicitacao = await consultarUm<{ status: string }>("select status from compras_solicitacoes where id = $1", [
      ocorrencia!.solicitacao_id
    ]);
    expect(solicitacao?.status).toBe("cancelada");
    const rodadas = await consultarUm<{ total: string }>(
      "select count(*)::text as total from compras_rodadas where solicitacao_id = $1",
      [ocorrencia!.solicitacao_id]
    );
    expect(rodadas?.total).toBe("0");
  });

  it("cancela e move uma data (so esta), e o agendador respeita as duas", async () => {
    await executarSql("delete from pedidos_agendas where empresa_id = $1", [idsTeste.empresaA]);
    const id = await criar({ regra: { tipo: "padrao", frequencia: "diaria", intervalo: 1 } });
    const [primeira, segunda] = (await listar()).find((linha) => linha.id === id)!.proximas;
    const cancelada = await pedir("POST", `/api/compras/agendamentos/${id}/ocorrencias/cancelar`, {
      empresaId: idsTeste.empresaA,
      previstoPara: primeira!.previstoPara
    });
    expect(cancelada.statusCode, cancelada.body).toBe(204);
    const movida = await pedir("POST", `/api/compras/agendamentos/${id}/ocorrencias/mover`, {
      empresaId: idsTeste.empresaA,
      previstoPara: segunda!.previstoPara,
      novaData: diaLocal(5),
      novaHora: "15:00"
    });
    expect(movida.statusCode, movida.body).toBe(204);
    const inventada = await pedir("POST", `/api/compras/agendamentos/${id}/ocorrencias/cancelar`, {
      empresaId: idsTeste.empresaA,
      previstoPara: `${diaLocal(1)}T13:00:00.000Z`
    });
    expect(inventada.statusCode).toBe(404);

    // Logo depois da 2a data original: nada nasce (a 1a foi cancelada, a 2a mudou para daqui a 5 dias).
    await materializarAgendamentos(new Date(new Date(segunda!.previstoPara).getTime() + 60_000), (_, erro) => {
      throw erro;
    });
    const situacoes = await consultarTodos<{ situacao: string }>(
      "select situacao from pedidos_agenda_ocorrencias where agenda_id = $1 order by previsto_para",
      [id]
    );
    expect(situacoes.map((linha) => linha.situacao)).toEqual(["cancelada", "agendada"]);
  });

  it("editar depois que uma data aconteceu cria a nova serie a partir da data (esta e as futuras)", async () => {
    await executarSql("delete from pedidos_agendas where empresa_id = $1", [idsTeste.empresaA]);
    const id = await criar({ regra: { tipo: "padrao", frequencia: "diaria", intervalo: 1 } });
    await materializar(depoisDoInicio());
    const editada = await pedir("PUT", `/api/compras/agendamentos/${id}`, {
      ...corpo({ inicioData: diaLocal(3), prazoRespostaHoras: 24 }),
      aPartirDe: diaLocal(3)
    });
    expect(editada.statusCode, editada.body).toBe(200);
    const series = await consultarTodos<{ id: string; termino_em: string | null; serie_anterior_id: string | null }>(
      "select id, termino_em::text, serie_anterior_id from pedidos_agendas where empresa_id = $1 order by criado_em",
      [idsTeste.empresaA]
    );
    expect(series).toHaveLength(2);
    expect(series[0]?.termino_em).toBe(diaLocal(2));
    expect(series[1]?.serie_anterior_id).toBe(id);

    const encerrada = await pedir("POST", `/api/compras/agendamentos/${series[1]!.id}/encerrar`, {
      empresaId: idsTeste.empresaA
    });
    expect(encerrada.statusCode).toBe(204);
    expect((await listar()).some((linha) => linha.id === series[1]!.id)).toBe(false);
  });

  it("lista os produtos com as bolinhas e os grupos", async () => {
    const resposta = json<{
      data: {
        produtos: Array<{ id: string; maisVende: boolean; maisCompra: boolean; maisLucro: boolean }>;
        grupos: unknown[];
      };
    }>(await pedir("GET", `/api/compras/agendamentos/produtos?empresaId=${idsTeste.empresaA}`)).data;
    const produto = resposta.produtos.find((linha) => linha.id === idsTeste.produto);
    expect(produto).toMatchObject({
      maisVende: expect.any(Boolean),
      maisCompra: expect.any(Boolean),
      maisLucro: expect.any(Boolean)
    });
    expect(resposta.grupos.length).toBeGreaterThan(0);
  });

  it("isola por empresa e por permissao", async () => {
    const outra = await pedir("GET", `/api/compras/agendamentos?empresaId=${idsTeste.empresaB}`);
    expect(outra.statusCode).toBe(403);
    const cookieSem = await cookieSessao(contexto.app, "semPermissao");
    for (const url of [
      `/api/compras/agendamentos?empresaId=${idsTeste.empresaA}`,
      `/api/compras/agendamentos/produtos?empresaId=${idsTeste.empresaA}`
    ]) {
      expect((await pedir("GET", url, undefined, cookieSem)).statusCode, url).toBe(403);
    }
    expect((await pedir("POST", "/api/compras/agendamentos", corpo(), cookieSem)).statusCode).toBe(403);
  });
});
