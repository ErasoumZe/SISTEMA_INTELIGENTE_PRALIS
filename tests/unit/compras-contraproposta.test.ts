import { describe, expect, it } from "vitest";
import {
  contrapropostaPayloadSchema,
  contrapropostaVigente,
  itensDoAceite,
  situacaoDoItemParaFornecedor,
  type VersaoDoConvite
} from "@padaria/shared/compras";

/**
 * Fase 2 / E7 — contraproposta versionada (R-221 decisao 7). Cada caso diz a regra, para quem ler
 * discordar dela e nao so do resultado. Versao e do livro do CONVITE: fornecedor e comprador na
 * mesma sequencia, nada sobrescreve.
 */
const fornecedor = (versao: number, itens: VersaoDoConvite["itens"]): VersaoDoConvite => ({
  versao,
  autorTipo: "fornecedor",
  itens
});
const comprador = (versao: number, itens: VersaoDoConvite["itens"]): VersaoDoConvite => ({
  versao,
  autorTipo: "comprador",
  itens
});
const preco = (conviteItemId: string, valorUnitario: string) => ({
  conviteItemId,
  indisponivel: false,
  valorUnitario
});

describe("contrapropostaVigente", () => {
  it("sem contraproposta depois da ultima resposta do fornecedor, nao ha nada pendente", () => {
    expect(contrapropostaVigente([fornecedor(1, [preco("a", "12")])])).toEqual([]);
    expect(contrapropostaVigente([])).toEqual([]);
  });

  it("a contraproposta pendente e o que o comprador mandou DEPOIS da ultima versao do fornecedor", () => {
    const versoes = [fornecedor(1, [preco("a", "12")]), comprador(2, [preco("a", "9")])];
    expect(contrapropostaVigente(versoes)).toEqual([{ conviteItemId: "a", valorUnitario: "9" }]);
  });

  it("resposta nova do fornecedor SUPERA a contraproposta (ela deixa de estar pendente)", () => {
    const versoes = [
      fornecedor(1, [preco("a", "12")]),
      comprador(2, [preco("a", "9")]),
      fornecedor(3, [preco("a", "11")])
    ];
    expect(contrapropostaVigente(versoes)).toEqual([]);
  });

  it("varias contrapropostas seguidas se somam por item e a mais recente vence no mesmo item", () => {
    const versoes = [
      fornecedor(1, [preco("a", "12"), preco("b", "5")]),
      comprador(2, [preco("a", "9")]),
      comprador(3, [preco("b", "4")]),
      comprador(4, [preco("a", "8")])
    ];
    expect(contrapropostaVigente(versoes)).toEqual([
      { conviteItemId: "a", valorUnitario: "8" },
      { conviteItemId: "b", valorUnitario: "4" }
    ]);
  });

  it("nao depende da ordem em que as versoes chegam do banco", () => {
    const versoes = [comprador(2, [preco("a", "9")]), fornecedor(1, [preco("a", "12")])];
    expect(contrapropostaVigente(versoes)).toEqual([{ conviteItemId: "a", valorUnitario: "9" }]);
  });
});

describe("itensDoAceite", () => {
  it("o aceite leva o valor da contraproposta e mantem o que o fornecedor ja tinha nos outros itens", () => {
    const ultima = fornecedor(1, [
      preco("a", "12"),
      preco("b", "5"),
      { conviteItemId: "c", indisponivel: true, valorUnitario: null }
    ]);
    const itens = itensDoAceite(ultima, [{ conviteItemId: "a", valorUnitario: "9" }]);
    expect(itens).toEqual([
      { conviteItemId: "a", indisponivel: false, valorUnitario: "9" },
      { conviteItemId: "b", indisponivel: false, valorUnitario: "5" },
      { conviteItemId: "c", indisponivel: true, valorUnitario: null }
    ]);
  });

  it("contraproposta para item que o fornecedor nao tinha precificado entra no aceite", () => {
    const ultima = fornecedor(1, [preco("a", "12")]);
    expect(itensDoAceite(ultima, [{ conviteItemId: "b", valorUnitario: "7" }])).toEqual([
      { conviteItemId: "a", indisponivel: false, valorUnitario: "12" },
      { conviteItemId: "b", indisponivel: false, valorUnitario: "7" }
    ]);
  });
});

describe("situacaoDoItemParaFornecedor", () => {
  it("comprado vale para qualquer vencedor e nao revela quem nem por quanto", () => {
    expect(situacaoDoItemParaFornecedor({ comprado: true, ofereceuPreco: false })).toBe("comprado");
    expect(situacaoDoItemParaFornecedor({ comprado: true, ofereceuPreco: true })).toBe("comprado");
  });

  it("com preco dele e sem compra e 'em analise' (cobre acima da base E sem base: nao revela a direcao da base)", () => {
    expect(situacaoDoItemParaFornecedor({ comprado: false, ofereceuPreco: true })).toBe("em_analise");
  });

  it("sem preco dele (nao respondeu ou disse que nao tem) e 'nao cotado'", () => {
    expect(situacaoDoItemParaFornecedor({ comprado: false, ofereceuPreco: false })).toBe("nao_cotado");
  });
});

describe("contrapropostaPayloadSchema", () => {
  const uuid = "11111111-1111-4111-8111-111111111111";

  it("aceita itens com valor positivo", () => {
    const lido = contrapropostaPayloadSchema.parse({
      empresaId: uuid,
      itens: [{ rodadaItemId: uuid, valorUnitario: "9.5" }]
    });
    expect(lido.itens[0]?.valorUnitario).toBe(9.5);
  });

  it("recusa lista vazia, valor zero/negativo/enorme e id que nao e uuid", () => {
    const base = { empresaId: uuid };
    expect(contrapropostaPayloadSchema.safeParse({ ...base, itens: [] }).success).toBe(false);
    for (const valorUnitario of [0, -1, 1e12, Number.POSITIVE_INFINITY]) {
      expect(
        contrapropostaPayloadSchema.safeParse({ ...base, itens: [{ rodadaItemId: uuid, valorUnitario }] }).success
      ).toBe(false);
    }
    expect(
      contrapropostaPayloadSchema.safeParse({ ...base, itens: [{ rodadaItemId: "x", valorUnitario: 1 }] }).success
    ).toBe(false);
  });
});
