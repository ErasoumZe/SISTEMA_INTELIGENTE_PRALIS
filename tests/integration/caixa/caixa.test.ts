import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

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
    await expect(
      consultarUm("select id from despesas where id = $1 and descricao = $2", [despesaId, "Quebra de caixa"])
    ).resolves.toBeTruthy();
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
    const token = await consultarUm<{ token_edicao: string }>(
      "select token_edicao from fechamentos_caixa where id = $1",
      [caixaId]
    );
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
    await expect(
      consultarUm("select id from fechamentos_caixa where id = $1 and status = 'fechado'", [caixaId])
    ).resolves.toBeTruthy();
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

  it("Deve_AbrirApenasUmCaixa_Quando_AberturasConcorremNoMesmoPdv", async () => {
    const usuarioAdminId = await usuarioIdPorEmail(usuariosTeste.admin.email);
    const conta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Conta concorrencia" }
    });
    expect(conta.statusCode).toBe(201);
    const contaId = json<{ data: { id: string } }>(conta).data.id;
    const pdv = await contexto.app.inject({
      method: "POST",
      url: "/api/pdvs",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "PDV concorrencia", contaId, ativo: true }
    });
    expect(pdv.statusCode).toBe(201);
    const pdvId = json<{ data: { id: string } }>(pdv).data.id;

    const abertura = (observacao: string) =>
      contexto.app.inject({
        method: "POST",
        url: "/api/caixa/abrir",
        headers: { cookie: cookieAdmin },
        payload: {
          empresaId: idsTeste.empresaA,
          pdvId,
          usuarioCaixaId: usuarioAdminId,
          dataHoraAbertura: "2026-02-10T08:00",
          observacao
        }
      });

    const [primeira, segunda] = await Promise.all([abertura("Abertura A"), abertura("Abertura B")]);

    const statuses = [primeira.statusCode, segunda.statusCode].sort();
    expect(statuses).toEqual([201, 400]);
    const abertos = await consultarUm<{ total: number }>(
      "select count(*)::int as total from fechamentos_caixa where pdv_id = $1 and status = 'aberto'",
      [pdvId]
    );
    expect(abertos?.total).toBe(1);

    // Prova deterministica do indice: mesmo por fora da API, o banco rejeita o segundo caixa aberto.
    const violacao = await executarSql(
      `insert into fechamentos_caixa (empresa_id, pdv_id, colaborador_id, data_movimento, status)
       values ($1, $2, $3, '2026-02-10', 'aberto')`,
      [idsTeste.empresaA, pdvId, idsTeste.colaboradorAdmin]
    )
      .then(() => null)
      .catch((error: Error & { code?: string; constraint?: string }) => error);
    expect(violacao?.code).toBe("23505");
    expect(violacao?.constraint).toBe("fechamentos_caixa_pdv_aberto_unico_idx");
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

  it("Deve_Retornar403_Quando_AcertarSaldoDeCaixaDeOutroUsuario", async () => {
    const cookieCaixa = await cookieSessao(contexto.app, "caixa");
    const resposta = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${idsTeste.caixaAberto}/acertar-saldo`,
      headers: { cookie: cookieCaixa },
      payload: {}
    });

    assertProblem(resposta, 403);
  });

  it("Deve_CalcularSaldoAcertarEFechar_Quando_CicloOperacionalCompleto", async () => {
    const usuarioAdminId = await usuarioIdPorEmail(usuariosTeste.admin.email);

    const conta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Conta ciclo operacional" }
    });
    expect(conta.statusCode).toBe(201);
    const contaPdvId = json<{ data: { id: string } }>(conta).data.id;
    const pdv = await contexto.app.inject({
      method: "POST",
      url: "/api/pdvs",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "PDV ciclo operacional", contaId: contaPdvId, ativo: true }
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
        dataHoraAbertura: "2026-03-01T08:00",
        observacao: "Ciclo operacional"
      }
    });
    expect(abrir.statusCode).toBe(201);
    const caixaId = json<{ data: { id: string } }>(abrir).data.id;

    const dataRef = "2026-03-01";
    const lancamentos = [
      {
        url: "/api/vendas",
        payload: {
          empresaId: idsTeste.empresaA,
          dataReferencia: dataRef,
          dataPagamento: dataRef,
          descricao: "Venda ciclo",
          valorOriginal: 100,
          contaOrigemId: contaPdvId,
          pdvId,
          colaboradorId: idsTeste.colaboradorAdmin,
          itensVenda: [
            {
              produtoId: idsTeste.produto,
              descricaoProduto: "Produto ciclo",
              quantidade: 1,
              valorUnitario: 100,
              valorTotal: 100
            }
          ],
          tiposPagamento: [{ formaPagamentoId: idsTeste.formaPagamentoDinheiro, numeroVendas: 1, totalPago: 100 }]
        }
      },
      {
        url: "/api/transferencias",
        payload: {
          empresaId: idsTeste.empresaA,
          dataReferencia: dataRef,
          descricao: "Transferencia entrada ciclo",
          valorOriginal: 50,
          contaOrigemId: idsTeste.contaBanco,
          contaDestinoId: contaPdvId
        }
      },
      {
        url: "/api/transferencias",
        payload: {
          empresaId: idsTeste.empresaA,
          dataReferencia: dataRef,
          descricao: "Transferencia saida ciclo",
          valorOriginal: 30,
          contaOrigemId: contaPdvId,
          contaDestinoId: idsTeste.contaBanco
        }
      },
      {
        url: "/api/despesas",
        payload: {
          empresaId: idsTeste.empresaA,
          dataReferencia: dataRef,
          dataVencimento: dataRef,
          dataPagamento: dataRef,
          descricao: "Despesa ciclo",
          valorOriginal: 20,
          contaOrigemId: contaPdvId,
          grupoDespesaId: idsTeste.grupoDespesaOperacional
        }
      },
      {
        url: "/api/retiradas",
        payload: {
          empresaId: idsTeste.empresaA,
          dataReferencia: dataRef,
          dataVencimento: dataRef,
          dataPagamento: dataRef,
          descricao: "Retirada ciclo",
          valorOriginal: 10,
          contaOrigemId: contaPdvId,
          colaboradorId: idsTeste.colaboradorAdmin,
          grupoRetiradaId: idsTeste.grupoRetiradaSangria
        }
      },
      {
        url: "/api/mercadorias",
        payload: {
          empresaId: idsTeste.empresaA,
          dataReferencia: dataRef,
          dataVencimento: dataRef,
          dataPagamento: dataRef,
          descricao: "Mercadoria ciclo",
          valorOriginal: 15,
          contaOrigemId: contaPdvId,
          fornecedorId: idsTeste.fornecedor,
          grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
          temNotaFiscal: false
        }
      }
    ];
    for (const lancamento of lancamentos) {
      const resposta = await contexto.app.inject({
        method: "POST",
        url: lancamento.url,
        headers: { cookie: cookieAdmin },
        payload: lancamento.payload
      });
      expect(resposta.statusCode, `${lancamento.url}: ${resposta.body}`).toBe(201);
    }

    // Formula oficial: entradas + transf entrada - transf saida - despesas - retiradas - mercadorias
    // 100 + 50 - 30 - 20 - 10 - 15 = 75
    const statusAntes = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(statusAntes);
    expect(statusAntes.json()).toMatchObject({
      data: {
        caixaAberto: { id: caixaId },
        resumo: {
          totalEntradas: 100,
          totalTransferenciasEntrada: 50,
          totalTransferenciasSaida: 30,
          totalDespesas: 20,
          totalRetiradas: 10,
          totalMercadorias: 15,
          saldo: 75
        }
      }
    });

    const acerto = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixaId}/acertar-saldo`,
      headers: { cookie: cookieAdmin },
      payload: { observacao: "Acerto ciclo" }
    });
    expect(acerto.statusCode, acerto.body).toBe(201);

    // Efeitos completos do acerto: despesa pendente vinculada ao colaborador e ao caixa,
    // item da despesa, debito FECHAMENTO_CAIXA e ajuste operacional — todos com 75.00.
    const despesaAcerto = await consultarUm<{
      id: string;
      colaborador_id: string;
      data_pagamento: string | null;
      valor_original: string;
    }>(
      "select id, colaborador_id, data_pagamento, valor_original from despesas where caixa_id = $1 and descricao = 'Diferenca de caixa'",
      [caixaId]
    );
    expect(despesaAcerto?.valor_original).toBe("75.00");
    expect(despesaAcerto?.colaborador_id).toBe(idsTeste.colaboradorAdmin);
    expect(despesaAcerto?.data_pagamento).toBeNull();

    const itemAcerto = await consultarUm<{ valor: string }>("select valor from despesas_itens where despesa_id = $1", [
      despesaAcerto?.id
    ]);
    expect(itemAcerto?.valor).toBe("75.00");

    const debito = await consultarUm<{ tipo: string; valor: string; colaborador_id: string }>(
      "select tipo, valor, colaborador_id from debitos_colaboradores where caixa_id = $1 and despesa_id = $2",
      [caixaId, despesaAcerto?.id]
    );
    expect(debito?.tipo).toBe("FECHAMENTO_CAIXA");
    expect(debito?.valor).toBe("75.00");
    expect(debito?.colaborador_id).toBe(idsTeste.colaboradorAdmin);

    const ajuste = await consultarUm<{ valor_diferenca: string }>(
      "select valor_diferenca from ajustes_fechamento_caixa where fechamento_caixa_id = $1 and despesa_id = $2",
      [caixaId, despesaAcerto?.id]
    );
    expect(ajuste?.valor_diferenca).toBe("75.00");

    // A despesa de acerto entra no proprio caixa e zera o saldo (o bug antigo nao volta).
    const statusDepois = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(statusDepois);
    expect(statusDepois.json()).toMatchObject({
      data: { caixaAberto: { id: caixaId }, resumo: { totalDespesas: 95, saldo: 0 } }
    });

    const fechar = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixaId}/fechar`,
      headers: { cookie: cookieAdmin },
      payload: { observacao: "Fechado apos acerto" }
    });
    expect(fechar.statusCode, fechar.body).toBe(204);
    const fechado = await consultarUm<{ status: string; saldo: string }>(
      "select status, saldo from fechamentos_caixa where id = $1",
      [caixaId]
    );
    expect(fechado?.status).toBe("fechado");
    expect(fechado?.saldo).toBe("0.00");
  });
});
