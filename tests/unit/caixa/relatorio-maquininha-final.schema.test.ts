import { describe, expect, it } from "vitest";
import { salvarRelatorioMaquininhaFechamentoSchema } from "@padaria/shared/caixa";

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
