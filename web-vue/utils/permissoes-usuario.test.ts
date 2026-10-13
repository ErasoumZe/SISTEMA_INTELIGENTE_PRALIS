import { descricaoPermissao, permissoes } from "@padaria/shared";
import { describe, expect, it } from "vitest";
import { regrasDiretasCompletas, rotuloPermissao, secoesDoUsuario } from "~/utils/permissoes-usuario";

describe("perfis diretos por pessoa", () => {
  it("cria um mapa denso, sem o estado herdar", () => {
    const regra = regrasDiretasCompletas(["transferencias_visualizar"]);

    expect(Object.keys(regra)).toHaveLength(permissoes.length);
    expect(regra.transferencias_visualizar).toBe(true);
    expect(regra.cadastro_permissoes_visualizar).toBe(false);
    expect(Object.values(regra).every((valor) => typeof valor === "boolean")).toBe(true);
  });

  it("organiza todos os acessos por seção e filtra pela busca", () => {
    const regra = regrasDiretasCompletas(["transferencias_visualizar"]);
    const todas = secoesDoUsuario(regra);
    const filtradas = secoesDoUsuario(regra, new Map(), "transferencias_visualizar");

    expect(todas.flatMap((secao) => secao.itens)).toHaveLength(permissoes.length);
    expect(filtradas.flatMap((secao) => secao.itens)).toContainEqual(
      expect.objectContaining({ codigo: "transferencias_visualizar", permitido: true })
    );
  });

  it("prioriza o nome legível vindo do catálogo", () => {
    expect(rotuloPermissao("transferencias_visualizar", new Map([["transferencias_visualizar", "Ver transferências"]]))).toBe(
      "Ver transferências"
    );
  });

  it("explica todas as permissões, inclusive as regras de menu", () => {
    expect(permissoes.every((permissao) => descricaoPermissao(permissao).trim().length > 0)).toBe(true);
    expect(descricaoPermissao("menu_entradas_mostrar")).toContain("não concede acesso");
    expect(descricaoPermissao("caixa_operar")).toContain("próprio PDV");
  });
});
