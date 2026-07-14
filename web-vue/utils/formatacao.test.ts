import { describe, expect, it } from "vitest";
import {
  apenasDigitos,
  dataHoraUtc,
  documentoEhCpf,
  formatarDataHora,
  mascararCep,
  mascararCnpj,
  mascararCpf,
  mascararDocumento,
  mascararWhatsapp
} from "./formatacao";

describe("formatacao", () => {
  it("preserva o relogio UTC ao preencher e exibir a abertura do caixa", () => {
    const abertura = "2026-07-14T10:43:00.000Z";

    expect(dataHoraUtc(abertura)).toBe("2026-07-14T10:43");
    expect(formatarDataHora(abertura)).toContain("10:43:00");
  });

  it("apenasDigitos remove tudo que nao e digito", () => {
    expect(apenasDigitos("12.345-67/ab")).toBe("1234567");
  });

  it("mascararCpf formata progressivamente e limita a 11 digitos", () => {
    expect(mascararCpf("12345678901")).toBe("123.456.789-01");
    expect(mascararCpf("123456789019999")).toBe("123.456.789-01");
    expect(mascararCpf("123")).toBe("123");
  });

  it("mascararCnpj formata e limita a 14 digitos", () => {
    expect(mascararCnpj("12345678000199")).toBe("12.345.678/0001-99");
  });

  it("mascararDocumento escolhe CPF ate 11 digitos e CNPJ acima", () => {
    expect(mascararDocumento("12345678901")).toBe("123.456.789-01");
    expect(mascararDocumento("12345678000199")).toBe("12.345.678/0001-99");
  });

  it("documentoEhCpf classifica por quantidade de digitos", () => {
    expect(documentoEhCpf("12345678901")).toBe(true);
    expect(documentoEhCpf("12345678000199")).toBe(false);
    expect(documentoEhCpf("")).toBe(false);
  });

  it("mascararWhatsapp formata celular (11) e fixo (10)", () => {
    expect(mascararWhatsapp("11987654321")).toBe("(11) 98765-4321");
    expect(mascararWhatsapp("1132654321")).toBe("(11) 3265-4321");
    expect(mascararWhatsapp("11")).toBe("11");
  });

  it("mascararCep formata 8 digitos", () => {
    expect(mascararCep("01001000")).toBe("01001-000");
    expect(mascararCep("010")).toBe("010");
  });
});
