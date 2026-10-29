import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";

// B-01 (CX-M02) · Criar usuario de operacao/Caixa.
//
// Na reuniao de 04/08 toda criacao de usuario respondia "E-mail ja cadastrado", mesmo com e-mail
// inedito. A causa nao era o e-mail: `usuarios.service.ts` tinha um `catch {}` cego em volta de
// `auth.api.signUpEmail` que traduzia QUALQUER falha para essa mensagem — inclusive senha curta
// (o Better Auth exige 8 em teste e 10 em producao; o schema compartilhado aceita 6). Pior: quando
// a transacao de perfil/empresa/colaborador falhava DEPOIS do signUp, o usuario de autenticacao
// ficava gravado sem perfil, e a tentativa seguinte batia num e-mail que agora existia de verdade.
//
// Este arquivo cobre a fronteira inteira: duplicado de verdade, falha tecnica, estado parcial,
// concorrencia, escopo de empresa e o primeiro login do usuario criado.

const SENHA_VALIDA = "Teste#2026!caixa01";

interface EstadoUsuario {
  usuarioId: string | null;
  emailVerificado: boolean;
  temPerfil: boolean;
  empresas: string[];
  colaboradorId: string | null;
  cargosAtivos: string[];
}

describe("B-01 · criacao de usuario de Caixa", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  // Payload REAL da tela: cadastroPayload("usuarios") monta exatamente estes campos quando o admin
  // escolhe "novo colaborador" (shared/src/cadastros/index.ts).
  function payloadTela(
    email: string,
    opcoes: {
      senha?: string;
      cpf?: string | null;
      colaboradorId?: string;
      empresaId?: string;
      pdvPadraoId?: string | null;
      turnoCaixa?: "manha" | "tarde" | null;
      semCargo?: boolean;
    } = {}
  ) {
    const empresaId = opcoes.empresaId ?? idsTeste.empresaA;
    const base = {
      nome: "Operador de Caixa B01",
      email,
      senha: opcoes.senha ?? SENHA_VALIDA,
      role: "usuario_comum",
      empresaIds: [empresaId]
    };
    if (opcoes.colaboradorId) return { ...base, colaboradorId: opcoes.colaboradorId };
    return {
      ...base,
      novoColaborador: {
        empresaId,
        nome: "Operador de Caixa B01",
        cpf: opcoes.cpf ?? null,
        setorId: opcoes.semCargo ? null : idsTeste.setorA,
        cargoId: opcoes.semCargo ? null : idsTeste.cargoCaixa,
        pdvPadraoId: opcoes.pdvPadraoId ?? null,
        turnoCaixa: opcoes.turnoCaixa ?? null
      }
    };
  }

  function criarUsuario(payload: object) {
    return contexto.app.inject({
      method: "POST",
      url: "/api/usuarios",
      headers: { cookie: cookieAdmin },
      payload
    });
  }

  async function estadoDe(email: string): Promise<EstadoUsuario> {
    const usuario = await consultarUm<{ id: string; emailVerified: boolean }>(
      'select id, "emailVerified" from "user" where email = $1',
      [email]
    );
    if (!usuario) {
      return {
        usuarioId: null,
        emailVerificado: false,
        temPerfil: false,
        empresas: [],
        colaboradorId: null,
        cargosAtivos: []
      };
    }
    const perfil = await consultarUm<{ usuario_id: string }>(
      "select usuario_id from perfis_usuarios where usuario_id = $1",
      [usuario.id]
    );
    const empresas = await consultarTodos<{ empresa_id: string }>(
      "select empresa_id from usuarios_empresas where usuario_id = $1 order by empresa_id",
      [usuario.id]
    );
    const colaborador = await consultarUm<{ id: string }>("select id from colaboradores where usuario_id = $1", [
      usuario.id
    ]);
    const cargos = colaborador
      ? await consultarTodos<{ cargo_id: string }>(
          "select cargo_id from colaboradores_cargos where colaborador_id = $1 and ativo = true order by cargo_id",
          [colaborador.id]
        )
      : [];
    return {
      usuarioId: usuario.id,
      emailVerificado: usuario.emailVerified,
      temPerfil: Boolean(perfil),
      empresas: empresas.map((linha) => linha.empresa_id),
      colaboradorId: colaborador?.id ?? null,
      cargosAtivos: cargos.map((linha) => linha.cargo_id)
    };
  }

  async function contarUsuarios(email: string) {
    const linha = await consultarUm<{ total: number }>('select count(*)::int as total from "user" where email = $1', [
      email
    ]);
    return linha?.total ?? 0;
  }

  it("1+2+12 · cria usuario de Caixa completo a partir do payload real da tela", async () => {
    const email = "b01.caixa.completo@padaria.local";
    const resposta = await criarUsuario(payloadTela(email, { cpf: "11144477735" }));
    expect(resposta.statusCode, resposta.body).toBe(201);

    const estado = await estadoDe(email);
    expect(estado.usuarioId).toBeTruthy();
    // Criado por admin nasce verificado — sem isso nao loga em producao (requireEmailVerification).
    expect(estado.emailVerificado, "usuario criado por admin nasce com e-mail verificado").toBe(true);
    expect(estado.temPerfil, "perfil e obrigatorio: sem ele a sessao devolve PROFILE_NOT_CONFIGURED").toBe(true);
    expect(estado.empresas).toEqual([idsTeste.empresaA]);
    expect(estado.colaboradorId).toBeTruthy();
    expect(estado.cargosAtivos, "o cargo de Caixa tem de nascer ativo").toEqual([idsTeste.cargoCaixa]);

    // Nenhum registro duplicado em nenhuma das pontas.
    expect(await contarUsuarios(email)).toBe(1);
    const colaboradores = await consultarTodos<{ id: string }>(
      "select id from colaboradores where empresa_id = $1 and cpf = $2",
      [idsTeste.empresaA, "11144477735"]
    );
    expect(colaboradores).toHaveLength(1);
  });

  // R-229 · o posto do Caixa e PDV + turno do caixa; o login de posto nao precisa de setor nem cargo.
  it("cria o login de posto (PDV · Tarde) so com e-mail e senha, sem setor e cargo", async () => {
    await executarSql(
      "update colaboradores set turno_caixa = null where pdv_padrao_id = $1 and turno_caixa = 'tarde'",
      [idsTeste.pdvLivre]
    );
    const email = "b01.caixa.posto-tarde@padaria.local";
    const resposta = await criarUsuario(
      payloadTela(email, { pdvPadraoId: idsTeste.pdvLivre, turnoCaixa: "tarde", semCargo: true })
    );
    expect(resposta.statusCode, resposta.body).toBe(201);
    const vinculo = await consultarUm<{ pdv_padrao_id: string | null; turno_caixa: string | null }>(
      `select c.pdv_padrao_id, c.turno_caixa
       from colaboradores c
       join "user" u on u.id = c.usuario_id
       where u.email = $1`,
      [email]
    );
    expect(vinculo).toEqual({ pdv_padrao_id: idsTeste.pdvLivre, turno_caixa: "tarde" });

    // O mesmo posto nao aceita um segundo login: 409 com o nome de quem ja esta nele.
    const outro = await criarUsuario(
      payloadTela("b01.caixa.posto-tarde-2@padaria.local", {
        pdvPadraoId: idsTeste.pdvLivre,
        turnoCaixa: "tarde",
        semCargo: true
      })
    );
    expect(outro.statusCode, outro.body).toBe(409);
    expect(outro.body).toMatch(/ja esta no login de/);

    // O PDV nao desmarca a tarde com o login de posto vinculado.
    const pdv = await consultarUm<{ nome: string; conta_id: string }>("select nome, conta_id from pdvs where id = $1", [
      idsTeste.pdvLivre
    ]);
    const desmarcar = await contexto.app.inject({
      method: "PUT",
      url: `/api/pdvs/${idsTeste.pdvLivre}`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: pdv!.nome, contaId: pdv!.conta_id, turnosCaixa: ["manha"] }
    });
    expect(desmarcar.statusCode, desmarcar.body).toBe(400);
    expect(desmarcar.body).toMatch(/login de posto vinculado/);

    // Trocar o posto de um login que ja existe: rota propria. Tirar o posto libera a tarde.
    const usuario = await consultarUm<{ id: string }>('select id from "user" where email = $1', [email]);
    const tirar = await contexto.app.inject({
      method: "PUT",
      url: `/api/usuarios/${usuario!.id}/posto-caixa`,
      headers: { cookie: cookieAdmin },
      payload: { posto: null }
    });
    expect(tirar.statusCode, tirar.body).toBe(204);
    const depois = await consultarUm<{ turno_caixa: string | null }>(
      'select c.turno_caixa from colaboradores c join "user" u on u.id = c.usuario_id where u.email = $1',
      [email]
    );
    expect(depois?.turno_caixa).toBeNull();
  });

  it("recusa posto do Caixa incompleto antes de criar o usuario", async () => {
    const email = "b01.caixa.vinculo-incompleto@padaria.local";
    const resposta = await criarUsuario(payloadTela(email, { pdvPadraoId: idsTeste.pdvLivre }));
    expect(resposta.statusCode, resposta.body).toBe(400);
    expect(resposta.body).toContain("Escolha o posto do caixa");
    expect(await contarUsuarios(email)).toBe(0);
  });

  it("4+5 · o usuario criado autentica e a sessao traz empresa, colaborador, cargo e permissoes", async () => {
    // O seed dá permissões pela camada USUARIO (permissoes_usuarios), não pela do cargo. Um usuario
    // recem-criado so tem cargo, entao a regra do CARGO precisa existir para a heranca ser
    // observavel — que e justamente o que o operador de Caixa depende em producao.
    await consultarUm(
      "insert into permissoes_cargos (cargo_id, regras) values ($1, $2::jsonb) on conflict (cargo_id) do update set regras = excluded.regras returning cargo_id",
      [idsTeste.cargoCaixa, JSON.stringify({ caixa_operar: true, entradas_visualizar: true })]
    );

    const email = "b01.caixa.login@padaria.local";
    expect((await criarUsuario(payloadTela(email))).statusCode).toBe(201);

    const login = await contexto.app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email, password: SENHA_VALIDA }
    });
    expect(login.statusCode, `primeiro login precisa funcionar: ${login.body}`).toBe(200);
    const cookies = login.headers["set-cookie"];
    const lista = Array.isArray(cookies) ? cookies : cookies ? [cookies] : [];
    expect(lista.length).toBeGreaterThan(0);
    const cookie = lista.map((item) => item.split(";")[0]).join("; ");

    const me = await contexto.app.inject({ method: "GET", url: "/api/me", headers: { cookie } });
    assertOk(me);
    const dadosMe = json<{
      data: { user: { email: string }; perfil: { email: string }; empresas: Array<{ id: string }> };
    }>(me).data;
    expect(dadosMe.user.email).toBe(email);
    expect(dadosMe.perfil.email).toBe(email);
    expect(dadosMe.empresas.map((empresa) => empresa.id)).toContain(idsTeste.empresaA);

    const sessao = await contexto.app.inject({ method: "GET", url: "/api/sessao", headers: { cookie } });
    assertOk(sessao);
    const perfil = json<{
      data: { perfil: { empresaId: string; colaboradorId?: string | null; permissoes: string[] } };
    }>(sessao).data.perfil;
    expect(perfil.empresaId).toBe(idsTeste.empresaA);
    // Herdadas do cargo de Caixa: sessao sem permissao nenhuma significa que o vinculo do cargo
    // nao foi aplicado na criacao — o usuario logaria e nao conseguiria operar nada.
    expect(perfil.permissoes, "a sessao tem de herdar as permissoes do cargo de Caixa").toEqual(
      expect.arrayContaining(["caixa_operar", "entradas_visualizar"])
    );
  });

  it("3 · caminho vinculando colaborador existente continua funcionando", async () => {
    const colaborador = await consultarUm<{ id: string }>(
      "insert into colaboradores (empresa_id, nome, setor_id) values ($1, $2, $3) returning id",
      [idsTeste.empresaA, "Colaborador ja cadastrado B01", idsTeste.setorA]
    );
    await consultarUm(
      `insert into colaboradores_cargos (empresa_id, colaborador_id, setor_id, cargo_id, remuneracao_minuto, data_inicio, ativo)
       values ($1, $2, $3, $4, 1, current_date, true) returning id`,
      [idsTeste.empresaA, colaborador!.id, idsTeste.setorA, idsTeste.cargoCaixa]
    );

    const email = "b01.colaborador.existente@padaria.local";
    const resposta = await criarUsuario(payloadTela(email, { colaboradorId: colaborador!.id }));
    expect(resposta.statusCode, resposta.body).toBe(201);

    const estado = await estadoDe(email);
    expect(estado.colaboradorId).toBe(colaborador!.id);
    expect(estado.cargosAtivos).toEqual([idsTeste.cargoCaixa]);
    expect(estado.temPerfil).toBe(true);
  });

  it("6 · e-mail realmente duplicado responde conflito, nao sequestra o usuario existente", async () => {
    const email = "b01.duplicado@padaria.local";
    expect((await criarUsuario(payloadTela(email))).statusCode).toBe(201);
    const antes = await estadoDe(email);

    const repetido = await criarUsuario({ ...payloadTela(email), nome: "Tentativa de sequestro" });
    assertProblem(repetido, 409, "EMAIL_ALREADY_REGISTERED");
    expect(repetido.body.toLowerCase()).toContain("mail");

    // O usuario que ja existia continua exatamente como estava (nome, perfil, vinculos).
    expect(await contarUsuarios(email)).toBe(1);
    expect(await estadoDe(email)).toEqual(antes);
    const nome = await consultarUm<{ name: string }>('select name from "user" where email = $1', [email]);
    expect(nome?.name, "o cadastro repetido nao pode renomear o usuario existente").toBe("Operador de Caixa B01");
  });

  it("7+11 · falha tecnica do Better Auth nao vira 'e-mail ja cadastrado' nem vaza a senha", async () => {
    const email = "b01.senha.curta@padaria.local";
    // 6 caracteres: passa no schema compartilhado (min 6) e e reprovada pelo Better Auth (min 8/10).
    const senha = "Abc123";
    const resposta = await criarUsuario(payloadTela(email, { senha }));

    expect(resposta.statusCode, resposta.body).toBe(400);
    expect(resposta.body.toLowerCase(), "senha curta nao pode ser reportada como e-mail duplicado").not.toContain(
      "ja cadastrado"
    );
    expect(resposta.body.toLowerCase(), "a mensagem tem de apontar a senha").toContain("senha");
    // Nem a senha nem detalhe interno do Better Auth podem sair na resposta.
    expect(resposta.body).not.toContain(senha);
    expect(resposta.body).not.toContain("PASSWORD_TOO_SHORT");

    // E-mail inedito recusado por senha nao pode deixar nada gravado.
    expect(await contarUsuarios(email)).toBe(0);
  });

  it("8 · falha depois do signUp nao deixa orfao e a nova tentativa funciona", async () => {
    const email = "b01.estado.parcial@padaria.local";
    const cpf = "52998224725";
    // CPF ja pertence a um colaborador de OUTRO usuario: a validacao estoura DENTRO da transacao de
    // perfil/empresa/colaborador, ou seja, DEPOIS de o Better Auth ja ter gravado user + account.
    await consultarUm("update colaboradores set cpf = $1 where id = $2 returning id", [
      cpf,
      idsTeste.colaboradorGerente
    ]);

    const primeira = await criarUsuario(payloadTela(email, { cpf }));
    expect(primeira.statusCode, primeira.body).toBe(400);
    expect(primeira.body.toLowerCase()).toContain("cpf");

    const parcial = await estadoDe(email);
    expect(parcial.usuarioId, "falha parcial nao pode deixar usuario de autenticacao orfao").toBeNull();
    expect(parcial.temPerfil).toBe(false);

    // Nova tentativa, com o CPF corrigido: tem de funcionar, e nao bater em "e-mail ja cadastrado".
    const segunda = await criarUsuario(payloadTela(email, { cpf: "16899535009" }));
    expect(segunda.statusCode, `nova tentativa apos falha parcial: ${segunda.body}`).toBe(201);
    const estado = await estadoDe(email);
    expect(estado.temPerfil).toBe(true);
    expect(estado.cargosAtivos).toEqual([idsTeste.cargoCaixa]);
    expect(await contarUsuarios(email)).toBe(1);
  });

  it("9 · duas requisicoes concorrentes com o mesmo e-mail produzem um unico usuario consistente", async () => {
    const email = "b01.concorrencia@padaria.local";
    const [a, b] = await Promise.all([
      criarUsuario(payloadTela(email, { cpf: "63017285095" })),
      criarUsuario({ ...payloadTela(email, { cpf: "27300942086" }), nome: "Concorrente B" })
    ]);

    const status = [a.statusCode, b.statusCode].sort((x, y) => x - y);
    expect(status[0], `uma das duas tem de ser criada: ${a.body} | ${b.body}`).toBe(201);
    expect(status[1], "a outra tem de falhar de forma compreensivel, nunca criar duplicata").toBeGreaterThanOrEqual(
      400
    );

    expect(await contarUsuarios(email), "nunca pode existir mais de um usuario com o mesmo e-mail").toBe(1);
    const perfis = await consultarTodos<{ usuario_id: string }>(
      "select usuario_id from perfis_usuarios where email = $1",
      [email]
    );
    expect(perfis).toHaveLength(1);
    const estado = await estadoDe(email);
    expect(estado.temPerfil).toBe(true);
    expect(estado.colaboradorId).toBeTruthy();
    expect(estado.cargosAtivos).toEqual([idsTeste.cargoCaixa]);
  });

  it("10 · empresa fora do escopo do admin continua respondendo 403", async () => {
    const email = "b01.fora.escopo@padaria.local";
    const resposta = await criarUsuario(payloadTela(email, { empresaId: idsTeste.empresaB }));
    assertProblem(resposta, 403);
    expect(await contarUsuarios(email)).toBe(0);
  });
});
