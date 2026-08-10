import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import {
  abrirBloqueador,
  aindaPendente,
  consultarUm,
  esperarBloqueioPor,
  executarSql,
  fecharBloqueador,
  json,
  snapshotDoLancamento
} from "../../setup/integracao.js";

// CX-M06 — a EXCECAO DE LEGADO tem de ser atomica.
//
// A excecao (retirada que conserva colaborador; despesa com o par de credores intacto) e decidida
// comparando o payload com o registro GRAVADO. Enquanto a leitura desse registro nao tinha lock, a
// janela era: T1 e T2 leem o mesmo legado → T1 moderniza e commita → T2 valida contra o retrato
// VELHO, passa, e reintroduz o credor legado por cima do registro ja saneado. Na retirada isso
// tambem RECRIA `debitos_colaboradores` — ressuscita divida de funcionario ja quitada.
//
// Aqui a corrida e deterministica: um cliente proprio segura a linha com o MESMO lock que a rota
// pega, e o bloqueio da rota e observado pelo banco (`pg_blocking_pids`), nao por sleep.
describe("CX-M06 - a excecao de legado e atomica", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin = "";
  const hoje = "2026-08-01";

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 180_000);

  afterAll(async () => contexto.fechar());

  function post(url: string, payload: object) {
    return contexto.app.inject({ method: "POST", url, headers: { cookie: cookieAdmin }, payload });
  }
  function put(url: string, payload: object) {
    return contexto.app.inject({ method: "PUT", url, headers: { cookie: cookieAdmin }, payload });
  }

  const corpo = (descricao: string, extras: Record<string, unknown> = {}) => ({
    empresaId: idsTeste.empresaA,
    dataReferencia: hoje,
    dataVencimento: hoje,
    descricao,
    valorOriginal: 10,
    contaOrigemId: idsTeste.contaBanco,
    ...extras
  });

  it("Deve_NaoReintroduzirColaborador_Quando_OutraTransacaoModernizaARetiradaLegada", async () => {
    const criada = await post(
      "/api/retiradas",
      corpo("CX-M06 corrida retirada", {
        grupoRetiradaId: idsTeste.grupoRetiradaSangria,
        fornecedorId: idsTeste.fornecedor
      })
    );
    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(criada).data;

    // Estado LEGADO: credor colaborador, como a 0020 permitia.
    await executarSql(
      "update retiradas set fornecedor_id = null, colaborador_id = $2, credor_tipo = 'colaborador' where id = $1",
      [id, idsTeste.colaboradorCaixa]
    );

    const bloqueador = await abrirBloqueador();
    try {
      // T1 segura a linha com o MESMO lock da rota e ainda NAO commitou.
      await bloqueador.cliente.query("begin");
      await bloqueador.cliente.query("select id from retiradas where id = $1 for no key update", [id]);

      // T2 chega pela rota real, mandando o colaborador que ainda esta gravado. Se a rota validasse
      // com um retrato lido antes do lock, isto passaria.
      const edicao = put(
        `/api/retiradas/${id}`,
        corpo("CX-M06 corrida retirada T2", {
          grupoRetiradaId: idsTeste.grupoRetiradaSangria,
          colaboradorId: idsTeste.colaboradorCaixa
        })
      );

      // A rota TEM de estar esperando pelo lock — provado pelo banco, e nao por tempo.
      expect(await esperarBloqueioPor(bloqueador)).toBe(true);
      expect(await aindaPendente(edicao)).toBe(true);

      // T1 moderniza e commita: a retirada deixa de ser de colaborador.
      await bloqueador.cliente.query(
        "update retiradas set colaborador_id = null, fornecedor_id = $2, credor_tipo = 'fornecedor' where id = $1",
        [id, idsTeste.fornecedor]
      );
      await bloqueador.cliente.query("commit");

      // T2 so agora prossegue, e relê sob o lock: o registro nao e mais legado → R-128 recusa.
      const resposta = await edicao;
      expect(resposta.statusCode, resposta.body).toBe(400);
      expect(resposta.body).toContain("R-128");
    } finally {
      await fecharBloqueador(bloqueador);
    }

    // Estado final: modernizado, sem colaborador e SEM divida ressuscitada.
    expect(
      await consultarUm<{ colaborador_id: string | null; fornecedor_id: string; credor_tipo: string }>(
        "select colaborador_id, fornecedor_id, credor_tipo from retiradas where id = $1",
        [id]
      )
    ).toMatchObject({ colaborador_id: null, fornecedor_id: idsTeste.fornecedor, credor_tipo: "fornecedor" });

    const debitos = await consultarUm<{ total: string }>(
      "select count(*) as total from debitos_colaboradores where retirada_id = $1",
      [id]
    );
    expect(Number(debitos?.total ?? "0")).toBe(0);
  });

  it("Deve_NaoRecriarOParIncoerente_Quando_OutraTransacaoResolveADespesaLegada", async () => {
    const criada = await post(
      "/api/despesas",
      corpo("CX-M06 corrida despesa", {
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        fornecedorId: idsTeste.fornecedor
      })
    );
    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(criada).data;

    // Estado LEGADO: os dois ids e `credor_tipo` nulo.
    await executarSql("update despesas set colaborador_id = $2, credor_tipo = null where id = $1", [
      id,
      idsTeste.colaboradorCaixa
    ]);

    const bloqueador = await abrirBloqueador();
    try {
      await bloqueador.cliente.query("begin");
      await bloqueador.cliente.query("select id from despesas where id = $1 for no key update", [id]);

      // T2 devolve o par intacto — o que a excecao de legado permite, contra o retrato VELHO.
      const edicao = put(
        `/api/despesas/${id}`,
        corpo("CX-M06 corrida despesa T2", {
          valorOriginal: 5000,
          grupoDespesaId: idsTeste.grupoDespesaOperacional,
          fornecedorId: idsTeste.fornecedor,
          colaboradorId: idsTeste.colaboradorCaixa
        })
      );

      expect(await esperarBloqueioPor(bloqueador)).toBe(true);
      expect(await aindaPendente(edicao)).toBe(true);

      // T1 resolve o par: fica so o fornecedor.
      await bloqueador.cliente.query(
        "update despesas set colaborador_id = null, credor_tipo = 'fornecedor' where id = $1",
        [id]
      );
      await bloqueador.cliente.query("commit");

      // Sob o lock, o par ja nao esta intacto → a despesa nao pode voltar a ter dois credores.
      const resposta = await edicao;
      expect(resposta.statusCode, resposta.body).toBe(400);
      expect(resposta.body).toContain("um credor so");
    } finally {
      await fecharBloqueador(bloqueador);
    }

    expect(
      await consultarUm<{ colaborador_id: string | null; credor_tipo: string; valor_original: string }>(
        "select colaborador_id, credor_tipo, valor_original from despesas where id = $1",
        [id]
      )
    ).toMatchObject({ colaborador_id: null, credor_tipo: "fornecedor", valor_original: "10.00" });

    // A divida do colaborador que nao era credor nao pode ter sido recriada nem revalorada.
    const debitos = await consultarUm<{ total: string }>(
      "select count(*) as total from debitos_colaboradores where despesa_id = $1",
      [id]
    );
    expect(Number(debitos?.total ?? "0")).toBe(0);
  });

  // A recusa da corrida nao pode deixar rastro: o registro tem de sair EXATAMENTE como T1 o deixou.
  it("Deve_PreservarOSnapshotIntegral_Quando_ACorridaERecusada", async () => {
    const criada = await post(
      "/api/retiradas",
      corpo("CX-M06 corrida snapshot", {
        grupoRetiradaId: idsTeste.grupoRetiradaSangria,
        fornecedorId: idsTeste.fornecedor
      })
    );
    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(criada).data;

    await executarSql(
      "update retiradas set fornecedor_id = null, colaborador_id = $2, credor_tipo = 'colaborador' where id = $1",
      [id, idsTeste.colaboradorCaixa]
    );

    const bloqueador = await abrirBloqueador();
    try {
      await bloqueador.cliente.query("begin");
      await bloqueador.cliente.query("select id from retiradas where id = $1 for no key update", [id]);

      const edicao = put(
        `/api/retiradas/${id}`,
        corpo("CX-M06 corrida snapshot T2", {
          grupoRetiradaId: idsTeste.grupoRetiradaSangria,
          colaboradorId: idsTeste.colaboradorCaixa
        })
      );
      expect(await esperarBloqueioPor(bloqueador)).toBe(true);

      await bloqueador.cliente.query(
        "update retiradas set colaborador_id = null, fornecedor_id = $2, credor_tipo = 'fornecedor' where id = $1",
        [id, idsTeste.fornecedor]
      );
      await bloqueador.cliente.query("commit");
      expect((await edicao).statusCode).toBe(400);
    } finally {
      await fecharBloqueador(bloqueador);
    }

    const antes = await snapshotDoLancamento("retirada", id);
    // Uma segunda tentativa recusada nao pode mover nem `atualizado_em` nem as derivadas.
    const segunda = await put(
      `/api/retiradas/${id}`,
      corpo("CX-M06 corrida snapshot T3", {
        grupoRetiradaId: idsTeste.grupoRetiradaSangria,
        colaboradorId: idsTeste.colaboradorCaixa
      })
    );
    expect(segunda.statusCode, segunda.body).toBe(400);
    expect(await snapshotDoLancamento("retirada", id)).toEqual(antes);
  });
});
