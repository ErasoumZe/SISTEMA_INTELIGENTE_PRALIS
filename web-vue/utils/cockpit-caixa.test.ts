import { describe, expect, it } from "vitest";
import type { Permissao } from "@padaria/shared";
import type { CaixaOperacional, DetalheCaixaResponse, LinhaHistoricoCaixa } from "@padaria/shared";
import type { OperacaoResumo, ResumoCaixa } from "~/types/padaria";
import {
  itemDeLancamento,
  itemDeOperacao,
  mapearCaixasSelecionaveis,
  montarSecoesCockpit,
  saldoDosTotais,
  totaisDoDetalhe,
  totaisDoResumo
} from "./cockpit-caixa";

const TODAS = [
  "entradas_visualizar",
  "transferencias_visualizar",
  "transferencias_criar",
  "despesas_visualizar",
  "despesas_criar",
  "despesas_discriminar",
  "mercadorias_visualizar",
  "mercadorias_criar",
  "mercadorias_discriminar",
  "retiradas_visualizar",
  "retiradas_criar"
] as Permissao[];

const TOTAIS_ZERO = { entradas: 0, transferencias: 0, despesas: 0, mercadorias: 0, retiradas: 0 };

describe("montarSecoesCockpit", () => {
  it("mostra as 5 categorias na ordem do Xmind e cores certas quando ha todas as permissoes", () => {
    const secoes = montarSecoesCockpit(TODAS, TOTAIS_ZERO, true);
    expect(secoes.map((s) => s.categoria)).toEqual([
      "entradas",
      "transferencias",
      "despesas",
      "mercadorias",
      "retiradas"
    ]);
    expect(secoes.find((s) => s.categoria === "despesas")?.cor).toBe("#dc2626");
  });

  it("Entradas nunca aceita +Lancar (venda so por integracao), mesmo com caixa proprio aberto", () => {
    const secoes = montarSecoesCockpit(TODAS, TOTAIS_ZERO, true);
    expect(secoes.find((s) => s.categoria === "entradas")?.podeLancar).toBe(false);
    expect(secoes.find((s) => s.categoria === "despesas")?.podeLancar).toBe(true);
  });

  it("nao mostra +Lancar em modo auditoria (caixa de outro / fechado)", () => {
    const secoes = montarSecoesCockpit(TODAS, TOTAIS_ZERO, false);
    expect(secoes.every((s) => s.podeLancar === false)).toBe(true);
  });

  it("secao sem permissao de visualizar nao renderiza", () => {
    const semDespesas = TODAS.filter((p) => !p.startsWith("despesas_"));
    const secoes = montarSecoesCockpit(semDespesas, TOTAIS_ZERO, true);
    expect(secoes.map((s) => s.categoria)).not.toContain("despesas");
  });

  it("podeDiscriminar respeita a permissao da categoria", () => {
    const semDiscriminar = TODAS.filter((p) => p !== "despesas_discriminar");
    const secoes = montarSecoesCockpit(semDiscriminar, TOTAIS_ZERO, true);
    expect(secoes.find((s) => s.categoria === "despesas")?.podeDiscriminar).toBe(false);
  });
});

describe("totais e saldo", () => {
  it("totaisDoResumo mapeia os campos do resumo", () => {
    const resumo = {
      totalEntradas: 100,
      totalTransferencias: 10,
      totalDespesas: 20,
      totalMercadorias: 5,
      totalRetiradas: 3,
      saldo: 82
    } as ResumoCaixa;
    expect(totaisDoResumo(resumo)).toEqual({
      entradas: 100,
      transferencias: 10,
      despesas: 20,
      mercadorias: 5,
      retiradas: 3
    });
  });

  it("totaisDoDetalhe soma por categoria do detalhe", () => {
    const detalhe: DetalheCaixaResponse = {
      lancamentos: [
        { categoria: "entradas", titulo: "Entradas", total: 50, itens: [] },
        { categoria: "despesas", titulo: "Despesas", total: 8, itens: [] }
      ],
      edicoes: [],
      ajuste: null
    };
    const totais = totaisDoDetalhe(detalhe);
    expect(totais.entradas).toBe(50);
    expect(totais.despesas).toBe(8);
    expect(totais.retiradas).toBe(0);
  });

  it("saldoDosTotais = entradas + transferencias - despesas - retiradas - mercadorias", () => {
    expect(saldoDosTotais({ entradas: 100, transferencias: 10, despesas: 20, mercadorias: 5, retiradas: 3 })).toBe(82);
  });
});

function linhaHistorico(over: Partial<LinhaHistoricoCaixa>): LinhaHistoricoCaixa {
  return {
    id: "cx",
    empresaId: "e",
    dataMovimento: "2026-07-20",
    pdvId: "p",
    pdvNome: "PDV",
    usuarioCaixaId: "u",
    usuarioCaixaNome: "Op",
    colaboradorId: "c",
    colaboradorNome: "Op",
    turnoId: null,
    turnoNome: null,
    dataHoraAbertura: null,
    dataHoraFechamento: null,
    totalEntradas: 0,
    totalTransferencias: 0,
    totalTransferenciasEntrada: 0,
    totalTransferenciasSaida: 0,
    totalDespesas: 0,
    totalRetiradas: 0,
    totalMercadorias: 0,
    saldo: 0,
    status: "fechado",
    temAjuste: false,
    observacao: null,
    ...over
  };
}

describe("mapearCaixasSelecionaveis", () => {
  const proprio: CaixaOperacional = {
    id: "cx-proprio",
    empresaId: "e",
    pdvId: "p1",
    pdvNome: "PDV 1",
    usuarioId: "u",
    usuarioCaixaId: "u",
    usuarioCaixaNome: "Ana",
    colaboradorId: "c",
    dataHoraAbertura: "2026-07-20T10:00:00.000Z",
    abertoEm: "2026-07-20T10:00:00.000Z",
    dataHoraFechamento: null,
    fechadoEm: null,
    tokenEdicao: null,
    turnoId: null,
    observacao: null,
    status: "aberto"
  };
  const historico = [
    linhaHistorico({ id: "cx-proprio", pdvNome: "PDV 1", usuarioCaixaNome: "Ana", status: "aberto" }),
    linhaHistorico({ id: "cx-2", pdvNome: "PDV 2", usuarioCaixaNome: "Beto", status: "fechado" })
  ];

  it("poe o proprio caixa aberto primeiro e nao repete no historico", () => {
    const opcoes = mapearCaixasSelecionaveis(historico, proprio);
    expect(opcoes.map((o) => o.id)).toEqual(["cx-proprio", "cx-2"]);
    expect(opcoes[0]?.ehProprioAberto).toBe(true);
    expect(opcoes[1]?.ehProprioAberto).toBe(false);
  });

  it("sem caixa proprio, lista so o historico", () => {
    const opcoes = mapearCaixasSelecionaveis(historico, null);
    expect(opcoes.map((o) => o.id)).toEqual(["cx-proprio", "cx-2"]);
    expect(opcoes.every((o) => !o.ehProprioAberto)).toBe(true);
  });
});

describe("normalizacao de item de lista", () => {
  it("itemDeOperacao usa dataVenda e valorLiquido quando existem (venda)", () => {
    const op = {
      id: "v1",
      descricao: "Venda 1",
      dataReferencia: "2026-07-20",
      dataVenda: "2026-07-20T13:00:00.000Z",
      valorOriginal: "100",
      valorLiquido: "95",
      pendenteDiscriminacao: false
    } as OperacaoResumo;
    expect(itemDeOperacao(op)).toEqual({
      id: "v1",
      descricao: "Venda 1",
      data: "2026-07-20T13:00:00.000Z",
      valor: 95,
      pendenteDiscriminacao: false
    });
  });

  it("itemDeLancamento usa dataHora quando existe, senao a data contabil", () => {
    expect(
      itemDeLancamento({ id: "l1", descricao: "Despesa", data: "2026-07-20", dataHora: null, valor: 12, sentido: null })
    ).toEqual({ id: "l1", descricao: "Despesa", data: "2026-07-20", valor: 12, pendenteDiscriminacao: false });
  });
});
