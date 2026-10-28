import { describe, expect, it } from "vitest";
import {
  conferenciaMaquininhaDoRelatorio,
  corDaSituacao,
  numero,
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
