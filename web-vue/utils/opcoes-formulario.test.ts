import { describe, expect, it } from "vitest";
import {
  avisoOpcoesIndisponiveis,
  carregarOpcaoOpcional,
  carregarTodasOpcoesPaginadas,
  carregarTodasPaginas
} from "./opcoes-formulario";

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

describe("carregarTodasPaginas", () => {
  it("carrega todos os itens quando a lista ultrapassa uma pagina", async () => {
    const paginasPedidas: number[] = [];
    const itens = await carregarTodasPaginas(async (page, pageSize) => {
      paginasPedidas.push(page);
      return {
        itens: page === 1 ? [{ id: "pdv-1" }, { id: "pdv-2" }] : [{ id: "pdv-3" }],
        total: 3,
        page,
        pageSize
      };
    }, 2);

    expect(paginasPedidas).toEqual([1, 2]);
    expect(itens).toEqual([{ id: "pdv-1" }, { id: "pdv-2" }, { id: "pdv-3" }]);
  });

  it("preserva os filtros e percorre todas as paginas de um endpoint de opcoes", async () => {
    const urls: string[] = [];
    const itens = await carregarTodasOpcoesPaginadas(
      "/api/usuarios",
      { empresaId: "empresa-1", t: "123" },
      async (url) => {
        urls.push(url);
        const page = Number(new URL(url, "http://local").searchParams.get("page"));
        return {
          itens: page === 1 ? [{ id: "usuario-1" }, { id: "usuario-2" }] : [{ id: "usuario-3" }],
          total: 3,
          page,
          pageSize: 2
        };
      },
      2
    );

    expect(urls).toEqual([
      "/api/usuarios?empresaId=empresa-1&t=123&page=1&pageSize=2",
      "/api/usuarios?empresaId=empresa-1&t=123&page=2&pageSize=2"
    ]);
    expect(itens).toEqual([{ id: "usuario-1" }, { id: "usuario-2" }, { id: "usuario-3" }]);
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
