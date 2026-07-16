import { describe, expect, it } from "vitest";
import { avisoOpcoesIndisponiveis, carregarOpcaoOpcional } from "./opcoes-formulario";

describe("carregarOpcaoOpcional", () => {
  it("devolve o valor carregado e nao registra falta quando a carga tem sucesso", async () => {
    const faltas: string[] = [];
    const valor = await carregarOpcaoOpcional(faltas, "Contas", async () => [{ id: "1" }], []);
    expect(valor).toEqual([{ id: "1" }]);
    expect(faltas).toEqual([]);
  });

  it("devolve o vazio e registra a falta quando a carga rejeita (ex.: 403)", async () => {
    const faltas: string[] = [];
    const valor = await carregarOpcaoOpcional(
      faltas,
      "Produtos",
      async () => {
        throw new Error("Permissao insuficiente");
      },
      []
    );
    expect(valor).toEqual([]);
    expect(faltas).toEqual(["Produtos"]);
  });

  it("uma falha parcial nao impede as demais listas de carregarem", async () => {
    const faltas: string[] = [];
    const [contas, produtos, formas] = await Promise.all([
      carregarOpcaoOpcional(faltas, "Contas", async () => ["c"], []),
      carregarOpcaoOpcional(
        faltas,
        "Produtos",
        async () => {
          throw new Error("403");
        },
        []
      ),
      carregarOpcaoOpcional(faltas, "Formas de pagamento", async () => ["f"], [])
    ]);
    expect(contas).toEqual(["c"]);
    expect(produtos).toEqual([]);
    expect(formas).toEqual(["f"]);
    expect(faltas).toEqual(["Produtos"]);
  });

  it("preserva o objeto vazio informado para listas nao-array (ex.: grupos)", async () => {
    const faltas: string[] = [];
    const vazio = { gruposDespesas: [], gruposMercadorias: [], gruposRetiradas: [] };
    const valor = await carregarOpcaoOpcional(
      faltas,
      "Grupos",
      async () => {
        throw new Error("403");
      },
      vazio
    );
    expect(valor).toBe(vazio);
    expect(faltas).toEqual(["Grupos"]);
  });
});

describe("avisoOpcoesIndisponiveis", () => {
  it("retorna string vazia quando nada faltou", () => {
    expect(avisoOpcoesIndisponiveis([])).toBe("");
  });

  it("lista as faltas de forma deduplicada", () => {
    const aviso = avisoOpcoesIndisponiveis(["Contas", "Produtos", "Contas"]);
    expect(aviso).toContain("Contas");
    expect(aviso).toContain("Produtos");
    // deduplicada: "Contas" aparece uma unica vez
    expect(aviso.match(/Contas/g)).toHaveLength(1);
  });
});
