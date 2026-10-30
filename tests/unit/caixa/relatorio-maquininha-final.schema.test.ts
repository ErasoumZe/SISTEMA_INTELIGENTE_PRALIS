import { describe, expect, it } from "vitest";
import { gerarRelatorioVendasFechamentoSchema, salvarRelatorioMaquininhaFechamentoSchema } from "@padaria/shared/caixa";

const leitura = {
  documentoLegivel: true,
  numeroMaquininha: "CX-01",
  dataEmissao: "02/10/2026",
  acumulador: 245,
  credito: 120,
  debito: 80,
  pix: 45,
  voucher: 0,
  detalhes: { credito: [], debito: [], pix: [], voucher: [] },
  camposDuvidosos: [],
  observacoes: []
};

describe("contrato dos relatórios de manhã e tarde da maquininha", () => {
  it("aceita as duas fotos e as leituras revisadas", () => {
    expect(
      salvarRelatorioMaquininhaFechamentoSchema.safeParse({
        anexoId: "11111111-1111-4111-8111-111111111111",
        leituraAcumulada: leitura
      }).success
    ).toBe(true);
  });

  it("recusa a antiga referência automática no lugar do relatório da manhã", () => {
    expect(
      salvarRelatorioMaquininhaFechamentoSchema.safeParse({
        anexoManhaId: "11111111-1111-4111-8111-111111111111",
        leituraManha: leitura,
        anexoTardeId: "22222222-2222-4222-8222-222222222222",
        leituraTarde: leitura
      }).success
    ).toBe(false);
  });
});

describe("contrato da prova CREARE", () => {
  const leituraCreare = {
    documentoLegivel: true,
    periodoInicio: "26/10/2026 06:14:58",
    trocoInicial: 0,
    dinheiro: 100,
    credito: 0,
    debito: 0,
    pix: 0,
    voucher: 0,
    total: 100,
    despesas: 0,
    sangria: 0,
    camposDuvidosos: [],
    observacoes: []
  };

  it("exige foto, leitura revisada e o dinheiro do malote para gerar o relatório de vendas", () => {
    expect(gerarRelatorioVendasFechamentoSchema.safeParse({}).success).toBe(false);
    const semContagem = { anexoId: "11111111-1111-4111-8111-111111111111", leituraCreare };
    // R-232 · o dinheiro do fechamento da gaveta e digitado no passo 1 de Vendas e vai junto ao gerar.
    expect(gerarRelatorioVendasFechamentoSchema.safeParse(semContagem).success).toBe(false);
    expect(
      gerarRelatorioVendasFechamentoSchema.safeParse({
        ...semContagem,
        contagemFisica: { valorEspecie: 600, valorMoedas: 20 }
      }).success
    ).toBe(true);
  });
});
