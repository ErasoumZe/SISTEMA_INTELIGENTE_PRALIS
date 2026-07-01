import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

async function usuarioIdPorEmail(email: string) {
  const usuario = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [email]);
  if (!usuario) throw new Error(`Usuario nao encontrado para ${email}`);
  return usuario.id;
}

describe("caixa integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_RetornarStatusDoCaixaAberto_Quando_UsuarioTemCaixa", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });

    assertOk(resposta);
    expect(resposta.json()).toMatchObject({ data: { caixaAberto: { id: idsTeste.caixaAberto, status: "aberto" } } });
  });

  it("Deve_ListarHistoricoEFechamentoSeedado_Quando_UsuarioPodeGerenciar", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/historico?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });

    assertOk(resposta);
    expect(JSON.stringify(resposta.json())).toContain(idsTeste.caixaFechado);
  });

  it("Deve_RetornarResumoEAcertarSaldoDeFechamento_Quando_DadosValidos", async () => {
    const resumo = await contexto.app.inject({
      method: "GET",
      url: `/api/fechamento-caixa/resumo?empresaId=${idsTeste.empresaA}&data=2026-06-30`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(resumo);
    expect(resumo.json()).toMatchObject({ data: { totalEntradas: 42 } });

    const acerto = await contexto.app.inject({
      method: "POST",
      url: "/api/fechamento-caixa/acertar-saldo",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        colaboradorId: idsTeste.colaboradorAdmin,
        contaOrigemId: idsTeste.contaCaixa,
        data: "2026-06-30",
        valorDiferenca: 5
      }
    });
    expect(acerto.statusCode).toBe(201);
    const despesaId = json<{ data: { id: string } }>(acerto).data.id;
    await expect(consultarUm("select id from despesas where id = $1 and descricao = $2", [despesaId, "Quebra de caixa"])).resolves.toBeTruthy();
  });

  it("Deve_Retornar403_Quando_AcessarOuOperarCaixaDeEmpresaNaoPermitida", async () => {
    const usuarioAdminId = await usuarioIdPorEmail(usuariosTeste.admin.email);
    const status = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${idsTeste.empresaB}`,
      headers: { cookie: cookieAdmin }
    });
    const abrir = await contexto.app.inject({
      method: "POST",
      url: "/api/caixa/abrir",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaB,
        pdvId: idsTeste.pdvA,
        usuarioCaixaId: usuarioAdminId,
        dataHoraAbertura: "2026-07-02T08:00",
        observacao: "Caixa proibido"
      }
    });
    const acertoFechamento = await contexto.app.inject({
      method: "POST",
      url: "/api/fechamento-caixa/acertar-saldo",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaB,
        colaboradorId: idsTeste.colaboradorAdmin,
        contaOrigemId: idsTeste.contaCaixa,
        data: "2026-06-30",
        valorDiferenca: 1
      }
    });

    assertProblem(status, 403);
    assertProblem(abrir, 403);
    assertProblem(acertoFechamento, 403, "FORBIDDEN_COMPANY");
  });

  it("Deve_AbrirEEditarCaixa_Quando_PdvDisponivel", async () => {
    const usuarioAdminId = await usuarioIdPorEmail(usuariosTeste.admin.email);
    const conta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Conta caixa isolado" }
    });
    expect(conta.statusCode).toBe(201);
    const contaId = json<{ data: { id: string } }>(conta).data.id;
    const pdv = await contexto.app.inject({
      method: "POST",
      url: "/api/pdvs",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "PDV caixa isolado", contaId, ativo: true }
    });
    expect(pdv.statusCode).toBe(201);
    const pdvId = json<{ data: { id: string } }>(pdv).data.id;

    const abrir = await contexto.app.inject({
      method: "POST",
      url: "/api/caixa/abrir",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        pdvId,
        usuarioCaixaId: usuarioAdminId,
        dataHoraAbertura: "2026-01-15T08:00",
        observacao: "Caixa aberto por teste"
      }
    });
    expect(abrir.statusCode).toBe(201);
    const caixaId = json<{ data: { id: string } }>(abrir).data.id;
    const token = await consultarUm<{ token_edicao: string }>("select token_edicao from fechamentos_caixa where id = $1", [
      caixaId
    ]);
    expect(token?.token_edicao).toBeTruthy();

    const editar = await contexto.app.inject({
      method: "PUT",
      url: `/api/caixa/${caixaId}/abertura`,
      headers: { cookie: cookieAdmin },
      payload: {
        tokenEdicao: token?.token_edicao,
        pdvId,
        usuarioCaixaId: usuarioAdminId,
        dataHoraAbertura: "2026-01-15T09:00",
        observacao: "Caixa editado por teste"
      }
    });
    expect(editar.statusCode).toBe(204);

    const linha = await consultarUm<{ observacao: string }>("select observacao from fechamentos_caixa where id = $1", [
      caixaId
    ]);
    expect(linha?.observacao).toBe("Caixa editado por teste");

    const fechar = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixaId}/fechar`,
      headers: { cookie: cookieAdmin },
      payload: { observacao: "Caixa fechado por teste" }
    });
    expect(fechar.statusCode).toBe(204);
    await expect(consultarUm("select id from fechamentos_caixa where id = $1 and status = 'fechado'", [caixaId])).resolves.toBeTruthy();
  });

  it("Deve_Retornar400_Quando_EditarAberturaComTokenInvalido", async () => {
    const usuarioAdminId = await usuarioIdPorEmail(usuariosTeste.admin.email);
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/caixa/${idsTeste.caixaAberto}/abertura`,
      headers: { cookie: cookieAdmin },
      payload: {
        tokenEdicao: "TOKEN-INVALIDO",
        pdvId: idsTeste.pdvA,
        usuarioCaixaId: usuarioAdminId,
        dataHoraAbertura: "2026-06-30T08:00",
        observacao: "Token invalido"
      }
    });

    assertProblem(resposta, 400);
  });

  it("Deve_RetornarErro_Quando_CaixaForInexistenteOuFechado", async () => {
    const inexistente = "99999999-9999-4999-8999-999999999999";
    const fecharInexistente = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${inexistente}/fechar`,
      headers: { cookie: cookieAdmin },
      payload: {}
    });
    const fecharFechado = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${idsTeste.caixaFechado}/fechar`,
      headers: { cookie: cookieAdmin },
      payload: {}
    });

    assertProblem(fecharInexistente, 404);
    assertProblem(fecharFechado, 400);
  });

  it("Deve_Retornar400_Quando_AbrirCaixaComPdvInvalidoOuPeriodoIndisponivel", async () => {
    const usuarioAdminId = await usuarioIdPorEmail(usuariosTeste.admin.email);
    const pdvInvalido = await contexto.app.inject({
      method: "POST",
      url: "/api/caixa/abrir",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        pdvId: "99999999-9999-4999-8999-999999999999",
        usuarioCaixaId: usuarioAdminId,
        dataHoraAbertura: "2026-07-03T08:00"
      }
    });
    const pdvJaAberto = await contexto.app.inject({
      method: "POST",
      url: "/api/caixa/abrir",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        pdvId: idsTeste.pdvA,
        usuarioCaixaId: usuarioAdminId,
        dataHoraAbertura: "2026-07-03T08:00"
      }
    });
    const periodoSobreposto = await contexto.app.inject({
      method: "POST",
      url: "/api/caixa/abrir",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        pdvId: idsTeste.pdvLivre,
        usuarioCaixaId: usuarioAdminId,
        dataHoraAbertura: "2026-06-29T10:00"
      }
    });

    assertProblem(pdvInvalido, 400);
    assertProblem(pdvJaAberto, 400);
    assertProblem(periodoSobreposto, 400);
  });

  it("Deve_Retornar400_Quando_FecharCaixaComSaldoPositivoSemAcerto", async () => {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${idsTeste.caixaAberto}/fechar`,
      headers: { cookie: cookieAdmin },
      payload: { observacao: "Tentativa sem acerto" }
    });

    assertProblem(resposta, 400);
  });
});

