import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql } from "../../setup/integracao.js";

/**
 * ADM-002 V0 — os P0 do processo de admissao.
 *
 * Cobrem seis frentes. As duas de idempotencia sao PROBLEMAS DIFERENTES e por isso sao dois testes:
 * concorrencia e duas chamadas antes de qualquer commit; repeticao e uma chamada depois do commit da
 * outra. Um nao cobre o outro.
 */
describe("admissoes processos integration", () => {
  let contexto: ContextoApiTeste;
  let cookieDp: string; // perfil "admin": usuario_admin recebe toda permissao nova do catalogo
  let cookieSemPermissao: string;

  /** Cria um teste em andamento e devolve id e versao. */
  async function criarTeste(cookie: string, cpf: string) {
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/admissoes/testes",
      headers: { cookie },
      payload: {
        nomeCompleto: "Pessoa de Teste",
        cpf,
        funcaoId: idsTeste.funcaoOperacionalA,
        jornadaHorario: "seg a sex, 08:00 as 17:00",
        inicioEm: "2026-09-01T12:00:00.000Z",
        fimCombinadoEm: "2026-09-30T12:00:00.000Z"
      }
    });
    // 201, nao 200: criar periodo de teste devolve Created. `assertOk` so aceita o status que
    // recebe, entao omitir o 201 aqui fazia TODOS os casos morrerem na fixture.
    assertOk(criado, 201);
    const id = (criado.json()).data.id;
    return { id, versao: 1 };
  }

  async function efetivar(cookie: string, testeId: string, versao: number) {
    return contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/testes/${testeId}/encerrar`,
      headers: { cookie },
      payload: { versao, resultado: "aprovado_para_admissao" }
    });
  }

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieDp = await cookieSessao(contexto.app, "admin");
    // `semPermissao`: usuario_comum da MESMA empresa, com a lista de permissoes vazia. E o unico
    // ator que prova autorizacao — ver o comentario do P0-2.
    cookieSemPermissao = await cookieSessao(contexto.app, "semPermissao");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  // ---------------------------------------------------------------- P0-5 origem
  it("P0-5 Deve_CriarProcesso_Quando_TesteEfetivadoComAprovado", async () => {
    const teste = await criarTeste(cookieDp, "12345678909");
    const efetivado = await efetivar(cookieDp, teste.id, teste.versao);
    assertOk(efetivado);
    const { processoId } = (efetivado.json()).data;
    expect(processoId).toBeTruthy();
  });

  it("P0-5 Deve_NaoCriarProcesso_Quando_EncerradoSemProsseguir", async () => {
    const teste = await criarTeste(cookieDp, "11144477735");
    const encerrado = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/testes/${teste.id}/encerrar`,
      headers: { cookie: cookieDp },
      payload: { versao: teste.versao, resultado: "nao_prosseguir" }
    });
    assertOk(encerrado);
    expect((encerrado.json()).data.processoId).toBeNull();
    const linha = await consultarUm<{ n: number }>(`select count(*)::int as n from admissoes_processos where teste_id = '${teste.id}'`);
    if (!linha) throw new Error("consulta sem linha");
    expect(linha.n).toBe(0);
  });

  // ---------------------------------------------------------------- P0-3 concorrencia
  it("P0-3 Deve_CriarUmUnicoProcesso_Quando_DuasEfetivacoesSimultaneas", async () => {
    const teste = await criarTeste(cookieDp, "52998224725");
    // As duas partem ANTES de qualquer commit: e o caso que so o lock e a unique resolvem.
    const [a, b] = await Promise.all([
      efetivar(cookieDp, teste.id, teste.versao),
      efetivar(cookieDp, teste.id, teste.versao)
    ]);
    // Uma vence; a outra ou entra pelo ramo idempotente ou recebe conflito — nunca cria a segunda.
    expect([a.statusCode, b.statusCode].filter((s) => s === 200).length).toBeGreaterThanOrEqual(1);
    const linha = await consultarUm<{ n: number }>(`select count(*)::int as n from admissoes_processos where teste_id = '${teste.id}'`);
    if (!linha) throw new Error("consulta sem linha");
    expect(linha.n).toBe(1);
  });

  // ---------------------------------------------------------------- P0-3b repeticao
  it("P0-3b Deve_DevolverOMesmoProcesso_Quando_EfetivacaoRepetida", async () => {
    const teste = await criarTeste(cookieDp, "39053344705");
    const primeira = await efetivar(cookieDp, teste.id, teste.versao);
    assertOk(primeira);
    const idOriginal = (primeira.json()).data.processoId;

    // A repeticao carrega a versao ANTERIOR — o cliente nao recebeu a resposta que a incrementaria.
    // Se a checagem de versao vier antes do ramo idempotente, isto vira VERSAO_CONFLITANTE.
    const repetida = await efetivar(cookieDp, teste.id, teste.versao);
    assertOk(repetida);
    expect((repetida.json()).data.processoId).toBe(idOriginal);

    const linha = await consultarUm<{ n: number }>(`select count(*)::int as n from admissoes_processos where teste_id = '${teste.id}'`);
    if (!linha) throw new Error("consulta sem linha");
    expect(linha.n).toBe(1);
  });

  it("P0-3b Deve_Recusar_Quando_RepeticaoTrazDesfechoDiferente", async () => {
    const teste = await criarTeste(cookieDp, "48884555035");
    assertOk(await efetivar(cookieDp, teste.id, teste.versao));
    const divergente = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/testes/${teste.id}/encerrar`,
      headers: { cookie: cookieDp },
      payload: { versao: teste.versao, resultado: "nao_prosseguir" }
    });
    // Conflito REAL de intencao: nao e repeticao, e tentativa de trocar o desfecho.
    expect(divergente.statusCode).toBe(409);
  });

  it("P0-3b Deve_Responder200_Quando_EncerrarSemProsseguirRepetido", async () => {
    // A idempotencia e SIMETRICA: o duplo clique dOi igual nos dois desfechos, mesmo sem processo a
    // devolver. Antes este caso caia em 409 e a pessoa nao sabia se tinha funcionado.
    const teste = await criarTeste(cookieDp, "63017285057");
    const corpo = { versao: teste.versao, resultado: "nao_prosseguir" };
    const primeira = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/testes/${teste.id}/encerrar`,
      headers: { cookie: cookieDp },
      payload: corpo
    });
    assertOk(primeira);

    const repetida = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/testes/${teste.id}/encerrar`,
      headers: { cookie: cookieDp },
      payload: corpo
    });
    assertOk(repetida);
    expect(repetida.json().data.processoId).toBeNull();

    const linha = await consultarUm<{ n: number }>(`select count(*)::int as n from admissoes_processos where teste_id = '${teste.id}'`);
    if (!linha) throw new Error("consulta sem linha");
    expect(linha.n).toBe(0);
  });

  // ---------------------------------------------------------------- P0-1 tenant
  it("P0-1 Deve_Responder404_Quando_ProcessoDeOutraEmpresa", async () => {
    // O processo ALHEIO e montado direto na empresa B, e quem consulta e o ator da empresa A — o
    // inverso do que parece natural. O caminho natural (criar na A e consultar com outro cookie)
    // nao existe: TODO perfil semeado pertence a empresa A, e o unico multiempresa tem a A como
    // empresa ativa, entao ele enxerga o processo por direito e o 404 nunca viria.
    //
    // Nesta direcao o ator e o admin: ele TEM as duas permissoes. Um 404 aqui so pode ser escopo de
    // empresa, nunca autorizacao — que e exatamente o que o P0-1 precisa provar, e o que o P0-2
    // prova pelo outro lado.
    const funcaoB = "33333333-3333-4333-8333-333333330401";
    const testeB = "33333333-3333-4333-8333-333333330402";
    const processoB = "33333333-3333-4333-8333-333333330403";
    await executarSql(
      "insert into funcoes_operacionais (id, empresa_id, nome) values ($1, $2, $3) on conflict do nothing",
      [funcaoB, idsTeste.empresaB, "Funcao Integracao B"]
    );
    // Autoria vem de `perfis_usuarios` (FK simples, sem empresa): qualquer perfil serve de assinatura
    // da fixture. O que esta sob teste e `empresa_id`, e ele e da B nas duas linhas.
    await executarSql(
      `insert into admissoes_testes
         (id, empresa_id, nome_completo, cpf, funcao_id, jornada_horario, inicio_em, fim_combinado_em,
          criado_por, atualizado_por)
       select $1, $2, 'Pessoa da Empresa B', '15350946056', $3, 'seg a sex, 08:00 as 17:00',
              now(), now() + interval '30 days', p.usuario_id, p.usuario_id
         from perfis_usuarios p limit 1`,
      [testeB, idsTeste.empresaB, funcaoB]
    );
    await executarSql(
      `insert into admissoes_processos (id, empresa_id, teste_id, criado_por, atualizado_por)
       select $1, $2, $3, p.usuario_id, p.usuario_id from perfis_usuarios p limit 1`,
      [processoB, idsTeste.empresaB, testeB]
    );

    const alheio = await contexto.app.inject({
      method: "GET",
      url: `/api/admissoes/processos/${processoB}`,
      headers: { cookie: cookieDp }
    });
    // MESMA resposta de inexistente: distinguir entregaria a existencia de graca.
    expect(alheio.statusCode).toBe(404);

    const historicoAlheio = await contexto.app.inject({
      method: "GET",
      url: `/api/admissoes/processos/${processoB}/historico`,
      headers: { cookie: cookieDp }
    });
    expect(historicoAlheio.statusCode).toBe(404);

    // Escrever tambem nao alcanca: o 404 nao pode ser so da leitura.
    const cancelarAlheio = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/processos/${processoB}/cancelar`,
      headers: { cookie: cookieDp },
      payload: { versao: 1 }
    });
    expect(cancelarAlheio.statusCode).toBe(404);
    const intacto = await consultarUm<{ status: string }>(
      `select status from admissoes_processos where id = '${processoB}'`
    );
    expect(intacto?.status).toBe("iniciado");

    const inexistente = await contexto.app.inject({
      method: "GET",
      url: "/api/admissoes/processos/00000000-0000-4000-8000-000000000000",
      headers: { cookie: cookieDp }
    });
    expect(inexistente.statusCode).toBe(404);
  });

  // ---------------------------------------------------------------- P0-2 autorizacao
  it("P0-2 Deve_Responder403_Quando_SemPermissaoDeProcesso", async () => {
    // O alvo EXISTE e e da MESMA empresa do ator. Sem isso o teste nao prova autorizacao: um id
    // inexistente devolveria 404 tanto por falta de permissao quanto por ausencia, e o 404 do P0-1
    // (outra empresa responde como inexistente) mostra que os dois caminhos se cruzam de proposito.
    const teste = await criarTeste(cookieDp, "35388741079");
    const efetivado = await efetivar(cookieDp, teste.id, teste.versao);
    assertOk(efetivado);
    const processoId = (efetivado.json()).data.processoId;

    // O ator e `semPermissao` — usuario_comum com lista VAZIA. O perfil "admin" nao serve aqui:
    // `role = usuario_admin` recebe `permissoesAcessoTotal` em `perfil.service`, sem passar por
    // `permissoes_cargos`. Uma versao anterior deste teste tirava a regra da tabela e media o admin
    // — a permissao continuava valendo, a requisicao seguia, e o 404 do id inexistente era lido
    // como se fosse o 403 esperado.
    const visualizar = await contexto.app.inject({
      method: "GET",
      url: `/api/admissoes/processos/${processoId}`,
      headers: { cookie: cookieSemPermissao }
    });
    expect(visualizar.statusCode).toBe(403);

    const historico = await contexto.app.inject({
      method: "GET",
      url: `/api/admissoes/processos/${processoId}/historico`,
      headers: { cookie: cookieSemPermissao }
    });
    expect(historico.statusCode).toBe(403);

    // Cancelar tem permissao PROPRIA: visualizar nao autoriza escrever.
    const cancelar = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/processos/${processoId}/cancelar`,
      headers: { cookie: cookieSemPermissao },
      payload: { versao: 1 }
    });
    expect(cancelar.statusCode).toBe(403);

    // E a recusa nao pode ter deixado rastro: 403 e antes da escrita.
    const linha = await consultarUm<{ status: string }>(
      `select status from admissoes_processos where id = '${processoId}'`
    );
    expect(linha?.status).toBe("iniciado");
  });

  // ---------------------------------------------------------------- P0-4 estados
  it("P0-4 Deve_RecusarNoBanco_Quando_StatusForaDaLista", async () => {
    const teste = await criarTeste(cookieDp, "70830436049");
    const efetivado = await efetivar(cookieDp, teste.id, teste.versao);
    assertOk(efetivado);
    const processoId = (efetivado.json()).data.processoId;

    // O CHECK precisa recusar vocabulario que a V0 nao tem — inclusive vindo de fora do servico.
    await expect(
      executarSql(`update admissoes_processos set status = 'em_revisao_dp' where id = '${processoId}'`)
    ).rejects.toThrow();
  });

  it("P0-4 Deve_Recusar_Quando_CancelarProcessoJaCancelado", async () => {
    const teste = await criarTeste(cookieDp, "27267508006");
    const efetivado = await efetivar(cookieDp, teste.id, teste.versao);
    assertOk(efetivado);
    const processoId = (efetivado.json()).data.processoId;

    const primeiro = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/processos/${processoId}/cancelar`,
      headers: { cookie: cookieDp },
      payload: { versao: 1 }
    });
    assertOk(primeiro);

    const segundo = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/processos/${processoId}/cancelar`,
      headers: { cookie: cookieDp },
      payload: { versao: 2 }
    });
    // Terminal: nao ha reabertura e nao ha segundo cancelamento.
    expect(segundo.statusCode).toBe(409);
  });

  // ---------------------------------------------------------------- P0-6 auditoria
  it("P0-6 Deve_GravarTrilha_Quando_ProcessoNasceEQuandoECancelado", async () => {
    const teste = await criarTeste(cookieDp, "86288366757");
    const efetivado = await efetivar(cookieDp, teste.id, teste.versao);
    assertOk(efetivado);
    const processoId = (efetivado.json()).data.processoId;

    const aposCriar = await consultarUm<{ n: number }>(`select count(*)::int as n from admissoes_processos_historico where processo_id = '${processoId}' and acao = 'criado'`);
    if (!aposCriar) throw new Error("consulta sem linha");
    expect(aposCriar.n).toBe(1);

    assertOk(
      await contexto.app.inject({
        method: "POST",
        url: `/api/admissoes/processos/${processoId}/cancelar`,
        headers: { cookie: cookieDp },
        payload: { versao: 1 }
      })
    );

    const aposCancelar = await consultarUm<{ n: number }>(`select count(*)::int as n from admissoes_processos_historico where processo_id = '${processoId}'`);
    if (!aposCancelar) throw new Error("consulta sem linha");
    expect(aposCancelar.n).toBe(2);
  });
  // ============================================================ ADM-003 V1A: admissao direta
  //
  // A partir daqui, os casos da segunda origem. Eles convivem com os de cima de proposito: o teste
  // que garante que a ADM-002 nao regrediu tem de morar ao lado do que a estende.

  /** Cria um processo de admissao DIRETA e devolve o id. */
  async function criarDireta(cookie: string, jornada = "Seg a sex, 08:00 as 17:00") {
    return contexto.app.inject({
      method: "POST",
      url: "/api/admissoes/processos",
      headers: { cookie },
      payload: {
        funcaoId: idsTeste.funcaoOperacionalA,
        jornadaHorario: jornada,
        dataAdmissao: "2026-09-15"
      }
    });
  }

  it("P0-V1A Deve_CriarProcessoSemTeste_Quando_AdmissaoDireta", async () => {
    const criado = await criarDireta(cookieDp);
    assertOk(criado, 201);
    const id = criado.json().data.id;

    const linha = await consultarUm<{ origem: string; teste_id: string | null; funcao_id: string | null }>(
      `select origem, teste_id, funcao_id from admissoes_processos where id = '${id}'`
    );
    expect(linha?.origem).toBe("admissao_direta");
    // Sem teste, e com funcao PROPRIA: e a origem direta inteira em duas colunas.
    expect(linha?.teste_id).toBeNull();
    expect(linha?.funcao_id).toBe(idsTeste.funcaoOperacionalA);

    // O bloco interno nasce junto, ja em `pendente` — a tela nunca precisa decidir entre criar e editar.
    const internos = await consultarUm<{ exame_situacao: string; data_admissao: string }>(
      `select exame_situacao, data_admissao::text from admissoes_processos_internos where processo_id = '${id}'`
    );
    expect(internos?.exame_situacao).toBe("pendente");
    expect(internos?.data_admissao).toBe("2026-09-15");
  });

  it("P0-V1A Deve_IgnorarTesteId_Quando_EnviadoNaCriacaoDireta", async () => {
    // O contrato nao conhece `testeId`. Manda-lo nao cria processo de origem teste por engano — e
    // isso importa porque e a diferenca entre "o servico confere" e "e impossivel pedir".
    const teste = await criarTeste(cookieDp, "11122233396");
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/admissoes/processos",
      headers: { cookie: cookieDp },
      payload: {
        funcaoId: idsTeste.funcaoOperacionalA,
        jornadaHorario: "Seg a sex",
        dataAdmissao: "2026-09-15",
        testeId: teste.id
      }
    });
    assertOk(criado, 201);
    const linha = await consultarUm<{ origem: string; teste_id: string | null }>(
      `select origem, teste_id from admissoes_processos where id = '${criado.json().data.id}'`
    );
    expect(linha?.origem).toBe("admissao_direta");
    expect(linha?.teste_id).toBeNull();
  });

  it("P0-V1A Deve_RecusarNoBanco_Quando_OrigemForIncoerente", async () => {
    // A coerencia mora no BANCO. Sem o CHECK, um bug no servico criaria a segunda fonte de funcao —
    // e a partir dai "de onde vem a jornada?" passaria a ter duas respostas.
    const teste = await criarTeste(cookieDp, "44455566619");
    const efetivado = await efetivar(cookieDp, teste.id, teste.versao);
    assertOk(efetivado);
    const processoId = efetivado.json().data.processoId;

    // Processo vindo de teste NAO pode ganhar funcao propria.
    await expect(
      executarSql(
        `update admissoes_processos set funcao_id = '${idsTeste.funcaoOperacionalA}' where id = '${processoId}'`
      )
    ).rejects.toThrow();

    // E processo direto nao pode perder a dele.
    const direto = await criarDireta(cookieDp);
    assertOk(direto, 201);
    await expect(
      executarSql(`update admissoes_processos set funcao_id = null where id = '${direto.json().data.id}'`)
    ).rejects.toThrow();
  });

  it("P0-V1A Deve_MarcarOrigemTeste_Quando_EfetivacaoCriaOProcesso", async () => {
    // A ADM-002 nao regride: efetivar continua criando o processo, agora com a origem escrita.
    const teste = await criarTeste(cookieDp, "77788899941");
    const efetivado = await efetivar(cookieDp, teste.id, teste.versao);
    assertOk(efetivado);

    const linha = await consultarUm<{ origem: string; funcao_id: string | null }>(
      `select origem, funcao_id from admissoes_processos where id = '${efetivado.json().data.processoId}'`
    );
    expect(linha?.origem).toBe("teste_efetivado");
    // Funcao NAO e recopiada: ela mora no teste, e o CHECK garante que aqui fique nula.
    expect(linha?.funcao_id).toBeNull();
  });

  it("P0-V1A Deve_ListarAsDuasOrigens_Quando_ConsultarProcessos", async () => {
    const lista = await contexto.app.inject({
      method: "GET",
      url: "/api/admissoes/processos?page=1&pageSize=50",
      headers: { cookie: cookieDp }
    });
    assertOk(lista);
    const itens = lista.json().data as { origem: string; nomeCompleto: string | null }[];
    expect(itens.some((i) => i.origem === "teste_efetivado")).toBe(true);

    const diretos = itens.filter((i) => i.origem === "admissao_direta");
    expect(diretos.length).toBeGreaterThan(0);
    // O processo direto chega SEM nome, e e assim que tem de ser ate o candidato responder.
    expect(diretos.every((i) => i.nomeCompleto === null)).toBe(true);
  });

  it("P0-V1A Deve_Responder403_Quando_SemPermissaoDeCriarOuEditarInternos", async () => {
    const direto = await criarDireta(cookieDp);
    assertOk(direto, 201);
    const processoId = direto.json().data.id;

    // Ator `usuario_comum` com lista VAZIA, e alvo EXISTENTE da mesma empresa: e o unico arranjo que
    // prova autorizacao. O perfil admin nao serve — `usuario_admin` recebe tudo no perfil.service.
    const criar = await criarDireta(cookieSemPermissao);
    expect(criar.statusCode).toBe(403);

    const internos = await contexto.app.inject({
      method: "PUT",
      url: `/api/admissoes/processos/${processoId}/internos`,
      headers: { cookie: cookieSemPermissao },
      payload: { versao: 1, ctpsNumero: "123" }
    });
    expect(internos.statusCode).toBe(403);

    const exame = await contexto.app.inject({
      method: "PUT",
      url: `/api/admissoes/processos/${processoId}/exame`,
      headers: { cookie: cookieSemPermissao },
      payload: { versao: 1, situacao: "realizado" }
    });
    expect(exame.statusCode).toBe(403);

    const linha = await consultarUm<{ exame_situacao: string }>(
      `select exame_situacao from admissoes_processos_internos where processo_id = '${processoId}'`
    );
    expect(linha?.exame_situacao).toBe("pendente");
  });

  it("P0-V1A Deve_PercorrerAsCincoSituacoesDoExame_E_RecusarUmaSexta", async () => {
    const direto = await criarDireta(cookieDp);
    assertOk(direto, 201);
    const processoId = direto.json().data.id;

    let versao = 1;
    for (const situacao of ["guia_entregue", "agendado", "exige_acao", "realizado"]) {
      const resposta = await contexto.app.inject({
        method: "PUT",
        url: `/api/admissoes/processos/${processoId}/exame`,
        headers: { cookie: cookieDp },
        payload: { versao, situacao }
      });
      expect(resposta.statusCode, situacao).toBe(204);
      versao += 1;
    }

    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/admissoes/processos/${processoId}`,
      headers: { cookie: cookieDp }
    });
    assertOk(detalhe);
    const internos = detalhe.json().data.internos;
    expect(internos.exameSituacao).toBe("realizado");
    // O alerta e DERIVADO: some sozinho quando o exame fica realizado.
    expect(internos.exameExigeAtencao).toBe(false);

    // Um sexto valor e recusado pelo BANCO, nao so pelo Zod.
    await expect(
      executarSql(
        `update admissoes_processos_internos set exame_situacao = 'aguardando_dp' where processo_id = '${processoId}'`
      )
    ).rejects.toThrow();
  });

  it("P0-V1A Deve_Recusar_Quando_VersaoDosInternosEstiverVelha", async () => {
    const direto = await criarDireta(cookieDp);
    assertOk(direto, 201);
    const processoId = direto.json().data.id;

    const primeira = await contexto.app.inject({
      method: "PUT",
      url: `/api/admissoes/processos/${processoId}/internos`,
      headers: { cookie: cookieDp },
      payload: { versao: 1, ctpsNumero: "0001234", ctpsUf: "SP", pisPasepNit: "12345678901" }
    });
    expect(primeira.statusCode).toBe(204);

    // A versao do BLOCO INTERNO, nao a do processo: editar CTPS nao e editar o processo.
    const repetida = await contexto.app.inject({
      method: "PUT",
      url: `/api/admissoes/processos/${processoId}/internos`,
      headers: { cookie: cookieDp },
      payload: { versao: 1, ctpsNumero: "0009999" }
    });
    expect(repetida.statusCode).toBe(409);

    const linha = await consultarUm<{ ctps_numero: string }>(
      `select ctps_numero from admissoes_processos_internos where processo_id = '${processoId}'`
    );
    expect(linha?.ctps_numero).toBe("0001234");
  });

  it("P0-V1A Deve_GravarTrilha_Quando_InternosOuExameMudam", async () => {
    const direto = await criarDireta(cookieDp);
    assertOk(direto, 201);
    const processoId = direto.json().data.id;

    await contexto.app.inject({
      method: "PUT",
      url: `/api/admissoes/processos/${processoId}/internos`,
      headers: { cookie: cookieDp },
      payload: { versao: 1, observacoesRh: "anotacao interna" }
    });
    await contexto.app.inject({
      method: "PUT",
      url: `/api/admissoes/processos/${processoId}/exame`,
      headers: { cookie: cookieDp },
      payload: { versao: 2, situacao: "agendado" }
    });

    const eventos = await consultarTodos<{ acao: string; campos_alterados: string[] }>(
      `select acao, campos_alterados from admissoes_processos_historico where processo_id = '${processoId}' order by ocorrido_em`
    );
    expect(eventos.map((e) => e.acao)).toEqual(["criado", "internos_alterados", "exame_alterado"]);
    // NOMES de campo, nunca valores: o conteudo nao pode ser reconstruido a partir da trilha.
    expect(JSON.stringify(eventos)).not.toContain("anotacao interna");
    expect(eventos.at(-1)?.campos_alterados).toEqual(["exameSituacao"]);
  });

  it("P0-V1A Deve_Responder404_Quando_ProcessoDiretoForDeOutraEmpresa", async () => {
    const funcaoB = "33333333-3333-4333-8333-333333330501";
    const processoB = "33333333-3333-4333-8333-333333330502";
    await executarSql(
      "insert into funcoes_operacionais (id, empresa_id, nome) values ($1, $2, $3) on conflict do nothing",
      [funcaoB, idsTeste.empresaB, "Funcao Direta B"]
    );
    await executarSql(
      `insert into admissoes_processos
         (id, empresa_id, origem, teste_id, funcao_id, jornada_horario, criado_por, atualizado_por)
       select $1, $2, 'admissao_direta', null, $3, 'Seg a sex', p.usuario_id, p.usuario_id
         from perfis_usuarios p limit 1`,
      [processoB, idsTeste.empresaB, funcaoB]
    );

    for (const rota of [
      { method: "GET" as const, url: `/api/admissoes/processos/${processoB}` },
      { method: "PUT" as const, url: `/api/admissoes/processos/${processoB}/internos`, payload: { versao: 1 } },
      { method: "PUT" as const, url: `/api/admissoes/processos/${processoB}/exame`, payload: { versao: 1, situacao: "agendado" } }
    ]) {
      const resposta = await contexto.app.inject({
        method: rota.method,
        url: rota.url,
        headers: { cookie: cookieDp },
        ...(rota.payload ? { payload: rota.payload } : {})
      });
      expect(resposta.statusCode, rota.url).toBe(404);
    }

    // E ele nao aparece na lista da empresa A.
    const lista = await contexto.app.inject({
      method: "GET",
      url: "/api/admissoes/processos?page=1&pageSize=50",
      headers: { cookie: cookieDp }
    });
    assertOk(lista);
    expect(JSON.stringify(lista.json().data)).not.toContain(processoB);
  });
});
