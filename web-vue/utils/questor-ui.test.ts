import { describe, expect, it } from "vitest";
import { mensagemErroQuestor } from "./questor-ui";

describe("mensagemErroQuestor", () => {
  it("explica que a API ainda depende das rotas quando recebe 404", () => {
    expect(mensagemErroQuestor({ status: 404 })).toContain("Rotas e migrations");
  });

  it("trata conflito de concorrência sem ocultar a necessidade de recarregar", () => {
    expect(mensagemErroQuestor({ status: 409 })).toContain("Recarregue");
  });

  it("não replica mensagem bruta de falha desconhecida", () => {
    expect(mensagemErroQuestor(new Error("segredo interno"))).not.toContain("segredo");
  });
});
