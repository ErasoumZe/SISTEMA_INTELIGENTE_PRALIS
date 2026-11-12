import { describe, expect, it } from "vitest";
import {
  bandeirasDaLeitura,
  celulasCartao,
  celulasPdv,
  chaveCartao,
  chavePdv,
  conferirCartao,
  conferirPdv,
  linhasCartao,
  normalizarData,
  rotuloPdvPlanilha,
  subtrairManha,
  type LeituraCartaoPlanilha,
  type LeituraPdvPlanilha
} from "@padaria/shared/planilha-tesouraria";

// Comprovante PagBank "RELATORIO RESUMIDO" real enviado pelo Marco (10/11/2026, PDV, manha).
const pagbankManha: LeituraCartaoPlanilha = {
  data: "10/11/26",
  numeroSerie: "J9BB07936155",
  totalEfetivado: { transacoes: 231, valor: 3008.44 },
  modalidades: [
    {
      modalidade: "CRÉDITO",
      totalTransacoes: 52,
      totalValor: 707.21,
      bandeiras: [
        { bandeira: "Elo", transacoes: 6, valor: 96.22 },
        { bandeira: "Master", transacoes: 34, valor: 396.41 },
        { bandeira: "Visa", transacoes: 12, valor: 214.58 }
      ]
    },
    {
      modalidade: "DÉBITO",
      totalTransacoes: 91,
      totalValor: 1059.6,
      bandeiras: [
        { bandeira: "Maestro", transacoes: 34, valor: 375.75 },
        { bandeira: "Visa", transacoes: 31, valor: 394.96 },
        { bandeira: "Elo", transacoes: 12, valor: 120.96 },
        { bandeira: "Master", transacoes: 14, valor: 167.93 }
      ]
    },
    {
      modalidade: "VOUCHER",
      totalTransacoes: 32,
      totalValor: 449.83,
      bandeiras: [
        { bandeira: "Pluxee Refeicao", transacoes: 3, valor: 38.37 },
        { bandeira: "Pluxee Alimenta", transacoes: 6, valor: 40.46 },
        { bandeira: "Mastercard", transacoes: 4, valor: 70.4 },
        { bandeira: "VR Refeicao", transacoes: 2, valor: 24.25 },
        { bandeira: "VR Alimentacao", transacoes: 4, valor: 34.28 },
        { bandeira: "Visa", transacoes: 1, valor: 34.79 },
        { bandeira: "Alelo Refeicao", transacoes: 1, valor: 14.2 },
        { bandeira: "Ticket Alimenta", transacoes: 4, valor: 68.5 },
        { bandeira: "Ticket Flex", transacoes: 6, valor: 120.68 },
        { bandeira: "Elo", transacoes: 1, valor: 3.9 }
      ]
    },
    {
      modalidade: "PIX",
      totalTransacoes: 56,
      totalValor: 791.8,
      bandeiras: [{ bandeira: "Pix", transacoes: 56, valor: 791.8 }]
    }
  ],
  camposDuvidosos: []
};

// Folha CREARE "Relatorio de Venda Geral" real (10/11/2026).
const creare: LeituraPdvPlanilha = {
  data: "10/11/2026",
  formas: { credito: 707.21, debito: 1059.5, voucher: 449.83, pix: 791.8, dinheiro: 1197.4, clientes: 197.35 },
  totalImpresso: 4403.09,
  camposDuvidosos: []
};

describe("planilha da Tesouraria", () => {
  it("PDV vem do caixa: numero + M/T; sem numero ou turno, nao ha PDV", () => {
    expect(rotuloPdvPlanilha("PDV 2", "tarde")).toBe("VND CAIXA PDV - 2T");
    expect(rotuloPdvPlanilha("PDV 01", "manha")).toBe("VND CAIXA PDV - 1M");
    expect(rotuloPdvPlanilha("Balcao", "manha")).toBeNull();
    expect(rotuloPdvPlanilha("PDV 3", null)).toBeNull();
  });

  it("data curta vira dd/mm/aaaa; forma estranha pede conferencia", () => {
    expect(normalizarData("10/11/26")).toBe("10/11/2026");
    expect(normalizarData("1/2/2026")).toBe("01/02/2026");
    expect(normalizarData("10-11-26")).toBeNull();
  });

  it("comprovante real da PagBank concilia: bandeiras = subtotais e modalidades = total efetivado", () => {
    expect(conferirCartao(pagbankManha)).toEqual({ status: "CONCILIADO", avisos: [] });
  });

  it("um digito lido errado (0 virou 8) aparece como DIVERGENTE e nao e corrigido sozinho", () => {
    const lida = structuredClone(pagbankManha);
    lida.modalidades[0]!.bandeiras[0]!.valor = 98.22; // era 96,22
    const conferencia = conferirCartao(lida);
    expect(conferencia.status).toBe("DIVERGENTE");
    expect(lida.modalidades[0]!.bandeiras[0]!.valor).toBe(98.22);
  });

  it("valor ilegivel pede conferencia", () => {
    const lida = structuredClone(pagbankManha);
    lida.modalidades[1]!.bandeiras[2]!.valor = null;
    expect(conferirCartao(lida).status).toBe("CONFERÊNCIA NECESSÁRIA");
  });

  it("folha CREARE real concilia: formas somam o total impresso", () => {
    expect(conferirPdv(creare)).toEqual({ status: "CONCILIADO", avisos: [] });
    expect(conferirPdv({ ...creare, totalImpresso: 4403.19 }).status).toBe("DIVERGENTE");
  });

  it("uma linha por bandeira, PDV do caixa repetido, texto em maiusculas", () => {
    const linhas = linhasCartao(bandeirasDaLeitura(pagbankManha), {
      data: "10/11/2026",
      numeroSerie: "J9BB07936155",
      pdv: "VND CAIXA PDV - 1M"
    });
    expect(linhas).toHaveLength(18);
    expect(celulasCartao(linhas[0]!)).toEqual([
      "10/11/2026",
      "J9BB07936155",
      "VND CAIXA PDV - 1M",
      "CRÉDITO",
      "ELO",
      6,
      96.22
    ]);
    expect(linhas.every((linha) => linha.pdv === "VND CAIXA PDV - 1M")).toBe(true);
  });

  it("tarde = acumulado menos a manha, por bandeira; bandeira parada nao gera linha", () => {
    const acumulado = structuredClone(pagbankManha);
    acumulado.modalidades[0]!.bandeiras[1] = { bandeira: "Master", transacoes: 40, valor: 460.41 };
    acumulado.modalidades[3]!.bandeiras[0] = { bandeira: "Pix", transacoes: 60, valor: 850.8 };
    const { bandeiras, avisos } = subtrairManha(acumulado, pagbankManha);
    expect(avisos).toEqual([]);
    expect(bandeiras).toEqual([
      { modalidade: "CRÉDITO", bandeira: "MASTER", transacoes: 6, valor: 64 },
      { modalidade: "PIX", bandeira: "PIX", transacoes: 4, valor: 59 }
    ]);
  });

  it("tarde menor que a manha e impossivel e vira aviso", () => {
    const acumulado = structuredClone(pagbankManha);
    acumulado.modalidades[0]!.bandeiras[0] = { bandeira: "Elo", transacoes: 5, valor: 90 };
    expect(subtrairManha(acumulado, pagbankManha).avisos[0]).toMatch(/TARDE MENOR QUE A MANHÃ/u);
  });

  it("linha do PDV na ordem das colunas F:N e chaves de duplicidade", () => {
    const celulas = celulasPdv({
      data: "10/11/2026",
      pdv: "VND CAIXA PDV - 1M",
      operador: "liliane",
      ...creare.formas
    } as never);
    expect(celulas).toEqual([
      "10/11/2026",
      "VND CAIXA PDV - 1M",
      "LILIANE",
      707.21,
      1059.5,
      449.83,
      791.8,
      1197.4,
      197.35
    ]);
    expect(chavePdv(celulas)).toBe("10/11/2026|VND CAIXA PDV - 1M");
    expect(chaveCartao(["10/11/2026", "J9BB07936155", "VND CAIXA PDV - 1M", "CRÉDITO", "elo", 6, 96.22])).toBe(
      "10/11/2026|J9BB07936155|VND CAIXA PDV - 1M|CRÉDITO|ELO"
    );
  });
});
