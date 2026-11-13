import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql } from "../../setup/integracao.js";

type ContaPosto = {
  usuarioId: string;
  posto: string;
  cargoId: string | null;
  cargoNome: string | null;
  acessoIndividual: boolean;
};
type Resumo = {
  cargos: { id: string; nome: string; temPadrao: boolean; aceitaContaPosto: boolean }[];
  padroesFaltando: string[];
  contasPosto: ContaPosto[];
};

// Aba "Cargos" de Permissoes (Marco, 13/11/2026): restaurar o padrao do cargo ja existia so na API; aqui
// entram a lista, criar o cargo de referencia que falta ("Caixa Gerente", R-238), trocar o cargo da conta
// de posto do Caixa e fazer a conta voltar a seguir so o cargo.
describe("permissoes: cargos de acesso", () => {
  const empresaId = idsTeste.empresaA;
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieCaixa: string;
  let usuarioPosto: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    [cookieAdmin, cookieCaixa] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "caixa")
    ]);
    // Conta de posto propria, num PDV proprio: nao mexe nas contas que os outros testes usam.
    const sufixo = Date.now();
    const email = `qa.posto.cargos.${sufixo}@padaria.local`;
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/usuarios",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId,
        nome: `PDV QA ${sufixo} · Tarde`,
        email,
        senha: "QaCargos#2026!",
        role: "usuario_comum",
        novoColaborador: { empresaId, nome: `PDV QA ${sufixo} Tarde`, cargoId: idsTeste.cargoCaixa }
      }
    });
    expect([200, 201], criado.body).toContain(criado.statusCode);
    const perfil = await consultarUm<{ usuario_id: string }>(
      "select usuario_id from perfis_usuarios where lower(email) = lower($1)",
      [email]
    );
    usuarioPosto = perfil!.usuario_id;
    const contaPdv = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId, nome: `Conta PDV QA ${sufixo}` }
    });
    expect(contaPdv.statusCode, contaPdv.body).toBe(201);
    const pdvCriado = await contexto.app.inject({
      method: "POST",
      url: "/api/pdvs",
      headers: { cookie: cookieAdmin },
      payload: { empresaId, nome: `PDV QA ${sufixo}`, contaId: contaPdv.json().data.id, ativo: true }
    });
    expect(pdvCriado.statusCode, pdvCriado.body).toBe(201);
    const pdv = { id: pdvCriado.json().data.id as string };
    await executarSql("update colaboradores set pdv_padrao_id = $1, turno_caixa = 'tarde' where usuario_id = $2", [
      pdv.id,
      usuarioPosto
    ]);
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  async function resumo(): Promise<Resumo> {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/permissoes/cargos-acesso?empresaId=${empresaId}`,
      headers: { cookie: cookieAdmin }
    });
    expect(resposta.statusCode, resposta.body).toBe(200);
    return resposta.json().data as Resumo;
  }

  const conta = async () => (await resumo()).contasPosto.find((item) => item.usuarioId === usuarioPosto);

  function chamar(method: "POST" | "PUT", url: string, payload: object, cookie = cookieAdmin) {
    return contexto.app.inject({ method, url, headers: { cookie }, payload });
  }

  it("quem nao cuida de permissoes nao ve nem mexe", async () => {
    const lista = await contexto.app.inject({
      method: "GET",
      url: `/api/permissoes/cargos-acesso?empresaId=${empresaId}`,
      headers: { cookie: cookieCaixa }
    });
    expect(lista.statusCode).toBe(403);
    const troca = await chamar(
      "PUT",
      `/api/permissoes/contas-posto/${usuarioPosto}/cargo`,
      { empresaId, cargoId: idsTeste.cargoGerente },
      cookieCaixa
    );
    expect(troca.statusCode).toBe(403);
  });

  it("lista os cargos e a conta de posto com o cargo atual", async () => {
    const dados = await resumo();
    expect(dados.cargos.length).toBeGreaterThan(0);
    expect(await conta()).toMatchObject({ cargoId: idsTeste.cargoCaixa, acessoIndividual: false });
    expect((await conta())?.posto).toMatch(/· Tarde$/u);
  });

  it("cria o Caixa Gerente com o padrao e nao deixa criar duas vezes", async () => {
    if ((await resumo()).padroesFaltando.includes("Caixa Gerente")) {
      const criado = await chamar("POST", "/api/permissoes/cargos-acesso/padrao", { empresaId, nome: "caixa gerente" });
      expect(criado.statusCode, criado.body).toBe(201);
      expect(criado.json().data.nome).toBe("Caixa Gerente");
    }
    const dados = await resumo();
    expect(dados.padroesFaltando).not.toContain("Caixa Gerente");
    const gerente = dados.cargos.find((cargo) => cargo.nome === "Caixa Gerente");
    expect(gerente?.temPadrao).toBe(true);
    const regras = await consultarUm<{ regras: Record<string, boolean> }>(
      "select regras from permissoes_cargos where cargo_id = $1",
      [gerente!.id]
    );
    expect(regras!.regras["entradas_visualizar"]).toBe(true);

    const repetido = await chamar("POST", "/api/permissoes/cargos-acesso/padrao", { empresaId, nome: "Caixa Gerente" });
    expect(repetido.statusCode).toBe(409);
    const semPadrao = await chamar("POST", "/api/permissoes/cargos-acesso/padrao", {
      empresaId,
      nome: "Cargo Inventado"
    });
    expect(semPadrao.statusCode).toBe(400);
  });

  it("troca o cargo da conta de posto: um cargo ativo so, e o acesso muda", async () => {
    const gerente = (await resumo()).cargos.find((cargo) => cargo.nome === "Caixa Gerente")!;
    const troca = await chamar("PUT", `/api/permissoes/contas-posto/${usuarioPosto}/cargo`, {
      empresaId,
      cargoId: gerente.id
    });
    expect(troca.statusCode, troca.body).toBe(200);
    expect(await conta()).toMatchObject({ cargoId: gerente.id, cargoNome: "Caixa Gerente" });

    const ativos = await consultarTodos<{ cargo_id: string }>(
      `select cc.cargo_id from colaboradores_cargos cc join colaboradores c on c.id = cc.colaborador_id
       where c.usuario_id = $1 and cc.ativo`,
      [usuarioPosto]
    );
    expect(ativos.map((linha) => linha.cargo_id)).toEqual([gerente.id]);

    // Trocar para o mesmo cargo nao cria linha nova.
    expect(
      (await chamar("PUT", `/api/permissoes/contas-posto/${usuarioPosto}/cargo`, { empresaId, cargoId: gerente.id }))
        .statusCode
    ).toBe(200);
    const total = await consultarUm<{ total: number }>(
      `select count(*)::int total from colaboradores_cargos cc join colaboradores c on c.id = cc.colaborador_id where c.usuario_id = $1`,
      [usuarioPosto]
    );
    expect(total!.total).toBe(2);
  });

  it("acesso individual aparece e some com Seguir so o cargo", async () => {
    const salvo = await chamar("POST", "/api/permissoes", {
      tipoPermissao: "usuario",
      usuarioId: usuarioPosto,
      regras: { entradas_visualizar: false }
    });
    expect([200, 201]).toContain(salvo.statusCode);
    expect((await conta())?.acessoIndividual).toBe(true);

    const seguir = await chamar("POST", `/api/permissoes/contas-posto/${usuarioPosto}/seguir-cargo`, { empresaId });
    expect(seguir.statusCode, seguir.body).toBe(200);
    expect((await conta())?.acessoIndividual).toBe(false);
    const linha = await consultarUm("select 1 from permissoes_usuarios where usuario_id = $1", [usuarioPosto]);
    expect(linha).toBeFalsy();
  });

  it("conta de posto nao recebe cargo que da poder pelo nome", async () => {
    const tesouraria = await consultarUm<{ id: string }>("select id from cargos where id = $1", [
      idsTeste.cargoTesouraria
    ]);
    const troca = await chamar("PUT", `/api/permissoes/contas-posto/${usuarioPosto}/cargo`, {
      empresaId,
      cargoId: tesouraria!.id
    });
    expect(troca.statusCode).toBe(400);
    expect(troca.body).toContain("CARGO_NAO_E_DE_POSTO");
    const lista = await resumo();
    expect(lista.cargos.find((cargo) => cargo.id === idsTeste.cargoTesouraria)?.aceitaContaPosto).toBe(false);
  });

  it("conta que nao e de posto nao muda de cargo por aqui", async () => {
    const gerente = await consultarUm<{ usuario_id: string }>(
      "select usuario_id from perfis_usuarios where lower(email) = lower($1)",
      [usuariosTeste.gerente.email]
    );
    const troca = await chamar("PUT", `/api/permissoes/contas-posto/${gerente!.usuario_id}/cargo`, {
      empresaId,
      cargoId: (await resumo()).cargos.find((cargo) => cargo.nome === "Caixa Gerente")!.id
    });
    expect(troca.statusCode).toBe(400);
    expect(troca.body).toContain("CONTA_SEM_POSTO");
  });

  it("empresa de fora e cargo de outra empresa sao recusados", async () => {
    const outraEmpresa = await contexto.app.inject({
      method: "GET",
      url: `/api/permissoes/cargos-acesso?empresaId=${idsTeste.empresaB}`,
      headers: { cookie: cookieAdmin }
    });
    expect([200, 403]).toContain(outraEmpresa.statusCode);
    const cargoB = await consultarUm<{ id: string }>("select id from cargos where empresa_id = $1 limit 1", [
      idsTeste.empresaB
    ]);
    if (cargoB) {
      const troca = await chamar("PUT", `/api/permissoes/contas-posto/${usuarioPosto}/cargo`, {
        empresaId,
        cargoId: cargoB.id
      });
      expect(troca.statusCode).toBe(404);
    }
  });
});
