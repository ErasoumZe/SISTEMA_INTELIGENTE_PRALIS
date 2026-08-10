import { describe, expect, it } from "vitest";
import { ehRotaPublica, normalizarCaminhoRota, ROTAS_PUBLICAS } from "./rotas-publicas";

// Regressao de producao: a API redireciona para `/reset-password?token=...`, o Nginx normaliza para
// `/reset-password/?token=...`, e a comparacao exata reprovava a barra final. O visitante — que por
// definicao nao tem sessao — era mandado para /login com o token valido na mao.
describe("ehRotaPublica · recuperacao de senha", () => {
  it("visitante em /reset-password permanece na recuperacao", () => {
    expect(ehRotaPublica("/reset-password")).toBe(true);
  });

  // O caso que quebrou em producao.
  it("visitante em /reset-password/ (barra final do Nginx) permanece na recuperacao", () => {
    expect(ehRotaPublica("/reset-password/")).toBe(true);
  });

  it("barras finais repetidas tambem sao aceitas", () => {
    expect(ehRotaPublica("/reset-password//")).toBe(true);
  });
});

describe("ehRotaPublica · demais rotas publicas", () => {
  it("/login e /forgot-password continuam publicas, com e sem barra final", () => {
    for (const caminho of ["/login", "/login/", "/forgot-password", "/forgot-password/"]) {
      expect(ehRotaPublica(caminho), caminho).toBe(true);
    }
  });

  it("a allowlist tem exatamente as tres telas de autenticacao", () => {
    expect([...ROTAS_PUBLICAS].sort()).toEqual(["/forgot-password", "/login", "/reset-password"]);
  });
});

describe("ehRotaPublica · rotas protegidas continuam protegidas", () => {
  it("rota protegida sem barra final exige sessao", () => {
    for (const caminho of ["/", "/caixa", "/transferencias", "/usuarios", "/permissoes"]) {
      expect(ehRotaPublica(caminho), caminho).toBe(false);
    }
  });

  // Trailing slash nao pode virar um passe livre para o resto do sistema.
  it("rota protegida COM barra final continua exigindo sessao", () => {
    for (const caminho of ["/caixa/", "/transferencias/", "/usuarios/", "/permissoes/"]) {
      expect(ehRotaPublica(caminho), caminho).toBe(false);
    }
  });

  // A correcao normaliza a barra FINAL, e so ela. Nao e allowlist por prefixo: qualquer coisa
  // ABAIXO de uma rota publica continua protegida.
  it("nao libera por prefixo: subcaminhos de rota publica seguem protegidos", () => {
    for (const caminho of [
      "/reset-password/admin",
      "/reset-password/qualquer/coisa",
      "/login/admin",
      "/forgot-password/x",
      "/reset-password-admin",
      "/admin/reset-password"
    ]) {
      expect(ehRotaPublica(caminho), caminho).toBe(false);
    }
  });

  it("nao libera por diferenca de caixa alta (a allowlist e exata)", () => {
    expect(ehRotaPublica("/Reset-Password")).toBe(false);
  });
});

describe("normalizarCaminhoRota", () => {
  it("remove barras finais, exceto na raiz", () => {
    expect(normalizarCaminhoRota("/reset-password/")).toBe("/reset-password");
    expect(normalizarCaminhoRota("/reset-password///")).toBe("/reset-password");
    expect(normalizarCaminhoRota("/reset-password")).toBe("/reset-password");
  });

  it("a raiz continua sendo a raiz, e nao vira string vazia", () => {
    expect(normalizarCaminhoRota("/")).toBe("/");
    expect(normalizarCaminhoRota("//")).toBe("/");
    expect(normalizarCaminhoRota("")).toBe("/");
  });

  // `to.path` do Vue Router ja vem sem query e sem hash. A funcao nao os interpreta de proposito:
  // se um dia chegar algo assim, ela NAO deve fingir que e a rota publica.
  it("nao interpreta query nem hash como parte do caminho", () => {
    expect(ehRotaPublica("/reset-password?token=abc")).toBe(false);
    expect(ehRotaPublica("/reset-password#x")).toBe(false);
  });
});

// A query viaja fora do `path`, entao a decisao do middleware nao a toca. Este teste fixa o
// contrato: normalizar o caminho nao pode consumir nem alterar o token do link.
describe("token da recuperacao sobrevive a decisao do middleware", () => {
  it("path e query sao independentes: a rota e publica e o token continua intacto", () => {
    const rota = { path: "/reset-password/", query: { token: "tok-123", callback: "/caixa" } };

    expect(ehRotaPublica(rota.path)).toBe(true);
    expect(rota.query.token).toBe("tok-123");
    expect(rota.query.callback).toBe("/caixa");
  });
});
