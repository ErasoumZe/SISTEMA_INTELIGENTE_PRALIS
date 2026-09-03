import { describe, expect, it } from "vitest";
import {
  corSituacaoFicha,
  diagnosticoTurnos,
  fichaRevisavel,
  mensagemDiagnosticoTurnos,
  motivoTurnoIndisponivel,
  processoCancelavel,
  rotaRevisaoDaFicha,
  rotuloDeclaracaoDependentes
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

// ADM-003 V5 — a ficha vista pelo DP. Regras puras, fora dos componentes, pelo mesmo motivo das
// quatro acima: cada uma decide se um botao existe ou o que uma frase diz.

describe("fichaRevisavel", () => {
  it("Deve_PermitirDecidir_So_Quando_Enviada", () => {
    // E a regra do servidor (`FICHA_NAO_REVISAVEL`): aprovar e devolver so valem de `enviada`.
    // Oferecer o botao em outro estado seria o botao morto que a D-8.1 tirou do modal.
    expect(fichaRevisavel("enviada")).toBe(true);
    expect(fichaRevisavel("rascunho")).toBe(false);
    expect(fichaRevisavel("devolvida")).toBe(false);
    expect(fichaRevisavel("aprovada")).toBe(false);
  });
});

describe("rotuloDeclaracaoDependentes", () => {
  it("Deve_DistinguirOsTresEstados", () => {
    // `null` NAO e "nao tem": e "nao respondeu". Confundir os dois poria na tela do DP uma
    // declaracao que o candidato nunca fez.
    expect(rotuloDeclaracaoDependentes(null)).toBe("Não respondeu");
    expect(rotuloDeclaracaoDependentes(true)).toBe("Declarou que não tem dependentes");
    expect(rotuloDeclaracaoDependentes(false)).toBe("Declarou que tem dependentes");
  });
});

describe("corSituacaoFicha", () => {
  it("Deve_DestacarSoOQuePedeDecisao", () => {
    // Cor forte so onde ha decisao humana pendente — mesmo criterio do exame.
    expect(corSituacaoFicha("enviada")).toBe("primary");
    expect(corSituacaoFicha("aprovada")).toBe("success");
    expect(corSituacaoFicha("devolvida")).toBe("warning");
    expect(corSituacaoFicha("rascunho")).toBeUndefined();
  });
});

describe("rotaRevisaoDaFicha", () => {
  it("Deve_SerSubRotaDoProcesso_E_NaoLevarNadaAlemDoId", () => {
    // A ficha e DE um processo, entao a rota e filha da rota do processo. So o id viaja: nem
    // token, nem CPF, nem versao — nada que o historico do navegador possa guardar.
    expect(rotaRevisaoDaFicha("01a06746-d313-7f5c-b860-915d5ecb69f0")).toBe(
      "/admissoes_processos/01a06746-d313-7f5c-b860-915d5ecb69f0/ficha"
    );
    expect(rotaRevisaoDaFicha("a/b")).toBe("/admissoes_processos/a%2Fb/ficha");
  });
});
