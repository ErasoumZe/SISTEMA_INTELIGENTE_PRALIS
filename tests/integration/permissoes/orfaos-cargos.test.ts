import { describe, expect, it } from "vitest";
import { permissoesPorCargo } from "@padaria/db/referencia-permissoes";

// Auditoria de permissoes: garante que permissoes exigidas por rotas NAO fiquem orfas (exigidas
// pela API, mas concedidas por nenhum cargo — so o admin passava e os botoes davam 403). Trava os
// seis orfaos corrigidos na referencia de PRODUCAO (db/src/referencia-permissoes.ts). O seed dev
// (db/seed.ts) e mantido em paridade manual; se um mudar, o outro tem de acompanhar.
describe("permissoes: matriz de orfaos por cargo (referencia de producao)", () => {
  const cargo = (nome: string) => new Set(permissoesPorCargo[nome] ?? []);

  it("Gerencia concede as acoes de retaguarda que antes eram orfas", () => {
    const gerencia = cargo("Gerencia");
    for (const permissao of [
      "mercadorias_aprovar",
      "pedidos_aprovar",
      "notas_fiscais_importar",
      "despesas_editar",
      "retiradas_editar",
      "transferencias_editar"
    ] as const) {
      expect(gerencia.has(permissao), `Gerencia deveria conceder ${permissao}`).toBe(true);
    }
  });

  it("Financeiro concede importacao de NF-e e as edicoes de lancamento", () => {
    const financeiro = cargo("Financeiro");
    for (const permissao of [
      "notas_fiscais_importar",
      "despesas_editar",
      "retiradas_editar",
      "transferencias_editar"
    ] as const) {
      expect(financeiro.has(permissao), `Financeiro deveria conceder ${permissao}`).toBe(true);
    }
  });

  it("nenhuma acao critica de rota fica orfa (concedida por ao menos um cargo nao-admin)", () => {
    // Permissoes que uma ROTA valida e que precisam existir em algum cargo comum (fora o usuario_admin).
    const acoesCriticas = [
      "mercadorias_aprovar",
      "pedidos_aprovar",
      "notas_fiscais_importar",
      "despesas_editar",
      "retiradas_editar",
      "transferencias_editar",
      "mercadorias_discriminar",
      "despesas_discriminar",
      "caixa_alterar_horario"
    ] as const;
    const concedidas = new Set<string>(Object.values(permissoesPorCargo).flat());
    const orfas = acoesCriticas.filter((permissao) => !concedidas.has(permissao));
    expect(orfas, `Permissoes orfas (nenhum cargo concede): ${orfas.join(", ")}`).toEqual([]);
  });
});
