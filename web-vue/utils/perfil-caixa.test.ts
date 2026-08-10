// CX-M06 — uma definicao so de operador/retaguarda, compartilhada com o servidor.
//
// Estes casos existem porque a tela e a API discordavam nos DOIS sentidos, e nenhum teste amarrava
// as duas pontas. Os perfis abaixo sao os reais do projeto: Caixa, Financeiro, Tesouraria, Gerencia
// e um cargo customizado.
import { describe, expect, it } from "vitest";
import type { PerfilUsuario } from "@padaria/shared";
import { contaTravadaDeCaixa, ehOperadorDeCaixa } from "~/utils/perfil-caixa";

const CONTA_PDV = "conta-do-pdv";

function perfil(
  cargo: string,
  permissoes: PerfilUsuario["permissoes"],
  role: PerfilUsuario["role"] = "usuario_comum"
): PerfilUsuario {
  return {
    usuarioId: "u",
    colaboradorId: "c",
    cargoIds: ["cargo"],
    cargos: [{ id: "cargo", nome: cargo }],
    role,
    nome: cargo,
    email: `${cargo}@teste.local`,
    permissoes
  };
}

const caixaAberto = { pdvContaId: CONTA_PDV };

describe("ehOperadorDeCaixa", () => {
  it("Deve_Reconhecer_Quando_CargoCaixaOperaOCaixa", () => {
    expect(ehOperadorDeCaixa(perfil("Caixa", ["caixa_operar", "despesas_criar"]))).toBe(true);
  });

  // Financeiro, Tesouraria e Gerencia sao retaguarda no SERVIDOR (`podeLancarSemCaixa`), mesmo
  // tendo `caixa_operar`. Antes a tela travava o campo para eles e a API aceitava qualquer conta.
  it.each(["Financeiro", "Tesouraria", "Gerencia de loja", "Gerente", "Diretor Geral"])(
    "Deve_TratarComoRetaguarda_Quando_CargoE_%s",
    (cargo) => {
      expect(ehOperadorDeCaixa(perfil(cargo, ["caixa_operar"]))).toBe(false);
    }
  );

  it("Deve_TratarComoRetaguarda_Quando_RoleEAdmin", () => {
    expect(ehOperadorDeCaixa(perfil("Caixa", ["caixa_operar"], "usuario_admin"))).toBe(false);
  });

  // O cargo customizado sem `caixa_operar` nao e operador — e tambem nao ganha trava nenhuma.
  it("Deve_NaoSerOperador_Quando_CargoCustomizadoNaoOperaCaixa", () => {
    expect(ehOperadorDeCaixa(perfil("Conferente de loja", ["despesas_criar", "retiradas_criar"]))).toBe(false);
  });

  // O caso que a regra antiga errava: cargo operacional COM `caixas_gerenciar` continua operador
  // para o servidor, que exige a conta do PDV. A tela liberava a lista inteira e o 400 vinha depois.
  it("Deve_ContinuarSendoOperador_Quando_CargoCaixaTambemGerenciaCaixas", () => {
    expect(ehOperadorDeCaixa(perfil("Caixa", ["caixa_operar", "caixas_gerenciar"]))).toBe(true);
  });

  it("Deve_NaoSerOperador_Quando_NaoHaPerfil", () => {
    expect(ehOperadorDeCaixa(null)).toBe(false);
    expect(ehOperadorDeCaixa(undefined)).toBe(false);
  });
});

describe("contaTravadaDeCaixa", () => {
  it("Deve_DevolverAContaDoPdv_Quando_EOperador", () => {
    expect(contaTravadaDeCaixa(perfil("Caixa", ["caixa_operar"]), caixaAberto)).toBe(CONTA_PDV);
  });

  it("Deve_DevolverVazio_Quando_ERetaguarda", () => {
    expect(contaTravadaDeCaixa(perfil("Financeiro", ["caixa_operar"]), caixaAberto)).toBe("");
  });

  it("Deve_DevolverVazio_Quando_OperadorNaoTemCaixaAberto", () => {
    expect(contaTravadaDeCaixa(perfil("Caixa", ["caixa_operar"]), null)).toBe("");
  });

  it("Deve_DevolverVazio_Quando_OPdvNaoTemConta", () => {
    expect(contaTravadaDeCaixa(perfil("Caixa", ["caixa_operar"]), { pdvContaId: null })).toBe("");
  });
});
