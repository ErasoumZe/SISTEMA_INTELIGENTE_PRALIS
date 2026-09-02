import { describe, expect, it } from "vitest";
import {
  camposConferenciaVazios,
  montarPayloadConfirmacao,
  montarPayloadRecusa,
  valorConferenciaValido
} from "./conferencia-transferencia";

describe("valorConferenciaValido", () => {
  // O caso que motivou a funcao: `0` e uma conferencia legitima ("o envelope veio vazio") e um
  // `if (valor)` a descartaria junto com o campo em branco.
  it("aceita 0 e recusa vazio", () => {
    expect(valorConferenciaValido("0")).toBe(true);
    expect(valorConferenciaValido("0,00".replace(",", "."))).toBe(true);
    expect(valorConferenciaValido("")).toBe(false);
    expect(valorConferenciaValido("   ")).toBe(false);
  });

  it("recusa texto nao numerico e valor negativo", () => {
    expect(valorConferenciaValido("abc")).toBe(false);
    expect(valorConferenciaValido("-1")).toBe(false);
  });
});

describe("montarPayloadConfirmacao · Caixa -> Cofre", () => {
  // A regressao real: o cockpit mandava `nLacreDoc: ""`, o schema exige `.min(1)`, e um movimento
  // SEM lacre (R-026 permite) ficava impossivel de conferir pela tela.
  it("lacre vazio vira null, nunca string vazia", () => {
    const campos = { ...camposConferenciaVazios(), valorRecebido: "10" };
    expect(montarPayloadConfirmacao(campos, "conta-padrao", true).nLacreDoc).toBeNull();
    expect(montarPayloadConfirmacao({ ...campos, lacre: "   " }, "conta-padrao", true).nLacreDoc).toBeNull();
  });

  it("lacre informado viaja aparado", () => {
    const campos = { ...camposConferenciaVazios(), lacre: "  LAC-1  ", valorRecebido: "10" };
    expect(montarPayloadConfirmacao(campos, "conta-padrao", true).nLacreDoc).toBe("LAC-1");
  });

  it("valor 0 e enviado como numero, e nao omitido", () => {
    const campos = { ...camposConferenciaVazios(), valorRecebido: "0" };
    expect(montarPayloadConfirmacao(campos, "conta-padrao", true).valorRecebido).toBe(0);
  });

  it("sem conta digitada usa a conta de destino do movimento", () => {
    const campos = { ...camposConferenciaVazios(), valorRecebido: "5" };
    expect(montarPayloadConfirmacao(campos, "conta-do-movimento", true).contaDestinoId).toBe("conta-do-movimento");
    expect(
      montarPayloadConfirmacao({ ...campos, contaDestinoId: "outra" }, "conta-do-movimento", true).contaDestinoId
    ).toBe("outra");
  });
});

describe("montarPayloadConfirmacao · transferencia GENERICA", () => {
  // A regressao que este bloco protege: na generica o valor e OPCIONAL, e vazio significa "nao
  // informei". Converter para 0 mudaria o comportamento vigente — o servidor entenderia
  // divergencia de valor, confirmaria assim mesmo e notificaria uma divergencia que nao existe.
  it("valor vazio OMITE o campo, em vez de mandar 0", () => {
    const campos = camposConferenciaVazios();
    const payload = montarPayloadConfirmacao(campos, "conta-padrao", false);

    expect("valorRecebido" in payload).toBe(false);
    expect(payload).toEqual({ contaDestinoId: "conta-padrao", nLacreDoc: null });
  });

  it("valor informado continua viajando, inclusive 0", () => {
    const comValor = montarPayloadConfirmacao(
      { ...camposConferenciaVazios(), valorRecebido: "150" },
      "conta-padrao",
      false
    );
    expect(comValor.valorRecebido).toBe(150);

    const comZero = montarPayloadConfirmacao({ ...camposConferenciaVazios(), valorRecebido: "0" }, "conta", false);
    expect(comZero.valorRecebido).toBe(0);
  });

  it("valor invalido tambem e omitido (nao vira NaN no payload)", () => {
    const payload = montarPayloadConfirmacao({ ...camposConferenciaVazios(), valorRecebido: "abc" }, "conta", false);
    expect("valorRecebido" in payload).toBe(false);
  });
});

describe("montarPayloadRecusa", () => {
  // R-183 · sem a flag, a rota so registra a tentativa e o caixa continua travado. O default e
  // deliberado: encerrar e uma escolha da pessoa que contou, nunca um efeito colateral.
  it("nao manda encerrar quando o desfecho nao foi escolhido", () => {
    const campos = { contaDestinoId: "", lacre: "L1", valorRecebido: "180", motivo: "faltou" };
    expect(montarPayloadRecusa(campos, "conta-padrao")).not.toHaveProperty("encerrar");
  });

  it("manda encerrar e o consentimento da sobra quando escolhidos", () => {
    const campos = { contaDestinoId: "", lacre: "L1", valorRecebido: "220", motivo: "sobrou" };
    expect(montarPayloadRecusa(campos, "conta-padrao", { encerrar: true, sobraConfirmada: true })).toMatchObject({
      encerrar: true,
      sobraConfirmada: true,
      valorRecebido: 220
    });
  });

  it("carrega o motivo aparado junto com valor e lacre conferidos", () => {
    const campos = { contaDestinoId: "", lacre: "LAC-9", valorRecebido: "80", motivo: "  faltou dinheiro  " };
    expect(montarPayloadRecusa(campos, "conta-padrao")).toEqual({
      contaDestinoId: "conta-padrao",
      nLacreDoc: "LAC-9",
      valorRecebido: 80,
      motivo: "faltou dinheiro"
    });
  });
});

describe("camposConferenciaVazios", () => {
  // Impede residuo entre conferencias: abrir a segunda com o valor da primeira ja preenchido
  // levaria alguem a confirmar sem contar.
  it("devolve todos os campos em branco", () => {
    expect(camposConferenciaVazios()).toEqual({ contaDestinoId: "", lacre: "", valorRecebido: "", motivo: "" });
  });
});
