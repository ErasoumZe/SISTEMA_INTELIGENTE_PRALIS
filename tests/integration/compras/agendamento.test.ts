import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";
import { materializarAgendamentos } from "../../../api/src/compras/compras-agendamento-agendador.js";

// Agendamento de pedido (PROJECT_BRAIN/56): agenda -> na data, solicitacao para conferir + sino -> o
// comprador confere e envia (cada fornecedor recebe SO os seus produtos) -> pedido "enviado". O agendador
// nunca envia nada sozinho e nunca cria a mesma data duas vezes.

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

  it("na data, cria a solicitacao para conferir e avisa no sino, uma vez so", async () => {
    await executarSql("delete from pedidos_agendas where empresa_id = $1", [idsTeste.empresaA]);
    const id = await criar();
    const depoisDoInicio = new Date(new Date(`${diaLocal(1)}T11:00:00.000Z`).getTime() + 60_000);

    await materializarAgendamentos(depoisDoInicio, (_, erro) => {
      throw erro;
    });
    await materializarAgendamentos(depoisDoInicio, (_, erro) => {
      throw erro;
    });

    const ocorrencias = await consultarTodos<{ situacao: string; solicitacao_id: string }>(
      "select situacao, solicitacao_id from pedidos_agenda_ocorrencias where agenda_id = $1",
      [id]
    );
    expect(ocorrencias).toHaveLength(1);
    expect(ocorrencias[0]?.situacao).toBe("aguardando_conferencia");
    const solicitacao = await consultarUm<{ origem: string; status: string; itens: string }>(
      "select s.origem, s.status, (select count(*) from compras_solicitacoes_itens i where i.solicitacao_id = s.id)::text as itens from compras_solicitacoes s where s.id = $1",
      [ocorrencias[0]!.solicitacao_id]
    );
    expect(solicitacao).toEqual({ origem: "agendamento", status: "rascunho", itens: "1" });
    const sino = await consultarTodos("select id from notificacoes where tipo = 'compras_agendamento_conferir'", []);
    expect(sino).toHaveLength(1);
    // Nada foi enviado: nenhuma rodada nasceu sozinha.
    const rodadas = await consultarUm<{ total: string }>(
      "select count(*)::text as total from compras_rodadas where solicitacao_id = $1",
      [ocorrencias[0]!.solicitacao_id]
    );
    expect(rodadas?.total).toBe("0");
  });

  it("o comprador confere, acrescenta e envia: cada fornecedor recebe os seus produtos", async () => {
    const para = json<{ data: Array<{ id: string; solicitacaoId: string; prazoRespostaHoras: number }> }>(
      await pedir("GET", `/api/compras/agendamentos/para-conferir?empresaId=${idsTeste.empresaA}`)
    ).data;
    expect(para).toHaveLength(1);
    const ocorrenciaId = para[0]!.id;

    const envio = json<{
      data: { itens: Array<{ produtoId: string; quantidade: string; fornecedores: Array<{ fornecedorId: string }> }> };
    }>(
      await pedir("GET", `/api/compras/agendamentos/ocorrencias/${ocorrenciaId}/envio?empresaId=${idsTeste.empresaA}`)
    ).data;
    expect(envio.itens).toHaveLength(1);
    expect(Number(envio.itens[0]?.quantidade)).toBe(3);
    expect(envio.itens[0]?.fornecedores.map((fornecedor) => fornecedor.fornecedorId).sort()).toEqual(
      [FORNECEDOR, SEGUNDO].sort()
    );

    const enviado = await pedir("POST", `/api/compras/agendamentos/ocorrencias/${ocorrenciaId}/enviar`, {
      empresaId: idsTeste.empresaA,
      itens: [{ produtoId: idsTeste.produto, quantidade: 5 }],
      convites: [
        { fornecedorId: FORNECEDOR, produtoIds: [idsTeste.produto] },
        { fornecedorId: SEGUNDO, produtoIds: [idsTeste.produto] }
      ]
    });
    expect(enviado.statusCode, enviado.body).toBe(201);
    const rodada = json<{ data: { prazoRespostaHoras: number | null; convites: Array<{ token: string }> } }>(
      enviado
    ).data;
    expect(rodada.convites).toHaveLength(2);
    // O prazo que o fornecedor ve e o do agendamento.
    expect(rodada.prazoRespostaHoras).toBe(12);

    const ocorrencia = await consultarUm<{ situacao: string; enviada_por: string | null }>(
      "select situacao, enviada_por from pedidos_agenda_ocorrencias where id = $1",
      [ocorrenciaId]
    );
    expect(ocorrencia?.situacao).toBe("enviada");
    expect(ocorrencia?.enviada_por).toBeTruthy();
    const item = await consultarUm<{ quantidade: string }>(
      "select quantidade from compras_solicitacoes_itens where solicitacao_id = $1",
      [para[0]!.solicitacaoId]
    );
    expect(Number(item?.quantidade)).toBe(5);

    const repetido = await pedir("POST", `/api/compras/agendamentos/ocorrencias/${ocorrenciaId}/enviar`, {
      empresaId: idsTeste.empresaA,
      itens: [{ produtoId: idsTeste.produto, quantidade: 5 }],
      convites: [{ fornecedorId: FORNECEDOR, produtoIds: [idsTeste.produto] }]
    });
    expect(repetido.statusCode).toBe(409);
  });

  it("produto sem quantidade nao entra sozinho, mas aparece na conferencia; sem fornecedor nao envia", async () => {
    await executarSql("delete from pedidos_agendas where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("update produtos set estoque_max = null where id = $1", [idsTeste.produto]);
    await criar({ produtos: [{ produtoId: idsTeste.produto, quantidadePadrao: null }] });
    await materializarAgendamentos(new Date(new Date(`${diaLocal(1)}T11:00:00.000Z`).getTime() + 60_000), (_, erro) => {
      throw erro;
    });
    const para = json<{ data: Array<{ id: string; totalItens: number }> }>(
      await pedir("GET", `/api/compras/agendamentos/para-conferir?empresaId=${idsTeste.empresaA}`)
    ).data;
    expect(para[0]?.totalItens).toBe(0);
    const envio = json<{ data: { itens: Array<{ quantidade: string }> } }>(
      await pedir("GET", `/api/compras/agendamentos/ocorrencias/${para[0]!.id}/envio?empresaId=${idsTeste.empresaA}`)
    ).data;
    expect(envio.itens).toEqual([expect.objectContaining({ quantidade: "" })]);

    const semFornecedor = await pedir("POST", `/api/compras/agendamentos/ocorrencias/${para[0]!.id}/enviar`, {
      empresaId: idsTeste.empresaA,
      itens: [{ produtoId: idsTeste.produto, quantidade: 2 }],
      convites: [{ fornecedorId: FORNECEDOR, produtoIds: [] }]
    });
    expect(semFornecedor.statusCode).toBe(400);
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
    await materializarAgendamentos(new Date(new Date(`${diaLocal(1)}T11:00:00.000Z`).getTime() + 60_000), (_, erro) => {
      throw erro;
    });
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
      `/api/compras/agendamentos/produtos?empresaId=${idsTeste.empresaA}`,
      `/api/compras/agendamentos/para-conferir?empresaId=${idsTeste.empresaA}`
    ]) {
      expect((await pedir("GET", url, undefined, cookieSem)).statusCode, url).toBe(403);
    }
    expect((await pedir("POST", "/api/compras/agendamentos", corpo(), cookieSem)).statusCode).toBe(403);
  });
});
