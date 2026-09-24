import { describe, expect, it } from "vitest";
import {
  camposConferenciaVazios,
  lacreConfereEntrega,
  montarPayloadConfirmacao,
  bloqueiaEnvioPorSobra,
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
    const campos = {
      ...camposConferenciaVazios(),
      valorRecebido: "10",
      valorEspecieContado: "10",
      valorMoedasContado: "0"
    };
    expect(montarPayloadConfirmacao(campos, "conta-padrao", true).nLacreDoc).toBeNull();
    expect(montarPayloadConfirmacao({ ...campos, lacre: "   " }, "conta-padrao", true).nLacreDoc).toBeNull();
  });

  it("lacre informado viaja aparado", () => {
    const campos = {
      ...camposConferenciaVazios(),
      lacre: "  LAC-1  ",
      valorRecebido: "10",
      valorEspecieContado: "10",
      valorMoedasContado: "0"
    };
    expect(montarPayloadConfirmacao(campos, "conta-padrao", true).nLacreDoc).toBe("LAC-1");
  });

  it("valor 0 e enviado como numero, e nao omitido", () => {
    const campos = {
      ...camposConferenciaVazios(),
      valorRecebido: "0",
      valorEspecieContado: "0",
      valorMoedasContado: "0"
    };
    expect(montarPayloadConfirmacao(campos, "conta-padrao", true).valorRecebido).toBe(0);
  });

  it("sem conta digitada usa a conta de destino do movimento", () => {
    const campos = {
      ...camposConferenciaVazios(),
      valorRecebido: "5",
      valorEspecieContado: "5",
      valorMoedasContado: "0"
    };
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

// R-183 · o envio so pode ficar travado por sobra ENQUANTO a pessoa esta recusando e escolheu
// encerrar. Fora disso o botao volta a funcionar, senao ele fica morto sem causa visivel — a caixa
// de consentimento so aparece no modo recusa, entao o motivo do bloqueio estaria escondido.
describe("lacreConfereEntrega", () => {
  it("aceita ausencia dos dois lados", () => {
    expect(lacreConfereEntrega("   ", null)).toBe(true);
  });

  it("exige o lacre da entrega para a confirmacao normal", () => {
    expect(lacreConfereEntrega("", "E2E-AUTO-101-LACRE")).toBe(false);
    expect(lacreConfereEntrega("  E2E-AUTO-101-LACRE  ", "E2E-AUTO-101-LACRE")).toBe(true);
  });

  it("deixa o lacre diferente ser tratado como divergencia", () => {
    expect(lacreConfereEntrega("OUTRO-LACRE", "E2E-AUTO-101-LACRE")).toBe(false);
    expect(lacreConfereEntrega("LACRE-NAO-EXISTE", null)).toBe(false);
  });
});

describe("bloqueiaEnvioPorSobra", () => {
  it("bloqueia quando esta recusando, escolheu encerrar, contou a mais e nao confirmou", () => {
    expect(bloqueiaEnvioPorSobra({ modoRecusa: true, encerrar: true, contouAMais: true, confirmou: false })).toBe(true);
  });

  it("libera assim que a sobra e confirmada", () => {
    expect(bloqueiaEnvioPorSobra({ modoRecusa: true, encerrar: true, contouAMais: true, confirmou: true })).toBe(false);
  });

  it("nao bloqueia fora do modo recusa — e o caso do botao morto ao voltar para Conferir", () => {
    expect(bloqueiaEnvioPorSobra({ modoRecusa: false, encerrar: true, contouAMais: true, confirmou: false })).toBe(
      false
    );
  });

  it("nao bloqueia quando o encerramento nao foi escolhido, nem quando o contado nao passou", () => {
    expect(bloqueiaEnvioPorSobra({ modoRecusa: true, encerrar: false, contouAMais: true, confirmou: false })).toBe(
      false
    );
    expect(bloqueiaEnvioPorSobra({ modoRecusa: true, encerrar: true, contouAMais: false, confirmou: false })).toBe(
      false
    );
  });
});

describe("montarPayloadRecusa", () => {
  // R-183 · sem a flag, a rota so registra a tentativa e o caixa continua travado. O default e
  // deliberado: encerrar e uma escolha da pessoa que contou, nunca um efeito colateral.
  it("nao manda encerrar quando o desfecho nao foi escolhido", () => {
    const campos = {
      ...camposConferenciaVazios(),
      lacre: "L1",
      valorRecebido: "180",
      valorEspecieContado: "180",
      motivo: "faltou"
    };
    expect(montarPayloadRecusa(campos, "conta-padrao")).not.toHaveProperty("encerrar");
  });

  it("manda encerrar e o consentimento da sobra quando escolhidos", () => {
    const campos = {
      ...camposConferenciaVazios(),
      lacre: "L1",
      valorRecebido: "220",
      valorEspecieContado: "220",
      motivo: "sobrou"
    };
    expect(montarPayloadRecusa(campos, "conta-padrao", { encerrar: true, sobraConfirmada: true })).toMatchObject({
      encerrar: true,
      sobraConfirmada: true,
      valorRecebido: 220
    });
  });

  it("carrega o motivo aparado junto com valor e lacre conferidos", () => {
    const campos = {
      ...camposConferenciaVazios(),
      lacre: "LAC-9",
      valorRecebido: "80",
      valorEspecieContado: "80",
      motivo: "  faltou dinheiro  "
    };
    expect(montarPayloadRecusa(campos, "conta-padrao")).toMatchObject({
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
    expect(camposConferenciaVazios()).toEqual({
      contaDestinoId: "",
      lacre: "",
      valorRecebido: "",
      valorEspecieContado: "",
      valorMoedasContado: "",
      motivo: ""
    });
  });
});
