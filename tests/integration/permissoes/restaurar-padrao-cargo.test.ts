import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql } from "../../setup/integracao.js";

// Auditoria item 3: regras "false" salvas na UI nunca sao restauradas pelo bootstrap (merge preserva
// o banco). O endpoint "restaurar padrao do cargo" REAPLICA a referencia (REPLACE), religando o que
// foi desligado. So vale para cargos com nome conhecido (casado por nome normalizado).
describe("permissoes: restaurar padrao do cargo", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  async function criarCargo(nome: string, regras: Record<string, boolean>): Promise<string> {
    const cargo = await consultarUm<{ id: string }>(
      `insert into cargos (empresa_id, nome) values ($1, $2) returning id`,
      [idsTeste.empresaA, nome]
    );
    const id = cargo!.id;
    await executarSql(`insert into permissoes_cargos (cargo_id, regras) values ($1, $2)`, [id, JSON.stringify(regras)]);
    return id;
  }

  function restaurar(cargoId: string) {
    return contexto.app.inject({
      method: "POST",
      url: `/api/permissoes/cargo/${cargoId}/restaurar-padrao`,
      headers: { cookie: cookieAdmin }
    });
  }

  it("reaplica o padrao (REPLACE), religando permissoes que a UI havia desligado", async () => {
    // "Gerencia" (casa com a referencia) com permissoes criticas DESLIGADAS (regra false).
    const cargoId = await criarCargo("Gerencia", { mercadorias_aprovar: false, entradas_visualizar: false });
    expect((await restaurar(cargoId)).statusCode).toBe(200);

    const linha = await consultarUm<{ regras: Record<string, boolean> }>(
      `select regras from permissoes_cargos where cargo_id = $1`,
      [cargoId]
    );
    expect(linha!.regras["mercadorias_aprovar"]).toBe(true);
    expect(linha!.regras["entradas_visualizar"]).toBe(true);
  });

  it("casa mesmo com acento/caixa diferentes no nome do cargo", async () => {
    const cargoId = await criarCargo("Financeiro", { notas_fiscais_importar: false });
    expect((await restaurar(cargoId)).statusCode).toBe(200);
    const linha = await consultarUm<{ regras: Record<string, boolean> }>(
      `select regras from permissoes_cargos where cargo_id = $1`,
      [cargoId]
    );
    expect(linha!.regras["notas_fiscais_importar"]).toBe(true);
  });

  it("rejeita cargo sem padrao de referencia", async () => {
    const cargoId = await criarCargo("Cargo Custom Sem Referencia", {});
    expect((await restaurar(cargoId)).statusCode).toBeGreaterThanOrEqual(400);
  });
});
