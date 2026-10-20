import { describe, expect, it } from "vitest";
import {
  apenasDigitos,
  dataHoraLocal,
  dataHoraParaUtc,
  documentoEhCpf,
  formatarDataHora,
  formatarDataSomenteDia,
  formatarDiaDeTimestamp,
  formatarHora,
  formatarQuantidade,
  mascararCep,
  mascararCnpj,
  mascararCpf,
  mascararDocumento,
  mascararWhatsapp,
  normalizarQuantidadeEditavel,
  normalizarWhatsappParaLink
} from "./formatacao";

describe("formatacao", () => {
  it("converte o relogio local para UTC e o restaura ao preencher o campo", () => {
    const aberturaLocal = "2026-07-14T10:43";
    const aberturaUtc = dataHoraParaUtc(aberturaLocal);

    expect(aberturaUtc).toMatch(/Z$/);
    expect(dataHoraLocal(aberturaUtc)).toBe(aberturaLocal);
    expect(formatarDataHora(aberturaUtc)).toBe(new Date(aberturaUtc).toLocaleString("pt-BR"));
  });

  it("apenasDigitos remove tudo que nao e digito", () => {
    expect(apenasDigitos("12.345-67/ab")).toBe("1234567");
  });

  it("formata quantidade sem zeros decimais artificiais", () => {
    expect(formatarQuantidade("40.000")).toBe("40");
    expect(formatarQuantidade("4.500")).toBe("4,5");
    expect(formatarQuantidade("4.100")).toBe("4,1");
    expect(formatarQuantidade("4.010")).toBe("4,01");
    expect(formatarQuantidade("4.001")).toBe("4,001");
  });

  it("normaliza quantidade para campo numerico sem casas vazias", () => {
    expect(normalizarQuantidadeEditavel("40.000")).toBe("40");
    expect(normalizarQuantidadeEditavel("4.500")).toBe("4.5");
    expect(normalizarQuantidadeEditavel("4.010")).toBe("4.01");
  });

  // Campo date-only ("yyyy-MM-dd") jamais pode passar por Date: seria lido como meia-noite UTC e,
  // em fuso negativo, voltaria um dia. O vitest.config fixa TZ=America/Sao_Paulo para o teste valer.
  it("formatarDataSomenteDia nao desloca a data pura por fuso horario", () => {
    expect(formatarDataSomenteDia("2026-07-16")).toBe("16/07/2026");
    expect(formatarDataSomenteDia("2026-06-30")).toBe("30/06/2026");
    expect(formatarDataSomenteDia("2026-01-01")).toBe("01/01/2026");
  });

  it("formatarDataSomenteDia evita a armadilha que quebrou o detalhe do caixa", () => {
    // O bug real: dataReferencia "2026-07-16" exibida via Date virava "15/07/2026, 21:00:00".
    expect(new Date("2026-07-16").toLocaleDateString("pt-BR")).toBe("15/07/2026"); // prova do fuso
    expect(formatarDataSomenteDia("2026-07-16")).toBe("16/07/2026"); // o helper nao cai nela
  });

  it("formatarDataSomenteDia trata vazio/nulo e aceita timestamp cortando o dia", () => {
    expect(formatarDataSomenteDia(null)).toBe("-");
    expect(formatarDataSomenteDia("")).toBe("-");
    expect(formatarDataSomenteDia("2026-07-16T00:00:00.000Z")).toBe("16/07/2026");
  });

  // Timestamp real e o oposto: TEM de ser convertido para o fuso local.
  it("formatarDiaDeTimestamp usa o dia LOCAL, nao o dia em UTC", () => {
    // 16/07 01:00 UTC = 15/07 22:00 em BRT: o dia local e 15, nao 16.
    expect(formatarDiaDeTimestamp("2026-07-16T01:00:00.000Z")).toBe("15/07/2026");
    expect(formatarDiaDeTimestamp(null)).toBe("-");
  });

  it("formatarHora extrai a hora local do timestamp e trata venda sem hora", () => {
    expect(formatarHora("2026-07-16T12:34:56.000Z")).toBe("09:34:56"); // UTC-3
    expect(formatarHora(null)).toBe("-"); // venda manual nao tem dataVenda
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
    expect(mascararWhatsapp("5511987654321")).toBe("+55 (11) 98765-4321");
    expect(mascararWhatsapp("11")).toBe("11");
  });

  // O banco aceita de 10 a 15 digitos (perfis_usuarios_whatsapp_check). Truncar em 13 era invisivel
  // enquanto o numero nao voltava ao formulario; com o WhatsApp do usuario carregado na edicao, o
  // salvar seguinte gravaria o numero mutilado em cima do certo.
  it("mascararWhatsapp devolve cru o numero que nao cabe no formato brasileiro", () => {
    // 12 digitos sem DDI 55 (ex.: numero estrangeiro) era cortado para 11 e virava outro telefone.
    expect(mascararWhatsapp("351912345678")).toBe("351912345678");
    expect(mascararWhatsapp("12345678901234")).toBe("12345678901234");
    expect(mascararWhatsapp("123456789012345")).toBe("123456789012345");
    // O que tem forma brasileira continua mascarado como antes.
    expect(mascararWhatsapp("5511987654321")).toBe("+55 (11) 98765-4321");
    expect(mascararWhatsapp("551132654321")).toBe("+55 (11) 3265-4321");
  });

  it("normalizarWhatsappParaLink acrescenta DDI somente ao numero local", () => {
    expect(normalizarWhatsappParaLink("(11) 98765-4321")).toBe("5511987654321");
    expect(normalizarWhatsappParaLink("+55 (11) 98765-4321")).toBe("5511987654321");
  });

  it("mascararCep formata 8 digitos", () => {
    expect(mascararCep("01001000")).toBe("01001-000");
    expect(mascararCep("010")).toBe("010");
  });
});
