import { describe, expect, it } from "vitest";
import { filtrarFornecedores, fornecedorPendente } from "./fornecedores-pendentes";

describe("fornecedores pendentes (doc 59)", () => {
  const linhas = [
    { nome: "SPAL", whatsapp: "(31) 99999-0000" },
    { nome: "PRIMUS", whatsapp: undefined },
    { nome: "TARUMA", whatsapp: "  " }
  ];

  it("pendente é quem não tem WhatsApp", () => {
    expect(linhas.map(fornecedorPendente)).toEqual([false, true, true]);
    expect(fornecedorPendente({ whatsapp: "9999" })).toBe(true);
  });

  it("combina pesquisa por nome com WhatsApp e situacao sem perder os outros fornecedores", () => {
    const dados = [
      { ...linhas[0], ativo: "Sim" },
      { ...linhas[1], ativo: "Não" },
      { ...linhas[2], ativo: "Sim" }
    ];
    expect(
      filtrarFornecedores(dados, { busca: "taruma", whatsapp: "sem", situacao: "ativos" }).map((l) => l.nome)
    ).toEqual(["TARUMA"]);
    expect(filtrarFornecedores(dados, { busca: "", whatsapp: "com", situacao: "todos" }).map((l) => l.nome)).toEqual([
      "SPAL"
    ]);
    expect(filtrarFornecedores(dados, { busca: "", whatsapp: "sem", situacao: "inativos" }).map((l) => l.nome)).toEqual(
      ["PRIMUS"]
    );
  });
});
