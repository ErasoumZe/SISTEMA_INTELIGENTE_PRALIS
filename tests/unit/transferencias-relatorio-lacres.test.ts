import { describe, expect, it } from "vitest";
import {
  derivarSituacaoMalote,
  ehMaloteDeIda,
  escaparCuringasLike,
  montarLacresDaLinha,
  type LacreDoBanco,
  type LinhaParaRelatorio
} from "../../api/src/transferencias/relatorio-lacres.js";

const MALOTE = "malote-1";
const SANGRIA = "sangria-1";

function malote(parcial: Partial<LinhaParaRelatorio> = {}): LinhaParaRelatorio {
  return {
    id: MALOTE,
    tipo: "suprimento",
    status: "pendente",
    caixaId: null,
    nLacreDoc: "A-100",
    ehPlanejamentoRetorno: false,
    lacreFechamentoDoCaixa: null,
    pdvsDestino: ["PDV 1"],
    ...parcial
  };
}

function lacre(parcial: Partial<LacreDoBanco> & Pick<LacreDoBanco, "numero" | "origem">): LacreDoBanco {
  return { transferenciaId: null, transferenciaDistribuicaoId: null, rompido: false, ...parcial };
}

describe("relatorio de transferencias - situacao do malote", () => {
  it("pendente, sem caixa, Cofre -> PDV = disponivel", () => {
    expect(derivarSituacaoMalote(malote())).toBe("disponivel");
  });

  it("agendada NAO e disponivel (a abertura recusa ate o cron libera-la)", () => {
    expect(derivarSituacaoMalote(malote({ status: "agendada" }))).toBe("agendado");
  });

  it("abertura recebida = usado", () => {
    expect(derivarSituacaoMalote(malote({ tipo: "abertura", status: "recebido", caixaId: "cx-1" }))).toBe("usado");
  });

  it("suprimento recebido pela confirmacao generica, sem caixa, nao some: recebido_sem_caixa", () => {
    expect(derivarSituacaoMalote(malote({ status: "recebido" }))).toBe("recebido_sem_caixa");
  });

  it("suprimento direto para PDV com caixa aberto nao e malote", () => {
    expect(derivarSituacaoMalote(malote({ status: "recebido", caixaId: "cx-1" }))).toBeNull();
  });

  it("divergente e cancelada mantem o proprio estado e nunca viram disponivel", () => {
    expect(derivarSituacaoMalote(malote({ status: "divergente" }))).toBe("divergente");
    expect(derivarSituacaoMalote(malote({ status: "cancelada" }))).toBe("cancelado");
  });

  it("sangria/retorno, planejamento legado e transferencia entre contas nao tem situacao de malote", () => {
    expect(derivarSituacaoMalote(malote({ tipo: "retorno", caixaId: "cx-1" }))).toBeNull();
    expect(derivarSituacaoMalote(malote({ tipo: "sangria", caixaId: "cx-1" }))).toBeNull();
    expect(derivarSituacaoMalote(malote({ ehPlanejamentoRetorno: true }))).toBeNull();
    expect(derivarSituacaoMalote(malote({ pdvsDestino: [] }))).toBeNull();
    expect(ehMaloteDeIda(malote({ pdvsDestino: [] }))).toBe(false);
  });
});

describe("relatorio de transferencias - lacres", () => {
  const lacresDoMalote: LacreDoBanco[] = [
    lacre({ numero: "A-100", origem: "saida", transferenciaId: MALOTE }),
    lacre({ numero: "F-100", origem: "fechamento", transferenciaId: MALOTE }),
    lacre({ numero: "B-2", origem: "retorno", transferenciaDistribuicaoId: MALOTE }),
    lacre({ numero: "B-10", origem: "retorno", transferenciaDistribuicaoId: MALOTE }),
    lacre({ numero: "B-1", origem: "retorno", transferenciaDistribuicaoId: MALOTE })
  ];

  it("malote disponivel: abertura disponivel, fechamento reservado e bolsas disponiveis em ordem natural", () => {
    const lacres = montarLacresDaLinha(malote(), lacresDoMalote, true);
    expect(lacres.map((item) => [item.tipo, item.numero, item.situacao])).toEqual([
      ["abertura", "A-100", "disponivel"],
      ["fechamento", "F-100", "reservado"],
      ["sangria", "B-1", "disponivel"],
      ["sangria", "B-2", "disponivel"],
      ["sangria", "B-10", "disponivel"]
    ]);
  });

  it("sem permissao, esconde o numero do que ainda nao foi rompido, mas nao o da abertura", () => {
    const lacres = montarLacresDaLinha(malote(), lacresDoMalote, false);
    expect(lacres.find((item) => item.tipo === "abertura")?.numero).toBe("A-100");
    expect(lacres.find((item) => item.tipo === "fechamento")?.numero).toBeNull();
    expect(lacres.filter((item) => item.tipo === "sangria").every((item) => item.numero === null)).toBe(true);
  });

  it("bolsa tem TRES estados: disponivel, usada aguardando conferencia e conferida", () => {
    const lacres = montarLacresDaLinha(
      malote({ tipo: "abertura", status: "recebido", caixaId: "cx-1" }),
      [
        lacre({ numero: "A-100", origem: "saida", transferenciaId: MALOTE, rompido: true }),
        lacre({ numero: "B-1", origem: "retorno", transferenciaDistribuicaoId: MALOTE }),
        lacre({ numero: "B-2", origem: "retorno", transferenciaDistribuicaoId: MALOTE, transferenciaId: SANGRIA }),
        lacre({
          numero: "B-3",
          origem: "retorno",
          transferenciaDistribuicaoId: MALOTE,
          transferenciaId: "sangria-2",
          rompido: true
        })
      ],
      false
    );
    const bolsas = lacres.filter((item) => item.tipo === "sangria");
    expect(bolsas.map((item) => [item.situacao, item.usadoEmTransferenciaId])).toEqual([
      ["disponivel", null],
      ["usada_aguardando_conferencia", SANGRIA],
      ["conferida", "sangria-2"]
    ]);
    // Rompida e conferida: o numero aparece mesmo sem permissao; as outras ficam ocultas.
    expect(bolsas.map((item) => item.numero)).toEqual([null, null, "B-3"]);
    expect(lacres.find((item) => item.tipo === "abertura")?.situacao).toBe("usado");
  });

  it("a MESMA bolsa vira lacre proprio na linha da sangria, sem duplicar no malote", () => {
    const bolsa = lacre({
      numero: "B-2",
      origem: "retorno",
      transferenciaDistribuicaoId: MALOTE,
      transferenciaId: SANGRIA
    });
    const linhaSangria: LinhaParaRelatorio = {
      ...malote({ tipo: "retorno", caixaId: "cx-1", id: SANGRIA, nLacreDoc: "B-2", pdvsDestino: [] })
    };
    const naSangria = montarLacresDaLinha(linhaSangria, [bolsa], false);
    expect(naSangria).toEqual([
      { tipo: "sangria", numero: "B-2", situacao: "usada_aguardando_conferencia", usadoEmTransferenciaId: SANGRIA }
    ]);
    // Na linha do malote a bolsa aparece UMA vez, como bolsa enviada.
    const noMalote = montarLacresDaLinha(malote(), [bolsa], true);
    const bolsasNoMalote = noMalote.filter((item) => item.tipo === "sangria");
    expect(bolsasNoMalote).toHaveLength(1);
    expect(bolsasNoMalote[0]?.situacao).toBe("usada_aguardando_conferencia");
  });

  it("caixa antigo, sem lacre de fechamento reservado, usa o lacre gravado no fechamento do caixa", () => {
    const lacres = montarLacresDaLinha(
      malote({ tipo: "abertura", status: "recebido", caixaId: "cx-1", lacreFechamentoDoCaixa: "FECH-OLD" }),
      [lacre({ numero: "A-100", origem: "saida", transferenciaId: MALOTE, rompido: true })],
      false
    );
    expect(lacres.find((item) => item.tipo === "fechamento")).toEqual({
      tipo: "fechamento",
      numero: "FECH-OLD",
      situacao: "usado",
      usadoEmTransferenciaId: null
    });
  });

  it("transferencia antiga sem nenhum lacre devolve lista vazia (a tela mostra 'Sem lacre')", () => {
    expect(montarLacresDaLinha(malote({ nLacreDoc: null, pdvsDestino: [] }), [], true)).toEqual([]);
  });

  it("sem registro em `lacres`, o lacre de abertura vem de nLacreDoc e a situacao do status", () => {
    expect(montarLacresDaLinha(malote(), [], true)).toEqual([
      { tipo: "abertura", numero: "A-100", situacao: "disponivel", usadoEmTransferenciaId: null }
    ]);
    expect(montarLacresDaLinha(malote({ tipo: "abertura", status: "recebido" }), [], true)[0]?.situacao).toBe("usado");
  });
});

describe("relatorio de transferencias - busca de lacre", () => {
  it("escapa % _ e a barra, para que '%' deixe de casar qualquer lacre (D-14)", () => {
    expect(escaparCuringasLike("100%")).toBe("100\\%");
    expect(escaparCuringasLike("A_1")).toBe("A\\_1");
    expect(escaparCuringasLike("a\\b")).toBe("a\\\\b");
    expect(escaparCuringasLike("ABC-1")).toBe("ABC-1");
  });
});
