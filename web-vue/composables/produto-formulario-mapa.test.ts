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
});
