import { describe, expect, it } from "vitest";
import type { ProdutoDetalhe } from "@padaria/shared";
import {
  descricaoPreviewDoProduto,
  formularioDoDetalhe,
  formularioVazio,
  payloadDoFormulario
} from "./produto-formulario-mapa";

describe("produto-formulario-mapa", () => {
  it("so monta a descrição quando nome e medida existem e preserva descrição legada intacta", () => {
    expect(
      descricaoPreviewDoProduto({
        nome: "",
        nomeOriginal: null,
        descricaoAtual: "",
        quantidade: "1",
        siglaUnidade: ""
      })
    ).toBe("");

    expect(
      descricaoPreviewDoProduto({
        nome: "Café",
        nomeOriginal: null,
        descricaoAtual: "",
        quantidade: "500",
        siglaUnidade: "G"
      })
    ).toBe("CAFÉ 500 G");

    expect(
      descricaoPreviewDoProduto({
        nome: "BISCOITO 200 G",
        nomeOriginal: null,
        descricaoAtual: "BISCOITO 200 G",
        quantidade: "200",
        siglaUnidade: "G"
      })
    ).toBe("BISCOITO 200 G");
  });

  it("mantem os dois locais de venda ao hidratar e salvar", () => {
    const detalhe = {
      empresaId: "11111111-1111-4111-8111-111111111111",
      localVenda1: "Gondola 01",
      localVenda2: "Ponta de gondola"
    } as ProdutoDetalhe;

    const hidratado = formularioDoDetalhe(detalhe);
    expect(hidratado.localVenda1).toBe("Gondola 01");
    expect(hidratado.localVenda2).toBe("Ponta de gondola");

    const novo = formularioVazio(detalhe.empresaId);
    novo.descricao = "Produto com locais";
    novo.unidadeIndividualId = "22222222-2222-4222-8222-222222222222";
    novo.localVenda1 = "Gondola 01";
    novo.localVenda2 = "Ponta de gondola";

    expect(payloadDoFormulario(novo, detalhe.empresaId, false)).toMatchObject({
      localVenda1: "Gondola 01",
      localVenda2: "Ponta de gondola"
    });
  });

  it("preserva campos oficiais de balança e área de venda no round-trip", () => {
    const detalhe = {
      empresaId: "11111111-1111-4111-8111-111111111111",
      descricao: "Produto oficial",
      nomeCatalogo: "Produto oficial",
      teclaBalanca: 131,
      validadeBalanca: 7,
      grupoIdExterno: "GR-09",
      areaVenda: "vitrine_paes"
    } as ProdutoDetalhe;
    const form = formularioDoDetalhe(detalhe);
    expect(form.teclaBalanca).toBe("131");
    expect(form.validadeBalanca).toBe("7");
    expect(payloadDoFormulario(form, detalhe.empresaId, false)).toMatchObject({
      teclaBalanca: 131,
      validadeBalanca: 7,
      grupoIdExterno: "GR-09",
      areaVenda: "vitrine_paes"
    });
  });

  it("preserva os campos oficiais de compra, venda, fiscal e receituário no round-trip", () => {
    const detalhe = {
      empresaId: "11111111-1111-4111-8111-111111111111",
      tipo: "transformacao",
      descricao: "Produto de transformação",
      compraAproximada: true,
      habilitarAjuda: true,
      setorVenda1: "BALCAO",
      setorVenda2: "DELIVERY",
      fiscal: {
        aliquotaEcf: "18,00%",
        aliquotaEcfId: "03",
        estado: "pendente",
        motivo: "A CLASSIFICAR",
        conferidoEm: "2026-10-26T12:00:00.000Z",
        pctNcm: "0.2500"
      },
      transformacao: { refReceituario: "REC-001" }
    } as ProdutoDetalhe;

    const form = formularioDoDetalhe(detalhe);
    expect(form.compraAproximada).toBe(true);
    expect(form.habilitarAjuda).toBe(true);
    expect(form.setorVenda1).toBe("BALCAO");
    expect(form.fiscal.aliquotaEcf).toBe("18,00%");
    expect(form.fiscal.aliquotaEcfId).toBe("03");
    expect(form.fiscal.conferidoEm).toBe("2026-10-26T12:00:00.000Z");
    expect(form.produtoReceituario).toBe("");
    expect(form.refReceituario).toBe("REC-001");

    const payload = payloadDoFormulario(form, detalhe.empresaId, false);
    expect(payload).toMatchObject({
      compraAproximada: true,
      habilitarAjuda: true,
      setorVenda1: "BALCAO",
      fiscal: {
        aliquotaEcf: "18,00%",
        aliquotaEcfId: "03",
        estado: "pendente",
        motivo: "A CLASSIFICAR",
        conferidoEm: "2026-10-26T12:00:00.000Z",
        pctNcm: 0.25
      },
      transformacao: { refReceituario: "REC-001" }
    });
  });

  it("separa nome, descrição automática e estado de pesagem sem inferir o legado", () => {
    const empresaId = "11111111-1111-4111-8111-111111111111";
    const novo = formularioVazio(empresaId);
    novo.nomeCatalogo = "Talento Meio Amargo";
    novo.quantidadeIndividual = "25";
    novo.unidadeIndividualId = "22222222-2222-4222-8222-222222222222";
    novo.pesavel = false;

    expect(payloadDoFormulario(novo, empresaId, false, "TALENTO MEIO AMARGO 25 G")).toMatchObject({
      nomeCatalogo: "Talento Meio Amargo",
      descricao: "TALENTO MEIO AMARGO 25 G",
      pesavel: false
    });

    const legado = formularioDoDetalhe({
      empresaId,
      descricao: "BISCOITO 200 G",
      nomeCatalogo: null,
      pesavel: null
    } as ProdutoDetalhe);
    expect(legado.nomeCatalogo).toBe("BISCOITO 200 G");
    expect(legado.pesavel).toBeNull();
    expect(payloadDoFormulario(legado, empresaId, false, "BISCOITO 200 G 200 G")).toMatchObject({
      nomeCatalogo: null,
      descricao: "BISCOITO 200 G",
      pesavel: null
    });
  });

  it("balanca como no oficial: tecla fixa 000 para quem vai, nada para quem nao vai; gramatura vazia vira 0", () => {
    const vai = {
      ...formularioVazio("e1"),
      pesavel: true,
      teclaBalanca: "123",
      validadeBalanca: "5",
      quantidadeIndividual: ""
    };
    expect(payloadDoFormulario(vai, "e1", false)).toMatchObject({
      teclaBalanca: 0,
      validadeBalanca: 5,
      quantidadeIndividual: 0
    });
    const naoVai = { ...formularioVazio("e1"), pesavel: false, teclaBalanca: "123", validadeBalanca: "5" };
    expect(payloadDoFormulario(naoVai, "e1", false)).toMatchObject({ teclaBalanca: null, validadeBalanca: null });
  });
});
