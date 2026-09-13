import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";

describe("contas integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieMultiempresa: string;
  const contaAtaqueEmpresaAId = randomUUID();
  const contaVitimaEmpresaBId = randomUUID();
  const usuarioEmpresaBId = `usuario-conta-cross-${randomUUID()}`;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    cookieMultiempresa = await cookieSessao(contexto.app, "multiempresa");
    await executarSql(
      `insert into perfis_usuarios (usuario_id, empresa_id, nome, email, role)
       values ($1, $2, 'Usuario Conta Empresa B', $3, 'usuario_comum')`,
      [usuarioEmpresaBId, idsTeste.empresaB, `${usuarioEmpresaBId}@teste.local`]
    );
    await executarSql("insert into usuarios_empresas (usuario_id, empresa_id) values ($1, $2)", [
      usuarioEmpresaBId,
      idsTeste.empresaB
    ]);
    await executarSql("insert into contas (id, empresa_id, nome) values ($1, $2, 'Conta vitima B')", [
      contaVitimaEmpresaBId,
      idsTeste.empresaB
    ]);
    await executarSql("insert into contas_usuarios (empresa_id, conta_id, usuario_id) values ($1, $2, $3)", [
      idsTeste.empresaB,
      contaVitimaEmpresaBId,
      usuarioEmpresaBId
    ]);
  }, 120_000);

  afterAll(async () => {
    try {
      await executarSql("delete from contas where id in ($1, $2)", [contaAtaqueEmpresaAId, contaVitimaEmpresaBId]);
      await executarSql("delete from perfis_usuarios where usuario_id = $1", [usuarioEmpresaBId]);
    } finally {
      await contexto.fechar();
    }
  });

  it("Deve_ListarECriarConta_Quando_EmpresaPermitida", async () => {
    const listagem = await contexto.app.inject({
      method: "GET",
      url: `/api/contas?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(listagem);
    expect(JSON.stringify(listagem.json())).toContain("Caixa Integracao");

    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Conta criada por integracao" }
    });
    expect(resposta.statusCode).toBe(201);

    const corpo = json<{ data: { id: string } }>(resposta);
    const conta = await consultarUm<{ nome: string; empresa_id: string }>(
      "select nome, empresa_id from contas where id = $1",
      [corpo.data.id]
    );
    expect(conta).toMatchObject({ nome: "Conta criada por integracao", empresa_id: idsTeste.empresaA });
  });

  it("Deve_Retornar403_Quando_AcessarOuSalvarContaEmEmpresaNaoPermitida", async () => {
    const listar = await contexto.app.inject({
      method: "GET",
      url: `/api/contas?empresaId=${idsTeste.empresaB}`,
      headers: { cookie: cookieAdmin }
    });
    const criar = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaB, nome: "Conta proibida" }
    });

    assertProblem(listar, 403, "FORBIDDEN_COMPANY");
    assertProblem(criar, 403, "FORBIDDEN_COMPANY");
  });

  it("Deve_RecusarSemCriar_Quando_PostDaEmpresaARecebeUsuarioExclusivoDaEmpresaB", async () => {
    const nome = `Conta cross-tenant ${randomUUID()}`;
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nome,
        usuariosIds: [usuarioEmpresaBId]
      }
    });

    assertProblem(resposta, 400, "USUARIO_EMPRESA_DIVERGENTE");
    await expect(consultarUm("select id from contas where nome = $1", [nome])).resolves.toBeNull();
  });

  it("Deve_RecusarSemAlterar_Quando_PutDaContaARecebeUsuarioExclusivoDaEmpresaB", async () => {
    await executarSql("insert into contas (id, empresa_id, nome) values ($1, $2, 'Conta ataque A')", [
      contaAtaqueEmpresaAId,
      idsTeste.empresaA
    ]);

    try {
      const resposta = await contexto.app.inject({
        method: "PUT",
        url: `/api/contas/${contaAtaqueEmpresaAId}`,
        headers: { cookie: cookieAdmin },
        payload: {
          empresaId: idsTeste.empresaA,
          nome: "Conta ataque A alterada",
          usuariosIds: [usuarioEmpresaBId]
        }
      });

      assertProblem(resposta, 400, "USUARIO_EMPRESA_DIVERGENTE");
      await expect(
        consultarUm<{ nome: string }>("select nome from contas where id = $1", [contaAtaqueEmpresaAId])
      ).resolves.toMatchObject({ nome: "Conta ataque A" });
      await expect(
        consultarUm("select id from contas_usuarios where conta_id = $1", [contaAtaqueEmpresaAId])
      ).resolves.toBeNull();
    } finally {
      await executarSql("delete from contas where id = $1", [contaAtaqueEmpresaAId]);
    }
  });

  it("Deve_Retornar404SemApagarVinculo_Quando_PutDisfarcaContaDaEmpresaBComoEmpresaA", async () => {
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/contas/${contaVitimaEmpresaBId}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: "Conta vitima adulterada",
        usuariosIds: []
      }
    });

    assertProblem(resposta, 404, "CONTA_NAO_ENCONTRADA");
    await expect(
      consultarUm<{ empresa_id: string; usuario_id: string }>(
        "select empresa_id, usuario_id from contas_usuarios where conta_id = $1",
        [contaVitimaEmpresaBId]
      )
    ).resolves.toMatchObject({ empresa_id: idsTeste.empresaB, usuario_id: usuarioEmpresaBId });
    await expect(
      consultarUm<{ nome: string }>("select nome from contas where id = $1", [contaVitimaEmpresaBId])
    ).resolves.toMatchObject({ nome: "Conta vitima B" });
  });

  it("Deve_Retornar403_Quando_UsuarioNaoTemPermissaoDeListagem", async () => {
    const cookie = await cookieSessao(contexto.app, "semPermissao");

    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/contas?empresaId=${idsTeste.empresaA}`,
      headers: { cookie }
    });

    assertProblem(resposta, 403, "INSUFFICIENT_PERMISSION");
  });

  it("Deve_Retornar403_Quando_ImportarOuExportarContaParaEmpresaNaoPermitida", async () => {
    const importar = await contexto.app.inject({
      method: "POST",
      url: "/api/contas/importar",
      headers: { cookie: cookieAdmin },
      payload: { empresaOrigemId: idsTeste.empresaA, empresaDestinoId: idsTeste.empresaB, modo: "simples" }
    });
    const exportar = await contexto.app.inject({
      method: "POST",
      url: `/api/contas/${idsTeste.contaCaixa}/exportar`,
      headers: { cookie: cookieAdmin },
      payload: { empresaDestinoId: idsTeste.empresaB, modo: "simples" }
    });

    assertProblem(importar, 403);
    assertProblem(exportar, 403);
  });

  it("Deve_ImportarContasEntreEmpresasPermitidas_Quando_UsuarioTemAcessoMultiempresa", async () => {
    await executarSql("delete from contas where empresa_id = $1 and importado_de = $2", [
      idsTeste.empresaB,
      idsTeste.empresaA
    ]);

    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas/importar",
      headers: { cookie: cookieMultiempresa },
      payload: { empresaOrigemId: idsTeste.empresaA, empresaDestinoId: idsTeste.empresaB, modo: "simples" }
    });

    assertOk(resposta);
    // 5 contas semeadas em A (Caixa/Banco/Livre + Cofre do M1 + Entradas do D7) + a "Conta criada
    // por integracao" criada no primeiro teste deste arquivo = 6.
    expect(resposta.json()).toMatchObject({ data: { tipo: "contas", inseridos: 6 } });

    const contasCopiadas = await consultarTodos<{ nome: string; importado_de: string; id_importado: string }>(
      "select nome, importado_de, id_importado from contas where empresa_id = $1 and importado_de = $2 order by nome",
      [idsTeste.empresaB, idsTeste.empresaA]
    );
    expect(contasCopiadas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nome: "Caixa Integracao",
          importado_de: idsTeste.empresaA,
          id_importado: idsTeste.contaCaixa
        }),
        expect.objectContaining({
          nome: "Banco Integracao",
          importado_de: idsTeste.empresaA,
          id_importado: idsTeste.contaBanco
        }),
        expect.objectContaining({
          nome: "Conta Livre Integracao",
          importado_de: idsTeste.empresaA,
          id_importado: idsTeste.contaLivre
        }),
        expect.objectContaining({
          nome: "Cofre Integracao",
          importado_de: idsTeste.empresaA,
          id_importado: idsTeste.contaCofre
        })
      ])
    );
  });

  it("Deve_ExportarContaParaEmpresaPermitida_Quando_UsuarioTemAcessoMultiempresa", async () => {
    await executarSql("delete from contas where empresa_id = $1 and importado_de = $2 and id_importado = $3", [
      idsTeste.empresaB,
      idsTeste.empresaA,
      idsTeste.contaBanco
    ]);

    const resposta = await contexto.app.inject({
      method: "POST",
      url: `/api/contas/${idsTeste.contaBanco}/exportar`,
      headers: { cookie: cookieMultiempresa },
      payload: { empresaDestinoId: idsTeste.empresaB, modo: "simples" }
    });

    assertOk(resposta);
    expect(resposta.json()).toMatchObject({ data: { tipo: "contas", inseridos: 1 } });
    await expect(
      consultarUm("select id from contas where empresa_id = $1 and importado_de = $2 and id_importado = $3", [
        idsTeste.empresaB,
        idsTeste.empresaA,
        idsTeste.contaBanco
      ])
    ).resolves.toBeTruthy();
  });
});
