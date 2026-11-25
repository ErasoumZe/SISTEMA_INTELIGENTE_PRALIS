import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

describe("fornecedores integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_CriarEAtualizarFornecedor_Quando_EmpresaPermitida", async () => {
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/fornecedores",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: "Fornecedor criado por integracao",
        documento: "11.111.111/0001-11"
      }
    });
    expect(criado.statusCode).toBe(201);
    const fornecedorId = json<{ data: { id: string } }>(criado).data.id;

    const editado = await contexto.app.inject({
      method: "PUT",
      url: `/api/fornecedores/${fornecedorId}`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Fornecedor editado por integracao", documento: "11111111000111" }
    });
    expect(editado.statusCode).toBe(204);
    await expect(
      consultarUm("select id from fornecedores where id = $1 and nome = $2", [
        fornecedorId,
        "Fornecedor editado por integracao"
      ])
    ).resolves.toBeTruthy();
  });

  // R-219: fornecedor nasce ativo por default e a situacao faz round-trip na edicao.
  it("Deve_PersistirSituacao_Quando_InformadaNaCriacaoEEdicao", async () => {
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/fornecedores",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Fornecedor situacao" }
    });
    expect(criado.statusCode, criado.body).toBe(201);
    const id = json<{ data: { id: string } }>(criado).data.id;
    // Default: ativo.
    await expect(
      consultarUm("select id from fornecedores where id = $1 and situacao = 'ativo'", [id])
    ).resolves.toBeTruthy();

    const inativado = await contexto.app.inject({
      method: "PUT",
      url: `/api/fornecedores/${id}`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Fornecedor situacao", situacao: "inativo" }
    });
    expect(inativado.statusCode).toBe(204);
    await expect(
      consultarUm("select id from fornecedores where id = $1 and situacao = 'inativo'", [id])
    ).resolves.toBeTruthy();

    await executarSql("delete from fornecedores where id = $1", [id]);
  });

  async function criarFornecedor(nome: string): Promise<string> {
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/fornecedores",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome }
    });
    expect(criado.statusCode, criado.body).toBe(201);
    return json<{ data: { id: string } }>(criado).data.id;
  }
  function excluir(id: string, empresaId: string) {
    return contexto.app.inject({
      method: "DELETE",
      url: `/api/fornecedores/${id}?empresaId=${empresaId}`,
      headers: { cookie: cookieAdmin }
    });
  }

  // 25/11/2026: fornecedor sem historico sai do cadastro, com o catalogo dele junto.
  it("Deve_ExcluirFornecedor_Quando_NaoTemHistorico", async () => {
    const id = await criarFornecedor("Fornecedor sem historico");
    await executarSql(
      "insert into fornecedores_produtos (empresa_id, fornecedor_id, produto_id, origem) values ($1, $2, $3, 'compras')",
      [idsTeste.empresaA, id, idsTeste.produto]
    );

    const resposta = await excluir(id, idsTeste.empresaA);
    expect(resposta.statusCode, resposta.body).toBe(204);
    await expect(consultarUm("select id from fornecedores where id = $1", [id])).resolves.toBeNull();
    await expect(
      consultarUm("select id from fornecedores_produtos where fornecedor_id = $1", [id])
    ).resolves.toBeNull();
  });

  async function criarPedido(fornecedorId: string): Promise<string> {
    const pedido = await consultarUm<{ id: string }>(
      "insert into pedidos (empresa_id, fornecedor_id, criado_por) values ($1, $2, (select usuario_id from perfis_usuarios limit 1)) returning id",
      [idsTeste.empresaA, fornecedorId]
    );
    await executarSql(
      "insert into pedidos_eventos (empresa_id, pedido_id, status, criado_por) values ($1, $2, 'a_fazer', (select usuario_id from perfis_usuarios limit 1))",
      [idsTeste.empresaA, pedido!.id]
    );
    return pedido!.id;
  }

  // Decisao do Jose (25/11/2026): pedido que nunca foi recebido e "compra sem efeito" e sai junto.
  it("Deve_ExcluirJuntoPedidoNaoRecebido", async () => {
    const id = await criarFornecedor("Fornecedor com pedido nao recebido");
    const pedidoId = await criarPedido(id);

    const resposta = await excluir(id, idsTeste.empresaA);
    expect(resposta.statusCode, resposta.body).toBe(204);
    await expect(consultarUm("select id from fornecedores where id = $1", [id])).resolves.toBeNull();
    await expect(consultarUm("select id from pedidos where id = $1", [pedidoId])).resolves.toBeNull();
    await expect(consultarUm("select id from pedidos_eventos where pedido_id = $1", [pedidoId])).resolves.toBeNull();
  });

  // Pedido recebido ja mexeu no estoque: bloqueia, nomeia o motivo e orienta inativar. Nada e apagado.
  it("Deve_RecusarExclusao_Quando_TemPedidoRecebido", async () => {
    const id = await criarFornecedor("Fornecedor com pedido recebido");
    const pedidoId = await criarPedido(id);
    await executarSql(
      "insert into pedidos_recebimentos (empresa_id, pedido_id, idempotencia_chave, recebido_por) values ($1, $2, gen_random_uuid(), (select usuario_id from perfis_usuarios limit 1))",
      [idsTeste.empresaA, pedidoId]
    );

    const resposta = await excluir(id, idsTeste.empresaA);
    expect(resposta.statusCode).toBe(409);
    const corpo = json<{ code?: string; title?: string }>(resposta);
    expect(corpo.code).toBe("FORNECEDOR_EM_USO");
    expect(corpo.title).toContain("pedido recebido");
    expect(corpo.title).toContain("inativo");
    await expect(consultarUm("select id from fornecedores where id = $1", [id])).resolves.toBeTruthy();
    await expect(consultarUm("select id from pedidos where id = $1", [pedidoId])).resolves.toBeTruthy();

    await executarSql("delete from pedidos_recebimentos where pedido_id = $1", [pedidoId]);
    await executarSql("delete from pedidos_eventos where pedido_id = $1", [pedidoId]);
    await executarSql("delete from pedidos where id = $1", [pedidoId]);
    await executarSql("delete from fornecedores where id = $1", [id]);
  });

  // O id de um fornecedor de outra empresa nao apaga nada: a exclusao e sempre por (id, empresa).
  it("Deve_NaoExcluir_Quando_FornecedorEDeOutraEmpresa", async () => {
    const id = await criarFornecedor("Fornecedor da empresa A");
    const resposta = await excluir(id, idsTeste.empresaB);
    expect([403, 404]).toContain(resposta.statusCode);
    await expect(consultarUm("select id from fornecedores where id = $1", [id])).resolves.toBeTruthy();
    await executarSql("delete from fornecedores where id = $1", [id]);
  });
});

describe("fornecedores importacao/exportacao integration", () => {
  let contexto: ContextoApiTeste;
  let cookieMultiempresa: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieMultiempresa = await cookieSessao(contexto.app, "multiempresa");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_ImportarFornecedoresEntreEmpresasPermitidas", async () => {
    await executarSql("delete from fornecedores where empresa_id = $1 and importado_de = $2", [
      idsTeste.empresaB,
      idsTeste.empresaA
    ]);

    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/fornecedores/importar",
      headers: { cookie: cookieMultiempresa },
      payload: { empresaOrigemId: idsTeste.empresaA, empresaDestinoId: idsTeste.empresaB, modo: "completo" }
    });

    assertOk(resposta);
    expect(json<{ data: { inseridos: number } }>(resposta).data.inseridos).toBeGreaterThan(0);
    await expect(
      consultarUm("select id from fornecedores where empresa_id = $1 and importado_de = $2", [
        idsTeste.empresaB,
        idsTeste.empresaA
      ])
    ).resolves.toBeTruthy();
  });

  it("Deve_ExportarFornecedorParaEmpresaPermitida", async () => {
    await executarSql("delete from fornecedores where empresa_id = $1 and importado_de = $2 and id_importado = $3", [
      idsTeste.empresaB,
      idsTeste.empresaA,
      idsTeste.fornecedor
    ]);

    const resposta = await contexto.app.inject({
      method: "POST",
      url: `/api/fornecedores/${idsTeste.fornecedor}/exportar`,
      headers: { cookie: cookieMultiempresa },
      payload: { empresaDestinoId: idsTeste.empresaB, modo: "completo" }
    });

    assertOk(resposta);
    expect(json<{ data: { inseridos: number } }>(resposta).data.inseridos).toBe(1);
    await expect(
      consultarUm("select id from fornecedores where empresa_id = $1 and importado_de = $2 and id_importado = $3", [
        idsTeste.empresaB,
        idsTeste.empresaA,
        idsTeste.fornecedor
      ])
    ).resolves.toBeTruthy();
  });
});
