import { computed, effectScope, nextTick, ref, watch } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErroApiCliente } from "./useApi";
import { useProdutoFormulario, type ModoDoProduto } from "./useProdutoFormulario";

// O composable usa os auto-imports do Nuxt (ref, computed, watch, useApi): aqui eles entram como
// globais, e a API e um dublê que responde o minimo de cada rota.
const UNIDADES = [
  { id: "u-un", sigla: "un", nome: "Unidade" },
  { id: "u-kg", sigla: "kg", nome: "Quilograma" }
];
const GRUPOS = [
  { id: "g-leite", nome: "LEITE" },
  { id: "g-pao", nome: "PAO" }
];
const REGRAS = [
  { grupo: "LEITE", margemPadrao: 0.29 },
  { grupo: "PAO", margemPadrao: null }
];

let apiGet: ReturnType<typeof vi.fn>;
let apiPost: ReturnType<typeof vi.fn>;
let apiPut: ReturnType<typeof vi.fn>;

function respostaGet(detalhe: unknown) {
  return (rota: string) => {
    if (rota.startsWith("/api/unidades_medida")) return Promise.resolve(UNIDADES);
    if (rota.startsWith("/api/grupos")) return Promise.resolve({ gruposMercadorias: GRUPOS });
    if (rota.startsWith("/api/produtos/regras-fiscais")) return Promise.resolve({ disponivel: true, regras: REGRAS });
    return Promise.resolve(detalhe);
  };
}

beforeEach(() => {
  apiGet = vi.fn(respostaGet(null));
  apiPost = vi.fn();
  apiPut = vi.fn();
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("useApi", () => ({ apiGet, apiPost, apiPut, apiUrl: "" }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function montar(produtoId: string | null, modo: ModoDoProduto) {
  const escopo = effectScope();
  const formulario = escopo.run(() => useProdutoFormulario(ref("e1"), ref(produtoId), ref(modo)))!;
  return { formulario, escopo };
}

describe("useProdutoFormulario", () => {
  it("produto novo nasce com gramatura 0 e medida base KG da empresa", async () => {
    const { formulario, escopo } = montar(null, "base");
    await formulario.carregar();
    expect(formulario.form.value.quantidadeIndividual).toBe("0");
    expect(formulario.form.value.unidadeIndividualId).toBe("u-kg");
    escopo.stop();
  });

  it("trocar o grupo preenche a margem padrao dele; grupo sem margem nao mexe", async () => {
    const { formulario, escopo } = montar(null, "base");
    await formulario.carregar();

    formulario.form.value.grupoMercadoriaId = "g-leite";
    expect(formulario.form.value.margemPercentual).toBe("29");
    expect(formulario.margemDoGrupoPct.value).toBe("29");

    formulario.form.value.margemPercentual = "45";
    formulario.form.value.grupoMercadoriaId = "g-pao";
    expect(formulario.form.value.margemPercentual).toBe("45");
    expect(formulario.margemDoGrupoPct.value).toBeNull();
    escopo.stop();
  });

  it("abrir um produto NAO sobrescreve a margem gravada com a do grupo", async () => {
    apiGet = vi.fn(
      respostaGet({
        empresaId: "e1",
        descricao: "LEITE 1 L",
        nomeCatalogo: "LEITE",
        grupoMercadoriaId: "g-leite",
        margem: "0.5000",
        produtoBaseId: null,
        loja: "TNP",
        heranca: null
      })
    );
    const { formulario, escopo } = montar("p1", "loja");
    await formulario.carregar();
    await nextTick();
    expect(formulario.form.value.margemPercentual).toBe("50");
    escopo.stop();
  });

  it("salvar com erro diz o motivo e nao chama a API", async () => {
    const { formulario, escopo } = montar(null, "base");
    await formulario.carregar();
    const resultado = await formulario.salvar();
    expect(resultado).toBeNull();
    expect(formulario.erro.value).toBe("Informe o nome do produto.");
    expect(apiPost).not.toHaveBeenCalled();
    escopo.stop();
  });

  it("duplicado e reconhecido pelo CODIGO do erro (nome e codigo de barras)", async () => {
    apiPost = vi.fn().mockRejectedValue(new ErroApiCliente("Texto qualquer", 409, "DUPLICATE_BARCODE"));
    const { formulario, escopo } = montar(null, "base");
    await formulario.carregar();
    Object.assign(formulario.form.value, { nomeCatalogo: "Leite", grupoMercadoriaId: "g-leite" });
    await formulario.salvar();
    expect(formulario.duplicado.value).toBe("Texto qualquer");
    expect(formulario.erro.value).toBe("");
    escopo.stop();
  });

  it("editar a BASE informa quantas lojas foram atualizadas", async () => {
    apiGet = vi.fn(
      respostaGet({
        empresaId: "e1",
        descricao: "LEITE",
        nomeCatalogo: "LEITE",
        unidadeIndividualId: "u-un",
        grupoMercadoriaId: "g-leite",
        pesavel: false,
        produtoBaseId: null,
        loja: "BASE",
        heranca: null
      })
    );
    apiPut = vi.fn().mockResolvedValue({ id: "b1", lojasAtualizadas: 2 });
    const { formulario, escopo } = montar("b1", "base");
    await formulario.carregar();
    const resultado = await formulario.salvar();
    expect(apiPut.mock.calls[0]?.[0]).toBe("/api/produtos/base/b1");
    expect(apiPut.mock.calls[0]?.[1]).not.toHaveProperty("grupoIdExterno");
    expect(resultado).toEqual({ id: "b1", mensagem: "Produto salvo na base. 2 lojas atualizadas." });
    escopo.stop();
  });
});
