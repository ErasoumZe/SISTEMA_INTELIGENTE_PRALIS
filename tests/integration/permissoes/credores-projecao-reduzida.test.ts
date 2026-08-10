import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
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
// `cadastro_fornecedores_visualizar`, `mercadorias_visualizar` nem `caixa_operar`. E o unico perfil do
// seed que chega as duas rotas EXCLUSIVAMENTE pelas permissoes novas — com qualquer outro, um 200 nao
// provaria que o gate mudou, e um contrato reduzido nao provaria por qual porta ele entrou.
//
// O oraculo e o CONJUNTO DE CHAVES, nao os valores: um campo que chega nulo por acaso no seed passaria
// despercebido numa comparacao de valores, e e justamente o campo que nao pode existir.
const CONTRATO_REDUZIDO = ["id", "empresaId", "nome"];
const CONTRATO_COMPLETO_COLABORADOR = ["id", "empresaId", "nome", "cpf", "setorId", "turnoPadraoId", "usuarioId"];
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
  let fornecedorDaEmpresaB = "";
  let colaboradorDaEmpresaB = "";

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    [cookieOperacional, cookieCadastro, cookieSemPermissao, cookieMultiempresa] = await Promise.all([
      cookieSessao(contexto.app, "semRecorrencia"),
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "semPermissao"),
      cookieSessao(contexto.app, "multiempresa")
    ]);

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

  // ACEITE 1 e 3: as duas rotas passaram a aceitar as permissoes operacionais.
  it("Deve_Responder200_Quando_DespesasVisualizarConsultaColaboradores", async () => {
    const resposta = await listar(cookieOperacional, "/api/colaboradores");
    expect(resposta.statusCode, resposta.body).toBe(200);
    expect(itens(resposta).length).toBeGreaterThan(0);
  });

  it("Deve_Responder200_Quando_RetiradasVisualizarConsultaFornecedores", async () => {
    const resposta = await listar(cookieOperacional, "/api/fornecedores");
    expect(resposta.statusCode, resposta.body).toBe(200);
    expect(itens(resposta).length).toBeGreaterThan(0);
  });

  // ACEITE 2 e 5: o contrato operacional e exatamente tres campos — e o CPF nao esta no corpo, nem
  // escondido num campo com outro nome.
  it("Deve_DevolverSoIdEmpresaNome_Quando_ColaboradoresSaiPorPermissaoOperacional", async () => {
    const resposta = await listar(cookieOperacional, "/api/colaboradores");
    for (const item of itens(resposta)) {
      expect(Object.keys(item).sort()).toEqual([...CONTRATO_REDUZIDO].sort());
    }
    expect(resposta.body).not.toContain(CPF_DO_COLABORADOR);
  });

  // ACEITE 4 e 5: idem fornecedores. Aqui o vazamento era REAL antes desta entrega — a rota nao tinha
  // projecao nenhuma, e `despesas_visualizar`/`mercadorias_visualizar` ja recebiam o CNPJ inteiro.
  it("Deve_DevolverSoIdEmpresaNome_Quando_FornecedoresSaiPorPermissaoOperacional", async () => {
    const resposta = await listar(cookieOperacional, "/api/fornecedores");
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
    for (const item of itens(colaboradores)) {
      expect(Object.keys(item).sort()).toEqual([...CONTRATO_COMPLETO_COLABORADOR].sort());
    }
    expect(colaboradores.body).toContain(CPF_DO_COLABORADOR);

    const fornecedores = await listar(cookieCadastro, "/api/fornecedores");
    expect(fornecedores.statusCode, fornecedores.body).toBe(200);
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
