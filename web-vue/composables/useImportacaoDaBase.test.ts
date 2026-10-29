import { computed, effectScope, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useImportacaoDaBase, type ProdutoBase } from "./useImportacaoDaBase";

const linha = (id: string, nome: string): ProdutoBase => ({
  id,
  idOrigem: id,
  codigoInterno: null,
  codigoBarras: null,
  nome,
  status: "ativo",
  grupoIdOrigem: null,
  dadosOficiais: {},
  atualizadoEm: "",
  jaImportado: false
});

let apiPost: ReturnType<typeof vi.fn>;

beforeEach(() => {
  apiPost = vi.fn();
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("useApi", () => ({ apiPost }));
  vi.stubGlobal("confirm", () => true);
});
afterEach(() => vi.unstubAllGlobals());

function montar(empresaId = "loja-b") {
  const itens = ref<ProdutoBase[]>([linha("1", "UM"), linha("2", "DOIS")]);
  const empresa = ref(empresaId);
  const recarregar = vi.fn().mockResolvedValue(undefined);
  const escopo = effectScope();
  const importacao = escopo.run(() => useImportacaoDaBase({ empresaId: empresa, itens, recarregar }))!;
  return { importacao, itens, escopo };
}

describe("importar da BASE", () => {
  it("a selecao atravessa as paginas e o lote vai para a empresa ATIVA", async () => {
    const { importacao, itens, escopo } = montar("loja-b");
    importacao.selecionarPagina(true);
    expect(importacao.paginaToda.value).toBe(true);

    itens.value = [linha("3", "TRES")]; // trocou de pagina
    expect(importacao.idsSelecionados.value).toEqual(["1", "2"]);
    expect(importacao.paginaToda.value).toBe(false);
    importacao.selecionar(linha("3", "TRES"), true);

    apiPost.mockResolvedValue({
      total: 3,
      importados: 3,
      jaImportados: 0,
      ignorados: 0,
      bloqueados: 0,
      naoEncontrados: 0,
      erros: 0,
      itens: [{ produtoBaseId: "3", estado: "importado" }]
    });
    await importacao.copiarSelecionados("Loja B");
    expect(apiPost).toHaveBeenCalledWith("/api/produtos/catalogo-base/importar", {
      empresaId: "loja-b",
      produtoBaseIds: ["1", "2", "3"]
    });
    expect(importacao.lote.value?.itens[0]?.nome).toBe("TRES");
    expect(importacao.idsSelecionados.value).toEqual([]);
    escopo.stop();
  });

  it("sem loja de destino avisa em vez de nao fazer nada", async () => {
    const { importacao, escopo } = montar("");
    await importacao.copiarUm(linha("1", "UM"), "a loja ativa");
    expect(apiPost).not.toHaveBeenCalled();
    expect(importacao.aviso.value).toContain("Escolha a loja de destino");
    escopo.stop();
  });

  it("desmarcar a pagina tira so a pagina, nao o que veio das outras", () => {
    const { importacao, itens, escopo } = montar();
    importacao.selecionar(linha("9", "NOVE"), true);
    importacao.selecionarPagina(true);
    importacao.selecionarPagina(false);
    expect(importacao.idsSelecionados.value).toEqual(["9"]);
    expect(itens.value).toHaveLength(2);
    escopo.stop();
  });
});
