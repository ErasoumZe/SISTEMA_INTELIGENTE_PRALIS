import { describe, expect, it } from "vitest";
import type { ItemMenu } from "~/types/padaria";
import { atalhosDaNavegacaoMobile } from "./navegacao-mobile";

const telas: ItemMenu[] = [
  { id: "caixa", titulo: "Caixa", permissao: "caixa_operar", icone: "mdi-cash-register" },
  { id: "entradas", titulo: "Vendas", permissao: "entradas_visualizar", icone: "mdi-arrow-down-left" },
  {
    id: "transferencias",
    titulo: "Transferencias",
    permissao: "transferencias_visualizar",
    icone: "mdi-swap-horizontal"
  }
];

describe("atalhosDaNavegacaoMobile", () => {
  it("mantem rotas de consulta e abre saidas e transferencias pelo mesmo fluxo do Novo", () => {
    expect(atalhosDaNavegacaoMobile(telas, [], ["saidas", "transferencias"])).toEqual([
      { id: "painel", titulo: "Início", icone: "mdi-home-variant-outline", rota: "/" },
      { id: "caixa", titulo: "Caixa", icone: "mdi-cash-register", rota: "/caixa" },
      { id: "saidas", titulo: "Saídas", icone: "mdi-arrow-up-right", acao: "saidas" },
      { id: "transferencias", titulo: "Transferências", icone: "mdi-swap-horizontal", acao: "transferencias" }
    ]);
  });

  it("nao exibe atalho sem permissao para o ato correspondente", () => {
    expect(atalhosDaNavegacaoMobile(telas, ["caixa"], ["saidas"]).map((atalho) => atalho.id)).toEqual([
      "painel",
      "saidas"
    ]);
  });
});
