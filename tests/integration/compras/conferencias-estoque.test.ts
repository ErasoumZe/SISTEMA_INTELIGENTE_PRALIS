import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { materializarConferencias } from "../../../api/src/compras/conferencias-estoque-agendador.js";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";

// Conferencia de estoque agendada (PROJECT_BRAIN/57 §1): agenda com recorrencia e recorte -> na data nasce a
// conferencia com o saldo do sistema e quem conta e avisado no sino -> contar e concluir. Contar so registra.

const FUSO = "America/Sao_Paulo";
const diaLocal = (dias: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date(Date.now() + dias * 86_400_000));

type Detalhe = {
  id: string;
  status: string;
  responsavelId: string;
  totalItens: number;
  contados: number;
  itens: Array<{ itemId: string; produtoId: string; saldoSistema: string; quantidadeContada: string | null }>;
};

describe("conferencia de estoque agendada integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let adminId: string;
  let semPermissaoId: string;

  const pedir = (method: "GET" | "POST" | "PUT", url: string, payload?: object, cookie = cookieAdmin) =>
    contexto.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
  const corpo = (extra: Record<string, unknown> = {}) => ({
    empresaId: idsTeste.empresaA,
    responsavelId: adminId,
    grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
    inicioData: diaLocal(1),
    inicioHora: "07:00",
    regra: { tipo: "padrao", frequencia: "diaria", intervalo: 1 },
    termino: { tipo: "nunca" },
    observacao: "Contar a camara fria",
    ...extra
  });
  const depoisDoInicio = () => new Date(new Date(`${diaLocal(1)}T10:00:00.000Z`).getTime() + 60_000);
  const materializar = (agora: Date) =>
    materializarConferencias(agora, (_, erro) => {
      throw erro;
    });
  const limpar = async () => {
    await executarSql("delete from notificacoes where tipo = 'conferencia_estoque_fazer'", []);
    await executarSql("delete from conferencias_estoque where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from conferencias_agendas where empresa_id = $1", [idsTeste.empresaA]);
  };

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    adminId = (await consultarUm<{ usuario_id: string }>("select usuario_id from colaboradores where id = $1", [
      idsTeste.colaboradorAdmin
    ]))!.usuario_id;
    semPermissaoId = (await consultarUm<{ usuario_id: string }>("select usuario_id from colaboradores where id = $1", [
      idsTeste.colaboradorSemPermissao
    ]))!.usuario_id;
    await limpar();
  }, 120_000);

  afterAll(async () => {
    await limpar();
    await contexto.fechar();
  });

  it("as opcoes trazem os grupos e so quem pode contar", async () => {
    const opcoes = json<{
      data: { grupos: Array<{ id: string }>; responsaveis: Array<{ usuarioId: string }> };
    }>(await pedir("GET", `/api/compras/conferencias/opcoes?empresaId=${idsTeste.empresaA}`)).data;
    expect(opcoes.grupos.some((grupo) => grupo.id === idsTeste.grupoMercadoriaInsumos)).toBe(true);
    expect(opcoes.responsaveis.some((usuario) => usuario.usuarioId === adminId)).toBe(true);
    expect(opcoes.responsaveis.some((usuario) => usuario.usuarioId === semPermissaoId)).toBe(false);
  });

  it("agenda com recorrencia, recusa quem nao pode contar e calcula as proximas datas", async () => {
    const recusada = await pedir("POST", "/api/compras/conferencias/agendas", corpo({ responsavelId: semPermissaoId }));
    expect(recusada.statusCode).toBe(400);
    expect(json<{ code?: string }>(recusada).code).toBe("INVALID_RESPONSIBLE");
    const passado = await pedir("POST", "/api/compras/conferencias/agendas", corpo({ inicioData: diaLocal(-2) }));
    expect(json<{ code?: string }>(passado).code).toBe("START_IN_THE_PAST");

    const criada = await pedir("POST", "/api/compras/conferencias/agendas", corpo());
    expect(criada.statusCode, criada.body).toBe(201);
    const agendas = json<{ data: Array<{ id: string; resumo: string; proximas: string[] }> }>(
      await pedir("GET", `/api/compras/conferencias/agendas?empresaId=${idsTeste.empresaA}`)
    ).data;
    expect(agendas).toHaveLength(1);
    expect(agendas[0]?.proximas).toHaveLength(6);
    expect(agendas[0]?.proximas[0]).toBe(`${diaLocal(1)}T10:00:00.000Z`);
  });

  it("na data, nasce a conferencia com o saldo do sistema e quem conta e avisado, uma vez so", async () => {
    await materializar(depoisDoInicio());
    await materializar(depoisDoInicio());
    const lista = json<{ data: Array<{ id: string; status: string; totalItens: number; responsavelId: string }> }>(
      await pedir("GET", `/api/compras/conferencias?empresaId=${idsTeste.empresaA}`)
    ).data;
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ status: "agendada", responsavelId: adminId });
    expect(lista[0]!.totalItens).toBeGreaterThan(0);

    const detalhe = json<{ data: Detalhe }>(
      await pedir("GET", `/api/compras/conferencias/${lista[0]!.id}?empresaId=${idsTeste.empresaA}`)
    ).data;
    const produto = detalhe.itens.find((item) => item.produtoId === idsTeste.produto);
    const saldo = await consultarUm<{ quantidade_estoque: string }>(
      "select quantidade_estoque from produtos where id = $1",
      [idsTeste.produto]
    );
    expect(Number(produto?.saldoSistema)).toBe(Number(saldo?.quantidade_estoque));

    const sino = await consultarTodos<{ titulo: string }>(
      "select titulo from notificacoes where tipo = 'conferencia_estoque_fazer' and referencia_id = $1",
      [lista[0]!.id]
    );
    expect(sino).toHaveLength(1);
    const avisos = json<{ data: Array<{ tipo: string; detalhes?: { rota: string } }> }>(
      await pedir("GET", `/api/notificacoes?empresaId=${idsTeste.empresaA}`)
    ).data;
    expect(avisos.find((aviso) => aviso.tipo === "conferencia_estoque_fazer")?.detalhes).toMatchObject({
      rota: "/conferencias_estoque"
    });
  });

  it("contar so registra: salva aos poucos, so conclui com tudo contado e o estoque nao muda", async () => {
    const [conferencia] = json<{ data: Array<{ id: string }> }>(
      await pedir("GET", `/api/compras/conferencias?empresaId=${idsTeste.empresaA}`)
    ).data;
    const url = `/api/compras/conferencias/${conferencia!.id}`;
    const detalhe = json<{ data: Detalhe }>(await pedir("GET", `${url}?empresaId=${idsTeste.empresaA}`)).data;
    const saldoAntes = await consultarUm<{ quantidade_estoque: string }>(
      "select quantidade_estoque from produtos where id = $1",
      [idsTeste.produto]
    );

    const primeiro = detalhe.itens[0]!;
    const parcial = await pedir("PUT", `${url}/contagem`, {
      empresaId: idsTeste.empresaA,
      itens: [{ itemId: primeiro.itemId, quantidadeContada: 7 }]
    });
    expect(parcial.statusCode, parcial.body).toBe(204);
    if (detalhe.itens.length > 1) {
      const cedo = await pedir("POST", `${url}/concluir`, { empresaId: idsTeste.empresaA });
      expect(json<{ code?: string }>(cedo).code).toBe("CONFERENCE_INCOMPLETE");
    }
    const resto = await pedir("PUT", `${url}/contagem`, {
      empresaId: idsTeste.empresaA,
      itens: detalhe.itens.map((item) => ({ itemId: item.itemId, quantidadeContada: 3 }))
    });
    expect(resto.statusCode).toBe(204);
    const fora = await pedir("PUT", `${url}/contagem`, {
      empresaId: idsTeste.empresaA,
      itens: [{ itemId: idsTeste.produto, quantidadeContada: 1 }]
    });
    expect(json<{ code?: string }>(fora).code).toBe("ITEM_OUTSIDE");

    expect((await pedir("POST", `${url}/concluir`, { empresaId: idsTeste.empresaA })).statusCode).toBe(204);
    const concluida = json<{ data: Detalhe }>(await pedir("GET", `${url}?empresaId=${idsTeste.empresaA}`)).data;
    expect(concluida).toMatchObject({ status: "concluida" });
    expect(concluida.contados).toBe(concluida.totalItens);
    const saldoDepois = await consultarUm<{ quantidade_estoque: string }>(
      "select quantidade_estoque from produtos where id = $1",
      [idsTeste.produto]
    );
    expect(saldoDepois?.quantidade_estoque).toBe(saldoAntes?.quantidade_estoque);
    const depois = await pedir("PUT", `${url}/contagem`, {
      empresaId: idsTeste.empresaA,
      itens: [{ itemId: primeiro.itemId, quantidadeContada: 1 }]
    });
    expect(depois.statusCode).toBe(409);
  });

  it("encerrar a agenda tira as proximas datas e o que ja nasceu fica", async () => {
    const [agenda] = json<{ data: Array<{ id: string }> }>(
      await pedir("GET", `/api/compras/conferencias/agendas?empresaId=${idsTeste.empresaA}`)
    ).data;
    const encerrar = await pedir("POST", `/api/compras/conferencias/agendas/${agenda!.id}/encerrar`, {
      empresaId: idsTeste.empresaA
    });
    expect(encerrar.statusCode).toBe(204);
    const agendas = json<{ data: unknown[] }>(
      await pedir("GET", `/api/compras/conferencias/agendas?empresaId=${idsTeste.empresaA}`)
    ).data;
    expect(agendas).toHaveLength(0);
    const lista = json<{ data: unknown[] }>(
      await pedir("GET", `/api/compras/conferencias?empresaId=${idsTeste.empresaA}`)
    ).data;
    expect(lista).toHaveLength(1);
  });

  it("isola por empresa e por permissao", async () => {
    expect((await pedir("GET", `/api/compras/conferencias?empresaId=${idsTeste.empresaB}`)).statusCode).toBe(403);
    const cookieSem = await cookieSessao(contexto.app, "semPermissao");
    for (const url of [
      `/api/compras/conferencias?empresaId=${idsTeste.empresaA}`,
      `/api/compras/conferencias/agendas?empresaId=${idsTeste.empresaA}`,
      `/api/compras/conferencias/opcoes?empresaId=${idsTeste.empresaA}`
    ])
      expect((await pedir("GET", url, undefined, cookieSem)).statusCode, url).toBe(403);
    expect((await pedir("POST", "/api/compras/conferencias/agendas", corpo(), cookieSem)).statusCode).toBe(403);
  });
});
