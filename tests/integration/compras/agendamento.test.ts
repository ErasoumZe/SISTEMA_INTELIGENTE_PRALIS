import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";
import { materializarAgendamentos } from "../../../api/src/compras/compras-agendamento-agendador.js";

// Agendamento de pedido (PROJECT_BRAIN/56 e 58): agenda -> na data, vira a Solicitacao de compra do responsavel
// (aviso no sino); ele confere as quantidades e envia, e cada fornecedor do catalogo (com WhatsApp) recebe SO os
// seus produtos pela fila. Produto sem fornecedor recebe o que o responsavel escolher ali. O agendador nunca cria a
// mesma data duas vezes.

const FORNECEDOR = "11111111-1111-4111-8111-11111111a601";
const SEGUNDO = "11111111-1111-4111-8111-11111111a602";
const FUSO = "America/Sao_Paulo";

type AgendamentoDto = {
  id: string;
  resumo: string;
  proximas: Array<{ previstoPara: string; dataAtual: string; situacao: string }>;
  produtos: Array<{ produtoId: string; descricao: string }>;
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
    produtos: [{ produtoId: idsTeste.produto }],
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
    await executarSql("delete from compras_whatsapp_envios where empresa_id = $1", [idsTeste.empresaA]);
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
    expect(agenda.produtos.map((produto) => produto.produtoId)).toEqual([idsTeste.produto]);
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

  type Detalhe = {
    recebimentoInicio: string | null;
    recebimentoFim: string | null;
    margemVariacaoPercentual: number;
    itens: Array<{
      produtoId: string;
      fornecedores: Array<{ fornecedorId: string }>;
    }>;
  };
  const ocorrenciaDa = async (agendaId: string) =>
    (await consultarUm<{ id: string; situacao: string; solicitacao_id: string; enviada_por: string | null }>(
      "select id, situacao, solicitacao_id, enviada_por from pedidos_agenda_ocorrencias where agenda_id = $1",
      [agendaId]
    ))!;
  const detalhar = async (ocorrenciaId: string) =>
    json<{ data: Detalhe }>(
      await pedir("GET", `/api/compras/solicitacoes-compra/${ocorrenciaId}?empresaId=${idsTeste.empresaA}`)
    ).data;
  const enviarSolicitacao = (ocorrenciaId: string, itens: object[]) =>
    pedir("POST", `/api/compras/solicitacoes-compra/${ocorrenciaId}/enviar`, { empresaId: idsTeste.empresaA, itens });
  const enviosDaSolicitacao = (solicitacaoId: string) =>
    consultarTodos<{ fornecedor_id: string; tipo: string; status: string; telefone: string }>(
      "select c.fornecedor_id, e.tipo, e.status, e.telefone from compras_whatsapp_envios e join compras_rodadas_convites c on c.id = e.convite_id join compras_rodadas r on r.id = c.rodada_id where r.solicitacao_id = $1 order by e.telefone",
      [solicitacaoId]
    );

  it("na data, vira Solicitacao de compra do responsavel: aguardando, aviso no sino e nenhuma cotacao (uma vez so)", async () => {
    await executarSql("delete from pedidos_agendas where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from notificacoes where tipo = 'compras_agendamento_conferir'", []);
    const id = await criar({ margemVariacaoPercentual: 20, recebimentoInicio: "07:00", recebimentoFim: "11:00" });

    await materializar(depoisDoInicio());
    await materializar(depoisDoInicio());

    const ocorrencias = await consultarTodos<{ situacao: string }>(
      "select situacao from pedidos_agenda_ocorrencias where agenda_id = $1",
      [id]
    );
    expect(ocorrencias).toEqual([{ situacao: "aguardando_conferencia" }]);
    const ocorrencia = await ocorrenciaDa(id);
    const solicitacao = await consultarUm<{ origem: string; status: string }>(
      "select origem, status from compras_solicitacoes where id = $1",
      [ocorrencia.solicitacao_id]
    );
    expect(solicitacao).toEqual({ origem: "agendamento", status: "rascunho" });
    // Doc 58 §2: ninguem recebe nada ate o responsavel conferir e enviar.
    const rodadas = await consultarUm<{ total: string }>(
      "select count(*)::text as total from compras_rodadas where solicitacao_id = $1",
      [ocorrencia.solicitacao_id]
    );
    expect(rodadas?.total).toBe("0");
    const sino = await consultarTodos<{ titulo: string }>(
      "select titulo from notificacoes where tipo = 'compras_agendamento_conferir'",
      []
    );
    expect(sino).toHaveLength(1);
    expect(sino[0]?.titulo).toContain("Solicitação de compra para enviar");

    // O card do responsavel e o que ele ve ao abrir: a sugestao, os fornecedores e o horario de recebimento.
    const cards = json<{ data: Array<{ agendaId: string; pendentes: Array<{ ocorrenciaId: string }> }> }>(
      await pedir("GET", `/api/compras/solicitacoes-compra?empresaId=${idsTeste.empresaA}`)
    ).data;
    expect(cards.find((card) => card.agendaId === id)?.pendentes).toEqual([
      expect.objectContaining({ ocorrenciaId: ocorrencia.id })
    ]);
    const detalhe = await detalhar(ocorrencia.id);
    expect(detalhe).toMatchObject({
      recebimentoInicio: "07:00",
      recebimentoFim: "11:00",
      margemVariacaoPercentual: 20
    });
    const item = detalhe.itens.find((linha) => linha.produtoId === idsTeste.produto);
    // Doc 58 §2: o produto chega sem quantidade; quem decide e o responsavel. A solicitacao nasce sem item.
    expect(item).not.toHaveProperty("quantidadeSugerida");
    const itensSolicitacao = await consultarUm<{ total: string }>(
      "select count(*)::text as total from compras_solicitacoes_itens where solicitacao_id = $1",
      [ocorrencia.solicitacao_id]
    );
    expect(itensSolicitacao?.total).toBe("0");
    expect(item?.fornecedores.map((fornecedor) => fornecedor.fornecedorId).sort()).toEqual(
      [FORNECEDOR, SEGUNDO].sort()
    );
  });

  it("o responsavel confere e envia: cada fornecedor do catalogo entra na fila com o prazo, a margem e o horario", async () => {
    await executarSql("delete from pedidos_agendas where empresa_id = $1", [idsTeste.empresaA]);
    const id = await criar({ margemVariacaoPercentual: 20, recebimentoInicio: "07:00", recebimentoFim: "11:00" });
    await materializar(depoisDoInicio());
    const ocorrencia = await ocorrenciaDa(id);

    const envio = await enviarSolicitacao(ocorrencia.id, [{ produtoId: idsTeste.produto, quantidade: 4 }]);
    expect(envio.statusCode, envio.body).toBe(201);
    const depois = await ocorrenciaDa(id);
    expect(depois.situacao).toBe("enviada");
    expect(depois.enviada_por).toBeTruthy();
    const solicitacao = await consultarUm<{ status: string }>("select status from compras_solicitacoes where id = $1", [
      ocorrencia.solicitacao_id
    ]);
    expect(solicitacao?.status).toBe("em_cotacao");
    const rodada = await consultarUm<{
      id: string;
      prazo_resposta_horas: number;
      margem_variacao_percentual: number;
      recebimento_inicio: string;
      recebimento_fim: string;
    }>(
      "select id, prazo_resposta_horas, margem_variacao_percentual, recebimento_inicio::text, recebimento_fim::text from compras_rodadas where solicitacao_id = $1",
      [ocorrencia.solicitacao_id]
    );
    expect(rodada).toMatchObject({
      prazo_resposta_horas: 12,
      margem_variacao_percentual: 20,
      recebimento_inicio: "07:00:00",
      recebimento_fim: "11:00:00"
    });
    // A quantidade e a que o responsavel pos na Solicitacao de compra.
    const item = await consultarUm<{ quantidade: string }>(
      "select quantidade::text from compras_rodadas_itens where rodada_id = $1",
      [rodada!.id]
    );
    expect(Number(item?.quantidade)).toBe(4);
    const envios = await enviosDaSolicitacao(ocorrencia.solicitacao_id);
    expect(envios.map((linha) => linha.fornecedor_id).sort()).toEqual([FORNECEDOR, SEGUNDO].sort());
    expect(envios.every((linha) => linha.tipo === "convite" && linha.status === "pendente")).toBe(true);
    expect(envios[0]?.telefone).toBe("5511999995501");

    const deNovo = await enviarSolicitacao(ocorrencia.id, [{ produtoId: idsTeste.produto, quantidade: 4 }]);
    expect(deNovo.statusCode).toBe(409);
    expect(json<{ code?: string }>(deNovo).code).toBe("OCCURRENCE_NOT_PENDING");
  });

  it("produto sem fornecedor: enviar sem escolher e recusado; escolhendo ali, o convite sai e o catalogo aprende", async () => {
    await executarSql("delete from pedidos_agendas where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("update fornecedores_produtos set status = 'pendente' where empresa_id = $1", [
      idsTeste.empresaA
    ]);
    try {
      const id = await criar();
      await materializar(depoisDoInicio());
      const ocorrencia = await ocorrenciaDa(id);
      expect((await detalhar(ocorrencia.id)).itens[0]?.fornecedores).toEqual([]);

      const semEscolha = await enviarSolicitacao(ocorrencia.id, [{ produtoId: idsTeste.produto, quantidade: 3 }]);
      expect(semEscolha.statusCode).toBe(422);
      expect(json<{ code?: string }>(semEscolha).code).toBe("PRODUCT_WITHOUT_SUPPLIER");
      expect((await ocorrenciaDa(id)).situacao).toBe("aguardando_conferencia");

      const escolhido = await enviarSolicitacao(ocorrencia.id, [
        { produtoId: idsTeste.produto, quantidade: 3, fornecedorId: FORNECEDOR }
      ]);
      expect(escolhido.statusCode, escolhido.body).toBe(201);
      expect((await enviosDaSolicitacao(ocorrencia.solicitacao_id)).map((linha) => linha.fornecedor_id)).toEqual([
        FORNECEDOR
      ]);
      // Doc 58 §2: o vinculo vai para o catalogo — a proxima data ja manda sozinha para ele.
      const vinculo = await consultarUm<{ status: string }>(
        "select status from fornecedores_produtos where empresa_id = $1 and fornecedor_id = $2 and produto_id = $3",
        [idsTeste.empresaA, FORNECEDOR, idsTeste.produto]
      );
      expect(vinculo?.status).toBe("aprovado");
    } finally {
      await executarSql("update fornecedores_produtos set status = 'aprovado' where empresa_id = $1", [
        idsTeste.empresaA
      ]);
    }
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
