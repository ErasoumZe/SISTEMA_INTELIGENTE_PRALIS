import { computed, effectScope, nextTick, onScopeDispose, ref, watch } from "vue";
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
  { id: "g-pao", nome: "PAO" },
  { id: "g-sem", nome: "SEM REGRA" }
];
const REGRAS = [
  { grupo: "LEITE", margemPadrao: 0.29 },
  { grupo: "PAO", margemPadrao: null }
];

let apiGet: ReturnType<typeof vi.fn>;
let apiPost: ReturnType<typeof vi.fn>;
let apiPut: ReturnType<typeof vi.fn>;
let apiDelete: ReturnType<typeof vi.fn>;
let fontePronta = true;

function respostaGet(detalhe: unknown) {
  return (rota: string) => {
    if (rota.startsWith("/api/unidades_medida")) return Promise.resolve(UNIDADES);
    if (rota.startsWith("/api/grupos")) return Promise.resolve({ gruposMercadorias: GRUPOS });
    if (rota.startsWith("/api/produtos/regras-fiscais")) {
      return Promise.resolve(fontePronta ? { disponivel: true, regras: REGRAS } : { disponivel: false, regras: [] });
    }
    return Promise.resolve(detalhe);
  };
}

beforeEach(() => {
  apiGet = vi.fn(respostaGet(null));
  apiPost = vi.fn();
  apiPut = vi.fn();
  apiDelete = vi.fn().mockResolvedValue(undefined);
  fontePronta = true;
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("onScopeDispose", onScopeDispose);
  vi.stubGlobal("useApi", () => ({ apiGet, apiPost, apiPut, apiDelete, apiUrl: "" }));
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
    expect(resultado).toEqual({ id: "b1", mensagem: "Produto salvo na base. 2 lojas atualizadas.", tipo: "success" });
    escopo.stop();
  });

  it("so oferece grupos com regra fiscal (e mantem o grupo que o produto ja tem)", async () => {
    apiGet = vi.fn(respostaGet({ ...COPIA_DA_LOJA, grupoMercadoriaId: "g-sem" }));
    const { formulario, escopo } = montar("p1", "loja");
    await formulario.carregar();
    expect(formulario.gruposComRegra.value.map((grupo) => grupo.id)).toEqual(["g-leite", "g-pao", "g-sem"]);

    const novo = montar(null, "base");
    await novo.formulario.carregar();
    expect(novo.formulario.gruposComRegra.value.map((grupo) => grupo.id)).toEqual(["g-leite", "g-pao"]);
    escopo.stop();
    novo.escopo.stop();
  });

  it("sem regra fiscal disponivel, cadastro novo fica bloqueado; edicao continua", async () => {
    fontePronta = false;
    const novo = montar(null, "base");
    await novo.formulario.carregar();
    Object.assign(novo.formulario.form.value, { nomeCatalogo: "Leite", grupoMercadoriaId: "g-leite" });
    expect(await novo.formulario.salvar()).toBeNull();
    expect(novo.formulario.erro.value).toContain("Novos cadastros e reclassificações continuam bloqueados");
    expect(apiPost).not.toHaveBeenCalled();

    apiGet = vi.fn(respostaGet(COPIA_DA_LOJA));
    apiPut = vi.fn().mockResolvedValue({ id: "p1" });
    const edicao = montar("p1", "loja");
    await edicao.formulario.carregar();
    expect(await edicao.formulario.salvar()).toMatchObject({ id: "p1", tipo: "success" });
    novo.escopo.stop();
    edicao.escopo.stop();
  });

  it("foto escolhida so sobe AO SALVAR; removida e apagada pela rota depois do salvar", async () => {
    const envio = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: { fotoUrl: "produtos/p1/nova.jpg" } }) });
    vi.stubGlobal("fetch", envio);
    apiGet = vi.fn(respostaGet({ ...COPIA_DA_LOJA, fotoUrl: "produtos/p1/velha.jpg" }));
    apiPut = vi.fn().mockResolvedValue({ id: "p1" });
    const { formulario, escopo } = montar("p1", "loja");
    await formulario.carregar();

    formulario.fotoPendente.value = new File(["x"], "foto.jpg", { type: "image/jpeg" });
    expect(formulario.alterado.value).toBe(true);
    expect(envio).not.toHaveBeenCalled();
    await formulario.salvar();
    expect(envio).toHaveBeenCalledWith("/api/produtos/p1/foto", expect.objectContaining({ method: "POST" }));
    expect(formulario.form.value.fotoUrl).toBe("produtos/p1/nova.jpg");

    formulario.form.value.fotoUrl = null;
    await formulario.salvar();
    expect(apiDelete).toHaveBeenCalledWith("/api/produtos/p1/foto");
    escopo.stop();
  });

  it("foto que falha depois de salvar vira aviso, nao erro (o produto ja esta salvo)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    apiGet = vi.fn(respostaGet(COPIA_DA_LOJA));
    apiPut = vi.fn().mockResolvedValue({ id: "p1" });
    const { formulario, escopo } = montar("p1", "loja");
    await formulario.carregar();
    formulario.fotoPendente.value = new File(["x"], "foto.jpg", { type: "image/jpeg" });
    const resultado = await formulario.salvar();
    expect(resultado?.tipo).toBe("warning");
    expect(resultado?.mensagem).toContain("a foto não foi atualizada");
    escopo.stop();
  });

  it("voltar a herdar devolve a foto da BASE e mostra a foto pela rota da BASE", async () => {
    apiGet = vi.fn(
      respostaGet({
        ...COPIA_DA_LOJA,
        fotoUrl: "produtos/p1/propria.jpg",
        produtoBaseId: "b9",
        heranca: { naoSeguem: ["Foto"], base: { ...BASE_HERDADA, fotoUrl: "produtos-base/b9/base.jpg" } }
      })
    );
    const { formulario, escopo } = montar("p1", "loja");
    await formulario.carregar();
    expect(formulario.origemDaFoto.value).toEqual({ rota: "/api/produtos", id: "p1" });
    formulario.voltarAHerdar();
    expect(formulario.form.value.fotoUrl).toBe("produtos-base/b9/base.jpg");
    expect(formulario.origemDaFoto.value).toEqual({ rota: "/api/produtos/base", id: "b9" });
    escopo.stop();
  });
});

const COPIA_DA_LOJA = {
  empresaId: "e1",
  descricao: "LEITE",
  nomeCatalogo: "LEITE",
  unidadeIndividualId: "u-un",
  grupoMercadoriaId: "g-leite",
  pesavel: false,
  produtoBaseId: null,
  loja: "TNP",
  heranca: null
};

const BASE_HERDADA = {
  descricao: "LEITE",
  nomeCatalogo: "LEITE",
  quantidadeIndividual: 1,
  unidadeIndividualId: "u-un",
  pesavel: false,
  teclaBalanca: null,
  validadeBalanca: null,
  codigoBarras: null,
  marca: null,
  embalagem: null,
  cDe: null,
  quantidadeCaixa: 1,
  medidaCompra: null,
  compraAproximada: false,
  codigoInterno: null,
  fotoUrl: null,
  grupoMercadoriaId: "g-leite",
  grupoIdExterno: null,
  tipo: "revenda",
  habilitarAjuda: false,
  transformacao: null
};
