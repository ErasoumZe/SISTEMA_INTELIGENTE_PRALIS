// Testes de front da tela de Entradas (S6). O vitest.config fixa TZ=America/Sao_Paulo de proposito:
// os bugs de data desta base so aparecem em fuso NEGATIVO — num CI em UTC passariam por acidente.
import { describe, expect, it } from "vitest";
import {
  TAMANHO_PAGINA_OPERACOES,
  diaInicialEntradas,
  diaLocal,
  paramsListagemOperacoes,
  podeConsultarOutrosDias,
  totalPaginasOperacoes
} from "./entradas";

describe("diaLocal", () => {
  it("devolve o dia LOCAL, nao o dia em UTC", () => {
    // 30/07 as 22h em BRT ja e 31/07 em UTC. Fatiar o toISOString abriria a tela no dia seguinte,
    // vazia, justamente para quem esta conferindo o caixa a noite.
    const noite = new Date("2026-07-31T01:00:00.000Z");
    expect(noite.toISOString().slice(0, 10)).toBe("2026-07-31");
    expect(diaLocal(noite)).toBe("2026-07-30");
  });

  it("preenche mes e dia com zero a esquerda", () => {
    expect(diaLocal(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
  });
});

describe("podeConsultarOutrosDias", () => {
  it("libera quem NAO esta preso ao caixa aberto (gestao/retaguarda)", () => {
    expect(podeConsultarOutrosDias(["entradas_visualizar"])).toBe(true);
  });

  it("bloqueia o perfil preso ao caixa aberto — o servidor forca o dia do caixa", () => {
    expect(podeConsultarOutrosDias(["entradas_visualizar", "menu_entradas_somente_caixa_aberto"])).toBe(false);
  });
});

describe("diaInicialEntradas", () => {
  it("abre em hoje para quem pode consultar outros dias", () => {
    const dia = diaInicialEntradas({ podeConsultarOutrosDias: true, agora: new Date(2026, 6, 30, 9) });
    expect(dia).toBe("2026-07-30");
  });

  it("ignora o caixa quando o perfil pode navegar entre dias", () => {
    const dia = diaInicialEntradas({
      podeConsultarOutrosDias: true,
      dataMovimentoCaixa: "2026-07-01",
      agora: new Date(2026, 6, 30, 9)
    });
    expect(dia).toBe("2026-07-30");
  });

  it("usa o dia CONTABIL do caixa para o perfil preso a ele, mesmo apos a virada da meia-noite", () => {
    // Caixa aberto em 30/07 as 22h, consultado a 00h30 de 31/07: o dia do operador continua 30/07 —
    // e e esse que o servidor vai listar.
    const dia = diaInicialEntradas({
      podeConsultarOutrosDias: false,
      dataMovimentoCaixa: "2026-07-30",
      agora: new Date(2026, 6, 31, 0, 30)
    });
    expect(dia).toBe("2026-07-30");
  });

  it("cai em hoje quando o perfil e preso ao caixa mas nao ha caixa aberto", () => {
    const dia = diaInicialEntradas({
      podeConsultarOutrosDias: false,
      dataMovimentoCaixa: null,
      agora: new Date(2026, 6, 30, 9)
    });
    expect(dia).toBe("2026-07-30");
  });
});

describe("totalPaginasOperacoes", () => {
  it("pagina de 50 em 50", () => {
    expect(TAMANHO_PAGINA_OPERACOES).toBe(50);
    expect(totalPaginasOperacoes(50)).toBe(1);
    expect(totalPaginasOperacoes(51)).toBe(2);
    // O caso que motivou o S6: um dia de padaria com centenas de vendas.
    expect(totalPaginasOperacoes(437)).toBe(9);
  });

  it("nunca devolve menos de uma pagina", () => {
    expect(totalPaginasOperacoes(0)).toBe(1);
    expect(totalPaginasOperacoes(-3)).toBe(1);
  });
});

describe("paramsListagemOperacoes", () => {
  function query(params: URLSearchParams) {
    return Object.fromEntries(params.entries());
  }

  it("sempre manda page e pageSize — sem eles a API devolve o default de 10", () => {
    expect(query(paramsListagemOperacoes({ empresaId: "e1", pagina: 3 }))).toEqual({
      empresaId: "e1",
      page: "3",
      pageSize: "50"
    });
  });

  it("recorta UM dia (dataInicio == dataFim) quando a tela informa o dia", () => {
    expect(query(paramsListagemOperacoes({ empresaId: "e1", pagina: 1, dia: "2026-07-30" }))).toEqual({
      empresaId: "e1",
      dataInicio: "2026-07-30",
      dataFim: "2026-07-30",
      page: "1",
      pageSize: "50"
    });
  });

  it("nao filtra por dia nas telas que nao recortam por dia", () => {
    const params = paramsListagemOperacoes({ empresaId: "e1", pagina: 1, caixaId: "c1" });
    expect(params.has("dataInicio")).toBe(false);
    expect(params.get("caixaId")).toBe("c1");
  });

  it("manda o status da Tesouraria para o servidor antes da paginacao", () => {
    const params = paramsListagemOperacoes({ empresaId: "e1", pagina: 2, statusTransferencia: "divergente" });
    expect(params.get("status")).toBe("divergente");
    expect(params.get("page")).toBe("2");
  });

  it("a fila de pendencias ignora caixa E dia — e visao de retaguarda", () => {
    const params = paramsListagemOperacoes({
      empresaId: "e1",
      pagina: 1,
      pendenteDiscriminacao: true,
      caixaId: "c1",
      dia: "2026-07-30"
    });
    expect(params.get("pendenteDiscriminacao")).toBe("true");
    expect(params.has("caixaId")).toBe(false);
    expect(params.has("dataInicio")).toBe(false);
  });

  it("nao deixa a pagina cair abaixo de 1", () => {
    expect(paramsListagemOperacoes({ empresaId: "e1", pagina: 0 }).get("page")).toBe("1");
  });

  it("aceita um tamanho de pagina proprio (o relatorio usa outro recorte)", () => {
    expect(paramsListagemOperacoes({ empresaId: "e1", pagina: 1, tamanhoPagina: 100 }).get("pageSize")).toBe("100");
  });
});
