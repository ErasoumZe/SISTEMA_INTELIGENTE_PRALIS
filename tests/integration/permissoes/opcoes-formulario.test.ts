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
//   caixa        -> caixa_operar
//   discriminador-> despesas_visualizar, mercadorias_visualizar
//   tesouraria   -> transferencias_visualizar
//   semPermissao -> (nenhuma)

const query = `?empresaId=${idsTeste.empresaA}`;

// Para cada rota: perfis do seed que DEVEM passar (tem uma permissao aceita) e que DEVEM ser barrados.
const rotas: Array<{ rota: string; permite: PerfilTeste[]; nega: PerfilTeste[] }> = [
  { rota: "/api/turnos", permite: ["caixa"], nega: ["discriminador", "semPermissao"] },
  { rota: "/api/contas", permite: ["caixa", "discriminador", "tesouraria"], nega: ["semPermissao"] },
  { rota: "/api/colaboradores", permite: ["caixa"], nega: ["discriminador", "semPermissao"] },
  { rota: "/api/grupos", permite: ["discriminador"], nega: ["caixa", "semPermissao"] },
  { rota: "/api/fornecedores", permite: ["discriminador"], nega: ["caixa", "semPermissao"] },
  { rota: "/api/produtos", permite: ["discriminador"], nega: ["caixa", "semPermissao"] }
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

  // formas_pagamento aceita relatorio_vendas_visualizar (filtro do relatorio de vendas). Nenhum perfil
  // do seed isola essa permissao, entao concedemos a um usuario na camada usuario e re-logamos para
  // provar o grant positivo — sem depender do admin (que passa por ter tudo).
  it("/api/formas_pagamento: barra sem permissao e libera com relatorio_vendas_visualizar", async () => {
    for (const perfil of ["caixa", "semPermissao"] as const) {
      const barrado = await contexto.app.inject({
        method: "GET",
        url: `/api/formas_pagamento${query}`,
        headers: { cookie: cookies.get(perfil)! }
      });
      assertProblem(barrado, 403, "INSUFFICIENT_PERMISSION");
    }

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
