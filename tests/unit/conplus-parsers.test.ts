import { describe, expect, it } from "vitest";
import {
  parseCsvPontoEVirgula,
  parseFolhaTabular,
  parsePeriodosAquisitivos,
  parseRescisoesCalculadas
} from "../../shared/src/conplus/index.js";

describe("parsers Conplus", () => {
  it("lê rescisão calculada e rejeita data truncada sem inventar o ano", () => {
    const texto = [
      "RELATORIO",
      "Contrato do Empregado  Admissão  Aviso Prev  Demissão  Seq  Saldo FGTS  Salário  Proventos  Descontos  Líquido  FGTS-GRRF  Causa Demissão",
      "1001 - Pessoa Fictícia  01/01/2020  02/01/2020  03/01/2020  1  10,00  2.000,00  2.100,00  100,00  2.000,00  10,00  Pedido do empregado",
      "1002 - Outra Pessoa  01/01/202  02/01/2020  03/01/2020  1  10,00  2.000,00  2.100,00  100,00  2.000,00  10,00  Acordo"
    ].join("\n");
    const resultado = parseRescisoesCalculadas(texto);
    expect(resultado.registros).toHaveLength(1);
    expect(resultado.registros[0]?.contrato).toBe("1001");
    expect(resultado.registros[0]?.proventos).toBe("2.100,00");
    expect(resultado.diagnosticos).toHaveLength(1);
  });

  it("interpreta CSV com aspas, separador semicolon e período aquisitivo", () => {
    const texto = [
      'Empresa;"Relatório"',
      "Contrato do Empregado;Lim.S/Dobra;Admissão;Período (inicial/final);Faltas;Afast;Saldo;Pago;Tp;Qtd",
      "2001 - Dependente Fictício;31/12/2026;01/01/2020;01/01/2020 - 31/12/2020;0;0;30;0;D;30"
    ].join("\n");
    const resultado = parsePeriodosAquisitivos(texto);
    expect(resultado.registros).toEqual([
      expect.objectContaining({ contrato: "2001", periodoInicial: "01/01/2020", periodoFinal: "31/12/2020" })
    ]);
    expect(resultado.diagnosticos).toEqual([]);
    expect(parseCsvPontoEVirgula('A;"B;C"')).toEqual([["A", "B;C"]]);
  });

  it("preserva códigos e unidade H/R/V da folha sem conversão", () => {
    const resultado = parseFolhaTabular({
      colunas: [
        { campo: "Código do Funcionário" },
        { campo: "Nome" },
        { codigo: "80", natureza: "V", referencia: null, valor: "1500,00" },
        { codigo: "165", natureza: "R", referencia: "2", valor: null },
        { codigo: "167", natureza: "H", referencia: "120", valor: null }
      ],
      linhas: [["3001", "Colaborador Fictício", "1500,00", "2", "120"]]
    });
    expect(resultado.diagnosticos).toEqual([]);
    expect(resultado.registros[0]?.eventos).toEqual([
      expect.objectContaining({ codigo: "80", unidade: "V", valor: "1500,00" }),
      expect.objectContaining({ codigo: "165", unidade: "R", referencia: "2" }),
      expect.objectContaining({ codigo: "167", unidade: "H", referencia: "120" })
    ]);
  });

  it("não aceita linha de férias ambígua", () => {
    const resultado = parsePeriodosAquisitivos(
      [
        "Contrato do Empregado;Lim.S/Dobra;Admissão;Período (inicial/final);Faltas;Afast;Saldo;Pago;Tp;Qtd",
        "4001 - Pessoa;31/12/2026;01/01/2020;01/01/2020;0;0;30;0;D"
      ].join("\n")
    );
    expect(resultado.registros).toHaveLength(0);
    expect(resultado.diagnosticos[0]?.mensagem).toContain("exatamente 10 campos");
  });
});
