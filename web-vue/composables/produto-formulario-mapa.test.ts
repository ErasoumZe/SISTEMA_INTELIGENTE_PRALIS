import { describe, expect, it } from "vitest";
import type { ProdutoDetalhe } from "@padaria/shared";
import { formularioDoDetalhe, formularioVazio, payloadDoFormulario } from "./produto-formulario-mapa";

describe("produto-formulario-mapa", () => {
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
});
