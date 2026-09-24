import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CABECALHO_DO_CONVITE, linkDoConvite, tokenDoFragmento } from "./convite-token";
import { ROTA_ADMISSAO } from "./rotas-publicas";

/**
 * O token do candidato nao pode escapar do fragmento e da memoria da aba. Estes testes travam as
 * duas metades: a leitura (funcao pura) e o uso (varredura da pagina).
 */

describe("tokenDoFragmento", () => {
  it("Deve_LerOToken_Quando_FragmentoTemT", () => {
    expect(tokenDoFragmento("#t=abc123")).toBe("abc123");
    // Sem o `#` tambem: quem chama pode ja ter cortado.
    expect(tokenDoFragmento("t=abc123")).toBe("abc123");
  });

  it("Deve_DevolverVazio_Quando_NaoHaToken", () => {
    expect(tokenDoFragmento("")).toBe("");
    expect(tokenDoFragmento("#")).toBe("");
    expect(tokenDoFragmento("#outra=coisa")).toBe("");
  });

  it("Deve_IgnorarEspacos_E_ConviverComOutrosParametros", () => {
    expect(tokenDoFragmento("#t=%20abc%20")).toBe("abc");
    expect(tokenDoFragmento("#a=1&t=abc&b=2")).toBe("abc");
  });
});

describe("linkDoConvite", () => {
  const TOKEN = "a".repeat(64);

  it("Deve_MontarOLinkComOrigemDoNavegador_E_TokenNoFragmento", () => {
    expect(linkDoConvite("http://localhost:5185", TOKEN)).toBe(`http://localhost:5185/admissao#t=${TOKEN}`);
    // Producao serve na raiz do dominio, atras do proxy: a origem que vale e a do navegador do DP.
    expect(linkDoConvite("https://sistema.exemplo", TOKEN)).toBe(`https://sistema.exemplo/admissao#t=${TOKEN}`);
  });

  it("Deve_UsarAConstanteDaRota_E_NaoUmCaminhoEscritoAMao", () => {
    // Se alguem mudar a rota publica, o link tem de acompanhar sozinho.
    expect(linkDoConvite("https://x.exemplo", TOKEN)).toContain(`${ROTA_ADMISSAO}#t=`);
  });

  it("Deve_PorOTokenSoNoFragmento_Nunca_Em_QueryOuCaminho", () => {
    const link = new URL(linkDoConvite("https://x.exemplo", TOKEN));
    expect(link.pathname).toBe(ROTA_ADMISSAO);
    expect(link.search).toBe("");
    expect(link.hash).toBe(`#t=${TOKEN}`);
  });

  it("Deve_TolerarBarraFinalNaOrigem", () => {
    expect(linkDoConvite("https://x.exemplo/", TOKEN)).toBe(`https://x.exemplo/admissao#t=${TOKEN}`);
  });

  it("Deve_DevolverVazio_Quando_FaltaOrigemOuToken", () => {
    // Vazio e melhor que um link quebrado: quem chama decide o que mostrar, e nao ha meia-entrega.
    expect(linkDoConvite("", TOKEN)).toBe("");
    expect(linkDoConvite("https://x.exemplo", "")).toBe("");
    expect(linkDoConvite("https://x.exemplo", "   ")).toBe("");
  });

  it("Deve_SobreviverAoIdaEVolta_Com_TokenDoFragmento", () => {
    // O escritor e o leitor moram no mesmo arquivo justamente para isto valer sempre.
    const link = new URL(linkDoConvite("https://x.exemplo", TOKEN));
    expect(tokenDoFragmento(link.hash)).toBe(TOKEN);
  });
});

describe("a pagina do candidato nao deixa o token vazar", () => {
  // Mesma limpeza das outras varreduras do repositorio: explicar uma proibicao em comentario e
  // seguro; escreve-la em codigo, nao. Sem tirar o bloco `/** */`, o proprio comentario que diz
  // "nao monta AppWorkspace" reprovaria a pagina.
  const pagina = readFileSync(join(import.meta.dirname, "..", "pages", "admissao.vue"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^\s*\/\/.*$/gmu, "");

  it("Deve_LerDoFragmento_E_LimparAUrl", () => {
    expect(pagina).toContain("tokenDoFragmento(window.location.hash)");
    // Sem isto, o segredo fica na barra de enderecos, no historico e em qualquer print de tela.
    expect(pagina).toContain("history.replaceState");
  });

  it("Deve_MandarOTokenSoNoCabecalho", () => {
    expect(pagina).toContain(`[CABECALHO_DO_CONVITE]: token.value`);
    // Nem query, nem caminho: as duas formas colocam o token no log do servidor e no Referer.
    expect(pagina).not.toMatch(/\/api\/admissao[^"'`\n]*[?&]/u);
    expect(pagina).not.toMatch(/\/api\/admissao\/[^"'`\n]*\$\{token/u);
  });

  it("Deve_NaoGuardarOTokenEmLugarNenhum", () => {
    const linhasComToken = pagina.split("\n").filter((linha) => /token/iu.test(linha));
    expect(linhasComToken.length).toBeGreaterThan(0);
    for (const fuga of ["localStorage", "sessionStorage", "useState", "document.cookie", "console."]) {
      expect(
        linhasComToken.filter((linha) => linha.includes(fuga)),
        fuga
      ).toEqual([]);
    }
  });

  it("Deve_NaoMandarCookieDeSessao_Quando_ChamarRotaDeToken", () => {
    // Cookie junto faria a rota poder ser satisfeita por sessao — e um DP logado veria o que o
    // candidato ve, mascarando falha de token em teste e em producao.
    expect(pagina).toContain('credentials: "omit"');
    expect(pagina).not.toContain('credentials: "include"');
  });

  it("Deve_ImpedirORoteadorDeTratarOFragmentoComoSeletor", () => {
    // O `scrollBehavior` padrao do Nuxt entrega `to.hash` cru como seletor de elemento, e o
    // vue-router, em desenvolvimento, tenta `querySelector("#t=<token>")` so para diagnosticar.
    // O `=` e invalido em CSS, aquilo lanca, e o `catch` imprime o seletor INTEIRO — o segredo — no
    // console do navegador, antes mesmo de a pagina montar. Apagar o hash depois nao alcanca.
    expect(pagina).toContain("scrollToTop: false");
  });

  it("Deve_NaoMontarOWorkspace_Nem_LerSessao", () => {
    for (const proibido of ["AppWorkspace", "carregarSessao", "usePermissoes"]) {
      expect(pagina, proibido).not.toContain(proibido);
    }
  });

  it("Deve_UsarOMesmoNomeDeCabecalhoDoServidor", () => {
    // O nome do cabecalho saiu de `ficha.controller.ts` na V4: as rotas de dependente usam o
    // mesmo, e duas declaracoes divergentes nao quebrariam teste nenhum — so parariam de
    // autenticar. Este teste segue a fonte unica para onde ela foi.
    const servidor = readFileSync(
      join(import.meta.dirname, "..", "..", "api", "src", "admissoes", "convite-http.ts"),
      "utf8"
    );
    expect(servidor).toContain(`"${CABECALHO_DO_CONVITE}"`);
  });
});
