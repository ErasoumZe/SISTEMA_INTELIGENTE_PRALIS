import { computed, effectScope, nextTick, onScopeDispose, ref, watch } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formularioVazio } from "./produto-formulario-mapa";
import { useConsultaAoVivo } from "./useConsultaAoVivo";
import { ATRASO_DA_CLASSIFICACAO, useClassificacaoFiscalAoVivo } from "./useClassificacaoFiscalAoVivo";
import { ATRASO_DO_AVISO_DE_EAN, useAvisoDeEanRepetido } from "./useAvisoDeEanRepetido";

let apiGet: ReturnType<typeof vi.fn>;
let apiPost: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  apiGet = vi.fn();
  apiPost = vi.fn();
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("onScopeDispose", onScopeDispose);
  vi.stubGlobal("useApi", () => ({ apiGet, apiPost }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Deixa as promessas resolverem depois de avancar o relogio falso. */
const assentar = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
};

describe("consulta ao vivo", () => {
  it("espera a pausa: so a ultima digitacao consulta", async () => {
    const consultar = vi.fn().mockResolvedValue("ok");
    const escopo = effectScope();
    const consulta = escopo.run(() => useConsultaAoVivo(consultar, 300))!;
    consulta.agendar("a");
    consulta.agendar("ab");
    vi.advanceTimersByTime(299);
    expect(consultar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await assentar();
    expect(consultar).toHaveBeenCalledTimes(1);
    expect(consultar).toHaveBeenCalledWith("ab");
    expect(consulta.resultado.value).toBe("ok");
    escopo.stop();
  });

  it("resposta atrasada da consulta anterior nao sobrescreve a mais nova", async () => {
    let soltarPrimeira: (valor: string) => void = () => undefined;
    const consultar = vi
      .fn()
      .mockImplementationOnce(() => new Promise<string>((resolver) => (soltarPrimeira = resolver)))
      .mockResolvedValueOnce("segunda");
    const escopo = effectScope();
    const consulta = escopo.run(() => useConsultaAoVivo(consultar, 10))!;
    consulta.agendar("primeira");
    vi.advanceTimersByTime(10);
    consulta.agendar("segunda");
    vi.advanceTimersByTime(10);
    await assentar();
    soltarPrimeira("primeira");
    await assentar();
    expect(consulta.resultado.value).toBe("segunda");
    escopo.stop();
  });

  it("falha da consulta nao e erro de tela: o resultado volta a nulo", async () => {
    const escopo = effectScope();
    const consulta = escopo.run(() => useConsultaAoVivo(vi.fn().mockRejectedValue(new Error("fora")), 10))!;
    consulta.agendar("x");
    vi.advanceTimersByTime(10);
    await assentar();
    expect(consulta.resultado.value).toBeNull();
    expect(consulta.carregando.value).toBe(false);
    escopo.stop();
  });
});

describe("classificacao fiscal ao vivo (F3)", () => {
  it("consulta com grupo, EAN e nome da tela; sem grupo ou fora da loja nao consulta", async () => {
    apiPost.mockResolvedValue({
      estado: "completo",
      motivo: "",
      classificacao: { ncm: "19059090", origem: "produto" }
    });
    const form = ref(formularioVazio("e1"));
    const ativo = ref(true);
    const escopo = effectScope();
    const aoVivo = escopo.run(() => useClassificacaoFiscalAoVivo({ form, empresaId: ref("e1"), ativo }))!;

    form.value.codigoBarras = "7891000000017"; // sem grupo: nada
    await nextTick();
    vi.advanceTimersByTime(ATRASO_DA_CLASSIFICACAO);
    expect(apiPost).not.toHaveBeenCalled();

    form.value.grupoMercadoriaId = "g1";
    form.value.nomeCatalogo = "Pao";
    await nextTick();
    vi.advanceTimersByTime(ATRASO_DA_CLASSIFICACAO);
    await assentar();
    expect(apiPost).toHaveBeenCalledWith("/api/produtos/fiscal/classificar", {
      empresaId: "e1",
      grupoMercadoriaId: "g1",
      codigoBarras: "7891000000017",
      nome: "Pao"
    });
    expect(aoVivo.classificacao.value).toMatchObject({ ncm: "19059090" });

    ativo.value = false;
    await nextTick();
    expect(aoVivo.classificacao.value).toBeNull();
    escopo.stop();
  });
});

describe("aviso de EAN repetido (F4)", () => {
  function montar(modo: "base" | "loja", produtoId: string | null = null) {
    const form = ref(formularioVazio("e1"));
    const escopo = effectScope();
    const aviso = escopo.run(() =>
      useAvisoDeEanRepetido({ form, empresaId: ref("e1"), produtoId: ref(produtoId), modo: ref(modo) })
    )!;
    return { form, aviso, escopo };
  }

  it("procura na loja depois da pausa, ignora o proprio produto e nao avisa com menos de 6 digitos", async () => {
    apiGet.mockResolvedValue([
      { id: "p1", nome: "O PROPRIO", codigoInterno: "00001" },
      { id: "p2", nome: "LEITE", codigoInterno: "00002" }
    ]);
    const { form, aviso, escopo } = montar("loja", "p1");

    form.value.codigoBarras = "12345";
    await nextTick();
    vi.advanceTimersByTime(ATRASO_DO_AVISO_DE_EAN);
    expect(apiGet).not.toHaveBeenCalled();

    form.value.codigoBarras = "0789-1234";
    await nextTick();
    vi.advanceTimersByTime(ATRASO_DO_AVISO_DE_EAN);
    await assentar();
    expect(apiGet).toHaveBeenCalledWith(
      "/api/produtos/por-codigo-barras?codigoBarras=07891234&catalogo=loja&empresaId=e1"
    );
    expect(aviso.eanRepetido.value).toEqual({ nome: "LEITE", codigoInterno: "00002", rota: "/produtos/p2" });
    escopo.stop();
  });

  it("no cadastro da BASE procura no catalogo BASE e abre pela rota da BASE", async () => {
    apiGet.mockResolvedValue([{ id: "b9", nome: "BISCOITO", codigoInterno: "13200" }]);
    const { form, aviso, escopo } = montar("base");
    form.value.codigoBarras = "7891000000017";
    await nextTick();
    vi.advanceTimersByTime(ATRASO_DO_AVISO_DE_EAN);
    await assentar();
    expect(apiGet).toHaveBeenCalledWith("/api/produtos/por-codigo-barras?codigoBarras=7891000000017&catalogo=base");
    expect(aviso.eanRepetido.value?.rota).toBe("/produtos/base/b9");
    escopo.stop();
  });
});
