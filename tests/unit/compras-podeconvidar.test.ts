import { describe, expect, it } from "vitest";
import { podeConvidar } from "@padaria/shared/fornecedores";

// R-219/R-221: a obrigatoriedade do WhatsApp vive no ato de CONVIDAR, nao no cadastro. O fornecedor
// aparece no seletor da rodada, mas o convite e bloqueado com o nome do campo que falta.

describe("podeConvidar", () => {
  it("libera fornecedor ativo com WhatsApp valido", () => {
    expect(podeConvidar({ situacao: "ativo", whatsapp: "11988887777" })).toBeNull();
    // 12 digitos com DDI tambem vale.
    expect(podeConvidar({ situacao: "ativo", whatsapp: "5511988887777" })).toBeNull();
  });

  it("bloqueia fornecedor inativo mesmo com WhatsApp", () => {
    expect(podeConvidar({ situacao: "inativo", whatsapp: "11988887777" })).toBe("Fornecedor inativo");
  });

  it("bloqueia fornecedor sem WhatsApp nomeando o campo", () => {
    expect(podeConvidar({ situacao: "ativo", whatsapp: null })).toContain("WhatsApp");
    expect(podeConvidar({ situacao: "ativo", whatsapp: "" })).toContain("WhatsApp");
    expect(podeConvidar({ situacao: "ativo", whatsapp: "9999" })).toContain("WhatsApp");
  });

  it("situacao ausente (fornecedor historico) conta como ativo para o convite", () => {
    expect(podeConvidar({ whatsapp: "11988887777" })).toBeNull();
    expect(podeConvidar({ whatsapp: null })).toContain("WhatsApp");
  });
});
