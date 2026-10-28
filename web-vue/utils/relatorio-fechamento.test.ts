import { describe, expect, it } from "vitest";
import {
  conferenciaMaquininhaDoRelatorio,
  duracaoDaParada,
  etapaDoRelatorioMaquininha,
  corDaSituacao,
  numero,
  rotuloMotivoParada,
  separarPorSituacao,
  textoDaSituacao,
  valorOpcional,
  type LinhaRelatorio
} from "./relatorio-fechamento";

const linha = (id: string, situacaoTesouraria: string): LinhaRelatorio => ({ id, situacaoTesouraria }) as never;

describe("situacao da Tesouraria", () => {
  it("cada situacao conhecida tem cor e texto proprios", () => {
    expect(corDaSituacao("conferido_tesouraria")).toBe("success");
    expect(textoDaSituacao("com_quebra")).toBe("Com quebra");
  });

  it("situacao desconhecida ou ausente cai em neutro, sem quebrar a tela", () => {
    expect(corDaSituacao("inventada")).toBe("secondary");
    expect(textoDaSituacao("inventada")).toBe("Status não informado");
    expect(textoDaSituacao(undefined)).toBe("Status não informado");
  });
});

describe("separarPorSituacao", () => {
  it("divide em para conferir, historico e em operacao", () => {
    const resultado = separarPorSituacao([
      linha("1", "aguardando_tesouraria"),
      linha("2", "com_quebra"),
      linha("3", "conferido_tesouraria"),
      linha("4", "divergencia_confirmada_tesouraria"),
      linha("5", "aberto"),
      linha("6", "em_fechamento")
    ]);
    expect(resultado.paraConferir.map((item) => item.id)).toEqual(["1", "2"]);
    expect(resultado.historico.map((item) => item.id)).toEqual(["3", "4"]);
    expect(resultado.emOperacao.map((item) => item.id)).toEqual(["5", "6"]);
  });
});

describe("numeros e maquininha", () => {
  it("numero converte texto e trata vazio como zero; valorOpcional preserva o vazio", () => {
    expect(numero("12.5")).toBe(12.5);
    expect(numero(undefined)).toBe(0);
    expect(valorOpcional("")).toBeNull();
    expect(valorOpcional(null)).toBeNull();
    expect(valorOpcional("0")).toBe(0);
  });

  it("liquido so existe quando inicial e final existem", () => {
    const linhas = conferenciaMaquininhaDoRelatorio({ creditoInicial: 100, creditoFinal: 250, pixInicial: 10 });
    expect(linhas.find((item) => item.forma === "Credito")?.liquido).toBe(150);
    expect(linhas.find((item) => item.forma === "Pix")?.liquido).toBeNull();
    expect(linhas.find((item) => item.forma === "Debito")?.liquido).toBeNull();
  });
});

describe("parada do computador do PDV", () => {
  it("traduz o motivo e mantem o desconhecido como veio", () => {
    expect(rotuloMotivoParada("falta_energia")).toBe("Falta de energia na loja");
    expect(rotuloMotivoParada("motivo_novo")).toBe("motivo_novo");
  });

  it("calcula a duracao da parada", () => {
    expect(duracaoDaParada("2026-10-27T12:00:00Z", "2026-10-27T12:12:00Z")).toBe("12 min");
    expect(duracaoDaParada("2026-10-27T12:00:00Z", "2026-10-27T13:05:00Z")).toBe("1h05");
    expect(duracaoDaParada("2026-10-27T12:00:00Z", "2026-10-27T12:00:20Z")).toBe("menos de 1 min");
    expect(duracaoDaParada("2026-10-27T12:00:00Z", null)).toBe("Sem retorno registrado");
    expect(duracaoDaParada("2026-10-27T12:00:00Z", "2026-10-27T11:00:00Z")).toBe("Duração indisponível");
  });
});

describe("liquido da maquininha manha e tarde", () => {
  it("manha (sem leitura inicial) mostra o acumulado como liquido, em vez de Nao informado", () => {
    const linhas = conferenciaMaquininhaDoRelatorio({ creditoInicial: null, creditoFinal: 100, pixFinal: 20 });
    expect(linhas.find((item) => item.forma === "Credito")?.liquido).toBe(100);
    expect(linhas.find((item) => item.forma === "Pix")?.liquido).toBe(20);
    expect(linhas.find((item) => item.forma === "Debito")?.liquido).toBeNull();
  });

  it("tarde usa o liquido que o servidor gravou (acumulado do dia menos a manha)", () => {
    const linhas = conferenciaMaquininhaDoRelatorio({
      creditoInicial: 100,
      creditoFinal: 160,
      dadosRevisados: { etapaDia: "tarde", liquidos: { credito: 60, pix: 25 } }
    });
    const credito = linhas.find((item) => item.forma === "Credito");
    expect(credito).toMatchObject({ inicial: 100, acumulado: 160, liquido: 60 });
    expect(linhas.find((item) => item.forma === "Pix")?.liquido).toBe(25);
  });

  it("identifica o turno do relatorio", () => {
    expect(etapaDoRelatorioMaquininha({ dadosRevisados: { etapaDia: "tarde" } })).toBe("tarde");
    expect(etapaDoRelatorioMaquininha({ dadosRevisados: { etapaDia: "manha" } })).toBe("manha");
    expect(etapaDoRelatorioMaquininha({})).toBeNull();
    expect(etapaDoRelatorioMaquininha(null)).toBeNull();
  });
});
