import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { executarSql, expectNaoConterJson, json } from "../../setup/integracao.js";
import { pool } from "../../../api/src/banco/conexao.js";

type UsuarioResposta = {
  usuarioId: string;
  empresaId: string | null;
  empresaIds: string[];
  nome: string;
  colaboradorId: string;
  setorId: string | null;
  setorNome: string | null;
  cargoIds: string[];
  cargos: string[];
};

function linhaDoUsuario(resposta: { json: () => unknown }, nome: string): UsuarioResposta | undefined {
  return json<{ data: UsuarioResposta[] }>(resposta).data.find((usuario) => usuario.nome === nome);
}

// O PR #137 fechou QUAIS LINHAS aparecem (escopoEmpresaAtiva). Ficou de fora QUAIS CAMPOS de cada
// linha: `filtrarUsuariosPorEmpresas` (usuarios.service.ts:27-33 e a gemea em permissoes.service.ts:
// 48-54) mantem a linha INTEIRA quando qualquer empresa do usuario esta no escopo, e
// listarUsuariosRepository (usuarios.repository.ts:27-74) monta essa linha lendo as quatro tabelas
// SEM nenhum `where` de empresa. Um usuario com vinculo em A e B entrega, na consulta escopada em A,
// os metadados da B.
//
// A mesma funcao alimenta as duas rotas: permissoes.repository.ts:34 chama listarUsuariosRepository()
// e permissoes.service.ts:83 devolve `usuarios` verbatim. Causa raiz unica, dois vazamentos.
const usuarioCompartilhado = "usuario-compartilhado-empresa-a-b";
const nomeUsuarioCompartilhado = "USUARIO-COMPARTILHADO-A-B";
const emailUsuarioCompartilhado = "compartilhado.a.b@padaria.local";
// Metadados que existem SOMENTE na empresa B. Sao os identificadores que a resposta escopada na
// empresa A nao pode conter — nem o uuid, nem o nome legivel.
const setorSegredoB = "33333333-3333-4333-8333-0000000000f1";
const cargoSegredoB = "33333333-3333-4333-8333-0000000000f2";
const colaboradorSegredoB = "33333333-3333-4333-8333-0000000000f3";
const colaboradorCargoSegredoB = "33333333-3333-4333-8333-0000000000f4";
const nomeSetorB = "SETOR-EXCLUSIVO-EMPRESA-B";
const nomeCargoB = "CARGO-EXCLUSIVO-EMPRESA-B";
const nomeColaboradorB = "COLABORADOR-EXCLUSIVO-EMPRESA-B";

// O colaborador nasce na empresa B de proposito: `colaboradores_usuario_id_unico`
// (app.schema.ts:336-338) garante que um usuario tem no maximo UM colaborador em todo o banco, e
// `colaboradores.empresa_id` (app.schema.ts:324) e notNull. Entao o vinculo operacional do usuario
// compartilhado mora inteiro na empresa B — e hoje sai na consulta escopada na empresa A.
async function criarUsuarioCompartilhadoComMetadadosDaEmpresaB() {
  await executarSql("insert into setores (id, empresa_id, nome) values ($1, $2, $3)", [
    setorSegredoB,
    idsTeste.empresaB,
    nomeSetorB
  ]);
  await executarSql("insert into cargos (id, empresa_id, nome) values ($1, $2, $3)", [
    cargoSegredoB,
    idsTeste.empresaB,
    nomeCargoB
  ]);
  // `perfis_usuarios.empresa_id` guarda a empresa "principal" e e um valor unico e global
  // (app.schema.ts:120-132). Apontar para a B cobre tambem o campo `empresaId` da resposta.
  await executarSql(
    "insert into perfis_usuarios (usuario_id, empresa_id, nome, email, role) values ($1, $2, $3, $4, $5)",
    [usuarioCompartilhado, idsTeste.empresaB, nomeUsuarioCompartilhado, emailUsuarioCompartilhado, "usuario_comum"]
  );
  // O vinculo com a empresa A e o que faz a linha passar pelo filtro do escopo A. Sem ele o usuario
  // nem apareceria, e o teste ficaria verde por ausencia de dado em vez de por isolamento.
  await executarSql("insert into usuarios_empresas (usuario_id, empresa_id) values ($1, $2), ($1, $3)", [
    usuarioCompartilhado,
    idsTeste.empresaA,
    idsTeste.empresaB
  ]);
  await executarSql(
    "insert into colaboradores (id, empresa_id, nome, setor_id, usuario_id) values ($1, $2, $3, $4, $5)",
    [colaboradorSegredoB, idsTeste.empresaB, nomeColaboradorB, setorSegredoB, usuarioCompartilhado]
  );
  await executarSql(
    `insert into colaboradores_cargos
       (id, empresa_id, colaborador_id, setor_id, cargo_id, remuneracao_minuto, data_inicio, ativo)
     values ($1, $2, $3, $4, $5, $6, $7, true)`,
    [
      colaboradorCargoSegredoB,
      idsTeste.empresaB,
      colaboradorSegredoB,
      setorSegredoB,
      cargoSegredoB,
      "1.000000",
      "2026-01-01"
    ]
  );
}

// Segunda fixture, para um furo diferente do primeiro. O usuario compartilhado acima tem o vinculo
// operacional INTEIRO na empresa B, entao para ele o recorte de cargos e tudo-ou-nada e um erro de
// alinhamento entre os arrays paralelos `cargoIds`/`cargos`/`cargosEmpresaIds` (usuarios.service.ts
// recorta por indice) passaria despercebido.
//
// O `multiempresa` do seed tem colaborador e cargo na empresa A. Dando a ele um SEGUNDO cargo, na
// empresa B, a lista dele passa a ser mista: escopado em A a resposta tem de trazer exatamente um
// cargo, com o id e o NOME casando entre si. Trocar um indice, cair um item ou parear id de um cargo
// com nome de outro fica vermelho aqui — e em nenhum outro teste do arquivo.
//
// `colaboradores_cargos.cargo_id` e FK para `cargos` sem nenhum CHECK de mesma empresa: a FK sozinha
// nao isola por empresa, que e o mesmo padrao ja usado nas fixtures de patrimonio do seed.
const colaboradorCargoMistoB = "33333333-3333-4333-8333-0000000000f5";

async function darAoMultiempresaUmSegundoCargoNaEmpresaB() {
  const colaboradorMultiempresa = idsTeste.colaboradorMultiempresa;
  await executarSql(
    `insert into colaboradores_cargos
       (id, empresa_id, colaborador_id, setor_id, cargo_id, remuneracao_minuto, data_inicio, ativo)
     values ($1, $2, $3, $4, $5, $6, $7, true)`,
    [
      colaboradorCargoMistoB,
      idsTeste.empresaB,
      colaboradorMultiempresa,
      setorSegredoB,
      cargoSegredoB,
      "1.000000",
      "2026-01-01"
    ]
  );
}

// Terceira fixture, para o furo que sobrou: o `setorId` da resposta vinha do colaborador, e o
// colaborador ser da empresa A NAO garante que o setor dele seja. `colaboradores.setor_id` e uma FK
// simples para `setores` (app.schema.ts:327), sem nenhum CHECK de mesma empresa, e
// `POST/PUT /api/colaboradores` grava `setorId` sem validar contra a empresa do colaborador — ao
// contrario de `usuarios.service.ts`, que valida. Ou seja, o estado abaixo e alcancavel pelo produto.
//
// Este usuario tem vinculo SO com a empresa A e colaborador SO na empresa A: nada nele e
// compartilhado. A unica coisa que aponta para a empresa B e o setor. Sem isso o teste provaria de
// novo o recorte do colaborador, e nao o do setor.
const usuarioSetorCruzado = "usuario-setor-cruzado-empresa-a";
const nomeUsuarioSetorCruzado = "USUARIO-SETOR-CRUZADO-A";
const emailUsuarioSetorCruzado = "setor.cruzado.a@padaria.local";
const colaboradorSetorCruzado = "11111111-1111-4111-8111-0000000000a1";
const cargoSetorCruzado = "11111111-1111-4111-8111-0000000000a2";
const colaboradorCargoSetorCruzado = "11111111-1111-4111-8111-0000000000a3";
const nomeColaboradorSetorCruzado = "COLABORADOR-SETOR-CRUZADO-A";
const nomeCargoSetorCruzado = "CARGO-SETOR-CRUZADO-A";

async function criarUsuarioDaEmpresaAComSetorDaEmpresaB() {
  await executarSql("insert into cargos (id, empresa_id, nome) values ($1, $2, $3)", [
    cargoSetorCruzado,
    idsTeste.empresaA,
    nomeCargoSetorCruzado
  ]);
  await executarSql(
    "insert into perfis_usuarios (usuario_id, empresa_id, nome, email, role) values ($1, $2, $3, $4, $5)",
    [usuarioSetorCruzado, idsTeste.empresaA, nomeUsuarioSetorCruzado, emailUsuarioSetorCruzado, "usuario_comum"]
  );
  await executarSql("insert into usuarios_empresas (usuario_id, empresa_id) values ($1, $2)", [
    usuarioSetorCruzado,
    idsTeste.empresaA
  ]);
  // O colaborador e da empresa A, mas o setor dele e o da empresa B. E exatamente este cruzamento
  // que o banco nao impede e que a resposta nao pode propagar.
  await executarSql(
    "insert into colaboradores (id, empresa_id, nome, setor_id, usuario_id) values ($1, $2, $3, $4, $5)",
    [colaboradorSetorCruzado, idsTeste.empresaA, nomeColaboradorSetorCruzado, setorSegredoB, usuarioSetorCruzado]
  );
  await executarSql(
    `insert into colaboradores_cargos
       (id, empresa_id, colaborador_id, setor_id, cargo_id, remuneracao_minuto, data_inicio, ativo)
     values ($1, $2, $3, $4, $5, $6, $7, true)`,
    [
      colaboradorCargoSetorCruzado,
      idsTeste.empresaA,
      colaboradorSetorCruzado,
      idsTeste.setorA,
      cargoSetorCruzado,
      "1.000000",
      "2026-01-01"
    ]
  );
}

// Quarta e quinta fixtures, para os dois ramos do recorte de setor que nenhuma das anteriores toca.
//
// (4) Colaborador na empresa B com setor na empresa A. E o inverso do caso do setor cruzado, e e o
// unico jeito de exercitar o `colaboradorVisivel &&` de `setorVisivel`: o setor esta no escopo, mas o
// colaborador nao. Sem este caso, apagar aquele operando deixaria a suite inteira verde.
//
// (5) Colaborador SEM setor. Nenhuma fixture do seed ou deste arquivo tem `setor_id` nulo — o seed
// sempre grava setorA. Sem este caso, trocar o `leftJoin` por `innerJoin` derrubaria o vinculo inteiro
// de quem nao tem setor (o `colaboradorId` viraria "") e a suite continuaria verde.
const usuarioColaboradorNaB = "usuario-colaborador-na-b-setor-na-a";
const nomeUsuarioColaboradorNaB = "USUARIO-COLABORADOR-B-SETOR-A";
const colaboradorNaBSetorNaA = "33333333-3333-4333-8333-0000000000f6";
const usuarioSemSetor = "usuario-sem-setor-empresa-a";
const nomeUsuarioSemSetor = "USUARIO-SEM-SETOR-A";
const colaboradorSemSetor = "11111111-1111-4111-8111-0000000000b1";

async function criarUsuarioComColaboradorNaEmpresaBEStorNaEmpresaA() {
  await executarSql(
    "insert into perfis_usuarios (usuario_id, empresa_id, nome, email, role) values ($1, $2, $3, $4, $5)",
    [
      usuarioColaboradorNaB,
      idsTeste.empresaA,
      nomeUsuarioColaboradorNaB,
      "colab.b.setor.a@padaria.local",
      "usuario_comum"
    ]
  );
  await executarSql("insert into usuarios_empresas (usuario_id, empresa_id) values ($1, $2), ($1, $3)", [
    usuarioColaboradorNaB,
    idsTeste.empresaA,
    idsTeste.empresaB
  ]);
  // Colaborador na B, setor na A: escopado em A o colaborador tem de sumir, e o setor tem de sumir
  // JUNTO — ainda que o setor, sozinho, esteja no escopo.
  await executarSql(
    "insert into colaboradores (id, empresa_id, nome, setor_id, usuario_id) values ($1, $2, $3, $4, $5)",
    [colaboradorNaBSetorNaA, idsTeste.empresaB, "COLABORADOR-NA-B-SETOR-NA-A", idsTeste.setorA, usuarioColaboradorNaB]
  );
}

async function criarUsuarioDaEmpresaASemSetor() {
  await executarSql(
    "insert into perfis_usuarios (usuario_id, empresa_id, nome, email, role) values ($1, $2, $3, $4, $5)",
    [usuarioSemSetor, idsTeste.empresaA, nomeUsuarioSemSetor, "sem.setor.a@padaria.local", "usuario_comum"]
  );
  await executarSql("insert into usuarios_empresas (usuario_id, empresa_id) values ($1, $2)", [
    usuarioSemSetor,
    idsTeste.empresaA
  ]);
  await executarSql(
    "insert into colaboradores (id, empresa_id, nome, setor_id, usuario_id) values ($1, $2, $3, null, $4)",
    [colaboradorSemSetor, idsTeste.empresaA, "COLABORADOR-SEM-SETOR-A", usuarioSemSetor]
  );
}

// Identificadores que pertencem exclusivamente a empresa B. Nenhum pode aparecer numa resposta
// escopada na empresa A — nem como uuid (util para mirar outras rotas) nem como nome legivel
// (estrutura organizacional alheia).
//
// Cinco deles cabem no contrato atual e provam o recorte: o uuid da empresa B, o colaboradorId, o
// setorId, o cargoId e o NOME do cargo. Os outros tres — nome do setor, nome do colaborador e o id
// da linha de colaboradores_cargos — nao sao campos de `UsuarioLinha` hoje, entao aqui eles nao
// provam isolamento: ficam como guarda de contrato, para o dia em que alguem acrescentar campo na
// linha. Estao aqui de proposito, e nao por engano.
function esperarNenhumMetadadoDaEmpresaB(resposta: { json: () => unknown }) {
  expectNaoConterJson(resposta, idsTeste.empresaB);
  expectNaoConterJson(resposta, colaboradorSegredoB);
  expectNaoConterJson(resposta, setorSegredoB);
  expectNaoConterJson(resposta, cargoSegredoB);
  expectNaoConterJson(resposta, nomeCargoB);
  expectNaoConterJson(resposta, nomeSetorB);
  expectNaoConterJson(resposta, nomeColaboradorB);
  expectNaoConterJson(resposta, colaboradorCargoSegredoB);
}

describe("metadados de usuario cross-tenant integration", () => {
  let contexto: ContextoApiTeste;
  let cookieGerente: string;
  let cookieAdmin: string;
  let cookieMultiempresa: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    await criarUsuarioCompartilhadoComMetadadosDaEmpresaB();
    await darAoMultiempresaUmSegundoCargoNaEmpresaB();
    await criarUsuarioDaEmpresaAComSetorDaEmpresaB();
    await criarUsuarioComColaboradorNaEmpresaBEStorNaEmpresaA();
    await criarUsuarioDaEmpresaASemSetor();
    cookieGerente = await cookieSessao(contexto.app, "gerente");
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    cookieMultiempresa = await cookieSessao(contexto.app, "multiempresa");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  // O caso central. O gerente so tem vinculo com a empresa A (seed.ts:308), consulta escopada em A, e
  // a linha do usuario compartilhado volta com empresaIds [A, B], colaboradorId, setorId, cargoIds e
  // cargos que sao todos da empresa B.
  it("Deve_NaoVazarMetadadosDaEmpresaB_Quando_ListarUsuariosEscopadoNaEmpresaA", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/usuarios?empresaId=${idsTeste.empresaA}&pageSize=100`,
      headers: { cookie: cookieGerente }
    });

    assertOk(resposta);
    // Sem esta ancora o teste passaria por paginacao: o pageSize default da rota e 10
    // (shared/src/api/index.ts:67) e o alvo cairia na pagina 2, provando nada.
    expect(json<{ meta: { pagination: { total: number } } }>(resposta).meta.pagination.total).toBeLessThan(100);

    // Assercao ESTRUTURAL, e nao so a busca por substring. As substrings provam que a empresa B
    // sumiu; so esta prova que a empresa A continuou certa. Sem ela, um recorte que devolvesse
    // `empresaIds: []` e `empresaId: null` deixaria o arquivo inteiro verde e quebraria a tela:
    // `itensDaEmpresa` (web-vue/utils/domain.ts:679-683) casa por `empresaIds.includes`, entao o
    // usuario sumiria no filtro do cliente depois de ter passado no do servidor.
    //
    // Ela tambem e a contraprova de que a correcao e de projecao de CAMPOS e nao de omissao de
    // LINHA: o usuario compartilhado tem vinculo legitimo com a empresa A e continua listavel a
    // partir dela.
    expect(linhaDoUsuario(resposta, nomeUsuarioCompartilhado)).toMatchObject({
      empresaId: idsTeste.empresaA,
      empresaIds: [idsTeste.empresaA],
      colaboradorId: "",
      setorId: null,
      setorNome: null,
      cargoIds: [],
      cargos: []
    });
    esperarNenhumMetadadoDaEmpresaB(resposta);
  });

  // O recorte de cargos e por INDICE sobre arrays paralelos (usuarios.service.ts). Com uma lista
  // mista — um cargo na empresa A e outro na B, no mesmo colaborador — o par id/nome tem de
  // continuar casando. Este e o unico teste do arquivo que pega desalinhamento.
  it("Deve_ManterCargoIdECargoNomePareados_Quando_UsuarioTemCargoEmCadaEmpresa", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/usuarios?empresaId=${idsTeste.empresaA}&pageSize=100`,
      headers: { cookie: cookieGerente }
    });

    assertOk(resposta);
    // O colaborador do multiempresa vive na empresa A: diferente do usuario compartilhado, aqui
    // `colaboradorId` e `setorId` PRECISAM sobreviver ao recorte. E o ramo colaboradorVisivel=true.
    expect(linhaDoUsuario(resposta, usuariosTeste.multiempresa.nome)).toMatchObject({
      empresaId: idsTeste.empresaA,
      empresaIds: [idsTeste.empresaA],
      colaboradorId: idsTeste.colaboradorMultiempresa,
      setorId: idsTeste.setorA,
      setorNome: "Loja",
      cargoIds: [idsTeste.cargoMultiempresa],
      cargos: [usuariosTeste.multiempresa.nome]
    });
    esperarNenhumMetadadoDaEmpresaB(resposta);
  });

  // Mesma causa raiz, outra rota: permissoes.repository.ts:34 reusa listarUsuariosRepository() e
  // permissoes.service.ts:83 devolve a linha verbatim no campo `usuarios`.
  it("Deve_NaoVazarMetadadosDaEmpresaB_Quando_ListarPermissoesEscopadoNaEmpresaA", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/permissoes?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieGerente }
    });

    assertOk(resposta);
    expect(JSON.stringify(resposta.json())).toContain(nomeUsuarioCompartilhado);
    esperarNenhumMetadadoDaEmpresaB(resposta);
  });

  // O `setorId` vinha do colaborador, e o colaborador ser da empresa A nao garante que o setor dele
  // seja: `colaboradores.setor_id` e FK simples, sem CHECK de mesma empresa, e a rota de colaboradores
  // grava o setor sem validar a empresa. Aqui NADA do usuario e compartilhado — vinculo e colaborador
  // sao so da empresa A — entao o unico jeito de o uuid da empresa B aparecer e pelo setor.
  it("Deve_NaoDevolverSetorDeOutraEmpresa_Quando_ColaboradorDaEmpresaAApontaParaSetorDaEmpresaB", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/usuarios?empresaId=${idsTeste.empresaA}&pageSize=100`,
      headers: { cookie: cookieGerente }
    });

    assertOk(resposta);
    // O colaborador e legitimo na empresa A e PRECISA sobreviver: o recorte e do setor, nao do
    // colaborador. Zerar os dois seria sobrecorrecao e quebraria a edicao do usuario.
    expect(linhaDoUsuario(resposta, nomeUsuarioSetorCruzado)).toMatchObject({
      empresaId: idsTeste.empresaA,
      empresaIds: [idsTeste.empresaA],
      colaboradorId: colaboradorSetorCruzado,
      setorId: null,
      setorNome: null,
      cargoIds: [cargoSetorCruzado],
      cargos: [nomeCargoSetorCruzado]
    });
    esperarNenhumMetadadoDaEmpresaB(resposta);
  });

  // Contraprova legitima: quando setor e colaborador sao os dois da empresa consultada, o `setorId`
  // continua saindo — zerar o campo para todo mundo nao passa. A mesma garantia ja existe embutida no
  // caso de pareamento de cargos acima, que asserta `setorId: idsTeste.setorA` para o multiempresa;
  // este caso a torna explicita e local, ao lado do caso que ela contrapoe.
  it("Deve_PreservarSetorId_Quando_SetorEColaboradorSaoDaEmpresaConsultada", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/usuarios?empresaId=${idsTeste.empresaA}&pageSize=100`,
      headers: { cookie: cookieGerente }
    });

    assertOk(resposta);
    expect(linhaDoUsuario(resposta, usuariosTeste.gerente.nome)).toMatchObject({
      colaboradorId: idsTeste.colaboradorGerente,
      setorId: idsTeste.setorA,
      setorNome: "Loja"
    });
  });

  // O inverso do caso anterior, e o unico que exercita o `colaboradorVisivel &&` de `setorVisivel`:
  // o setor esta na empresa consultada, mas o colaborador nao. Esconder o colaborador e devolver o
  // setor dele seria incoerente — o vinculo operacional sai inteiro ou nao sai.
  it("Deve_OmitirSetorId_Quando_ColaboradorEDeOutraEmpresaAindaQueOSetorSejaDaEmpresaConsultada", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/usuarios?empresaId=${idsTeste.empresaA}&pageSize=100`,
      headers: { cookie: cookieGerente }
    });

    assertOk(resposta);
    expect(linhaDoUsuario(resposta, nomeUsuarioColaboradorNaB)).toMatchObject({
      empresaIds: [idsTeste.empresaA],
      colaboradorId: "",
      setorId: null,
      setorNome: null
    });
    esperarNenhumMetadadoDaEmpresaB(resposta);
  });

  // Colaborador sem setor. Trava o `leftJoin`: com `innerJoin` a linha do colaborador sumiria do
  // agregado e o usuario voltaria sem `colaboradorId`, quebrando a edicao dele — sem nenhum outro
  // teste da suite ficar vermelho.
  it("Deve_ManterOColaborador_Quando_ColaboradorNaoTemSetor", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/usuarios?empresaId=${idsTeste.empresaA}&pageSize=100`,
      headers: { cookie: cookieGerente }
    });

    assertOk(resposta);
    expect(linhaDoUsuario(resposta, nomeUsuarioSemSetor)).toMatchObject({
      empresaIds: [idsTeste.empresaA],
      colaboradorId: colaboradorSemSetor,
      setorId: null,
      setorNome: null
    });
  });

  // `usuario_admin` concede o catalogo inteiro de permissoes, mas NAO alarga o escopo de empresas
  // (api/src/auth/perfil.service.ts:7). O admin da empresa A tem que receber a mesma linha recortada.
  it("Deve_NaoVazarMetadadosDaEmpresaB_Quando_AdminDaEmpresaAListaUsuarios", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/usuarios?empresaId=${idsTeste.empresaA}&pageSize=100`,
      headers: { cookie: cookieAdmin }
    });

    assertOk(resposta);
    // Ancora positiva: sem ela, uma regressao que devolvesse lista vazia deixaria este teste verde,
    // porque todas as demais assercoes sao negativas.
    expect(linhaDoUsuario(resposta, nomeUsuarioCompartilhado)).toBeDefined();
    expect(json<{ meta: { pagination: { total: number } } }>(resposta).meta.pagination.total).toBeLessThan(100);
    esperarNenhumMetadadoDaEmpresaB(resposta);
  });

  // Sem empresaId o escopo cai para todas as empresas do perfil (api/src/auth/empresa.ts:23). Para
  // quem so tem a empresa A, isso nunca pode incluir a B — nem em campo agregado.
  it("Deve_NaoVazarMetadadosDaEmpresaB_Quando_ListarUsuariosSemEmpresaId", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: "/api/usuarios?pageSize=100",
      headers: { cookie: cookieGerente }
    });

    assertOk(resposta);
    expect(linhaDoUsuario(resposta, nomeUsuarioCompartilhado)).toBeDefined();
    expect(json<{ meta: { pagination: { total: number } } }>(resposta).meta.pagination.total).toBeLessThan(100);
    esperarNenhumMetadadoDaEmpresaB(resposta);
  });

  // Contraprova: o recorte nao pode virar cegueira universal. Quem tem vinculo legitimo com a B
  // continua vendo os metadados dela quando escopa na B.
  it("Deve_ListarMetadadosDaEmpresaB_Quando_UsuarioTemVinculoComEla", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/usuarios?empresaId=${idsTeste.empresaB}&pageSize=100`,
      headers: { cookie: cookieMultiempresa }
    });

    assertOk(resposta);
    const corpo = JSON.stringify(resposta.json());
    expect(corpo).toContain(nomeUsuarioCompartilhado);
    expect(corpo).toContain(colaboradorSegredoB);
    expect(corpo).toContain(nomeCargoB);
    expect(corpo).toContain(setorSegredoB);
  });

  // Ator com vinculo em A e B escopando em A: e o unico ator capaz de provar o recorte de
  // `empresaIds`, porque para quem so tem a empresa A a lista permitida e o escopo sao iguais. Ele
  // enxerga a empresa B legitimamente, mas nao NESTA consulta.
  it("Deve_RecortarEmpresaIds_Quando_MultiempresaEscopaNaEmpresaA", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/usuarios?empresaId=${idsTeste.empresaA}&pageSize=100`,
      headers: { cookie: cookieMultiempresa }
    });

    assertOk(resposta);
    expect(JSON.stringify(resposta.json())).toContain(nomeUsuarioCompartilhado);
    esperarNenhumMetadadoDaEmpresaB(resposta);
  });

  // Informar a empresa B sem vinculo continua sendo negacao de escopo, nao lista vazia.
  it("Deve_Retornar403_Quando_GerenteDaEmpresaAListaUsuariosDaEmpresaB", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/usuarios?empresaId=${idsTeste.empresaB}&pageSize=100`,
      headers: { cookie: cookieGerente }
    });

    esperarNenhumMetadadoDaEmpresaB(resposta);
    assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
  });

  // Trava a propriedade ponta a ponta: banco fora do ar responde 500, nunca uma falsa negacao de
  // empresa. Nem esta rota nem a irma (corrigida em 8ae8d22) tinham teste para isso.
  //
  // Honestidade sobre o que este teste prova: ele NAO fica vermelho se a consulta voltar para dentro
  // do try/catch do controller. Quem garante o 500 hoje e o Drizzle, que embrulha a falha do driver
  // num DrizzleQueryError — e como ele nao e Error puro, `mensagemDominioOuRelancar`
  // (api/src/erros.ts:9) o relanca para o handler global em vez de devolver a mensagem. Ou seja: o
  // recorte do try no controller e defesa em profundidade, nao o que segura o 500 hoje.
  //
  // Verificado por mutacao: removendo o `error.constructor === Error` de erros.ts E devolvendo a
  // consulta para dentro do try, este teste — e so ele — fica vermelho com "expected 403 to be 500".
  // Entao ele trava a propriedade que importa, mesmo nao travando a linha do controller.
  //
  // O `pool.query` e substituido de forma seletiva, no molde de tests/integration/saude/saude.test.ts.
  // Precisa ser seletivo: as consultas do preHandler de autenticacao (api/src/auth/perfil.repository.ts)
  // TODAS tem `where`, e a listagem de usuarios varre `usuarios_empresas` sem nenhum. Derrubar tudo
  // mataria a requisicao no guard e o teste ficaria verde pelo motivo errado, nos dois codigos.
  it("Deve_Retornar500_Quando_OBancoFalhaAoListarUsuarios", async () => {
    const consultaOriginal = pool.query.bind(pool);
    pool.query = ((texto: unknown, ...resto: unknown[]) => {
      const sql = typeof texto === "string" ? texto : String((texto as { text?: string })?.text ?? "");
      if (sql.includes('from "usuarios_empresas"') && !sql.includes("where")) {
        return Promise.reject(new Error("banco fora do ar (simulado)"));
      }
      return (consultaOriginal as (...args: unknown[]) => unknown)(texto, ...resto);
    }) as typeof pool.query;

    try {
      const resposta = await contexto.app.inject({
        method: "GET",
        url: `/api/usuarios?empresaId=${idsTeste.empresaA}&pageSize=100`,
        headers: { cookie: cookieGerente }
      });

      // 500, e nao 403: falha tecnica nao e negacao de empresa. O corpo tambem nao pode carregar a
      // mensagem interna do driver.
      expect(resposta.statusCode).toBe(500);
      expect(JSON.stringify(resposta.json())).not.toContain("FORBIDDEN_COMPANY");
      expect(JSON.stringify(resposta.json())).not.toContain("banco fora do ar (simulado)");
    } finally {
      pool.query = consultaOriginal;
    }
  });

  // Sem isto, o teste acima envenenaria os proximos arquivos se deixasse o pool quebrado.
  it("Deve_VoltarAListar_Quando_OBancoResponderDeNovo", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/usuarios?empresaId=${idsTeste.empresaA}&pageSize=100`,
      headers: { cookie: cookieGerente }
    });

    assertOk(resposta);
    expect(linhaDoUsuario(resposta, nomeUsuarioCompartilhado)).toBeDefined();
  });

  // O ZodError da query tem de continuar virando 400 pelo handler global. O catch da rota classifica
  // por mensagem, entao este caso trava a fronteira entre negacao de escopo e erro de validacao.
  it("Deve_Retornar400_Quando_EmpresaIdNaoEUuidNaRotaDeUsuarios", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: "/api/usuarios?empresaId=nao-e-uuid",
      headers: { cookie: cookieGerente }
    });

    assertProblem(resposta, 400);
  });
});
