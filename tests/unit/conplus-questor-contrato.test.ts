import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CAMPOS_BLOQUEADOS_QUESTOR,
  LAYOUT_ADMISSAO_QUESTOR,
  lerLinhaQuestor,
  montarContratoQuestor,
  prepararArquivoAdmissaoQuestor,
  totalDeCamposQuestor,
  type SnapshotAdmissaoPralis,
  type TipoRegistroQuestor
} from "../../shared/src/conplus/index.js";

const oficial = (caminho: string) =>
  readFileSync(fileURLToPath(new URL(`../fixtures/conplus-oficial/admissao/${caminho}`, import.meta.url)), "utf8");

/**
 * Snapshot fictício com os MESMOS valores do exemplo oficial da Conplus, escritos como o Pralís os
 * guarda (CPF/CNPJ/CEP sem máscara, data ISO, rótulos da ficha). Placeholders viram fictícios.
 */
function snapshotDoExemplo(): SnapshotAdmissaoPralis {
  return {
    empresa: { cnpj: "11222333000181" },
    processo: { nomeCompleto: "Nome do Funcionário", cpf: "12345678909" },
    internos: { dataAdmissao: "2025-03-27", ctpsNumero: "0", ctpsSerie: "0", ctpsUf: "MG", pisPasepNit: "12345678901" },
    ficha: {
      nomeSocial: null,
      nascimento: "2000-05-05",
      sexo: "Masculino",
      estadoCivil: "Solteiro(a)",
      racaCor: "Branca",
      grauInstrucao: "Educação Superior completa",
      nacionalidade: "Brasileira",
      nomeMae: "Nome da Mãe",
      nomePai: null,
      cep: "36037467",
      logradouro: "Rua",
      numero: "54",
      complemento: null,
      bairro: "Bairro",
      uf: "MG",
      email: null,
      rgNumero: null,
      rgUf: null,
      rgEmissao: null,
      tituloEleitor: null,
      tituloZona: null,
      tituloSecao: null
    },
    dependentes: [{ nomeCompleto: "Dependente Ficticio", nascimento: "2000-05-05", parentesco: "Filho(a)", cpf: null }]
  };
}

/** Placeholders e valores fora do formato no exemplo oficial → o que o Pralís produz para o mesmo dado. */
const SUBSTITUICOES: Record<string, string> = {
  "CNPJ-COMPLETO": "11.222.333/0001-81",
  "CPF-COMPLETO": "123.456.789-09",
  "CPF-SEM CARACTERES": "12345678909",
  "36037467": "36.037-467",
  "54(número)": "54",
  "MG(Estado)": "MG"
};

const linhasOficiais = () =>
  oficial("exemplo/admissao_unificado.txt")
    .split("\r\n")
    .map((linha) => lerLinhaQuestor(linha).valores);

describe("montagem do contrato a partir dos dados do Pralís", () => {
  it("cada campo preenchido pelo Pralís bate com o mesmo campo do exemplo oficial", () => {
    const { contrato, pendencias } = montarContratoQuestor(snapshotDoExemplo());
    expect(pendencias).toEqual([]);
    const [a, b] = linhasOficiais();
    const divergentes: string[] = [];
    for (const [tipo, nosso, deles] of [
      ["A", contrato.A, a!],
      ["B", contrato.B, b!]
    ] as const) {
      for (const [campo, valor] of Object.entries(nosso)) {
        const esperado = SUBSTITUICOES[deles[campo] ?? ""] ?? deles[campo];
        // PISFUNC é a única diferença intencional: vazio no exemplo (requerido pela doc), preenchido aqui.
        if (campo !== "PISFUNC" && valor !== esperado) divergentes.push(`${tipo}.${campo}: ${valor} x ${esperado}`);
      }
    }
    expect(divergentes).toEqual([]);
    expect(Object.keys(contrato.A).sort()).toEqual(["CODIGOEMPRESA", "CPFFUNC", "DATAADM", "DATANASC", "NOMEFUNC"]);
  });

  it("o dependente sai ligado ao titular como o índice do NLI exige", () => {
    const { contrato } = montarContratoQuestor(snapshotDoExemplo());
    expect(contrato.dependentes?.[0]).toEqual({
      CODIGOEMPRESA: "11.222.333/0001-81",
      CPFFUNC: "12345678909",
      DATAADM: "27/03/2025",
      NOMEDEPEND: "Dependente Ficticio",
      DATANASC: "05/05/2000",
      PARENTESCO: "01"
    });
    const arquivo = prepararArquivoAdmissaoQuestor([snapshotDoExemplo()]);
    expect(arquivo.diagnosticos.filter((item) => item.codigo === "VINCULO")).toEqual([]);
  });

  it("gera linhas com a mesma estrutura dos exemplos oficiais e CRLF em todas", () => {
    const { linhas, conteudo } = prepararArquivoAdmissaoQuestor([snapshotDoExemplo()]);
    const oficiais = oficial("exemplo/admissao_unificado.txt").split("\r\n");
    expect(linhas.map((linha) => linha[0])).toEqual(["A", "B", "C", "D"]);
    linhas.forEach((linha, indice) => {
      expect(linha.split(";")).toHaveLength(oficiais[indice]!.split(";").length);
      expect(linha.split(";")).toHaveLength(totalDeCamposQuestor(linha[0] as TipoRegistroQuestor));
      expect(lerLinhaQuestor(linha).diagnosticos.filter((item) => item.codigo === "ESTRUTURA")).toEqual([]);
    });
    expect(conteudo).toBe(linhas.map((linha) => `${linha}\r\n`).join(""));
  });

  it("deixa vazio — e o validador aponta — tudo que depende das etapas E2 em diante", () => {
    const { diagnosticos, pendencias, valido } = prepararArquivoAdmissaoQuestor([snapshotDoExemplo()]);
    expect(valido).toBe(false);
    expect(pendencias).toEqual([]);
    expect(diagnosticos.every((item) => item.codigo === "OBRIGATORIO")).toBe(true);
    const faltantes = diagnosticos.map((item) => `${item.registro}.${item.campo}`);
    expect(faltantes).toHaveLength(57);
    expect(faltantes.filter((item) => item.startsWith("A."))).toEqual([
      "A.TERMOCONSENTIMENTO",
      "A.GERARPRELIMINAR",
      "A.CODIGOTIPOCONTR",
      "A.CATEGESOCIAL",
      "A.CATEGORIA",
      "A.CODIGOSIND",
      "A.DIACONTREXP",
      "A.DIAPRORROGCONTREXP",
      "A.TIPOSALARIO",
      "A.VALORSAL"
    ]);
    expect(faltantes.filter((item) => item.startsWith("D."))).toEqual([
      "D.SEXO",
      "D.ESTADOCIVIL",
      "D.GRAUINSTR",
      "D.FORMACONTROLEIR",
      "D.NACIONALIDADE",
      "D.FUMANTE",
      "D.CONSOMEALCOOL"
    ]);
    // Nenhum código inventado: município, contrato, cargo, sindicato e estabelecimento seguem vazios.
    expect(faltantes).toEqual(
      expect.arrayContaining([
        "B.CODIGOMUNIC",
        "B.CODIGOMUNICNASC",
        "B.CODIGOESTAB",
        "B.CODIGOESCALA",
        "B.CODIGOTIPOLOGRAD"
      ])
    );
  });

  it("nunca preenche os três campos ambíguos nem campo fora do layout", () => {
    const { contrato } = montarContratoQuestor(snapshotDoExemplo());
    const registros = { A: [contrato.A], B: [contrato.B], C: [contrato.C!], D: contrato.dependentes! };
    for (const [tipo, lista] of Object.entries(registros) as Array<
      [TipoRegistroQuestor, Array<Record<string, unknown>>]
    >) {
      const conhecidos = new Set(LAYOUT_ADMISSAO_QUESTOR[tipo].map((campo) => campo.campo));
      for (const valores of lista) {
        for (const campo of Object.keys(valores)) expect(conhecidos.has(campo), `${tipo}.${campo}`).toBe(true);
        for (const bloqueado of CAMPOS_BLOQUEADOS_QUESTOR[tipo]) expect(valores[bloqueado]).toBeUndefined();
      }
    }
    expect(montarContratoQuestor(snapshotDoExemplo()).contrato.C?.["CODIGOFUNCCONTR"]).toBeUndefined();
  });

  it("não altera o snapshot recebido", () => {
    const snapshot = snapshotDoExemplo();
    const congelado = structuredClone(snapshot);
    montarContratoQuestor(snapshot);
    expect(snapshot).toEqual(congelado);
  });
});

describe("pendências: valor existe no Pralís, mas não tem conversão comprovada", () => {
  it("lista cada caso com o motivo e deixa o campo vazio", () => {
    const base = snapshotDoExemplo();
    const snapshot: SnapshotAdmissaoPralis = {
      ...base,
      ficha: {
        ...base.ficha!,
        racaCor: "Não declarado",
        estadoCivil: "União estável",
        nacionalidade: "Estrangeira",
        numero: "S/N"
      },
      dependentes: [
        { nomeCompleto: "Dependente Um", nascimento: "2019-01-01", parentesco: "Companheiro(a)", cpf: null },
        {
          nomeCompleto: "Dependente Dois",
          nascimento: "2020-01-01",
          parentesco: "Sobrinha querida",
          cpf: "52998224725"
        }
      ]
    };
    const { contrato, pendencias } = montarContratoQuestor(snapshot);
    expect(
      pendencias.map((item) => `${item.registro}.${item.campo}${item.dependente === null ? "" : `#${item.dependente}`}`)
    ).toEqual([
      "B.NUMEROENDER",
      "B.RACACOR",
      "B.ESTADOCIVIL",
      "B.NACIONALIDADE",
      "D.PARENTESCO#0",
      "D.PARENTESCO#1",
      "D.CPFDEPEND#1"
    ]);
    expect(contrato.B["RACACOR"]).toBeUndefined();
    expect(contrato.B["NUMEROENDER"]).toBeUndefined();
    expect(contrato.dependentes?.[1]?.["CPFDEPEND"]).toBeUndefined();
    expect(prepararArquivoAdmissaoQuestor([snapshot]).pendencias.every((item) => item.contrato === 0)).toBe(true);
  });

  it("CNPJ, CPF ou data fora do formato viram pendência, não valor quebrado", () => {
    const base = snapshotDoExemplo();
    const { contrato, pendencias } = montarContratoQuestor({
      ...base,
      empresa: { cnpj: "123" },
      processo: { ...base.processo, cpf: "999" },
      internos: { ...base.internos!, dataAdmissao: "2025-02-31" }
    });
    expect(pendencias.map((item) => item.campo)).toEqual(["CODIGOEMPRESA", "CPFFUNC", "DATAADM", "CPFFUNC"]);
    expect(contrato.A["CODIGOEMPRESA"]).toBeUndefined();
  });

  it("nome maior que o layout é apontado, nunca truncado", () => {
    const base = snapshotDoExemplo();
    const longo = "Nome Ficticio ".repeat(6).trim();
    const arquivo = prepararArquivoAdmissaoQuestor([{ ...base, processo: { ...base.processo, nomeCompleto: longo } }]);
    expect(arquivo.linhas[0]).toContain(longo);
    expect(arquivo.diagnosticos).toEqual(
      expect.arrayContaining([expect.objectContaining({ codigo: "TAMANHO", campo: "NOMEFUNC" })])
    );
  });
});
