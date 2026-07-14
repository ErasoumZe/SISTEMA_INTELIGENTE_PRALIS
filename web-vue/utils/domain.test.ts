import { describe, expect, it } from "vitest";
import { cadastroPayload } from "@padaria/shared";
import { formCadastroDeLinha } from "./domain";

describe("formCadastroDeLinha", () => {
  it("reconstroi o formulario de produto (booleanos, conversoes JSON, precos)", () => {
    const form = formCadastroDeLinha(
      {
        id: "p1",
        nome: "Pao Frances",
        descricao: "Pao Frances 50g",
        codigo: "PR-0001",
        marca: "Casa",
        auto: "true",
        status: "inativo",
        tipo: "transformacao",
        custo: "10",
        margem: "30",
        precoVenda: "6.5",
        unidadeMedidaId: "u1",
        conversoes: JSON.stringify([{ unidadeMedidaId: "u2", quantidade: 12, unidadesIndividuais: 1 }])
      },
      {}
    );
    expect(form.descricao).toBe("Pao Frances 50g");
    expect(form.auto).toBe(true);
    expect(form.status).toBe("inativo");
    expect(form.tipo).toBe("transformacao");
    expect(form.precoVenda).toBe("6.5");
    expect(form.unidadeIndividualId).toBe("u1");
    expect(form.produtoConversoes).toEqual([{ unidadeMedidaId: "u2", quantidade: "12", unidadesIndividuais: "1" }]);
  });

  it("aplica mascaras em documento/whatsapp/cep de cliente", () => {
    const form = formCadastroDeLinha(
      { nome: "Cliente", documento: "12345678901", whatsapp: "11987654321", cep: "01001000" },
      {}
    );
    expect(form.documento).toBe("123.456.789-01");
    expect(form.whatsapp).toBe("(11) 98765-4321");
    expect(form.cep).toBe("01001-000");
  });

  it("usa defaults quando a linha e minima e divide empresaIds", () => {
    const form = formCadastroDeLinha({ nome: "X", empresaIds: "e1,e2" }, {});
    expect(form.status).toBe("ativo");
    expect(form.tipo).toBe("revenda");
    expect(form.quantidadeCaixa).toBe("1");
    expect(form.ativo).toBe(true);
    expect(form.role).toBe("usuario_comum");
    expect(form.empresaIds).toEqual(["e1", "e2"]);
  });

  it("preserva o perfil de acesso ao editar usuario", () => {
    const form = formCadastroDeLinha({ nome: "Jose", email: "jose@example.com", role: "usuario_admin" }, {});
    expect(form.role).toBe("usuario_admin");
    expect(cadastroPayload("usuarios", form, "empresa-1")).toMatchObject({ role: "usuario_admin" });
  });

  it("deriva tipoAreaSetor=setor quando ha areaId/setorPaiId e repassa regras", () => {
    const form = formCadastroDeLinha({ nome: "S", areaId: "a1" }, { entradas_criar: true });
    expect(form.tipoAreaSetor).toBe("setor");
    expect(form.regras).toEqual({ entradas_criar: true });
    expect(formCadastroDeLinha({ nome: "A" }, {}).tipoAreaSetor).toBe("area");
  });

  it("ativo=false quando a linha marca 'Nao'", () => {
    expect(formCadastroDeLinha({ nome: "Y", ativo: "Nao" }, {}).ativo).toBe(false);
  });
});
