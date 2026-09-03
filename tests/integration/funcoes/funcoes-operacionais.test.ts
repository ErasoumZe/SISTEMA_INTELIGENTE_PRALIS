import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Permissao } from "@padaria/shared";
import { permissoesPorCargo, regrasPermissoes } from "@padaria/db/referencia-permissoes";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste, type PerfilTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

/**
 * Catalogo de FUNCOES OPERACIONAIS — o que a pessoa faz.
 *
 * Duas coisas esta suite existe para provar, e elas sao o coracao da decisao de 03/09/2026:
 *
 * 1. **quem administra**: o DP ve, cria e edita (e editar cobre desativar e reativar); a Gerencia
 *    SO VISUALIZA — inverso de Turnos, e inverso de proposito;
 * 2. **nada some**: nao ha rota de exclusao, e o banco recusa a exclusao direta por causa das duas
 *    chaves estrangeiras compostas. Funcao em uso pode ser DESATIVADA, e continua valendo no
 *    registro que ja a tinha.
 */
describe("funcoes operacionais: catalogo do cadastro", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieDpReal: string;
  let cookieGerenciaReal: string;
  let sequencia = 0;

  function matriz(cargo: string): Permissao[] {
    const lista = permissoesPorCargo[cargo];
    if (!lista) throw new Error(`cargo ausente na referencia: ${cargo}`);
    return lista;
  }

  async function vestirCargo(perfil: PerfilTeste, cargo: string) {
    const alvo = await consultarUm<{ id: string }>(`select u.id from "user" u where u.email = $1`, [
      usuariosTeste[perfil].email
    ]);
    if (!alvo) throw new Error(`usuario de teste ausente: ${perfil}`);
    await executarSql(
      `insert into permissoes_usuarios (usuario_id, regras) values ($1, $2::jsonb)
         on conflict (usuario_id) do update set regras = excluded.regras`,
      [alvo.id, JSON.stringify(regrasPermissoes(matriz(cargo)))]
    );
  }

  function nomeUnico(prefixo: string) {
    return `${prefixo} ${(sequencia += 1)}`;
  }

  // `string` explicito: com o default, o TypeScript estreitaria o parametro para o literal da
  // empresa A, e o caso de isolamento nao conseguiria pedir a lista da empresa B.
  function listar(cookie: string, empresaId: string = idsTeste.empresaA) {
    return contexto.app.inject({
      method: "GET",
      url: `/api/funcoes-operacionais?empresaId=${empresaId}`,
      headers: { cookie }
    });
  }

  async function criar(cookie: string, payload: Record<string, unknown>) {
    return contexto.app.inject({
      method: "POST",
      url: "/api/funcoes-operacionais",
      headers: { cookie },
      payload: { empresaId: idsTeste.empresaA, ...payload }
    });
  }

  function editar(cookie: string, id: string, payload: Record<string, unknown>) {
    return contexto.app.inject({
      method: "PUT",
      url: `/api/funcoes-operacionais/${id}`,
      headers: { cookie },
      payload: { empresaId: idsTeste.empresaA, ...payload }
    });
  }

  type LinhaFuncao = { id: string; nome: string; cbo: string | null; ativo: boolean; emUso: boolean };

  async function linhasDe(resposta: Awaited<ReturnType<typeof listar>>): Promise<LinhaFuncao[]> {
    assertOk(resposta, 200);
    return json<{ data: LinhaFuncao[] }>(resposta).data;
  }

  /** Cria uma funcao pelo DP e devolve o id. */
  async function funcaoDoDp(nome: string, cbo: string | null = null) {
    const criada = await criar(cookieDpReal, { nome, cbo, ativo: true });
    expect(criada.statusCode, criada.body).toBe(201);
    return json<{ data: { id: string } }>(criada).data.id;
  }

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    await vestirCargo("caixa", "DP");
    await vestirCargo("gerente", "Gerencia");
    cookieDpReal = await cookieSessao(contexto.app, "caixa");
    cookieGerenciaReal = await cookieSessao(contexto.app, "gerente");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  // ------------------------------------------------------------------ quem administra
  it("Deve_O_DpAdministrarOCatalogo_Inteiro", async () => {
    const nome = nomeUnico("Padeiro Sintetico");
    const id = await funcaoDoDp(nome, "848505");

    const listada = (await linhasDe(await listar(cookieDpReal))).find((linha) => linha.id === id);
    expect(listada?.nome).toBe(nome);
    expect(listada?.cbo).toBe("848505");
    expect(listada?.ativo).toBe(true);
    // Recem-criada nao esta em uso: nenhum teste nem processo aponta para ela.
    expect(listada?.emUso).toBe(false);

    const renomeada = nomeUnico("Padeiro Renomeado");
    expect((await editar(cookieDpReal, id, { nome: renomeada, cbo: "848505", ativo: true })).statusCode).toBe(204);

    // Desativar e reativar sao o MESMO ato de escrita, pelo mesmo campo.
    expect((await editar(cookieDpReal, id, { nome: renomeada, cbo: "848505", ativo: false })).statusCode).toBe(204);
    expect((await linhasDe(await listar(cookieDpReal))).find((l) => l.id === id)?.ativo).toBe(false);

    expect((await editar(cookieDpReal, id, { nome: renomeada, cbo: "848505", ativo: true })).statusCode).toBe(204);
    expect((await linhasDe(await listar(cookieDpReal))).find((l) => l.id === id)?.ativo).toBe(true);
  });

  it("Deve_A_GerenciaSoVisualizar", async () => {
    // O alvo EXISTE e e da MESMA empresa: sem isso, um 404 de id inexistente passaria por 403 e o
    // teste nao provaria autorizacao nenhuma.
    const id = await funcaoDoDp(nomeUnico("Alvo da Gerencia"));

    assertOk(await listar(cookieGerenciaReal), 200);

    const criando = await criar(cookieGerenciaReal, { nome: nomeUnico("Da Gerencia"), ativo: true });
    expect(criando.statusCode, criando.body).toBe(403);
    expect(criando.json().details?.permissao).toBe("cadastro_funcoes_criar");

    const editando = await editar(cookieGerenciaReal, id, { nome: "Renomeada pela Gerencia", ativo: true });
    expect(editando.statusCode, editando.body).toBe(403);
    expect(editando.json().details?.permissao).toBe("cadastro_funcoes_editar");

    // Contraprova: a funcao continua la, com o nome de antes.
    const intacta = (await linhasDe(await listar(cookieGerenciaReal))).find((linha) => linha.id === id);
    expect(intacta?.nome).not.toBe("Renomeada pela Gerencia");
  });

  it("Deve_A_ReferenciaConcederExatamenteOCombinado", async () => {
    // A matriz e a fonte. Se alguem "ajudar" a Gerencia com criar ou editar, isto cai antes de
    // virar comportamento. Prova o conjunto exato, nao apenas a presenca.
    const dp = matriz("DP");
    for (const acao of ["visualizar", "criar", "editar"] as const) {
      expect(dp, acao).toContain(`cadastro_funcoes_${acao}`);
    }

    const gerencia = matriz("Gerencia");
    expect(gerencia).toContain("cadastro_funcoes_visualizar");
    expect(gerencia).not.toContain("cadastro_funcoes_criar");
    expect(gerencia).not.toContain("cadastro_funcoes_editar");
  });

  it("Deve_RecusarQuemNaoTemPermissaoNenhuma", async () => {
    const semPermissao = await cookieSessao(contexto.app, "semPermissao");
    expect((await listar(semPermissao)).statusCode).toBe(403);
    expect((await criar(semPermissao, { nome: "Nao deveria", ativo: true })).statusCode).toBe(403);
  });

  // ------------------------------------------------------------------ nada some
  it("Deve_NaoExistirRotaDeExclusao", async () => {
    // A garantia e a AUSENCIA do caminho, e nao uma mensagem de erro. Uma rota que so recusa seria
    // o botao morto que este projeto ja tirou de outras telas.
    const id = await funcaoDoDp(nomeUnico("Sem Exclusao"));
    const tentativa = await contexto.app.inject({
      method: "DELETE",
      url: `/api/funcoes-operacionais/${id}?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieDpReal }
    });
    expect(tentativa.statusCode).toBe(404);

    const aindaLa = await consultarUm<{ n: number }>(
      "select count(*)::int as n from funcoes_operacionais where id = $1",
      [id]
    );
    expect(aindaLa?.n).toBe(1);
  });

  it("Deve_O_BancoRecusarAExclusaoDeFuncaoEmUso", async () => {
    // A funcao do seed e a que os testes de admissao usam. Um periodo de teste a poe em uso.
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/admissoes/testes",
      headers: { cookie: cookieAdmin },
      payload: {
        nomeCompleto: "Pessoa Que Usa A Funcao",
        cpf: "52998224725",
        funcaoId: idsTeste.funcaoOperacionalA,
        jornadaHorario: "seg a sex, 08:00 as 17:00",
        inicioEm: "2026-09-01T12:00:00.000Z",
        fimCombinadoEm: "2026-09-30T12:00:00.000Z"
      }
    });
    assertOk(criado, 201);

    // A lista passa a dizer que ela esta em uso — a tela usa isso para EXPLICAR, nao para bloquear.
    const emUso = (await linhasDe(await listar(cookieDpReal))).find(
      (linha) => linha.id === idsTeste.funcaoOperacionalA
    );
    expect(emUso?.emUso).toBe(true);

    // Por SQL direto, sem a API no caminho: a garantia e do BANCO, e um teste que so passa pela
    // rota provaria a ausencia da rota, nao a protecao da referencia.
    await expect(
      executarSql("delete from funcoes_operacionais where id = $1", [idsTeste.funcaoOperacionalA])
    ).rejects.toMatchObject({ code: "23503" });

    const sobreviveu = await consultarUm<{ n: number }>(
      "select count(*)::int as n from funcoes_operacionais where id = $1",
      [idsTeste.funcaoOperacionalA]
    );
    expect(sobreviveu?.n).toBe(1);
  });

  it("Deve_PermitirDesativarFuncaoEmUso_SemQuebrarORegistroExistente", async () => {
    // A decisao e explicita: funcao em uso PODE ficar inativa. O que ela nao pode e sumir.
    const antes = await consultarUm<{ n: number }>(
      "select count(*)::int as n from admissoes_testes where funcao_id = $1",
      [idsTeste.funcaoOperacionalA]
    );
    expect(antes?.n ?? 0).toBeGreaterThan(0);

    const desativar = await editar(cookieDpReal, idsTeste.funcaoOperacionalA, {
      nome: "Funcao Integracao",
      ativo: false
    });
    expect(desativar.statusCode, desativar.body).toBe(204);

    // O registro que ja apontava para ela continua la, e continua apontando.
    const depois = await consultarUm<{ n: number }>(
      "select count(*)::int as n from admissoes_testes where funcao_id = $1",
      [idsTeste.funcaoOperacionalA]
    );
    expect(depois?.n).toBe(antes?.n);

    // E ela nao pode mais ser escolhida em registro NOVO — que e para isso que desativar existe.
    const novo = await contexto.app.inject({
      method: "POST",
      url: "/api/admissoes/testes",
      headers: { cookie: cookieAdmin },
      payload: {
        nomeCompleto: "Pessoa Com Funcao Inativa",
        cpf: "15350946056",
        funcaoId: idsTeste.funcaoOperacionalA,
        jornadaHorario: "seg a sex, 08:00 as 17:00",
        inicioEm: "2026-09-01T12:00:00.000Z",
        fimCombinadoEm: "2026-09-30T12:00:00.000Z"
      }
    });
    expect(novo.statusCode, novo.body).toBe(400);

    // Reativa, para nao deixar o cenario sujo para os demais casos deste arquivo.
    expect(
      (await editar(cookieDpReal, idsTeste.funcaoOperacionalA, { nome: "Funcao Integracao", ativo: true }))
        .statusCode
    ).toBe(204);
  });

  // ------------------------------------------------------------------ duplicidade e formato
  it("Deve_Responder409_Quando_NomeRepetidoNaMesmaEmpresa", async () => {
    const nome = nomeUnico("Balconista Sintetico");
    await funcaoDoDp(nome);

    const repetida = await criar(cookieDpReal, { nome, ativo: true });
    expect(repetida.statusCode, repetida.body).toBe(409);
    expect(repetida.json().code).toBe("FUNCAO_DUPLICADA");

    // Espaco nas pontas NAO cria uma segunda: o servico apara antes de gravar, e o unique compara
    // o nome cru — sem o `trim`, " Balconista" e "Balconista" conviveriam no catalogo.
    const comEspaco = await criar(cookieDpReal, { nome: `  ${nome}  `, ativo: true });
    expect(comEspaco.statusCode, comEspaco.body).toBe(409);

    // E renomear PARA um nome que ja existe tambem e recusado.
    const outra = await funcaoDoDp(nomeUnico("Outra Funcao"));
    const renomeando = await editar(cookieDpReal, outra, { nome, ativo: true });
    expect(renomeando.statusCode, renomeando.body).toBe(409);
    expect(renomeando.json().code).toBe("FUNCAO_DUPLICADA");
  });

  it("Deve_RecusarCboForaDoFormato_E_AceitarVazio", async () => {
    for (const cbo of ["12345", "1234567", "abcdef"]) {
      const resposta = await criar(cookieDpReal, { nome: nomeUnico("CBO ruim"), cbo, ativo: true });
      expect(resposta.statusCode, `${cbo}: ${resposta.body}`).toBe(400);
    }

    // Vazio vira NULL, e nao erro: quem nao sabe o codigo nao pode ficar preso.
    const semCbo = await criar(cookieDpReal, { nome: nomeUnico("Sem CBO"), cbo: "", ativo: true });
    expect(semCbo.statusCode, semCbo.body).toBe(201);
    const id = json<{ data: { id: string } }>(semCbo).data.id;
    expect((await linhasDe(await listar(cookieDpReal))).find((l) => l.id === id)?.cbo).toBeNull();
  });

  it("Deve_RecusarNomeVazio", async () => {
    for (const nome of ["", "   "]) {
      const resposta = await criar(cookieDpReal, { nome, ativo: true });
      expect(resposta.statusCode, resposta.body).toBe(400);
    }
  });

  // ------------------------------------------------------------------ isolamento
  it("Deve_IsolarPorEmpresa", async () => {
    const funcaoB = "55555555-5555-4555-8555-555555550701";
    await executarSql(
      "insert into funcoes_operacionais (id, empresa_id, nome) values ($1, $2, $3) on conflict do nothing",
      [funcaoB, idsTeste.empresaB, "FUNCAO DA EMPRESA B"]
    );

    // A lista da empresa A nao a enxerga.
    const daEmpresaA = await linhasDe(await listar(cookieDpReal));
    expect(daEmpresaA.map((linha) => linha.id)).not.toContain(funcaoB);
    expect(JSON.stringify(daEmpresaA)).not.toContain("FUNCAO DA EMPRESA B");

    // Pedir a lista da empresa B com perfil da A e 403 — a empresa vem do cliente aqui, entao a
    // validacao de escopo e o que separa os tenants.
    const listandoB = await listar(cookieDpReal, idsTeste.empresaB);
    expect(listandoB.statusCode, listandoB.body).toBe(403);
    expect(listandoB.json().code).toBe("FORBIDDEN_COMPANY");

    // Editar a funcao alheia declarando a PROPRIA empresa nao a alcanca: o `where` casa as duas
    // colunas, entao nada e atualizado e a resposta e 404 — a mesma de inexistente.
    const editandoB = await editar(cookieDpReal, funcaoB, { nome: "Sequestrada", ativo: true });
    expect(editandoB.statusCode, editandoB.body).toBe(404);

    const intacta = await consultarUm<{ nome: string }>("select nome from funcoes_operacionais where id = $1", [
      funcaoB
    ]);
    expect(intacta?.nome).toBe("FUNCAO DA EMPRESA B");
  });

  it("Deve_A_ListaTrazerAtivasPrimeiro", async () => {
    // A mesma ordem do seletor de admissao. Com `asc(ativo)` as INATIVAS subiriam, porque no
    // Postgres `false < true` — e o DP procuraria no lugar errado.
    const inativa = await funcaoDoDp(nomeUnico("AAA Inativa"));
    expect((await editar(cookieDpReal, inativa, { nome: nomeUnico("AAA Inativa"), ativo: false })).statusCode).toBe(
      204
    );

    const linhas = await linhasDe(await listar(cookieDpReal));
    const posicaoInativa = linhas.findIndex((linha) => linha.id === inativa);
    const primeiraInativa = linhas.findIndex((linha) => !linha.ativo);
    const ultimaAtiva = linhas.map((linha) => linha.ativo).lastIndexOf(true);
    expect(posicaoInativa).toBeGreaterThanOrEqual(0);
    expect(primeiraInativa, "toda ativa vem antes de qualquer inativa").toBeGreaterThan(ultimaAtiva);
  });
});
