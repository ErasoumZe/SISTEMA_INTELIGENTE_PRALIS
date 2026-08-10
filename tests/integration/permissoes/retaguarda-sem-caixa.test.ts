import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

// DECISAO A-1 (Jose, 10/08/2026) — perfil reconhecido por `podeLancarSemCaixa` cria e edita as TRES
// saidas sem caixa aberto proprio, como a transferencia ja fazia. O operador de Caixa nao muda.
//
// Ate aqui as tres saidas chamavam `obterCaixaParaLancamento` INCONDICIONALMENTE. O comentario de
// `podeLancarSemCaixa` dizia que a retaguarda "lanca sem estar presa a um caixa" e o codigo nao fazia
// isso: o Financeiro, que e quem mais lanca despesa, dependia de um terceiro com `caixa_operar` abrir
// um caixa em NOME dele — e `abrirCaixa` nao verifica permissao nenhuma do designado.
//
// O ator aqui e `gerente`: retaguarda pelo nome do cargo (o que `podeLancarSemCaixa` consulta) e SEM
// caixa aberto neste arquivo. E o ponto do teste — se alguem abrir um caixa para ele no `beforeAll`,
// os casos passam a provar outra coisa.
// A-4 (mesma decisao) mora neste arquivo tambem, na segunda metade: quando a retaguarda TEM caixa
// aberto, o `caixa_id` so e associado se a conta escolhida for a do PDV daquele caixa. Os dois atores
// vivem juntos de proposito — a prova de A-1 e "caixa_id nulo", e sem o contraste da A-4 ela passaria
// verde com um `caixa_id` sempre nulo.
const CONTA_DA_EMPRESA_B = "44444444-4444-4444-8444-444444444401";

describe("CX-M06 A-1/A-4 - retaguarda lanca sem caixa aberto e o caixa_id segue a conta", () => {
  let contexto: ContextoApiTeste;
  let cookieGerente = "";
  let cookieCaixa = "";
  let cookieAdmin = "";
  let contaDoPdv = "";
  let caixaDoOperador = "";
  const hoje = "2026-08-01";

  const rotas = [
    [
      "despesa",
      "/api/despesas",
      { grupoDespesaId: idsTeste.grupoDespesaOperacional, fornecedorId: idsTeste.fornecedor }
    ],
    [
      "mercadoria",
      "/api/mercadorias",
      { grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos, fornecedorId: idsTeste.fornecedor }
    ],
    [
      "retirada",
      "/api/retiradas",
      { grupoRetiradaId: idsTeste.grupoRetiradaSangria, fornecedorId: idsTeste.fornecedor }
    ]
  ] as const;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    [cookieAdmin, cookieCaixa] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "caixa")
    ]);

    // O `gerente` do seed e retaguarda pelo NOME do cargo ("Gerente Integracao", que
    // `podeLancarSemCaixa` casa pelo prefixo) mas nao carrega as permissoes das tres saidas — o cargo
    // Gerencia do seed so tem transferencia e cadastros. Sem concede-las, todo caso deste arquivo
    // pararia num 403 de PERMISSAO e provaria a regra errada.
    //
    // A concessao e na camada USUARIO e explicita: o que muda e o que ele PODE fazer, nunca se ele e
    // retaguarda — isso continua saindo do nome do cargo, que e o que a A-1 decide. Mesmo mecanismo
    // ja usado em `opcoes-formulario.test.ts`.
    //
    // ACRESCENTA, nao substitui: o seed grava as permissoes de TODO perfil nesta mesma camada de
    // usuario, e `substituirPermissoesUsuarioRepository` apaga a linha antes de gravar. Mandar so as
    // permissoes novas tirava `caixa_operar` do gerente — e o caso da pre-condicao passava a falhar
    // por um motivo que nao tem nada a ver com a A-1.
    const gerente = await consultarUm<{ usuario_id: string }>(
      "select usuario_id from perfis_usuarios where lower(email) = lower($1)",
      [usuariosTeste.gerente.email]
    );
    if (!gerente) throw new Error("Usuario gerente nao encontrado");
    const regrasAtuais = await consultarUm<{ regras: Record<string, boolean> }>(
      "select regras from permissoes_usuarios where usuario_id = $1",
      [gerente.usuario_id]
    );
    const concessao = await contexto.app.inject({
      method: "POST",
      url: "/api/permissoes",
      headers: { cookie: cookieAdmin },
      payload: {
        tipoPermissao: "usuario",
        usuarioId: gerente.usuario_id,
        regras: {
          ...(regrasAtuais?.regras ?? {}),
          despesas_visualizar: true,
          despesas_criar: true,
          despesas_editar: true,
          mercadorias_visualizar: true,
          mercadorias_criar: true,
          mercadorias_editar: true,
          retiradas_visualizar: true,
          retiradas_criar: true,
          retiradas_editar: true
        }
      }
    });
    expect([200, 201]).toContain(concessao.statusCode);
    // Re-login depois da concessao: o perfil da sessao so recomputa as permissoes efetivas ao logar.
    cookieGerente = await cookieSessao(contexto.app, "gerente");

    // A empresa B nao tem conta no seed. O caso da conta de outra empresa precisa de uma que EXISTA —
    // um id inventado morreria no `uuidSchema`/404 e provaria a validacao de payload, nao o recorte
    // por empresa.
    await executarSql("insert into contas (id, empresa_id, nome) values ($1, $2, $3) on conflict do nothing", [
      CONTA_DA_EMPRESA_B,
      idsTeste.empresaB,
      "Conta da Empresa B (A-1)"
    ]);

    // Um caixa aberto para o OPERADOR, para provar que a regra dele nao mudou. O gerente segue sem.
    const usuario = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
      usuariosTeste.caixa.email
    ]);
    if (!usuario) throw new Error("Usuario caixa nao encontrado");

    const conta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Conta PDV A-1" }
    });
    expect(conta.statusCode, conta.body).toBe(201);
    contaDoPdv = json<{ data: { id: string } }>(conta).data.id;

    const pdv = await contexto.app.inject({
      method: "POST",
      url: "/api/pdvs",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "PDV A-1", contaId: contaDoPdv, ativo: true }
    });
    expect(pdv.statusCode, pdv.body).toBe(201);

    const abertura = await contexto.app.inject({
      method: "POST",
      url: "/api/caixa/abrir",
      headers: { cookie: cookieCaixa },
      payload: {
        empresaId: idsTeste.empresaA,
        pdvId: json<{ data: { id: string } }>(pdv).data.id,
        usuarioCaixaId: usuario.id,
        dataHoraAbertura: "2026-07-31T08:00"
      }
    });
    expect(abertura.statusCode, abertura.body).toBe(201);
    caixaDoOperador = json<{ data: { id: string } }>(abertura).data.id;
  }, 180_000);

  afterAll(async () => contexto.fechar());

  const corpo = (descricao: string, extras: Record<string, unknown> = {}) => ({
    empresaId: idsTeste.empresaA,
    dataReferencia: hoje,
    dataVencimento: hoje,
    descricao,
    valorOriginal: 10,
    ...extras
  });

  function post(cookie: string, url: string, payload: object) {
    return contexto.app.inject({ method: "POST", url, headers: { cookie }, payload });
  }
  function put(cookie: string, url: string, payload: object) {
    return contexto.app.inject({ method: "PUT", url, headers: { cookie }, payload });
  }

  // A PRE-CONDICAO do arquivo inteiro. Se o gerente tiver caixa aberto, tudo abaixo passa a provar
  // outra coisa — e passaria verde do mesmo jeito, que e exatamente o falso-verde a evitar.
  it("Deve_NaoTerCaixaAberto_Quando_OAtorEARetaguardaDesteArquivo", async () => {
    const status = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieGerente }
    });
    expect(status.statusCode, status.body).toBe(200);
    expect(json<{ data: { caixaAberto: unknown } }>(status).data.caixaAberto).toBeNull();
  });

  // PROVA 1 e 2: a retaguarda lanca sem caixa, e o lancamento nasce SEM `caixa_id`.
  it.each(rotas)("Deve_CriarSemCaixaAberto_Quando_ERetaguarda (%s)", async (nome, rota, extras) => {
    const descricao = `CX-M06 A-1 cria ${nome}`;
    const criada = await post(cookieGerente, rota, corpo(descricao, { contaOrigemId: idsTeste.contaBanco, ...extras }));

    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(criada).data;

    // PROVA 3: sem `caixa_id`, ele nao entra no total de caixa nenhum — o total soma por `caixa_id`.
    expect(
      await consultarUm<{ caixa_id: string | null; conta_origem_id: string }>(
        `select caixa_id, conta_origem_id from ${nome}s where id = $1`,
        [id]
      )
    ).toEqual({ caixa_id: null, conta_origem_id: idsTeste.contaBanco });
  });

  // PROVA 3, pelo outro lado: o total do caixa do OPERADOR nao se mexe com o lancamento da
  // retaguarda. Compara o resumo antes e depois — a assercao de coluna acima nao veria um total
  // calculado por outro criterio.
  it("Deve_NaoEntrarNoTotalDeCaixaNenhum_Quando_ARetaguardaLanca", async () => {
    const resumo = async () => {
      const resposta = await contexto.app.inject({
        method: "GET",
        url: `/api/caixa/status?empresaId=${idsTeste.empresaA}`,
        headers: { cookie: cookieCaixa }
      });
      expect(resposta.statusCode, resposta.body).toBe(200);
      return json<{ data: { resumo: Record<string, number> } }>(resposta).data.resumo;
    };

    const antes = await resumo();
    const criada = await post(
      cookieGerente,
      "/api/despesas",
      corpo("CX-M06 A-1 fora do total", {
        contaOrigemId: idsTeste.contaBanco,
        valorOriginal: 777,
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        fornecedorId: idsTeste.fornecedor
      })
    );
    expect(criada.statusCode, criada.body).toBe(201);

    expect(await resumo()).toEqual(antes);
  });

  // PROVA 6: PUT segue a MESMA regra do POST. Sem isto a decisao ficaria pela metade — a retaguarda
  // criaria com `caixa_id` nulo e nao conseguiria corrigir um numero depois.
  it.each(rotas)("Deve_EditarSemCaixaAberto_Quando_ERetaguarda (%s)", async (nome, rota, extras) => {
    const criada = await post(
      cookieGerente,
      rota,
      corpo(`CX-M06 A-1 edita ${nome}`, { contaOrigemId: idsTeste.contaBanco, ...extras })
    );
    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(criada).data;

    // Troca a CONTA junto com o valor: sem caixa aberto a retaguarda escolhe livremente entre as
    // contas da empresa, e e essa metade que o comentario de producao promete. Repetir a mesma conta
    // deixaria passar uma regra "conta imutavel na edicao" sem ninguem notar.
    const editada = await put(
      cookieGerente,
      `${rota}/${id}`,
      corpo(`CX-M06 A-1 edita ${nome} corrigida`, {
        contaOrigemId: idsTeste.contaLivre,
        valorOriginal: 55,
        ...extras
      })
    );

    expect(editada.statusCode, editada.body).toBe(200);
    expect(
      await consultarUm<{ valor_original: string; caixa_id: string | null; conta_origem_id: string | null }>(
        `select valor_original, caixa_id, conta_origem_id from ${nome}s where id = $1`,
        [id]
      )
    ).toEqual({ valor_original: "55.00", caixa_id: null, conta_origem_id: idsTeste.contaLivre });
  });

  // PROVA 2 (segunda metade): "conta autorizada" continua valendo. A retaguarda escolhe livremente
  // ENTRE AS CONTAS DA EMPRESA — nao entre todas as contas do banco.
  it("Deve_RecusarSemGravar_Quando_ARetaguardaUsaContaDeOutraEmpresa", async () => {
    const contaOutraEmpresa = await consultarUm<{ id: string }>("select id from contas where id = $1", [
      CONTA_DA_EMPRESA_B
    ]);
    if (!contaOutraEmpresa) throw new Error("Fixture da conta da empresa B nao foi criada");

    const descricao = "CX-M06 A-1 conta de outra empresa";
    const criada = await post(
      cookieGerente,
      "/api/despesas",
      corpo(descricao, {
        contaOrigemId: contaOutraEmpresa.id,
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        fornecedorId: idsTeste.fornecedor
      })
    );

    assertProblem(criada, 400);
    // Prende em "Conta de origem": `validarReferenciasDespesa` usa a MESMA frase final para
    // fornecedor, colaborador, grupo e item de patrimonio, entao so o sufixo nao diz o que falhou.
    expect(criada.body).toContain("Conta de origem");
    expect(
      await consultarUm<{ total: string }>("select count(*) as total from despesas where descricao = $1", [descricao])
    ).toMatchObject({ total: "0" });
  });

  // PROVA 4: o OPERADOR nao mudou — segue preso a conta do PDV do caixa aberto dele.
  it.each(rotas)("Deve_ContinuarPresoAoPdv_Quando_EOperadorDeCaixa (%s)", async (nome, rota, extras) => {
    const descricao = `CX-M06 A-1 operador ${nome}`;
    const recusada = await post(cookieCaixa, rota, corpo(descricao, { contaOrigemId: idsTeste.contaBanco, ...extras }));

    assertProblem(recusada, 400);
    expect(recusada.body).toContain("conta do PDV");
    expect(
      await consultarUm<{ total: string }>(`select count(*) as total from ${nome}s where descricao = $1`, [descricao])
    ).toMatchObject({ total: "0" });

    // E o caminho feliz dele grava o `caixa_id` do proprio caixa: o dinheiro SAIU daquela gaveta,
    // entao ele TEM de entrar no total. E o contraste que impede "caixa_id sempre nulo" de passar.
    const aceita = await post(cookieCaixa, rota, corpo(`${descricao} ok`, { contaOrigemId: contaDoPdv, ...extras }));
    expect(aceita.statusCode, aceita.body).toBe(201);
    expect(
      await consultarUm<{ caixa_id: string | null }>(`select caixa_id from ${nome}s where id = $1`, [
        json<{ data: { id: string } }>(aceita).data.id
      ])
    ).toEqual({ caixa_id: caixaDoOperador });
  });

  // ===== A-4 — retaguarda COM caixa aberto ====================================================
  //
  // O outro ator: `admin` e retaguarda pelo role E tem caixa aberto proprio no seed
  // (`idsTeste.caixaAberto`, no `pdvA`, cuja conta e `idsTeste.contaCaixa`). E o unico perfil deste
  // arquivo em que o `caixa_id` pode ou nao ser gravado — o que a A-4 decidiu.
  //
  // A PRE-CONDICAO desta secao. Sem ela, tudo abaixo passaria verde provando outra coisa: se o admin
  // nao tivesse caixa aberto, "caixa_id nulo" seria o resultado trivial de nao haver caixa.
  it("Deve_TerCaixaAbertoNaContaDoPdv_Quando_OAtorEARetaguardaDaSecaoA4", async () => {
    // `usuario_caixa_id` entra na assercao porque `buscarCaixaAbertoUsuarioRepository` filtra por ELE:
    // se o seed trocar o dono do caixa, `obterCaixaDaSaida` passa a devolver `null` para o admin e
    // "caixa_id nulo" volta a ser o resultado trivial de nao haver caixa.
    expect(
      await consultarUm<{ id: string; conta_id: string; usuario_caixa_id: string }>(
        `select f.id, p.conta_id, f.usuario_caixa_id from fechamentos_caixa f
           join pdvs p on p.id = f.pdv_id
           join perfis_usuarios pu on pu.usuario_id = f.usuario_caixa_id
          where f.id = $1 and f.status = 'aberto' and lower(pu.email) = lower($2)`,
        [idsTeste.caixaAberto, usuariosTeste.admin.email]
      )
    ).toMatchObject({ id: idsTeste.caixaAberto, conta_id: idsTeste.contaCaixa });
  });

  // A-4, os DOIS lados no mesmo teste. O contraste e o teste: "caixa_id sempre nulo" e "caixa_id
  // sempre preenchido" morrem os dois aqui.
  it.each(rotas)(
    "Deve_AssociarOCaixaSoNaContaDoPdv_Quando_ARetaguardaTemCaixaAberto (%s)",
    async (nome, rota, extras) => {
      const noPdv = await post(
        cookieAdmin,
        rota,
        corpo(`CX-M06 A-4 ${nome} no pdv`, { contaOrigemId: idsTeste.contaCaixa, ...extras })
      );
      expect(noPdv.statusCode, noPdv.body).toBe(201);
      expect(
        await consultarUm<{ caixa_id: string | null }>(`select caixa_id from ${nome}s where id = $1`, [
          json<{ data: { id: string } }>(noPdv).data.id
        ])
      ).toEqual({ caixa_id: idsTeste.caixaAberto });

      // Mesmo ator, mesmo caixa aberto, so a conta muda: fora do PDV o dinheiro nao saiu daquela
      // gaveta, entao o lancamento nao pode entrar no total do fechamento (R-015).
      const foraDoPdv = await post(
        cookieAdmin,
        rota,
        corpo(`CX-M06 A-4 ${nome} fora do pdv`, { contaOrigemId: idsTeste.contaBanco, ...extras })
      );
      expect(foraDoPdv.statusCode, foraDoPdv.body).toBe(201);
      expect(
        await consultarUm<{ caixa_id: string | null }>(`select caixa_id from ${nome}s where id = $1`, [
          json<{ data: { id: string } }>(foraDoPdv).data.id
        ])
      ).toEqual({ caixa_id: null });
    }
  );

  // PROVA 14: o criterio do `caixa_id` e o MESMO da transferencia, que e o precedente que a decisao
  // mandou seguir. Mesmo ator, mesmo caixa aberto, mesma pergunta ("a conta do PDV esta envolvida?"),
  // mesma resposta — se as duas features divergirem, este teste cai.
  it("Deve_ResponderComoATransferencia_Quando_ARetaguardaNaoEnvolveAContaDoPdv", async () => {
    const transferencia = await post(cookieAdmin, "/api/transferencias", {
      empresaId: idsTeste.empresaA,
      dataReferencia: hoje,
      descricao: "CX-M06 A-4 precedente da transferencia",
      valorOriginal: 10,
      contaOrigemId: idsTeste.contaBanco,
      contaDestinoId: idsTeste.contaLivre,
      nLacreDoc: "CX-M06-A4-PRECEDENTE"
    });
    expect(transferencia.statusCode, transferencia.body).toBe(201);

    expect(
      await consultarUm<{ caixa_id: string | null }>("select caixa_id from transferencias where id = $1", [
        json<{ data: { id: string } }>(transferencia).data.id
      ])
    ).toEqual({ caixa_id: null });
  });

  // A INVARIANTE, pelo PUT, nas DUAS direcoes. `caixa_id` preenchido quer dizer "saiu da conta do PDV
  // daquele caixa" — e o PUT tem de manter isso verdadeiro depois de a conta mudar. A regra e a MESMA
  // do POST (`caixaIdDaSaida`), aplicada tambem no UPDATE; e o aceite 13 literal.
  //
  // A primeira versao desta entrega mantinha a invariante RECUSANDO a troca de conta. Estava errado
  // por dois motivos que os revisores acharam: a tela apresenta a lista inteira de contas para a
  // retaguarda (`contaTravadaDeCaixa` devolve ""), entao era 403 sobre um campo oferecido livre; e o
  // codigo anterior a A-4 gravava `caixa.id` incondicionalmente, entao a recusa tornava ineditavel
  // todo o historico que a propria retaguarda ja tinha criado.
  it.each(rotas)(
    "Deve_SeguirAContaNasDuasDirecoes_Quando_ARetaguardaEditaOCaixaId (%s)",
    async (nome, rota, extras) => {
      const descricao = `CX-M06 A-4 invariante ${nome}`;
      const criada = await post(cookieAdmin, rota, corpo(descricao, { contaOrigemId: idsTeste.contaCaixa, ...extras }));
      expect(criada.statusCode, criada.body).toBe(201);
      const { id } = json<{ data: { id: string } }>(criada).data;
      const linha = () =>
        consultarUm<{ conta_origem_id: string | null; caixa_id: string | null; valor_original: string }>(
          `select conta_origem_id, caixa_id, valor_original from ${nome}s where id = $1`,
          [id]
        );
      expect(await linha()).toEqual({
        conta_origem_id: idsTeste.contaCaixa,
        caixa_id: idsTeste.caixaAberto,
        valor_original: "10.00"
      });

      // SAINDO do PDV: o dinheiro deixou de sair daquela gaveta, entao o lancamento deixa o fechamento.
      const paraFora = await put(
        cookieAdmin,
        `${rota}/${id}`,
        corpo(`${descricao} fora`, { contaOrigemId: idsTeste.contaBanco, valorOriginal: 99, ...extras })
      );
      expect(paraFora.statusCode, paraFora.body).toBe(200);
      expect(await linha()).toEqual({
        conta_origem_id: idsTeste.contaBanco,
        caixa_id: null,
        valor_original: "99.00"
      });

      // VOLTANDO para o PDV: e a direcao que a versao anterior deixava passar sem corrigir o
      // `caixa_id`. O valor saia do saldo da conta do PDV e nunca aparecia no fechamento.
      const paraDentro = await put(
        cookieAdmin,
        `${rota}/${id}`,
        corpo(`${descricao} dentro`, { contaOrigemId: idsTeste.contaCaixa, valorOriginal: 77, ...extras })
      );
      expect(paraDentro.statusCode, paraDentro.body).toBe(200);
      expect(await linha()).toEqual({
        conta_origem_id: idsTeste.contaCaixa,
        caixa_id: idsTeste.caixaAberto,
        valor_original: "77.00"
      });
    }
  );

  // O corpo SEM conta: para a retaguarda nao ha conta de PDV a repor, entao a conta fica nula — e o
  // `caixa_id` tem de acompanhar. Antes o UPDATE preservava o `caixa_id` gravado e nascia o par
  // (conta NULA, caixa preenchido): o valor sumia do saldo de qualquer conta e continuava somando no
  // fechamento. E o defeito B-05(c) que a rodada anterior fechou para o operador, pela porta da
  // retaguarda.
  it("Deve_ZerarOCaixaIdJuntoComAConta_Quando_ARetaguardaSalvaSemInformarConta", async () => {
    const criada = await post(
      cookieAdmin,
      "/api/despesas",
      corpo("CX-M06 A-4 sem conta", {
        contaOrigemId: idsTeste.contaCaixa,
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        fornecedorId: idsTeste.fornecedor
      })
    );
    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(criada).data;

    const editada = await put(
      cookieAdmin,
      `/api/despesas/${id}`,
      corpo("CX-M06 A-4 sem conta corrigida", {
        valorOriginal: 66,
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        fornecedorId: idsTeste.fornecedor
      })
    );
    expect(editada.statusCode, editada.body).toBe(200);
    expect(
      await consultarUm<{ conta_origem_id: string | null; caixa_id: string | null }>(
        "select conta_origem_id, caixa_id from despesas where id = $1",
        [id]
      )
    ).toEqual({ conta_origem_id: null, caixa_id: null });
  });

  // HISTORICO INCOERENTE: antes da A-4 o `caixa_id` era gravado incondicionalmente, entao existem
  // linhas com `caixa_id` preenchido e uma conta que nao e a do PDV. Elas TEM de continuar editaveis
  // — e o salvar corrige o par. A fixture e montada no banco porque a API atual nao consegue mais
  // produzir esse estado, que e exatamente o motivo de ele precisar de teste.
  it("Deve_CorrigirOParEDeixarEditar_Quando_OHistoricoTemCaixaIdComContaDeFora", async () => {
    const criada = await post(
      cookieAdmin,
      "/api/despesas",
      corpo("CX-M06 A-4 historico incoerente", {
        contaOrigemId: idsTeste.contaBanco,
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        fornecedorId: idsTeste.fornecedor
      })
    );
    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(criada).data;

    // O estado que a regra ANTIGA produzia: conta "Banco" e o caixa aberto da retaguarda.
    await executarSql("update despesas set caixa_id = $2 where id = $1", [id, idsTeste.caixaAberto]);

    const editada = await put(
      cookieAdmin,
      `/api/despesas/${id}`,
      corpo("CX-M06 A-4 historico corrigido", {
        contaOrigemId: idsTeste.contaBanco,
        valorOriginal: 44,
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        fornecedorId: idsTeste.fornecedor
      })
    );
    expect(editada.statusCode, editada.body).toBe(200);
    expect(
      await consultarUm<{ conta_origem_id: string | null; caixa_id: string | null; valor_original: string }>(
        "select conta_origem_id, caixa_id, valor_original from despesas where id = $1",
        [id]
      )
    ).toEqual({ conta_origem_id: idsTeste.contaBanco, caixa_id: null, valor_original: "44.00" });
  });

  // A metade que NAO afrouxou: lancamento preso ao caixa de OUTRA pessoa continua recusado, e a
  // recusa nao escreve. Sem este caso, "retaguarda edita qualquer coisa" passaria verde.
  it("Deve_RecusarSemGravar_Quando_ARetaguardaEditaLancamentoDeCaixaAlheio", async () => {
    const descricao = "CX-M06 A-4 caixa alheio";
    const doOperador = await post(
      cookieCaixa,
      "/api/despesas",
      corpo(descricao, {
        contaOrigemId: contaDoPdv,
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        fornecedorId: idsTeste.fornecedor
      })
    );
    expect(doOperador.statusCode, doOperador.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(doOperador).data;
    const antes = await consultarUm(`select descricao, conta_origem_id, caixa_id from despesas where id = $1`, [id]);
    expect(antes).toMatchObject({ caixa_id: caixaDoOperador });

    const recusada = await put(
      cookieAdmin,
      `/api/despesas/${id}`,
      corpo("CX-M06 A-4 caixa alheio invadido", {
        contaOrigemId: idsTeste.contaBanco,
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        fornecedorId: idsTeste.fornecedor
      })
    );
    assertProblem(recusada, 403);
    expect(await consultarUm(`select descricao, conta_origem_id, caixa_id from despesas where id = $1`, [id])).toEqual(
      antes
    );
  });

  // A conta do PDV de um caixa ALHEIO nao puxa o lancamento para aquele caixa: `caixaIdDaSaida` olha
  // o caixa do PROPRIO ator. E o trade-off que a decisao assumiu ao seguir a transferencia — o valor
  // sai do saldo daquela conta e nao entra em fechamento nenhum. Fixado aqui para ser escolha, e nao
  // acidente.
  it("Deve_GravarCaixaIdNulo_Quando_ARetaguardaUsaAContaDoPdvDeOutroOperador", async () => {
    const criada = await post(
      cookieGerente,
      "/api/despesas",
      corpo("CX-M06 A-4 conta de pdv alheio", {
        contaOrigemId: contaDoPdv,
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        fornecedorId: idsTeste.fornecedor
      })
    );
    expect(criada.statusCode, criada.body).toBe(201);
    expect(
      await consultarUm<{ caixa_id: string | null }>("select caixa_id from despesas where id = $1", [
        json<{ data: { id: string } }>(criada).data.id
      ])
    ).toEqual({ caixa_id: null });
  });

  // PROVA 4 (segunda metade): sem caixa aberto o operador continua BARRADO. E a metade da regra que
  // a A-1 nao afrouxou, e que distingue "retaguarda" de "qualquer um".
  it("Deve_RecusarSemGravar_Quando_OOperadorNaoTemCaixaAberto", async () => {
    // Fecha a porta so para este caso e devolve como estava — os demais dependem do caixa aberto.
    await executarSql("update fechamentos_caixa set status = 'fechado' where id = $1", [caixaDoOperador]);
    try {
      const descricao = "CX-M06 A-1 operador sem caixa";
      const recusada = await post(
        cookieCaixa,
        "/api/despesas",
        corpo(descricao, {
          contaOrigemId: contaDoPdv,
          grupoDespesaId: idsTeste.grupoDespesaOperacional,
          fornecedorId: idsTeste.fornecedor
        })
      );

      assertProblem(recusada, 400);
      expect(recusada.body).toContain("Abra um caixa");
      expect(
        await consultarUm<{ total: string }>("select count(*) as total from despesas where descricao = $1", [descricao])
      ).toMatchObject({ total: "0" });
    } finally {
      await executarSql("update fechamentos_caixa set status = 'aberto' where id = $1", [caixaDoOperador]);
    }
  });
});
