import { describe, expect, it } from "vitest";
import type { Permissao } from "@padaria/shared";
import { itemPorTela, rotaTela, telaVisivelNoMenu } from "./domain";
import { ID_CATEGORIA_PRODUTOS, agruparTelasMenu, telasComSubmenuDeProdutos } from "./menu";
import { usePermissoes } from "~/composables/usePermissoes";

function menuDe(permissoes: Permissao[], role = "colaborador", idsOcultos: string[] = []) {
  const { telasPermitidas } = usePermissoes(permissoes, true);
  const telas = telasComSubmenuDeProdutos(telasPermitidas.value, { role, permissoes });
  return agruparTelasMenu(telas, undefined, idsOcultos);
}

function submenuDeProdutos(menu: ReturnType<typeof menuDe>) {
  const no = menu.flatMap((secao) => secao.itens).find((item) => item.id === ID_CATEGORIA_PRODUTOS);
  return no?.tipo === "categoria" ? no.itens.map((tela) => `${tela.id}:${tela.titulo}`) : null;
}

describe("submenu Produtos", () => {
  it("a loja que importa ve a lista e o 'Importar da base'", () => {
    const menu = menuDe(["cadastro_produtos_visualizar", "cadastro_produtos_criar"]);
    expect(submenuDeProdutos(menu)).toEqual(["produtos:Lista de produtos", "produtos_importar:Importar da base"]);
  });

  it("o administrador ve tambem o Catalogo BASE, a Manutencao e a Central", () => {
    const menu = menuDe(["cadastro_produtos_visualizar", "cadastro_produtos_criar"], "usuario_admin");
    expect(submenuDeProdutos(menu)).toEqual([
      "produtos:Lista de produtos",
      "produtos_importar:Catálogo BASE",
      "produtos_manutencao:Manutenção",
      "produtos_central:Central de produtos"
    ]);
  });

  it("quem so consulta continua com a tela Produtos simples, sem submenu", () => {
    const menu = menuDe(["cadastro_produtos_visualizar"]);
    expect(submenuDeProdutos(menu)).toBeNull();
    expect(menu.flatMap((secao) => secao.itens).some((no) => no.id === "produtos")).toBe(true);
  });

  it("escondida a tela Produtos, as subtelas somem junto", () => {
    const menu = menuDe(["cadastro_produtos_visualizar", "cadastro_produtos_criar"], "usuario_admin", ["produtos"]);
    const ids = menu.flatMap((secao) => secao.itens).map((no) => no.id);
    expect(ids).not.toContain(ID_CATEGORIA_PRODUTOS);
    expect(ids.some((id) => id.startsWith("produtos"))).toBe(false);
  });

  it("as subtelas levam as rotas reais e nao viram tela com permissao de menu propria", () => {
    expect(rotaTela("produtos_importar")).toBe("/produtos/base");
    expect(rotaTela("produtos_manutencao")).toBe("/produtos/manutencao");
    expect(rotaTela("produtos_central")).toBe("/produtos/central");
    expect(itemPorTela["produtos_importar"]).toBeUndefined();
  });

  it("os placeholders Promocoes e Fiscais de produtos nao aparecem no menu", () => {
    const tudo = ["promocoes_visualizar", "cadastro_fiscal_produtos_visualizar"] as Permissao[];
    expect(telaVisivelNoMenu(tudo, itemPorTela["promocoes"]!)).toBe(false);
    expect(telaVisivelNoMenu(tudo, itemPorTela["fiscal_produtos"]!)).toBe(false);
  });
});
