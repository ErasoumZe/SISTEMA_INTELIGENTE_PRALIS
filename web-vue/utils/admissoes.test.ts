import { describe, expect, it } from "vitest";
import {
  diagnosticoTurnos,
  mensagemDiagnosticoTurnos,
  motivoTurnoIndisponivel,
  processoCancelavel
} from "./admissoes";

// Estas quatro regras moravam dentro de componentes e cada uma escondia um defeito de tela:
// a pausa sem saida, e o seletor de turno que dava o mesmo diagnostico para quatro causas.
// Aqui elas sao funcoes puras, e o teste prova a regra sem montar Vuetify.

describe("processoCancelavel", () => {
  it("Deve_PermitirCancelar_Quando_IniciadoOuPausado", () => {
    // O servidor recusa SO `cancelado`. A tela escondia o botao em `pausado`, e um processo parado
    // por ASO nao apto e justamente um dos que o DP quer encerrar.
    expect(processoCancelavel("iniciado")).toBe(true);
    expect(processoCancelavel("pausado")).toBe(true);
  });

  it("Deve_RecusarCancelar_Quando_JaCancelado", () => {
    expect(processoCancelavel("cancelado")).toBe(false);
  });
});

describe("diagnosticoTurnos", () => {
  const completo = { ativo: true, completo: true };
  const incompleto = { ativo: true, completo: false };
  const inativo = { ativo: false, completo: false };

  it("Deve_DizerFalha_Quando_CarregamentoFalhou", () => {
    // A falha vem ANTES da lista vazia: sem resposta do servidor, vazio nao prova nada sobre o
    // cadastro. Era exatamente esta confusao que mandava o DP configurar turno inexistente.
    expect(diagnosticoTurnos([], true)).toBe("falha_carregamento");
    expect(diagnosticoTurnos([completo], true)).toBe("falha_carregamento");
  });

  it("Deve_DistinguirListaVazia_De_TodosIncompletos", () => {
    // O bug original: `[].every(...)` e `true`, entao lista vazia caia em "nenhum completo".
    expect(diagnosticoTurnos([], false)).toBe("nenhum_cadastrado");
    expect(diagnosticoTurnos([incompleto], false)).toBe("todos_incompletos");
  });

  it("Deve_DistinguirInativo_De_Incompleto", () => {
    expect(diagnosticoTurnos([inativo], false)).toBe("todos_inativos");
    expect(diagnosticoTurnos([inativo, incompleto], false)).toBe("todos_incompletos");
  });

  it("Deve_DizerOk_Quando_HouverAoMenosUmCompleto", () => {
    expect(diagnosticoTurnos([incompleto, completo], false)).toBe("ok");
  });

  it("Deve_TerMensagemPropria_Para_CadaCausa", () => {
    // Quatro causas com a mesma frase seria o defeito de volta, so que com mais codigo.
    const frases = Object.values(mensagemDiagnosticoTurnos);
    expect(frases).toHaveLength(4);
    expect(new Set(frases).size).toBe(4);
  });
});

describe("motivoTurnoIndisponivel", () => {
  it("Deve_SepararInativoDeIncompleto_E_NaoAcusarOCompleto", () => {
    expect(motivoTurnoIndisponivel({ ativo: true, completo: true })).toBeNull();
    expect(motivoTurnoIndisponivel({ ativo: true, completo: false })).toBe("incompleto");
    // Etiqueta e dias podem estar preenchidos: o que falta e o turno estar ativo.
    expect(motivoTurnoIndisponivel({ ativo: false, completo: false })).toBe("inativo");
  });
});
