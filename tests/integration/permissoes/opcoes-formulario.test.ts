import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste, type PerfilTeste } from "../../setup/contexto.js";
import { consultarUm } from "../../setup/integracao.js";

// PR3 (bugs 1 e 2 do QA de 15/07): rotas de listagem consumidas como OPCOES de formulario deixaram
// de exigir apenas cadastro_X_visualizar e passaram a aceitar quem OPERA o lancamento correspondente
// (exigirAlgumaPermissao). Assim o operador de caixa abre o modal de caixa (turnos/colaboradores/
// contas) e as telas operacionais carregam suas opcoes. Esta suite prova o gate por rota x perfil do
// seed: quem tem UMA das permissoes aceitas -> 200; quem nao tem nenhuma -> 403 (nao viramos rota
// aberta). Segue o padrao ja existente de /api/pdvs e /api/malotes.
//
// Permissoes do seed (setup/seed.ts) usadas aqui:
//   caixa        -> caixa_operar + despesas/mercadorias/retiradas (visualizar/criar/editar)
//   discriminador-> despesas_visualizar, mercadorias_visualizar
//   tesouraria   -> transferencias_visualizar
//   semPermissao -> (nenhuma)
//
// ATUALIZADO em 01/08/2026 (R-121): o operador de caixa PASSOU a enxergar grupos, fornecedores e
// produtos. Nao e afrouxamento de gate — o fixture e que estava divergente da producao (so tinha 4
// permissoes) e fazia o teste "provar" que o operador nao ve as opcoes do proprio formulario. Sem
// elas, o modal de despesa do operador abre com Grupo e Fornecedor vazios. `semPermissao` continua
// sendo o negativo de verdade.
//
// ATUALIZADO em 10/08/2026 (B-1, decisao do Jose): `/api/colaboradores` passou a aceitar tambem
// `despesas_visualizar`, porque a despesa oferece Colaborador como credor e o chip abria um select
// vazio para quem so lanca. O `discriminador` (que tem `despesas_visualizar`) saiu de `nega` e entrou
// em `permite` — a mudanca e da DECISAO, nao do teste cedendo. O que ele passa a receber e a projecao
// reduzida `{id, empresaId, nome}`, provada em `credores-projecao-reduzida.test.ts`; aqui so o gate.
// `semPermissao` continua sendo o negativo de verdade nas duas rotas.

const query = `?empresaId=${idsTeste.empresaA}`;

// Para cada rota: perfis do seed que DEVEM passar (tem uma permissao aceita) e que DEVEM ser barrados.
const rotas: Array<{ rota: string; permite: PerfilTeste[]; nega: PerfilTeste[] }> = [
  { rota: "/api/turnos", permite: ["caixa"], nega: ["discriminador", "semPermissao"] },
  { rota: "/api/contas", permite: ["caixa", "discriminador", "tesouraria"], nega: ["semPermissao"] },
  { rota: "/api/colaboradores", permite: ["caixa", "discriminador"], nega: ["semPermissao"] },
  { rota: "/api/grupos", permite: ["discriminador", "caixa"], nega: ["semPermissao"] },
  { rota: "/api/fornecedores", permite: ["discriminador", "caixa"], nega: ["semPermissao"] },
  { rota: "/api/produtos", permite: ["discriminador", "caixa"], nega: ["semPermissao"] }
];

const permitidos = rotas.flatMap(({ rota, permite }) => permite.map((perfil) => ({ rota, perfil })));
const negados = rotas.flatMap(({ rota, nega }) => nega.map((perfil) => ({ rota, perfil })));

describe("opcoes de formulario: gate por permissao de operacao (exigirAlgumaPermissao)", () => {
  let contexto: ContextoApiTeste;
  const cookies = new Map<PerfilTeste, string>();

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    for (const perfil of ["admin", "caixa", "discriminador", "tesouraria", "semPermissao"] as const) {
      cookies.set(perfil, await cookieSessao(contexto.app, perfil));
    }
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it.each(permitidos)("$rota: perfil que opera ($perfil) enxerga a lista (200)", async ({ rota, perfil }) => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `${rota}${query}`,
      headers: { cookie: cookies.get(perfil)! }
    });
    expect(resposta.statusCode, resposta.body).toBe(200);
  });

  it.each(negados)("$rota: perfil sem permissao aceita ($perfil) continua barrado (403)", async ({ rota, perfil }) => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `${rota}${query}`,
      headers: { cookie: cookies.get(perfil)! }
    });
    assertProblem(resposta, 403, "INSUFFICIENT_PERMISSION");
  });

  // formas_pagamento aceita entradas_visualizar (o operador de caixa ve o nome da forma no detalhe
  // da venda, na tela de Entradas) e relatorio_vendas_visualizar (filtro do relatorio). O caixa tem
  // entradas_visualizar -> 200; semPermissao -> 403. O grant por relatorio_vendas_visualizar e
  // provado a parte, concedendo a um usuario na camada usuario e re-logando.
  it("/api/formas_pagamento: caixa enxerga (entradas_visualizar); sem permissao barra; libera relatorio_vendas", async () => {
    const caixa = await contexto.app.inject({
      method: "GET",
      url: `/api/formas_pagamento${query}`,
      headers: { cookie: cookies.get("caixa")! }
    });
    expect(caixa.statusCode, caixa.body).toBe(200);

    const barrado = await contexto.app.inject({
      method: "GET",
      url: `/api/formas_pagamento${query}`,
      headers: { cookie: cookies.get("semPermissao")! }
    });
    assertProblem(barrado, 403, "INSUFFICIENT_PERMISSION");

    const alvo = await consultarUm<{ usuario_id: string }>("select usuario_id from perfis_usuarios where email = $1", [
      usuariosTeste.tesouraria.email
    ]);
    const concessao = await contexto.app.inject({
      method: "POST",
      url: "/api/permissoes",
      headers: { cookie: cookies.get("admin")! },
      payload: {
        tipoPermissao: "usuario",
        usuarioId: alvo!.usuario_id,
        regras: { relatorio_vendas_visualizar: true }
      }
    });
    expect([200, 201]).toContain(concessao.statusCode);

    // Re-login para o perfil da sessao recomputar as permissoes efetivas.
    const cookieAtualizado = await cookieSessao(contexto.app, "tesouraria");
    const liberado = await contexto.app.inject({
      method: "GET",
      url: `/api/formas_pagamento${query}`,
      headers: { cookie: cookieAtualizado }
    });
    expect(liberado.statusCode, liberado.body).toBe(200);
  });
});
