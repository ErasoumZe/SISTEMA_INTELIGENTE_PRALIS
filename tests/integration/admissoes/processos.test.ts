import { afterAll, beforeAll, describe, expect, it } from "vitest";
// A matriz de cargos vem da REFERENCIA de producao, nunca copiada para ca: uma segunda lista
// divergiria no primeiro ajuste e o teste passaria a provar a copia, nao a regra.
import { permissoesPorCargo, regrasPermissoes } from "@padaria/db/referencia-permissoes";
import type { Permissao } from "@padaria/shared";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste, type PerfilTeste } from "../../setup/contexto.js";
import {
  abrirBloqueador,
  consultarTodos,
  consultarUm,
  esperarBloqueioPor,
  executarSql,
  fecharBloqueador
} from "../../setup/integracao.js";

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
  // Perfis com as permissoes REAIS dos cargos, montados a partir da referencia de producao.
  let cookieGerenciaReal: string;
  let cookieDpReal: string;

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
    const id = criado.json().data.id;
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

  /**
   * Veste um usuario de teste com as permissoes REAIS de um cargo da referencia.
   *
   * Os perfis do seed de teste gravam permissao na camada de USUARIO, que e a ultima a ser
   * resolvida — entao reescrever `permissoes_usuarios` e o caminho mais direto e nao depende do
   * nome do cargo normalizar. Tem de ser `usuario_comum`: `usuario_admin` recebe acesso total
   * antes de olhar qualquer camada, e o teste provaria nada.
   */
  /** A matriz REAL do cargo. Cargo ausente levanta erro: lista vazia viraria outro teste. */
  function matriz(cargo: string): Permissao[] {
    const lista = permissoesPorCargo[cargo];
    if (!lista) throw new Error(`cargo ausente na referencia: ${cargo}`);
    return lista;
  }

  async function vestirPermissoes(perfil: PerfilTeste, regras: Permissao[]) {
    const alvo = await consultarUm<{ id: string }>(`select u.id from "user" u where u.email = $1`, [
      usuariosTeste[perfil].email
    ]);
    if (!alvo) throw new Error(`usuario de teste ausente: ${perfil}`);
    await executarSql(
      `insert into permissoes_usuarios (usuario_id, regras) values ($1, $2::jsonb)
         on conflict (usuario_id) do update set regras = excluded.regras`,
      [alvo.id, JSON.stringify(regrasPermissoes(regras))]
    );
  }

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieDp = await cookieSessao(contexto.app, "admin");
    // `semPermissao`: usuario_comum da MESMA empresa, com a lista de permissoes vazia. E o unico
    // ator que prova autorizacao — ver o comentario do P0-2.
    cookieSemPermissao = await cookieSessao(contexto.app, "semPermissao");

    // `gerente` e `caixa` sao usuario_comum da mesma empresa. Vestidos com a matriz real, eles
    // passam a provar o cargo, e nao apenas "lista vazia recebe 403".
    // A referencia e um Record<string, ...>: o cargo ausente viraria lista vazia em silencio, e
    // o teste passaria a provar "sem permissao", que e outro teste.
    await vestirPermissoes("gerente", matriz("Gerencia"));
    await vestirPermissoes("caixa", matriz("DP"));
    cookieGerenciaReal = await cookieSessao(contexto.app, "gerente");
    cookieDpReal = await cookieSessao(contexto.app, "caixa");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  // ---------------------------------------------------------------- P0-5 origem
  it("P0-5 Deve_CriarProcesso_Quando_TesteEfetivadoComAprovado", async () => {
    const teste = await criarTeste(cookieDp, "12345678909");
    const efetivado = await efetivar(cookieDp, teste.id, teste.versao);
    assertOk(efetivado);
    const { processoId } = efetivado.json().data;
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
    expect(encerrado.json().data.processoId).toBeNull();
    const linha = await consultarUm<{ n: number }>(
      `select count(*)::int as n from admissoes_processos where teste_id = '${teste.id}'`
    );
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
    const linha = await consultarUm<{ n: number }>(
      `select count(*)::int as n from admissoes_processos where teste_id = '${teste.id}'`
    );
    if (!linha) throw new Error("consulta sem linha");
    expect(linha.n).toBe(1);
  });

  // ---------------------------------------------------------------- P0-3b repeticao
  it("P0-3b Deve_DevolverOMesmoProcesso_Quando_EfetivacaoRepetida", async () => {
    const teste = await criarTeste(cookieDp, "39053344705");
    const primeira = await efetivar(cookieDp, teste.id, teste.versao);
    assertOk(primeira);
    const idOriginal = primeira.json().data.processoId;

    // A repeticao carrega a versao ANTERIOR — o cliente nao recebeu a resposta que a incrementaria.
    // Se a checagem de versao vier antes do ramo idempotente, isto vira VERSAO_CONFLITANTE.
    const repetida = await efetivar(cookieDp, teste.id, teste.versao);
    assertOk(repetida);
    expect(repetida.json().data.processoId).toBe(idOriginal);

    const linha = await consultarUm<{ n: number }>(
      `select count(*)::int as n from admissoes_processos where teste_id = '${teste.id}'`
    );
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

    const linha = await consultarUm<{ n: number }>(
      `select count(*)::int as n from admissoes_processos where teste_id = '${teste.id}'`
    );
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
    const processoId = efetivado.json().data.processoId;

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
    const processoId = efetivado.json().data.processoId;

    // O CHECK precisa recusar vocabulario que a V0 nao tem — inclusive vindo de fora do servico.
    await expect(
      executarSql(`update admissoes_processos set status = 'em_revisao_dp' where id = '${processoId}'`)
    ).rejects.toThrow();
  });

  it("P0-4 Deve_Recusar_Quando_CancelarProcessoJaCancelado", async () => {
    const teste = await criarTeste(cookieDp, "27267508006");
    const efetivado = await efetivar(cookieDp, teste.id, teste.versao);
    assertOk(efetivado);
    const processoId = efetivado.json().data.processoId;

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
    const processoId = efetivado.json().data.processoId;

    const aposCriar = await consultarUm<{ n: number }>(
      `select count(*)::int as n from admissoes_processos_historico where processo_id = '${processoId}' and acao = 'criado'`
    );
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

    const aposCancelar = await consultarUm<{ n: number }>(
      `select count(*)::int as n from admissoes_processos_historico where processo_id = '${processoId}'`
    );
    if (!aposCancelar) throw new Error("consulta sem linha");
    expect(aposCancelar.n).toBe(2);
  });
  // ============================================================ ADM-003 V1A: admissao direta
  //
  // A partir daqui, os casos da segunda origem. Eles convivem com os de cima de proposito: o teste
  // que garante que a ADM-002 nao regrediu tem de morar ao lado do que a estende.

  /** Cria um processo de admissao DIRETA e devolve o id. */
  const turnoCompletoId = "11111111-1111-4111-8111-111111111801";
  const turnoIncompletoId = "11111111-1111-4111-8111-111111111802";
  const turnoLivreId = "11111111-1111-4111-8111-111111111803";
  // Turno PROPRIO do teste de preservacao: ele limpa a etiqueta no fim, e usar o compartilhado
  // deixaria o proximo teste com um turno incompleto — dependencia de ordem disfarcada de bug.
  const turnoEdicaoId = "11111111-1111-4111-8111-111111111804";

  /** Turnos sinteticos desta suite. Criados por SQL porque a tela de Turnos e outra vertical. */
  async function semearTurnos() {
    await executarSql(
      `insert into turnos (id, empresa_id, nome, hora_inicio, hora_fim, etiqueta, dias_semana)
       values ($1, $2, 'Manha V1B', '06:00', '14:00', 'M', array['SEGUNDA','TERCA']::text[])
       on conflict do nothing`,
      [turnoCompletoId, idsTeste.empresaA]
    );
    await executarSql(
      `insert into turnos (id, empresa_id, nome, hora_inicio, hora_fim)
       values ($1, $2, 'Sem etiqueta V1B', '14:00', '22:00') on conflict do nothing`,
      [turnoIncompletoId, idsTeste.empresaA]
    );
    await executarSql(
      `insert into turnos (id, empresa_id, nome, hora_inicio, hora_fim, etiqueta, dias_semana)
       values ($1, $2, 'Livre V1B', '08:00', '16:00', 'T', array['QUARTA']::text[])
       on conflict do nothing`,
      [turnoLivreId, idsTeste.empresaA]
    );
    await executarSql(
      `insert into turnos (id, empresa_id, nome, hora_inicio, hora_fim, etiqueta, dias_semana)
       values ($1, $2, 'Edicao V1B', '10:00', '18:00', 'M', array['SEGUNDA','TERCA']::text[])
       on conflict do nothing`,
      [turnoEdicaoId, idsTeste.empresaA]
    );
  }

  /**
   * Cria admissao direta. Desde a V1B o pre-cadastro do DP exige identidade e TURNO — jornada em
   * texto saiu do contrato. Um CPF por chamada, porque agora ha unicidade por CPF na empresa.
   */
  let sequenciaCpf = 0;
  function proximoCpfSintetico() {
    // Base sintetica + digito verificador calculado: o contrato valida DV, entao numero inventado
    // seria recusado antes de o teste chegar na regra que ele quer provar.
    const base = String(30000000 + sequenciaCpf++ * 137).padStart(9, "0");
    const dv = (parcial: string) => {
      const numeros = parcial.split("").map(Number);
      const soma = numeros.reduce((total, n, i) => total + n * (numeros.length + 1 - i), 0);
      const resto = (soma * 10) % 11;
      return resto > 9 ? 0 : resto;
    };
    const d1 = dv(base);
    return `${base}${d1}${dv(base + d1)}`;
  }

  async function criarDireta(cookie: string, cpf = proximoCpfSintetico()) {
    await semearTurnos();
    return contexto.app.inject({
      method: "POST",
      url: "/api/admissoes/processos",
      headers: { cookie },
      payload: {
        nomeCompleto: "Pessoa Direta",
        cpf,
        funcaoId: idsTeste.funcaoOperacionalA,
        turnoId: turnoCompletoId,
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
        nomeCompleto: "Pessoa Direta",
        cpf: proximoCpfSintetico(),
        funcaoId: idsTeste.funcaoOperacionalA,
        turnoId: turnoCompletoId,
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

    // E processo direto nao pode perder a dele — nem a funcao, nem o turno, nem a identidade.
    const direto = await criarDireta(cookieDp);
    assertOk(direto, 201);
    const idDireto = direto.json().data.id;
    for (const coluna of ["funcao_id", "turno_id", "nome_completo", "cpf"]) {
      await expect(
        executarSql(`update admissoes_processos set ${coluna} = null where id = '${idDireto}'`),
        coluna
      ).rejects.toThrow();
    }
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
    // Desde a V1B o processo direto JA nasce com nome: o pre-cadastro do DP o exige. Antes ele vinha
    // nulo, e a lista dizia "Aguardando dados do candidato" — essa regra mudou por decisao.
    expect(diretos.every((i) => i.nomeCompleto !== null)).toBe(true);
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
    for (const situacao of ["guia_entregue", "agendado", "exige_acao", "aso_apto"]) {
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
    expect(internos.exameSituacao).toBe("aso_apto");
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
    const turnoB = "33333333-3333-4333-8333-333333330503";
    await executarSql(
      `insert into turnos (id, empresa_id, nome, hora_inicio, hora_fim, etiqueta, dias_semana)
       values ($1, $2, 'Turno B', '06:00', '14:00', 'M', array['SEGUNDA']::text[])
       on conflict do nothing`,
      [turnoB, idsTeste.empresaB]
    );
    await executarSql(
      `insert into admissoes_processos
         (id, empresa_id, origem, teste_id, nome_completo, cpf, funcao_id, turno_id,
          criado_por, atualizado_por)
       select $1, $2, 'admissao_direta', null, 'Pessoa da Empresa B', '15350946056', $3, $4,
              p.usuario_id, p.usuario_id
         from perfis_usuarios p limit 1`,
      [processoB, idsTeste.empresaB, funcaoB, turnoB]
    );

    for (const rota of [
      { method: "GET" as const, url: `/api/admissoes/processos/${processoB}` },
      { method: "PUT" as const, url: `/api/admissoes/processos/${processoB}/internos`, payload: { versao: 1 } },
      {
        method: "PUT" as const,
        url: `/api/admissoes/processos/${processoB}/exame`,
        payload: { versao: 1, situacao: "agendado" }
      }
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
  // ============================================================ ADM-003 V1B
  //
  // Pre-cadastro do DP, turno por catalogo, CPF cruzado e ASO.

  async function criarDiretaV1B(
    cookie: string,
    cpf: string,
    turnoId = turnoCompletoId,
    nomeCompleto = "Pessoa Direta V1B"
  ) {
    await semearTurnos();
    return contexto.app.inject({
      method: "POST",
      url: "/api/admissoes/processos",
      headers: { cookie },
      payload: { nomeCompleto, cpf, funcaoId: idsTeste.funcaoOperacionalA, turnoId, dataAdmissao: "2026-09-15" }
    });
  }

  it("P0-V1B Deve_ExigirIdentidadeEturno_Quando_CriarAdmissaoDireta", async () => {
    const criado = await criarDiretaV1B(cookieDp, "02000000045");
    assertOk(criado, 201);
    const id = criado.json().data.id;

    const linha = await consultarUm<{
      nome_completo: string;
      cpf: string;
      turno_id: string;
      turno_etiqueta: string;
      turno_dias_semana: string[];
      jornada_horario: string | null;
    }>(
      `select nome_completo, cpf, turno_id, turno_etiqueta, turno_dias_semana, jornada_horario
         from admissoes_processos where id = '${id}'`
    );
    expect(linha?.nome_completo).toBe("Pessoa Direta V1B");
    expect(linha?.cpf).toBe("02000000045");
    expect(linha?.turno_id).toBe(turnoCompletoId);
    // RETRATO gravado no ato — nao e o catalogo lido depois.
    expect(linha?.turno_etiqueta).toBe("M");
    expect(linha?.turno_dias_semana).toEqual(["SEGUNDA", "TERCA"]);
    // Jornada em texto NAO e escrita por caminho novo: ela existe so para o legado da V1A.
    expect(linha?.jornada_horario).toBeNull();

    // A projecao nunca carrega digito de CPF.
    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/admissoes/processos/${id}`,
      headers: { cookie: cookieDp }
    });
    assertOk(detalhe);
    expect(JSON.stringify(detalhe.json().data)).not.toContain("02000000045");
    expect(detalhe.json().data.cpfMascarado).not.toMatch(/[0-9]/);
  });

  it("P0-V1B Deve_Recusar_Quando_TurnoIncompleto", async () => {
    // O seletor ja nao oferece. Isto prova que o SERVIDOR recusa quem tentar forcar.
    const recusado = await criarDiretaV1B(cookieDp, "02001111169", turnoIncompletoId);
    expect(recusado.statusCode).toBe(400);
    expect(JSON.stringify(recusado.json())).toContain("incompleto");

    const linha = await consultarUm<{ n: number }>(
      `select count(*)::int as n from admissoes_processos where cpf = '02001111169'`
    );
    expect(linha?.n).toBe(0);
  });

  it("P0-V1B Deve_Recusar_Quando_CpfJaEstaEmTeste_E_Vice_Versa", async () => {
    // Sentido 1: teste primeiro, admissao direta depois.
    const cpfA = "02002222282";
    await criarTeste(cookieDp, cpfA);
    const direta = await criarDiretaV1B(cookieDp, cpfA);
    expect(direta.statusCode).toBe(409);
    expect(direta.json().code).toBe("CPF_JA_EM_ADMISSAO");

    // Sentido 2: admissao direta primeiro, teste depois.
    const cpfB = "02003333304";
    assertOk(await criarDiretaV1B(cookieDp, cpfB), 201);
    const teste = await contexto.app.inject({
      method: "POST",
      url: "/api/admissoes/testes",
      headers: { cookie: cookieDp },
      payload: {
        nomeCompleto: "Pessoa de Teste",
        cpf: cpfB,
        funcaoId: idsTeste.funcaoOperacionalA,
        jornadaHorario: "seg a sex, 08:00 as 17:00",
        inicioEm: "2026-09-01T12:00:00.000Z",
        fimCombinadoEm: "2026-09-30T12:00:00.000Z"
      }
    });
    expect(teste.statusCode).toBe(409);
    expect(teste.json().code).toBe("CPF_JA_EM_ADMISSAO");
  });

  it("P0-V1B Deve_BloquearNoLock_Quando_TesteEDiretaCorremJuntos", async () => {
    // A corrida CRUZADA: as duas rotas gravam em tabelas diferentes, entao indice nenhum as separa.
    // Quem separa e o advisory lock, e este teste falha se ele for removido.
    const cpf = "02004444410";
    await semearTurnos();
    const bloqueador = await abrirBloqueador();
    try {
      await bloqueador.cliente.query("begin");
      // Toma a MESMA chave que o servico toma. Chave, nao linha: `for update` nao serviria.
      await bloqueador.cliente.query(
        "select pg_advisory_xact_lock(hashtext('admissoes:pessoa'), hashtext($1::text || ':' || $2::text))",
        [idsTeste.empresaA, cpf]
      );

      const emVoo = criarDiretaV1B(cookieDp, cpf);
      // Condicao, nao sleep: prova que a rota esta parada NESTE lock, e nao que demorou.
      expect(await esperarBloqueioPor(bloqueador)).toBe(true);

      await bloqueador.cliente.query("rollback");
      assertOk(await emVoo, 201);
    } finally {
      await fecharBloqueador(bloqueador);
    }
  });

  it("P0-V1B Deve_Recusar403_Quando_GerenciaEditaInternosOuExame", async () => {
    const criado = await criarDiretaV1B(cookieDp, "02005555533");
    assertOk(criado, 201);
    const id = criado.json().data.id;

    // `semPermissao` esta na MESMA empresa e o alvo EXISTE: e o unico arranjo que prova autorizacao.
    for (const rota of ["internos", "exame"]) {
      const resposta = await contexto.app.inject({
        method: "PUT",
        url: `/api/admissoes/processos/${id}/${rota}`,
        headers: { cookie: cookieSemPermissao },
        payload: rota === "exame" ? { versao: 1, situacao: "aso_apto" } : { versao: 1, ctpsNumero: "1" }
      });
      expect(resposta.statusCode, rota).toBe(403);
    }
  });

  it("P0-V1B Deve_Recusar403_Quando_CARGO_GerenciaEditaInternosOuExame", async () => {
    // O teste vizinho usa um perfil de lista VAZIA — ele prova que 403 acontece, nao que a Gerencia
    // e recusada. Este veste a matriz real: a Gerencia tem criar_direta e cancelar, e NAO tem
    // editar_internos. E a unica prova da D-7 no nivel de comportamento.
    const criado = await criarDiretaV1B(cookieDp, "02010101006");
    assertOk(criado, 201);
    const id = criado.json().data.id;

    for (const rota of ["internos", "exame"]) {
      const resposta = await contexto.app.inject({
        method: "PUT",
        url: `/api/admissoes/processos/${id}/${rota}`,
        headers: { cookie: cookieGerenciaReal },
        payload: rota === "exame" ? { versao: 1, situacao: "aso_apto" } : { versao: 1, ctpsNumero: "1" }
      });
      expect(resposta.statusCode, rota).toBe(403);
      expect(resposta.json().details?.permissao).toBe("admissoes_processos_editar_internos");
    }

    // E o que ela PODE: ver o processo continua valendo, senao o 403 acima seria so falta de acesso.
    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/admissoes/processos/${id}`,
      headers: { cookie: cookieGerenciaReal }
    });
    expect(detalhe.statusCode).toBe(200);
  });

  it("P0-V1B Deve_VerListaEDetalhe_Quando_CARGO_DpOuGerencia", async () => {
    // Ate aqui, "DP e Gerencia visualizam Processos" so estava provado como TEXTO da referencia.
    // Isto prova comportamento: lista e detalhe respondem 200 para os dois cargos reais.
    const criado = await criarDiretaV1B(cookieDp, "02050505060");
    assertOk(criado, 201);
    const id = criado.json().data.id;

    for (const [cargo, cookie] of [
      ["DP", cookieDpReal],
      ["Gerencia", cookieGerenciaReal]
    ] as const) {
      const lista = await contexto.app.inject({
        method: "GET",
        url: "/api/admissoes/processos?page=1&pageSize=10",
        headers: { cookie }
      });
      expect(lista.statusCode, `${cargo} lista`).toBe(200);

      const detalhe = await contexto.app.inject({
        method: "GET",
        url: `/api/admissoes/processos/${id}`,
        headers: { cookie }
      });
      expect(detalhe.statusCode, `${cargo} detalhe`).toBe(200);
    }
  });

  it("P0-V1B Deve_CriarDiretaECancelar_Quando_CARGO_DpOuGerencia", async () => {
    // Criar admissao direta e cancelar sao os dois atos que a referencia da aos DOIS cargos. Antes,
    // ambos so eram exercitados com o perfil admin, que passa por herdar tudo do role.
    const cpfs = { DP: "02060606020", Gerencia: "02030303038" } as const;
    for (const [cargo, cookie] of [
      ["DP", cookieDpReal],
      ["Gerencia", cookieGerenciaReal]
    ] as const) {
      const criado = await criarDiretaV1B(cookie, cpfs[cargo]);
      expect(criado.statusCode, `${cargo} cria`).toBe(201);
      // `criadoId` devolve o id, nao a versao. Processo recem-criado nasce na versao 1.
      const alvo = criado.json().data.id as string;

      const cancelado = await contexto.app.inject({
        method: "POST",
        url: `/api/admissoes/processos/${alvo}/cancelar`,
        headers: { cookie },
        payload: { versao: 1 }
      });
      expect(cancelado.statusCode, `${cargo} cancela`).toBe(200);
    }
  });

  it("P0-V1B Deve_Recusar403EmTudo_Quando_CARGO_DiretorGeralSemRole", async () => {
    // O cargo "Diretor Geral" e vazio de proposito: quem abre tudo e o role usuario_admin. Vestido
    // num usuario_comum, ele nao passa em rota nenhuma. Se alguem "ajudar" o cargo com permissoes,
    // este teste cai. O perfil e vestido AQUI, e nao no beforeAll, para o teste nao depender de
    // ordem: quem veste o proprio ator no corpo nao pode ser desfeito por um vizinho.
    await vestirPermissoes("semRecorrencia", matriz("Diretor Geral"));
    const cookieCargoDiretor = await cookieSessao(contexto.app, "semRecorrencia");

    const criado = await criarDiretaV1B(cookieDp, "02040404007");
    assertOk(criado, 201);
    const id = criado.json().data.id;

    const rotas: [string, string, Record<string, unknown> | null][] = [
      ["GET", "/api/admissoes/processos?page=1&pageSize=10", null],
      ["GET", `/api/admissoes/processos/${id}`, null],
      ["PUT", `/api/admissoes/processos/${id}/internos`, { versao: 1, ctpsNumero: "1" }],
      ["PUT", `/api/admissoes/processos/${id}/exame`, { versao: 1, situacao: "aso_apto" }],
      ["POST", `/api/admissoes/processos/${id}/cancelar`, { versao: 1 }]
    ];
    for (const [metodo, url, payload] of rotas) {
      const resposta = await contexto.app.inject({
        method: metodo as "GET",
        url,
        headers: { cookie: cookieCargoDiretor },
        ...(payload ? { payload } : {})
      });
      expect(resposta.statusCode, `${metodo} ${url}`).toBe(403);
    }

    // Contraprova: o MESMO alvo, pelo perfil com role usuario_admin, responde 200.
    const comRole = await contexto.app.inject({
      method: "GET",
      url: `/api/admissoes/processos/${id}`,
      headers: { cookie: cookieDp }
    });
    expect(comRole.statusCode).toBe(200);
  });

  it("P0-V1B Deve_Permitir_Quando_CARGO_DpEditaInternosEExame", async () => {
    // O outro lado da mesma moeda: a D-7 diz que o bloco interno e do DP, e ninguem provava isso
    // com o cargo DP de verdade — os testes usavam admin, que passa por herdar tudo.
    const criado = await criarDiretaV1B(cookieDp, "02020202077");
    assertOk(criado, 201);
    const id = criado.json().data.id;

    const internos = await contexto.app.inject({
      method: "PUT",
      url: `/api/admissoes/processos/${id}/internos`,
      headers: { cookie: cookieDpReal },
      payload: { versao: 1, ctpsNumero: "12345" }
    });
    expect(internos.statusCode).toBe(204);

    const exame = await contexto.app.inject({
      method: "PUT",
      url: `/api/admissoes/processos/${id}/exame`,
      headers: { cookie: cookieDpReal },
      payload: { versao: 2, situacao: "aso_apto" }
    });
    expect(exame.statusCode).toBe(204);
  });

  it("P0-V1B Deve_ListarFuncoes_Quando_AtorSoTemCriarDireta", async () => {
    // O catalogo de funcoes exigia `admissoes_testes_visualizar`, permissao de OUTRO dominio: quem
    // podia criar admissao direta nao conseguia carregar o proprio formulario. Aqui o ator tem
    // criar_direta e NAO tem testes_visualizar — e a rota tem de responder 200.
    await vestirPermissoes("tesouraria", ["admissoes_processos_criar_direta"]);
    const cookie = await cookieSessao(contexto.app, "tesouraria");

    const funcoes = await contexto.app.inject({
      method: "GET",
      url: "/api/admissoes/funcoes",
      headers: { cookie }
    });
    expect(funcoes.statusCode).toBe(200);

    // O turno, que ja aceitava criar_direta, continua respondendo — os dois catalogos da MESMA tela
    // nao podem pedir permissoes de dominios diferentes.
    const turnos = await contexto.app.inject({
      method: "GET",
      url: "/api/admissoes/turnos",
      headers: { cookie }
    });
    expect(turnos.statusCode).toBe(200);
  });

  it("P0-V1B Deve_Recusar403EmFuncoes_Quando_AtorNaoTemNenhumaDasDuas", async () => {
    // A abertura foi ADITIVA, nao um afrouxamento: quem nao tem nenhuma das duas continua fora.
    const resposta = await contexto.app.inject({
      method: "GET",
      url: "/api/admissoes/funcoes",
      headers: { cookie: cookieSemPermissao }
    });
    expect(resposta.statusCode).toBe(403);
  });

  it("P0-V1B Deve_ExporAtivo_Quando_ListarTurnosParaAdmissao", async () => {
    // Sem `ativo` no DTO, turno desativado chegava marcado so como "incompleto" e a tela mandava o
    // DP preencher etiqueta e dias que ja estavam la.
    await semearTurnos();
    const resposta = await contexto.app.inject({
      method: "GET",
      url: "/api/admissoes/turnos",
      headers: { cookie: cookieDp }
    });
    assertOk(resposta, 200);
    const itens = resposta.json().data as { ativo: boolean; completo: boolean }[];
    expect(itens.length).toBeGreaterThan(0);
    expect(itens.every((turno) => typeof turno.ativo === "boolean")).toBe(true);
    // Turno completo e necessariamente ativo — e a regra de `turnoCompleto`.
    expect(itens.filter((turno) => turno.completo).every((turno) => turno.ativo)).toBe(true);
  });

  it("P0-V1B Deve_PausarEretomar_Quando_AsoNaoAptoEdepoisApto", async () => {
    const criado = await criarDiretaV1B(cookieDp, "02006666657");
    assertOk(criado, 201);
    const id = criado.json().data.id;

    const naoApto = await contexto.app.inject({
      method: "PUT",
      url: `/api/admissoes/processos/${id}/exame`,
      headers: { cookie: cookieDp },
      payload: { versao: 1, situacao: "aso_nao_apto" }
    });
    expect(naoApto.statusCode).toBe(204);

    let processo = await consultarUm<{ status: string }>(`select status from admissoes_processos where id = '${id}'`);
    expect(processo?.status).toBe("pausado");

    // A situacao DERIVADA nao chama pausado de Ativo.
    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/admissoes/processos/${id}`,
      headers: { cookie: cookieDp }
    });
    assertOk(detalhe);
    expect(detalhe.json().data.situacao).toBe("pausado");

    const versaoInternos = detalhe.json().data.internos.versao;
    const apto = await contexto.app.inject({
      method: "PUT",
      url: `/api/admissoes/processos/${id}/exame`,
      headers: { cookie: cookieDp },
      payload: { versao: versaoInternos, situacao: "aso_apto" }
    });
    expect(apto.statusCode).toBe(204);

    processo = await consultarUm<{ status: string }>(`select status from admissoes_processos where id = '${id}'`);
    expect(processo?.status).toBe("iniciado");

    const eventos = await consultarTodos<{ acao: string }>(
      `select acao from admissoes_processos_historico where processo_id = '${id}' order by ocorrido_em`
    );
    expect(eventos.map((e) => e.acao)).toEqual(["criado", "exame_alterado", "pausado", "exame_alterado", "retomado"]);
  });

  it("P0-V1B Deve_RetomarSoDePausado_E_PermitirCancelarPausado", async () => {
    const criado = await criarDiretaV1B(cookieDp, "02007777770");
    assertOk(criado, 201);
    const id = criado.json().data.id;

    // Apto num processo JA iniciado nao mexe no status — nao ha de onde voltar.
    const apto = await contexto.app.inject({
      method: "PUT",
      url: `/api/admissoes/processos/${id}/exame`,
      headers: { cookie: cookieDp },
      payload: { versao: 1, situacao: "aso_apto" }
    });
    expect(apto.statusCode).toBe(204);
    let processo = await consultarUm<{ status: string }>(`select status from admissoes_processos where id = '${id}'`);
    expect(processo?.status).toBe("iniciado");
    const eventos = await consultarTodos<{ acao: string }>(
      `select acao from admissoes_processos_historico where processo_id = '${id}'`
    );
    expect(eventos.map((e) => e.acao)).not.toContain("retomado");

    // Pausa e cancela a partir de pausado: um processo parado por inaptidao e dos que o DP encerra.
    const detalhe1 = await contexto.app.inject({
      method: "GET",
      url: `/api/admissoes/processos/${id}`,
      headers: { cookie: cookieDp }
    });
    await contexto.app.inject({
      method: "PUT",
      url: `/api/admissoes/processos/${id}/exame`,
      headers: { cookie: cookieDp },
      payload: { versao: detalhe1.json().data.internos.versao, situacao: "aso_nao_apto" }
    });
    const detalhe2 = await contexto.app.inject({
      method: "GET",
      url: `/api/admissoes/processos/${id}`,
      headers: { cookie: cookieDp }
    });
    expect(detalhe2.json().data.status).toBe("pausado");

    const cancelado = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/processos/${id}/cancelar`,
      headers: { cookie: cookieDp },
      payload: { versao: detalhe2.json().data.versao }
    });
    assertOk(cancelado);
    processo = await consultarUm<{ status: string }>(`select status from admissoes_processos where id = '${id}'`);
    expect(processo?.status).toBe("cancelado");
  });

  it("P0-V1B Deve_Recusar409_Quando_ExcluirTurnoEmUso_E_PermitirTurnoLivre", async () => {
    const criado = await criarDiretaV1B(cookieDp, "02008888894");
    assertOk(criado, 201);

    const emUso = await contexto.app.inject({
      method: "DELETE",
      url: `/api/turnos/${turnoCompletoId}?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieDp }
    });
    // 409, e nao 500: o banco recusa, e o servico traduz o 23503.
    expect(emUso.statusCode).toBe(409);
    expect(emUso.json().code).toBe("TURNO_EM_USO");

    const aindaLa = await consultarUm<{ n: number }>(
      `select count(*)::int as n from turnos where id = '${turnoCompletoId}'`
    );
    expect(aindaLa?.n).toBe(1);

    // Turno sem uso continua excluivel: a protecao e do que esta em uso, nao de tudo.
    const livre = await contexto.app.inject({
      method: "DELETE",
      url: `/api/turnos/${turnoLivreId}?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieDp }
    });
    expect(livre.statusCode).toBe(204);
  });

  it("P0-V1B Deve_PreservarEtiquetaEdias_Quando_PayloadNaoOsTraz", async () => {
    await semearTurnos();
    // Um cliente que NAO conhece os campos novos salva o turno. Nada pode ser apagado.
    const salvo = await contexto.app.inject({
      method: "PUT",
      url: `/api/turnos/${turnoEdicaoId}`,
      headers: { cookie: cookieDp },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: "Edicao V1B renomeada",
        horaInicio: "06:00",
        horaFim: "14:00",
        ativo: true
      }
    });
    // 204: salvar turno nao devolve corpo. O que importa e o efeito, conferido abaixo no banco.
    expect(salvo.statusCode).toBe(204);

    const linha = await consultarUm<{ nome: string; etiqueta: string; dias_semana: string[] }>(
      `select nome, etiqueta, dias_semana from turnos where id = '${turnoEdicaoId}'`
    );
    expect(linha?.nome).toBe("Edicao V1B renomeada");
    expect(linha?.etiqueta).toBe("M");
    expect(linha?.dias_semana).toEqual(["SEGUNDA", "TERCA"]);

    // Limpar exige `null` EXPLICITO — e a outra metade da regra.
    await contexto.app.inject({
      method: "PUT",
      url: `/api/turnos/${turnoEdicaoId}`,
      headers: { cookie: cookieDp },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: "Edicao V1B renomeada",
        horaInicio: "06:00",
        horaFim: "14:00",
        ativo: true,
        etiqueta: null
      }
    });
    const limpa = await consultarUm<{ etiqueta: string | null; dias_semana: string[] }>(
      `select etiqueta, dias_semana from turnos where id = '${turnoEdicaoId}'`
    );
    expect(limpa?.etiqueta).toBeNull();
    expect(limpa?.dias_semana).toEqual(["SEGUNDA", "TERCA"]);
  });

  it("P0-V1B Deve_RevelarCpfComTrilha_E_NuncaEmQueryString", async () => {
    const criado = await criarDiretaV1B(cookieDp, "02009999908");
    assertOk(criado, 201);
    const id = criado.json().data.id;

    const revelado = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/processos/${id}/cpf`,
      headers: { cookie: cookieDp },
      payload: {}
    });
    assertOk(revelado);
    expect(revelado.json().data.cpf).toBe("02009999908");

    // Revelar e ATO AUDITADO: se a trilha nao gravasse, o CPF nao teria saido.
    const eventos = await consultarTodos<{ acao: string }>(
      `select acao from admissoes_processos_historico where processo_id = '${id}'`
    );
    expect(eventos.map((e) => e.acao)).toContain("cpf_revelado");
  });

  it("P0-V1B Deve_NaoTer_SegundaRotaDeCriarOuRetomar", async () => {
    // Guarda de superficie: o servidor nao pode ter ganhado um verbo paralelo.
    for (const rota of [
      { method: "POST" as const, url: `/api/admissoes/processos/${idsTeste.empresaA}/retomar` },
      { method: "POST" as const, url: `/api/admissoes/processos/${idsTeste.empresaA}/iniciar` },
      { method: "POST" as const, url: "/api/admissoes/processos/criar" }
    ]) {
      const resposta = await contexto.app.inject({
        method: rota.method,
        url: rota.url,
        headers: { cookie: cookieDp },
        payload: {}
      });
      expect(resposta.statusCode, rota.url).toBe(404);
    }
  });

  // ============================================================ ADM-003 P0 / migration 0038
  // Revelar CPF e LEITURA. Ate a 0038 ela consumia uma versao do processo, e consumir versao e
  // UPDATE na linha raiz: gravava `atualizado_por` e disparava a trigger de `atualizado_em`. O
  // detalhe passava a mostrar como "Alterado por" quem apenas tinha lido o documento.
  //
  // Estes casos provam as duas metades: o que a revelacao DEIXOU de fazer (escrever), e o que ela
  // nao pode ter afrouxado (a unicidade das acoes funcionais).

  /** A linha raiz crua. E aqui que a contaminacao apareceria — o DTO nao mostra `atualizado_em`. */
  async function linhaRaiz(id: string) {
    return consultarUm<{ versao: number; atualizado_por: string | null; atualizado_em: Date }>(
      `select versao, atualizado_por, atualizado_em from admissoes_processos where id = $1`,
      [id]
    );
  }

  async function revelar(cookie: string, id: string) {
    return contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/processos/${id}/cpf`,
      headers: { cookie },
      payload: {}
    });
  }

  it("P0-0038 Deve_NaoContaminarVersaoNemAutoria_Quando_RevelarCpf", async () => {
    const criado = await criarDireta(cookieDp);
    assertOk(criado, 201);
    const id = criado.json().data.id as string;

    const antes = await linhaRaiz(id);
    expect(antes).not.toBeNull();

    // Quem revela e OUTRO ator, de proposito: com o mesmo criador, `atualizado_por` continuaria
    // igual mesmo havendo UPDATE, e o teste passaria sem provar nada.
    assertOk(await revelar(cookieDpReal, id));

    const depois = await linhaRaiz(id);
    expect(depois?.versao).toBe(antes?.versao);
    expect(depois?.atualizado_por).toBe(antes?.atualizado_por);
    expect(depois?.atualizado_em?.toISOString()).toBe(antes?.atualizado_em?.toISOString());
  });

  it("P0-0038 Deve_AuditarVariasRevelacoes_NaMesmaVersaoFuncional", async () => {
    const criado = await criarDireta(cookieDp);
    assertOk(criado, 201);
    const id = criado.json().data.id as string;

    // Tres leituras, tres linhas de trilha. Antes da 0038 cada uma exigia uma versao nova; com o
    // indice unico simples, duas na mesma versao teriam violado a constraint e virado 500.
    assertOk(await revelar(cookieDp, id));
    assertOk(await revelar(cookieDpReal, id));
    assertOk(await revelar(cookieDp, id));

    const revelacoes = await consultarTodos<{ versao: number }>(
      `select versao from admissoes_processos_historico where processo_id = $1 and acao = 'cpf_revelado'`,
      [id]
    );
    expect(revelacoes).toHaveLength(3);

    // Todas na MESMA versao, e essa versao e a funcional vigente — a do `criado`, que nao mudou.
    const raiz = await linhaRaiz(id);
    expect(new Set(revelacoes.map((linha) => linha.versao))).toEqual(new Set([raiz?.versao]));
  });

  it("P0-0038 Deve_CancelarSemConflito_Quando_OutroAtorRevelouOCpf", async () => {
    const criado = await criarDireta(cookieDp);
    assertOk(criado, 201);
    const id = criado.json().data.id as string;

    // Ator A le o detalhe e guarda a versao, como a tela faz ao abrir o modal.
    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/admissoes/processos/${id}`,
      headers: { cookie: cookieDp }
    });
    assertOk(detalhe);
    const versaoNaTelaDeA = detalhe.json().data.versao as number;

    // Ator B revela o CPF enquanto o modal de A esta aberto.
    assertOk(await revelar(cookieDpReal, id));

    // A cancela com a versao que tinha. Ninguem alterou nada de negocio: tem de passar.
    const cancelado = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/processos/${id}/cancelar`,
      headers: { cookie: cookieDp },
      payload: { versao: versaoNaTelaDeA }
    });
    expect(cancelado.statusCode).toBe(200);
  });

  it("P0-0038 Deve_EditarInternosEExameSemConflito_E_GravarNaVersaoSeguinte", async () => {
    const criado = await criarDireta(cookieDp);
    assertOk(criado, 201);
    const id = criado.json().data.id as string;

    assertOk(await revelar(cookieDp, id));

    // A versao do BLOCO INTERNO nunca foi tocada pela revelacao — nem antes, nem agora. O que este
    // caso prova e que o evento funcional seguinte grava sem colidir com o `cpf_revelado` que ficou
    // na versao 1.
    const internos = await contexto.app.inject({
      method: "PUT",
      url: `/api/admissoes/processos/${id}/internos`,
      headers: { cookie: cookieDpReal },
      payload: { versao: 1, ctpsNumero: "1234567" }
    });
    expect(internos.statusCode).toBe(204);

    const exame = await contexto.app.inject({
      method: "PUT",
      url: `/api/admissoes/processos/${id}/exame`,
      headers: { cookie: cookieDpReal },
      payload: { versao: 2, situacao: "guia_entregue" }
    });
    expect(exame.statusCode).toBe(204);

    const eventos = await consultarTodos<{ acao: string; versao: number }>(
      `select acao, versao from admissoes_processos_historico where processo_id = $1 order by ocorrido_em, versao`,
      [id]
    );
    expect(eventos.map((evento) => evento.acao)).toEqual([
      "criado",
      "cpf_revelado",
      "internos_alterados",
      "exame_alterado"
    ]);
    // `criado` e `cpf_revelado` dividem a versao 1; os funcionais seguintes tem cada um a sua.
    expect(eventos.map((evento) => evento.versao)).toEqual([1, 1, 2, 3]);
  });

  it("P0-0038 Deve_ManterAcoesFuncionaisUnicas_Quando_TransicaoRepetida", async () => {
    const criado = await criarDireta(cookieDp);
    assertOk(criado, 201);
    const id = criado.json().data.id as string;

    assertOk(await revelar(cookieDp, id));
    assertOk(await revelar(cookieDp, id));

    const cancelar = (versao: number) =>
      contexto.app.inject({
        method: "POST",
        url: `/api/admissoes/processos/${id}/cancelar`,
        headers: { cookie: cookieDp },
        payload: { versao }
      });

    expect((await cancelar(1)).statusCode).toBe(200);
    // Terminal continua terminal: o indice ficou PARCIAL, nao permissivo.
    expect((await cancelar(2)).statusCode).toBe(409);

    const eventos = await consultarTodos<{ acao: string }>(
      `select acao from admissoes_processos_historico where processo_id = $1`,
      [id]
    );
    const contar = (acao: string) => eventos.filter((evento) => evento.acao === acao).length;
    expect(contar("criado")).toBe(1);
    expect(contar("cancelado")).toBe(1);
    expect(contar("cpf_revelado")).toBe(2);
  });

  it("P0-0038 Deve_ManterRevelacaoComoPostAuditado_E_RecusarGetEQuemNaoPodeVer", async () => {
    const criado = await criarDireta(cookieDp);
    assertOk(criado, 201);
    const id = criado.json().data.id as string;

    // Nao existe GET equivalente: documento nao entra em URL, e a rota de leitura seria cacheavel.
    const porGet = await contexto.app.inject({
      method: "GET",
      url: `/api/admissoes/processos/${id}/cpf`,
      headers: { cookie: cookieDp }
    });
    expect(porGet.statusCode).toBe(404);

    // Sem permissao de visualizar, nao ha revelacao — e nao ha trilha.
    const semPermissao = await revelar(cookieSemPermissao, id);
    expect(semPermissao.statusCode).toBe(403);

    assertOk(await revelar(cookieDp, id));
    const eventos = await consultarTodos<{ acao: string }>(
      `select acao from admissoes_processos_historico where processo_id = $1 and acao = 'cpf_revelado'`,
      [id]
    );
    expect(eventos).toHaveLength(1);
  });
});
