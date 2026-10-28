import { describe, expect, it } from "vitest";
import { camposAlteradosFolha, leituraDaSugestao, type SugestaoFolhaCreare } from "./folha-creare";

describe("camposAlteradosFolha", () => {
  const sugestao = {
    documentoLegivel: true,
    nomeLoja: null,
    dataEmissao: null,
    periodoInicio: null,
    periodoFim: null,
    trocoInicial: 243.2,
    saldoInicial: null,
    clientes: null,
    credito: 947.05,
    debito: 779.72,
    dinheiro: null,
    pix: null,
    voucher: null,
    total: null,
    despesas: null,
    sangria: 600,
    saldoFinalDinheiro: null,
    camposDuvidosos: ["debito"],
    observacoes: []
  } as SugestaoFolhaCreare;

  it("so conta numero travado (lido pela IA) que mudou", () => {
    const leitura = { ...leituraDaSugestao(sugestao), credito: "947,50", debito: "1,00", sangria: "-600,00" };
    // Debito era duvidoso (nao travado) e a sangria com sinal e o mesmo valor: so o credito conta.
    expect(camposAlteradosFolha(leitura, sugestao)).toEqual(["CREDITO (VND/TRANS)"]);
  });
});
