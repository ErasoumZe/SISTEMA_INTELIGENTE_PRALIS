import { describe, expect, it } from "vitest";
import {
  aceiteDeAvisoPermitido,
  avisoPorVersao,
  avisoPrivacidadeVigente,
  avisosPrivacidade,
  avisoVigenteDoAmbiente,
  ehAvisoDeTeste
} from "@padaria/shared/admissoes";

/**
 * ADM-003 — o aviso de TESTE nao pode vigorar em producao.
 *
 * O adendo que autorizou este aviso foi explicito: "deve ser impossivel gerar/enviar convite real ou
 * aceitar esse aviso em producao", e a guarda tem de ser de SERVIDOR, nao de botao. As duas guardas
 * puras vivem em `shared/src/admissoes/aviso-privacidade.ts` e ate aqui nao tinham teste proprio —
 * eram exercitadas so de lado, pelo caminho de integracao, e so no ambiente de teste, onde por
 * definicao `producao` e falso. Ou seja: o ramo que importa nunca era executado.
 *
 * Este arquivo executa o ramo de producao diretamente. Ele nao precisa de banco nem de servidor
 * porque as duas guardas sao funcoes puras — e serem puras e o que permite prova-las assim.
 */
describe("aviso de privacidade — guardas de ambiente", () => {
  it("Deve_ReconhecerAvisoDeTeste_PeloPrefixo_E_NaoPorMemoria", () => {
    // O marcador e permanente e vive na propria string gravada na ficha. Um aceite de 2026 continua
    // identificavel como de teste em 2030, mesmo que ninguem se lembre de qual era o ambiente.
    expect(ehAvisoDeTeste(avisoPrivacidadeVigente)).toBe(true);
    expect(ehAvisoDeTeste("AVISO-ADMISSAO-V1")).toBe(false);
  });

  it("G-1 Deve_RecusarVigencia_Quando_AvisoDeTesteEmProducao", () => {
    // Fora de producao o formulario abre; em producao NAO existe versao vigente, e quem chama
    // responde fechado. Isso e o que impede o formulario de coletar dado real sob um texto que diz
    // "nao use dados reais".
    expect(avisoVigenteDoAmbiente(false)).toBe(avisoPrivacidadeVigente);
    expect(avisoVigenteDoAmbiente(true)).toBeNull();
  });

  it("G-3 Deve_RecusarAceite_Quando_AvisoDeTesteEmProducao", () => {
    // Separada da emissao de proposito: um convite emitido ANTES de uma promocao de ambiente
    // continuaria valendo, e a guarda da emissao ja teria passado. Esta olha o momento de gravar.
    expect(aceiteDeAvisoPermitido(avisoPrivacidadeVigente, false)).toBe(true);
    expect(aceiteDeAvisoPermitido(avisoPrivacidadeVigente, true)).toBe(false);
  });

  it("G-3 Deve_RecusarAceite_Quando_VersaoNaoExisteNoRegistro", () => {
    // Aceite de versao inventada e aceite de nada: sem entrada no registro nao ha texto a exibir, e
    // sem texto nao ha o que a pessoa possa ter lido.
    expect(aceiteDeAvisoPermitido("AVISO-QUE-NAO-EXISTE", false)).toBe(false);
    expect(avisoPorVersao("AVISO-QUE-NAO-EXISTE")).toBeNull();
  });

  it("Deve_ManterORegistroCompleto_E_ComOTextoDeAlerta", () => {
    // Nunca se apaga uma entrada: um aceite antigo aponta para a versao que aceitou, e remove-la
    // tornaria esse aceite ilegivel. A vigente precisa estar no registro para ter texto.
    const vigente = avisoPorVersao(avisoPrivacidadeVigente);
    expect(vigente).not.toBeNull();
    expect(avisosPrivacidade.some((aviso) => aviso.versao === avisoPrivacidadeVigente)).toBe(true);
    // A frase exigida no adendo, literal. Ela e o que a pessoa le antes de digitar qualquer coisa.
    expect(vigente?.texto).toContain("Ambiente de teste — não use dados pessoais reais.");
  });
});
