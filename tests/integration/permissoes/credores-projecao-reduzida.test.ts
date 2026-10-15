import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

// DECISAO B-1 (Jose, 10/08/2026):
//   - `despesas_visualizar` passa a consultar `GET /api/colaboradores`;
//   - `retiradas_visualizar` passa a consultar `GET /api/fornecedores`;
//   - quem entra SOMENTE por permissao operacional recebe exatamente `{ id, empresaId, nome }`;
//   - quem tem a permissao de CADASTRO continua recebendo o contrato completo;
//   - o isolamento por empresa nao muda: reduzir campos nao e reduzir linhas.
//
// O ator central e `semRecorrencia` (setup/seed.ts): tem `despesas_visualizar` e
// `retiradas_visualizar` e NAO tem `cadastro_colaboradores_visualizar`, `cadastro_usuarios_visualizar`,
// `cadastro_fornecedores_visualizar`, `mercadorias_visualizar` nem `caixa_operar`. Ele prova o gate de
// COLABORADORES pelas permissoes novas e a projecao reduzida das duas rotas.
//
// Ele NAO serve para provar o gate de FORNECEDORES: `despesas_visualizar` ja estava naquele gate
// antes desta entrega, entao um 200 dele viria pela porta velha e apagar `retiradas_visualizar` do
// controller deixaria a suite verde. Foi o falso-verde que a revisao pegou. O gate de fornecedores e
// provado a parte, com a Tesouraria — o unico perfil do seed sem nenhuma das permissoes antigas —,
// medindo 403 ANTES e 200 DEPOIS da concessao de `retiradas_visualizar`.
//
// O oraculo e o CONJUNTO DE CHAVES, nao os valores: um campo que chega nulo por acaso no seed passaria
// despercebido numa comparacao de valores, e e justamente o campo que nao pode existir.
const CONTRATO_REDUZIDO = ["id", "empresaId", "nome"];
// Os quatro campos de vinculo pertencem ao resumo da lista DP. A projecao operacional continua
// estritamente reduzida a id/empresa/nome no teste abaixo.
const CONTRATO_COMPLETO_COLABORADOR = [
  "id",
  "empresaId",
  "nome",
  "cpf",
  "setorId",
  "turnoPadraoId",
  "usuarioId",
  "vinculoAtivoId",
  "temVinculoHistorico",
  "matricula",
  "funcaoNome"
];
const CONTRATO_COMPLETO_FORNECEDOR = ["id", "empresaId", "nome", "documento"];

// Dados que NAO podem sair na resposta operacional. Sao gravados por SQL direto de proposito: o
// payload de cadastro valida CPF/CNPJ e o que importa aqui e o vazamento, nao a validacao.
const CPF_DO_COLABORADOR = "52998224725";
const CNPJ_DO_FORNECEDOR = "00000000000100";

describe("CX-M06 B-1 - credores por permissao operacional, em projecao reduzida", () => {
  let contexto: ContextoApiTeste;
  let cookieOperacional = "";
  let cookieCadastro = "";
  let cookieSemPermissao = "";
  let cookieMultiempresa = "";
  let cookieSoCaixaOperar = "";
  let cookieSoRetiradas = "";
  let fornecedorDaEmpresaB = "";
  let colaboradorDaEmpresaB = "";

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    [cookieOperacional, cookieCadastro, cookieSemPermissao, cookieMultiempresa, cookieSoCaixaOperar] =
      await Promise.all([
        cookieSessao(contexto.app, "semRecorrencia"),
        cookieSessao(contexto.app, "admin"),
        cookieSessao(contexto.app, "semPermissao"),
        cookieSessao(contexto.app, "multiempresa"),
        // `operadorEntradas` tem `caixa_operar` e NAO tem `despesas_visualizar`. Depois da B-1 ele e o
        // unico perfil do seed que ainda isola a permissao ANTIGA do gate de colaboradores: o `caixa`
        // passou a entrar por `despesas_visualizar`, entao sem este ator apagar `caixa_operar` do
        // controller deixaria a suite verde.
        cookieSessao(contexto.app, "operadorEntradas")
      ]);
    // Ainda SEM `retiradas_visualizar` — o caso do aceite 3 mede o 403 antes da concessao.
    cookieSoRetiradas = await cookieSessao(contexto.app, "tesouraria");

    // O colaborador do seed nasce com `cpf` NULO. Sem um CPF de verdade gravado, "a resposta nao tem
    // CPF" seria verdade por acidente e a projecao poderia ser removida sem nenhum teste cair.
    await executarSql("update colaboradores set cpf = $1 where id = $2", [
      CPF_DO_COLABORADOR,
      idsTeste.colaboradorAdmin
    ]);

    // Vizinhos na empresa B, para o isolamento ser afirmado contra dados que EXISTEM. Sem eles, "a
    // empresa A nao ve a empresa B" passaria verde numa base onde a empresa B nao tem ninguem.
    const fornecedorB = await consultarUm<{ id: string }>(
      "insert into fornecedores (empresa_id, nome, documento) values ($1, $2, $3) returning id",
      [idsTeste.empresaB, "Fornecedor da Empresa B", "00000000000272"]
    );
    const colaboradorB = await consultarUm<{ id: string }>(
      "insert into colaboradores (empresa_id, nome, cpf) values ($1, $2, $3) returning id",
      [idsTeste.empresaB, "Colaborador da Empresa B", "11144477735"]
    );
    if (!fornecedorB || !colaboradorB) throw new Error("Fixtures da empresa B nao foram criadas");
    fornecedorDaEmpresaB = fornecedorB.id;
    colaboradorDaEmpresaB = colaboradorB.id;
  }, 180_000);

  // O ator que isola `retiradas_visualizar` no gate de fornecedores. A Tesouraria do seed nao tem
  // NENHUMA das tres permissoes que ja passavam ali (`cadastro_fornecedores_visualizar`,
  // `despesas_visualizar`, `mercadorias_visualizar`), entao a porta dela e exclusivamente a nova.
  // A concessao ACRESCENTA a regra existente: o seed grava as permissoes na mesma camada de usuario e
  // `substituirPermissoesUsuarioRepository` apaga a linha antes de gravar.
  async function concederRetiradasVisualizarATesouraria() {
    const alvo = await consultarUm<{ usuario_id: string }>(
      "select usuario_id from perfis_usuarios where lower(email) = lower($1)",
      [usuariosTeste.tesouraria.email]
    );
    if (!alvo) throw new Error("Usuario tesouraria nao encontrado");
    const atuais = await consultarUm<{ regras: Record<string, boolean> }>(
      "select regras from permissoes_usuarios where usuario_id = $1",
      [alvo.usuario_id]
    );
    const concessao = await contexto.app.inject({
      method: "POST",
      url: "/api/permissoes",
      headers: { cookie: cookieCadastro },
      payload: {
        tipoPermissao: "usuario",
        usuarioId: alvo.usuario_id,
        regras: { ...(atuais?.regras ?? {}), retiradas_visualizar: true }
      }
    });
    expect([200, 201]).toContain(concessao.statusCode);
    cookieSoRetiradas = await cookieSessao(contexto.app, "tesouraria");
  }

  afterAll(async () => contexto.fechar());

  // `pageSize` no teto da rota (100) de proposito: o oraculo destes casos e "TODA linha respeita o contrato", e uma
  // pagina curta esconderia justamente a linha que vaza.
  function listar(cookie: string, rota: string, empresaId: string = idsTeste.empresaA) {
    return contexto.app.inject({
      method: "GET",
      url: `${rota}?empresaId=${empresaId}&pageSize=100`,
      headers: { cookie }
    });
  }

  // Envelope de `paginadoDeArray`: `{ ok, data: [...], meta }` — a lista e o proprio `data`.
  const itens = (resposta: { json: () => unknown }) => json<{ data: Record<string, unknown>[] }>(resposta).data;

  // A PRE-CONDICAO. Se `semRecorrencia` ganhar uma permissao de cadastro, tudo abaixo continua verde
  // provando o contrato ERRADO — o completo. Este caso e o que denuncia.
  it("Deve_ChegarSoPelasPermissoesOperacionais_Quando_OAtorEODesteArquivo", async () => {
    const sessao = await contexto.app.inject({
      method: "GET",
      url: "/api/sessao",
      headers: { cookie: cookieOperacional }
    });
    expect(sessao.statusCode, sessao.body).toBe(200);
    const { permissoes } = json<{ data: { perfil: { permissoes: string[] } } }>(sessao).data.perfil;

    expect(permissoes).toEqual(expect.arrayContaining(["despesas_visualizar", "retiradas_visualizar"]));
    expect(permissoes).not.toContain("cadastro_colaboradores_visualizar");
    expect(permissoes).not.toContain("cadastro_usuarios_visualizar");
    expect(permissoes).not.toContain("cadastro_fornecedores_visualizar");
    expect(permissoes).not.toContain("mercadorias_visualizar");
    expect(permissoes).not.toContain("caixa_operar");
  });

  // ACEITE 1: `despesas_visualizar` e permissao NOVA no gate de colaboradores, entao o 200 do
  // `semRecorrencia` so pode vir por ela — ele nao tem `cadastro_colaboradores_visualizar` nem
  // `caixa_operar`, as duas que ja passavam.
  it("Deve_Responder200_Quando_DespesasVisualizarConsultaColaboradores", async () => {
    const resposta = await listar(cookieOperacional, "/api/colaboradores");
    expect(resposta.statusCode, resposta.body).toBe(200);
    expect(itens(resposta).length).toBeGreaterThan(0);
  });

  // ACEITE 3, provado pela transicao 403 -> 200 sobre o MESMO ator. E a unica forma de amarrar o
  // resultado a permissao nova: `semRecorrencia` entraria por `despesas_visualizar`, que ja estava no
  // gate, e apagar `retiradas_visualizar` do controller nao derrubaria nada.
  it("Deve_AbrirFornecedores_Quando_ORetiradasVisualizarEConcedido", async () => {
    assertProblem(await listar(cookieSoRetiradas, "/api/fornecedores"), 403, "INSUFFICIENT_PERMISSION");

    await concederRetiradasVisualizarATesouraria();

    const depois = await listar(cookieSoRetiradas, "/api/fornecedores");
    expect(depois.statusCode, depois.body).toBe(200);
    expect(itens(depois).length).toBeGreaterThan(0);
    // E entra na projecao reduzida, como toda permissao operacional.
    for (const item of itens(depois)) {
      expect(Object.keys(item).sort()).toEqual([...CONTRATO_REDUZIDO].sort());
    }
    expect(depois.body).not.toContain(CNPJ_DO_FORNECEDOR);
  });

  // A permissao ANTIGA do gate de colaboradores continua valendo — e, depois da B-1, `operadorEntradas`
  // e o unico perfil do seed que a isola. Sem este caso, remover `caixa_operar` do controller passaria
  // despercebido.
  it("Deve_Responder200ComContratoReduzido_Quando_OAtorSoTemCaixaOperar", async () => {
    const resposta = await listar(cookieSoCaixaOperar, "/api/colaboradores");
    expect(resposta.statusCode, resposta.body).toBe(200);
    expect(itens(resposta).length).toBeGreaterThan(0);
    for (const item of itens(resposta)) {
      expect(Object.keys(item).sort()).toEqual([...CONTRATO_REDUZIDO].sort());
    }
    expect(resposta.body).not.toContain(CPF_DO_COLABORADOR);
  });

  // ACEITE 2 e 5: o contrato operacional e exatamente tres campos — e o CPF nao esta no corpo, nem
  // escondido num campo com outro nome.
  it("Deve_DevolverSoIdEmpresaNome_Quando_ColaboradoresSaiPorPermissaoOperacional", async () => {
    const resposta = await listar(cookieOperacional, "/api/colaboradores");
    // Nao-vacuidade: um `for` sobre lista vazia passa. A lista tem de existir para o contrato valer.
    expect(itens(resposta).length).toBeGreaterThan(0);
    for (const item of itens(resposta)) {
      expect(Object.keys(item).sort()).toEqual([...CONTRATO_REDUZIDO].sort());
    }
    expect(resposta.body).not.toContain(CPF_DO_COLABORADOR);
  });

  // ACEITE 4 e 5: idem fornecedores. Aqui o vazamento era REAL antes desta entrega — a rota nao tinha
  // projecao nenhuma, e `despesas_visualizar`/`mercadorias_visualizar` ja recebiam o CNPJ inteiro.
  it("Deve_DevolverSoIdEmpresaNome_Quando_FornecedoresSaiPorPermissaoOperacional", async () => {
    const resposta = await listar(cookieOperacional, "/api/fornecedores");
    expect(itens(resposta).length).toBeGreaterThan(0);
    for (const item of itens(resposta)) {
      expect(Object.keys(item).sort()).toEqual([...CONTRATO_REDUZIDO].sort());
    }
    expect(resposta.body).not.toContain(CNPJ_DO_FORNECEDOR);
  });

  // ACEITE 6: quem cadastra continua recebendo tudo. Sem este caso, "reduzir sempre" passaria verde e
  // apagaria dado no proximo PUT de cadastro, que e substituicao total.
  it("Deve_ManterOContratoCompleto_Quando_OAtorTemAPermissaoDeCadastro", async () => {
    const colaboradores = await listar(cookieCadastro, "/api/colaboradores");
    expect(colaboradores.statusCode, colaboradores.body).toBe(200);
    expect(itens(colaboradores).length).toBeGreaterThan(0);
    for (const item of itens(colaboradores)) {
      expect(Object.keys(item).sort()).toEqual([...CONTRATO_COMPLETO_COLABORADOR].sort());
    }
    expect(colaboradores.body).toContain(CPF_DO_COLABORADOR);

    const fornecedores = await listar(cookieCadastro, "/api/fornecedores");
    expect(fornecedores.statusCode, fornecedores.body).toBe(200);
    expect(itens(fornecedores).length).toBeGreaterThan(0);
    for (const item of itens(fornecedores)) {
      expect(Object.keys(item).sort()).toEqual([...CONTRATO_COMPLETO_FORNECEDOR].sort());
    }
    expect(fornecedores.body).toContain(CNPJ_DO_FORNECEDOR);
  });

  // ACEITE 7: o isolamento por empresa e ANTERIOR a projecao e nao depende dela.
  it("Deve_NuncaVerAEmpresaB_Quando_OAtorEDaEmpresaA", async () => {
    const colaboradores = await listar(cookieOperacional, "/api/colaboradores");
    const fornecedores = await listar(cookieOperacional, "/api/fornecedores");

    expect(itens(colaboradores).map((item) => item["id"])).not.toContain(colaboradorDaEmpresaB);
    expect(itens(fornecedores).map((item) => item["id"])).not.toContain(fornecedorDaEmpresaB);
    expect(itens(colaboradores).every((item) => item["empresaId"] === idsTeste.empresaA)).toBe(true);
    expect(itens(fornecedores).every((item) => item["empresaId"] === idsTeste.empresaA)).toBe(true);

    // O contraste: as linhas da empresa B EXISTEM e sao visiveis a quem tem a empresa no escopo.
    // Sem ele, um filtro que devolvesse lista vazia para todo mundo passaria neste teste.
    expect(
      itens(await listar(cookieMultiempresa, "/api/fornecedores", idsTeste.empresaB)).map((i) => i["id"])
    ).toContain(fornecedorDaEmpresaB);
    expect(
      itens(await listar(cookieMultiempresa, "/api/colaboradores", idsTeste.empresaB)).map((i) => i["id"])
    ).toContain(colaboradorDaEmpresaB);
  });

  // O gate continua sendo um gate: a B-1 acrescentou DUAS permissoes, nao abriu a rota.
  it("Deve_Recusar_Quando_OAtorNaoTemNenhumaDasPermissoesAceitas", async () => {
    assertProblem(await listar(cookieSemPermissao, "/api/colaboradores"), 403, "INSUFFICIENT_PERMISSION");
    assertProblem(await listar(cookieSemPermissao, "/api/fornecedores"), 403, "INSUFFICIENT_PERMISSION");
  });
});
