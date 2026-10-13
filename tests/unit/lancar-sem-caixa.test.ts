import { describe, expect, it } from "vitest";
import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import {
  exigirContaDoCaixaNoLancamento,
  exigirRecorrenciaDeRetaguarda,
  podeLancarSemCaixa
} from "../../api/src/lancamentos/lancamentos.dominio.js";
import { podeAcessarRelatorioFechamento } from "@padaria/shared";

function perfil(
  cargo: string,
  role: PerfilUsuario["role"] = "usuario_comum",
  permissoes: PerfilUsuario["permissoes"] = []
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

const CONTA_PDV = "conta-do-pdv";
const caixa = { pdvContaId: CONTA_PDV };

// A regra vale para as QUATRO saidas desde a R-121 — antes era `podeTransferirSemCaixa`, so da
// transferencia (R-032). Uma definicao so de "perfil de retaguarda"; duas divergem com o tempo.
describe("podeLancarSemCaixa - quem lanca sem estar preso a um caixa", () => {
  it.each(["Tesouraria", "Gerência", "Financeiro", "Diretor Geral"])("libera %s", (cargo) => {
    expect(podeLancarSemCaixa(perfil(cargo))).toBe(true);
  });

  it("libera usuario_admin e admin independentemente do cargo", () => {
    expect(podeLancarSemCaixa(perfil("Outro", "usuario_admin"))).toBe(true);
    expect(podeLancarSemCaixa(perfil("Outro", "admin"))).toBe(true);
  });

  it("mantem o cargo Caixa preso ao caixa aberto", () => {
    expect(podeLancarSemCaixa(perfil("Caixa"))).toBe(false);
  });

  it("ignora acento e caixa alta do nome do cargo", () => {
    expect(podeLancarSemCaixa(perfil("gerência de loja"))).toBe(true);
    expect(podeLancarSemCaixa(perfil("GERENCIA"))).toBe(true);
  });
});

describe("podeAcessarRelatorioFechamento", () => {
  it.each(["Tesouraria", "Diretor Geral", "diretor geral regional"])("libera %s", (cargo) => {
    expect(podeAcessarRelatorioFechamento(perfil(cargo))).toBe(true);
  });

  it("libera administrador total e mantém Caixa e Gerência fora", () => {
    expect(podeAcessarRelatorioFechamento(perfil("Outro", "usuario_admin"))).toBe(true);
    expect(podeAcessarRelatorioFechamento(perfil("Caixa"))).toBe(false);
    expect(podeAcessarRelatorioFechamento(perfil("Gerência"))).toBe(false);
  });
});

// R-121: a saida do operador tem de sair da conta do PDV aberto.
describe("exigirContaDoCaixaNoLancamento", () => {
  it("Deve_DeixarPassarIntacto_Quando_PerfilDeRetaguarda", () => {
    const dados = { contaOrigemId: "outra-conta-qualquer" };
    expect(exigirContaDoCaixaNoLancamento(dados, caixa, perfil("Tesouraria"))).toBe(dados);
  });

  it("Deve_PreencherComAContaDoPdv_Quando_OperadorNaoInformaConta", () => {
    const resultado = exigirContaDoCaixaNoLancamento({ contaOrigemId: "" }, caixa, perfil("Caixa"));
    expect(resultado.contaOrigemId).toBe(CONTA_PDV);
  });

  it("Deve_Aceitar_Quando_OperadorInformaAContaDoPdv", () => {
    const resultado = exigirContaDoCaixaNoLancamento({ contaOrigemId: CONTA_PDV }, caixa, perfil("Caixa"));
    expect(resultado.contaOrigemId).toBe(CONTA_PDV);
  });

  it("Deve_Recusar_Quando_OperadorInformaOutraConta", () => {
    expect(() => exigirContaDoCaixaNoLancamento({ contaOrigemId: "conta-banco" }, caixa, perfil("Caixa"))).toThrow(
      /conta do PDV aberto/i
    );
  });

  it("Deve_PreservarOsDemaisCampos_AoPreencherAConta", () => {
    const resultado = exigirContaDoCaixaNoLancamento(
      { contaOrigemId: null, descricao: "Insumos", valorOriginal: 10 },
      caixa,
      perfil("Caixa")
    );
    expect(resultado).toMatchObject({ contaOrigemId: CONTA_PDV, descricao: "Insumos", valorOriginal: 10 });
  });
});

// R-123: as ocorrencias futuras nascem fora de caixa e nao teriam conta valida.
describe("exigirRecorrenciaDeRetaguarda", () => {
  const serie = { frequencia: "mes" as const, repeticoes: 3 };

  it("Deve_Recusar_Quando_OperadorDeCaixaMandaRecorrencia", () => {
    const operador = perfil("Caixa", "usuario_comum", ["caixa_operar"]);
    expect(() => exigirRecorrenciaDeRetaguarda(operador, serie)).toThrow(/Tesouraria\/Financeiro/i);
  });

  // R-075 continua respondendo por quem apenas nao tem a permissao e NAO opera caixa: la o 403
  // apontando `lancamentos_recorrencia_criar` e o motivo certo, nao "e ato de Tesouraria".
  it("Deve_NaoInterferir_Quando_PerfilNaoOperaCaixa", () => {
    expect(() => exigirRecorrenciaDeRetaguarda(perfil("Compras"), serie)).not.toThrow();
  });

  it("Deve_Liberar_Quando_PerfilDeRetaguarda", () => {
    expect(() => exigirRecorrenciaDeRetaguarda(perfil("Financeiro"), serie)).not.toThrow();
  });

  it("Deve_Liberar_Quando_NaoHaRecorrencia", () => {
    expect(() => exigirRecorrenciaDeRetaguarda(perfil("Caixa"), undefined)).not.toThrow();
  });
});
