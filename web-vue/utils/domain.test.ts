import { describe, expect, it } from "vitest";
import { bloqueioCadastroUsuario, cadastroPayload } from "@padaria/shared";
import {
  formCadastroDeLinha,
  formCadastroVazio,
  permissaoPertenceASecao,
  permissoes,
  secoesPermissoes
} from "./domain";

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
    // `role` NAO tem default aqui. `formCadastroDeLinha` monta o form de EDICAO, e assumir
    // "usuario_comum" para uma linha que chegou sem papel rebaixa o alvo no salvar seguinte. O
    // default de criacao continua existindo, mas em `formCadastroVazio`.
    expect(form.role).toBe("");
    expect(form.empresaIds).toEqual(["e1", "e2"]);
  });

  it("preserva o perfil de acesso ao editar usuario", () => {
    const form = formCadastroDeLinha({ nome: "Jose", email: "jose@example.com", role: "usuario_admin" }, {});
    expect(form.role).toBe("usuario_admin");
    expect(cadastroPayload("usuarios", form, "empresa-1")).toMatchObject({ role: "usuario_admin" });
    expect(bloqueioCadastroUsuario("usuarios", form)).toBeNull();
  });

  it("preserva usuario_comum ao editar usuario comum", () => {
    const form = formCadastroDeLinha({ nome: "Ana", email: "ana@example.com", role: "usuario_comum" }, {});
    expect(form.role).toBe("usuario_comum");
    expect(cadastroPayload("usuarios", form, "empresa-1")).toMatchObject({ role: "usuario_comum" });
    expect(bloqueioCadastroUsuario("usuarios", form)).toBeNull();
  });

  // O achado: `role: linha.role || "usuario_comum"`. A listagem pode entregar a linha sem `role` —
  // por recorte cross-tenant, por pagina montada de outra fonte, ou por um campo que a API pare de
  // devolver. Abrir essa linha para edicao e salvar REBAIXAVA um usuario_admin para usuario_comum,
  // sem ninguem pedir e sem aviso nenhum.
  it("nao rebaixa o perfil de acesso quando a linha de edicao chega sem role", () => {
    const form = formCadastroDeLinha({ id: "u1", nome: "Sem Papel", email: "sem.papel@example.com" }, {});
    expect(form.role).toBe("");

    const payload = cadastroPayload("usuarios", form, "empresa-1");
    expect(payload).not.toHaveProperty("role");
    expect(payload).not.toMatchObject({ role: "usuario_comum" });
  });

  it("bloqueia o salvamento do usuario quando o perfil de acesso nao esta disponivel", () => {
    const form = formCadastroDeLinha({ id: "u1", nome: "Sem Papel", email: "sem.papel@example.com" }, {});
    const motivo = bloqueioCadastroUsuario("usuarios", form);
    expect(motivo).toBeTruthy();
    expect(motivo).toContain("Recarregue");
  });

  // Contraprova: o default de criacao continua existindo e continua sendo enviado. Sem isto,
  // "nunca assumir usuario_comum" viraria "usuario novo nasce sem papel".
  it("mantem usuario_comum como padrao na criacao de usuario novo", () => {
    const form = formCadastroVazio();
    expect(form.role).toBe("usuario_comum");
    expect(cadastroPayload("usuarios", form, "empresa-1")).toMatchObject({ role: "usuario_comum" });
    expect(bloqueioCadastroUsuario("usuarios", form)).toBeNull();
  });

  it("nao bloqueia telas que nao sao de usuario", () => {
    expect(bloqueioCadastroUsuario("produtos", formCadastroDeLinha({ nome: "Pao" }, {}))).toBeNull();
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

describe("secoes de permissoes", () => {
  it("organiza cada permissao visivel em exatamente um modulo", () => {
    for (const permissao of permissoes) {
      const secoes = secoesPermissoes.filter((secao) => permissaoPertenceASecao(permissao, secao));
      expect(
        secoes.map((secao) => secao.titulo),
        permissao
      ).toHaveLength(1);
    }
  });
});
