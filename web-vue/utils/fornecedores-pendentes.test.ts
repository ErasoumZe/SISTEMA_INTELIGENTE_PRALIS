import { describe, expect, it } from "vitest";
import { fornecedorPendente, soPendentes } from "./fornecedores-pendentes";

describe("fornecedores pendentes (doc 59)", () => {
  const linhas = [
    { nome: "SPAL", whatsapp: "(31) 99999-0000" },
    { nome: "PRIMUS", whatsapp: undefined },
    { nome: "TARUMA", whatsapp: "  " }
  ];

  it("pendente é quem não tem WhatsApp", () => {
    expect(linhas.map(fornecedorPendente)).toEqual([false, true, true]);
  });

  it("filtra só quando o filtro está ligado", () => {
    expect(soPendentes(linhas, true).map((l) => l.nome)).toEqual(["PRIMUS", "TARUMA"]);
    expect(soPendentes(linhas, false)).toHaveLength(3);
  });
});
