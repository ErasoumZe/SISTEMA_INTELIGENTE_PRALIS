import { describe, expect, it } from "vitest";
import { empresaPayloadSchema, fusoHorarioValido } from "@padaria/shared/empresas";
import { usuarioPayloadSchema } from "@padaria/shared/usuarios";

// Os contratos que a migration 0060 passou a exigir. Antes eles aceitavam qualquer string e quem
// errava o preenchimento recebia 500 vindo do CHECK do banco, sem saber o que corrigir.

const empresaId = "019a0000-0000-7000-8000-000000000001";

const usuarioBase = {
  empresaId,
  nome: "Responsavel de Compras",
  email: "compras@padaria.local",
  colaboradorId: "019a0000-0000-7000-8000-000000000002"
};

describe("whatsapp do usuario", () => {
  // A tela manda MASCARADO; o banco exige `^[0-9]{10,15}$`.
  it("desfaz a mascara da tela antes de validar", () => {
    expect(usuarioPayloadSchema.parse({ ...usuarioBase, whatsapp: "(11) 98888-7777" }).whatsapp).toBe("11988887777");
    expect(usuarioPayloadSchema.parse({ ...usuarioBase, whatsapp: "+55 11 98888-7777" }).whatsapp).toBe(
      "5511988887777"
    );
  });

  it("recusa numero curto com erro de validacao, nao com erro do banco", () => {
    const resultado = usuarioPayloadSchema.safeParse({ ...usuarioBase, whatsapp: "9999" });
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toContain("10 a 15");
  });

  it("recusa numero longo demais para a coluna", () => {
    expect(usuarioPayloadSchema.safeParse({ ...usuarioBase, whatsapp: "1".repeat(16) }).success).toBe(false);
  });

  // Telefone e opcional: campo em branco significa "nao tem", e precisa virar null e nao "".
  it("aceita ausencia, nulo e vazio como sem telefone", () => {
    expect(usuarioPayloadSchema.parse(usuarioBase).whatsapp).toBeUndefined();
    expect(usuarioPayloadSchema.parse({ ...usuarioBase, whatsapp: null }).whatsapp).toBeNull();
    expect(usuarioPayloadSchema.parse({ ...usuarioBase, whatsapp: "" }).whatsapp).toBeNull();
    expect(usuarioPayloadSchema.parse({ ...usuarioBase, whatsapp: "   " }).whatsapp).toBeNull();
  });
});

describe("configuracao operacional da empresa", () => {
  const base = { nome: "Padaria TNP" };

  it("reconhece fuso valido e recusa texto que nao e fuso", () => {
    expect(fusoHorarioValido("America/Sao_Paulo")).toBe(true);
    expect(fusoHorarioValido("America/Belem")).toBe(true);
    // Os dois casos que o CHECK `btrim(...) <> ''` deixava passar e so quebrariam dentro de `Intl`,
    // longe do cadastro que digitou o valor.
    expect(fusoHorarioValido("America/Sao Paulo")).toBe(false);
    expect(fusoHorarioValido("BRT")).toBe(false);
  });

  it("recusa fuso invalido no payload da empresa", () => {
    expect(empresaPayloadSchema.safeParse({ ...base, fusoHorario: "America/Sao Paulo" }).success).toBe(false);
    expect(empresaPayloadSchema.parse({ ...base, fusoHorario: "America/Belem" }).fusoHorario).toBe("America/Belem");
  });

  it("usa America/Sao_Paulo quando a empresa nao escolheu fuso", () => {
    expect(empresaPayloadSchema.parse(base).fusoHorario).toBe("America/Sao_Paulo");
  });

  // Prazo nulo e um estado legitimo: significa "usa o padrao do sistema".
  it("aceita prazo nulo e recusa prazo que nao cabe na coluna", () => {
    expect(
      empresaPayloadSchema.parse({ ...base, comprasPrazoRespostaHoras: null }).comprasPrazoRespostaHoras
    ).toBeNull();
    expect(empresaPayloadSchema.parse({ ...base, comprasPrazoRespostaHoras: 48 }).comprasPrazoRespostaHoras).toBe(48);
    expect(empresaPayloadSchema.safeParse({ ...base, comprasPrazoRespostaHoras: 0 }).success).toBe(false);
    expect(empresaPayloadSchema.safeParse({ ...base, comprasPrazoRespostaHoras: -1 }).success).toBe(false);
    expect(empresaPayloadSchema.safeParse({ ...base, comprasPrazoRespostaHoras: 1.5 }).success).toBe(false);
    // `integer` do Postgres para em 2.147.483.647: acima disso o banco responde 22003 e a rota
    // devolveria 500 por um numero digitado errado.
    expect(empresaPayloadSchema.safeParse({ ...base, comprasPrazoRespostaHoras: 99_999_999_999 }).success).toBe(false);
  });
});
