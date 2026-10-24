import { describe, expect, it } from "vitest";
import { ConplusGoogleSyncService } from "../../api/src/conplus/conplus-google.service.js";
import {
  CONPLUS_ABAS,
  CABECALHOS_RESCISOES_ENTRADA,
  mapearRegistroConplus,
  mapearRescisaoTecnica,
  prepararAtualizacoesConplus,
  validarAbaConplus
} from "../../api/src/conplus/conplus-google-mapping.js";
import { CONFIG_ABAS } from "../../api/src/conplus/conplus-google.service.js";

describe("mapeamento Conplus para Google Sheets", () => {
  it("usa a linha 6 como cabeçalho e a linha 8 como primeira linha de dados nas quatro abas", () => {
    expect(Object.values(CONFIG_ABAS)).toEqual([
      { linhaCabecalho: 6, primeiraLinhaDados: 8 },
      { linhaCabecalho: 6, primeiraLinhaDados: 8 },
      { linhaCabecalho: 6, primeiraLinhaDados: 8 },
      { linhaCabecalho: 6, primeiraLinhaDados: 8 }
    ]);
  });

  it("usa os cabeçalhos presentes, mesmo reorganizados", () => {
    expect(
      prepararAtualizacoesConplus(
        ["Campo interno RH", " EMPREGADO ", "Contrato", "Valor"],
        { empregado: "Pessoa fictícia", contrato: "001", valor: "10" },
        ["Empregado", "Contrato", "Valor"]
      )
    ).toEqual([
      { coluna: 1, valor: "Pessoa fictícia" },
      { coluna: 2, valor: "001" },
      { coluna: 3, valor: "10" }
    ]);
  });

  it("não preenche campos internos e recusa cabeçalhos ambíguos", () => {
    expect(() =>
      prepararAtualizacoesConplus(
        ["SALÁRIO", "EMPREGADO", "EMPREGADO"],
        { salário: "9000", empregado: "Pessoa fictícia" },
        ["Empregado"]
      )
    ).toThrow("ambíguos");
  });

  it("exige o nome autorizado da aba e não aceita apenas aproximação", () => {
    expect(() => validarAbaConplus(CONPLUS_ABAS.ferias, "ferias")).not.toThrow();
    expect(() => validarAbaConplus("CONPLUS FÉRIAS", "ferias")).toThrow();
  });

  it("não chama o Google quando a sincronização está desabilitada", async () => {
    let chamadas = 0;
    const mock = {
      validarIdentidade: async () => {
        chamadas += 1;
      },
      lerCabecalhos: async () => ["Colaborador"],
      inserirAtualizacoesSemSobrescrever: async () => {
        chamadas += 1;
        return { linha: 7, ranges: [] };
      }
    };
    const resultado = await new ConplusGoogleSyncService(mock, false).sincronizar("ferias", [
      { valores: { Colaborador: "Fictício" }, camposPermitidos: ["Colaborador"] }
    ]);
    expect(resultado).toEqual({ habilitada: false, aba: "CONPLUS FOLHA DE PAGAMENTO FÉRIAS", linhas: [] });
    expect(chamadas).toBe(0);
  });

  it("não converte a data para o campo Mês sem regra oficial validada", () => {
    const mapeado = mapearRegistroConplus("ferias", {
      contrato: "001",
      empregado: "Pessoa fictícia",
      admissao: "01/01/2020",
      periodoInicial: "01/01/2026",
      periodoFinal: "31/12/2026"
    });
    expect(mapeado.valores).not.toHaveProperty("Mês");
    expect(mapeado.valores).toMatchObject({ Código: "001", Colaborador: "Pessoa fictícia" });
  });

  it("prepara rescisão técnica com os 13 campos oficiais e metadados", () => {
    const resultado = mapearRescisaoTecnica(
      { contrato: "001", empregado: "Pessoa fictícia" },
      {
        idImportacao: "importacao-ficticia",
        idRegistro: "registro-ficticio",
        hashRegistro: "hash-ficticio",
        statusSincronizacao: "pendente",
        criadoEm: "2026-10-21T00:00:00.000Z",
        atualizadoEm: "2026-10-21T00:00:00.000Z"
      }
    );

    expect(resultado.camposPermitidos).toEqual([...CABECALHOS_RESCISOES_ENTRADA]);
    expect(resultado.valores).toMatchObject({
      "Código (Funcionário)": "001",
      Nome: "Pessoa fictícia",
      ID_IMPORTACAO: "importacao-ficticia",
      ID_REGISTRO: "registro-ficticio",
      HASH_REGISTRO: "hash-ficticio",
      STATUS_SINCRONIZACAO: "pendente"
    });
  });

  it("usa a aba técnica somente quando explicitamente habilitado", async () => {
    const mock = {
      validarIdentidade: async () => undefined,
      lerCabecalhos: async () => [...CABECALHOS_RESCISOES_ENTRADA],
      inserirAtualizacoesSemSobrescrever: async () => ({ linha: 2, ranges: [] }),
      lerGrade: async () => ({ sheets: [{ data: [{ rowData: [{ values: [] }] }] }] })
    };
    const service = new ConplusGoogleSyncService(mock, false, { destinoTecnicoRescisoes: true });

    expect(service.abaParaTipo("rescisoes")).toBe("CONPLUS RESCISOES - ENTRADA");
    const previa = await service.prepararPrevia("rescisoes", [
      {
        registroId: "registro-ficticio",
        valores: { "Código (Funcionário)": "001", Nome: "Pessoa fictícia" },
        camposPermitidos: ["Código (Funcionário)", "Nome"]
      }
    ]);

    expect(previa.aba).toBe("CONPLUS RESCISOES - ENTRADA");
    expect(previa.podeGravar).toBe(true);
    expect(previa.celulas.map((celula) => celula.endereco)).toEqual(["A2", "B2"]);
  });

  it("gera prévia somente leitura com endereços e bloqueia células ocupadas", async () => {
    const previa = await new ConplusGoogleSyncService(
      {
        validarIdentidade: async () => undefined,
        lerCabecalhos: async () => ["Código (Funcionário)", "Nome"],
        inserirAtualizacoesSemSobrescrever: async () => ({ linha: 8, ranges: [] }),
        lerGrade: async () => ({
          sheets: [
            {
              data: [
                {
                  rowData: [{ values: [{ effectiveValue: { stringValue: "existente" } }] }, { values: [] }]
                }
              ]
            }
          ]
        })
      },
      false
    ).prepararPrevia("rescisoes", [
      {
        registroId: "registro-ficticio",
        valores: { "Código (Funcionário)": "001", Nome: "Pessoa fictícia" },
        camposPermitidos: ["Código (Funcionário)", "Nome"]
      }
    ]);

    expect(previa.aba).toBe(CONPLUS_ABAS.rescisoes);
    expect(previa.linhaCabecalho).toBe(6);
    expect(previa.primeiraLinhaDados).toBe(8);
    expect(previa.celulas.map((celula) => celula.endereco)).toEqual(["A9", "B9"]);
    expect(previa.celulas[0]?.ocupada).toBe(false);
    expect(previa.podeGravar).toBe(true);
  });

  it("bloqueia a previa quando a linha livre tem protecao ou mesclagem incompativel", async () => {
    const previa = await new ConplusGoogleSyncService(
      {
        validarIdentidade: async () => undefined,
        lerCabecalhos: async () => ["Codigo (Funcionario)", "Nome"],
        inserirAtualizacoesSemSobrescrever: async () => ({ linha: 8, ranges: [] }),
        lerGrade: async () => ({
          sheets: [
            {
              data: [{ rowData: [{ values: [] }] }],
              protectedRanges: [
                { range: { startRowIndex: 7, endRowIndex: 8, startColumnIndex: 0, endColumnIndex: 1 } }
              ],
              merges: [{ startRowIndex: 7, endRowIndex: 8, startColumnIndex: 1, endColumnIndex: 2 }]
            }
          ]
        })
      },
      false
    ).prepararPrevia("rescisoes", [
      {
        registroId: "registro-ficticio",
        valores: { "Codigo (Funcionario)": "001", Nome: "Pessoa ficticia" },
        camposPermitidos: ["Codigo (Funcionario)", "Nome"]
      }
    ]);

    expect(previa.podeGravar).toBe(false);
    expect(previa.celulas).toEqual([]);
    expect(previa.conflitos).toHaveLength(1);
    expect(previa.conflitos[0]).toContain("Nenhuma linha livre");
  });
});
