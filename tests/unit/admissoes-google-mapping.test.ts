import { describe, expect, it } from "vitest";
import {
  CABECALHOS_COLABORADOR,
  CABECALHOS_DEPENDENTE,
  mapearColaboradorParaSheets,
  mapearDependenteParaSheets,
  prepararLinhaColaboradorParaSheets,
  validarCabecalhosColaborador
} from "../../api/src/admissoes/google-mapping.service.js";
import { GoogleSheetHeaderError } from "../../api/src/google/google-errors.js";
import { validarCabecalhos } from "../../api/src/google/google-sheets.service.js";

const colaborador = {
  processoId: "processo-ficticio-1",
  nomeCompleto: "Pessoa de Teste",
  cpf: "52998224725",
  nascimento: "1990-01-02",
  sexo: "Feminino",
  estadoCivil: "Solteira(a)",
  racaCor: "Parda",
  nacionalidade: "Brasileira",
  naturalidade: "Vitoria",
  nomeMae: "Mae de Teste",
  nomePai: null,
  cep: "29000000",
  logradouro: "Rua de Teste",
  numero: "10",
  complemento: "Casa",
  bairro: "Centro",
  municipio: "Vitoria",
  uf: "ES",
  telefone: "27999999999",
  email: "teste@example.com",
  documentos: {
    cpf: "https://drive.google.com/file/d/cpf-ficticio/view",
    comprovante_residencia: null
  }
} as const;

describe("mapeamento de admissao para Sheets", () => {
  it("mapeia colaborador sem preencher campos internos ou dependentes", () => {
    const registro = mapearColaboradorParaSheets(colaborador);

    expect(registro).toMatchObject({
      ID: "processo-ficticio-1",
      "NOME COMPLETO": "Pessoa de Teste",
      CPF: "52998224725",
      "N°/COMPLEMENTO": "10 / Casa",
      "CPF (LINK DO ANEXO)": "https://drive.google.com/file/d/cpf-ficticio/view",
      "STATUS DOCUMENTOS": "Pendente"
    });
    expect(registro).not.toHaveProperty("SALÁRIO");
    expect(registro).not.toHaveProperty("BANCO");
    expect(registro).not.toHaveProperty("Nome do dependente");
    expect(Object.keys(registro)).not.toContain("Identificador do colaborador");
  });

  it("gera uma linha independente para cada dependente e aceita documento sem link como pendente", () => {
    const primeiro = mapearDependenteParaSheets({
      processoId: "processo-ficticio-1",
      nomeCompleto: "Dependente Um",
      nascimento: "2015-03-04",
      parentesco: "Filho(a)",
      cpf: null,
      finalidades: ["Imposto de renda"],
      documentos: { certidao_nascimento_rg: "https://drive.google.com/file/d/certidao/view" }
    });
    const segundo = mapearDependenteParaSheets({
      processoId: "processo-ficticio-1",
      nomeCompleto: "Dependente Dois",
      nascimento: "2018-05-06",
      parentesco: "Filho(a)",
      cpf: "52998224725",
      finalidades: ["Auxílio-creche"],
      documentos: {}
    });

    expect(primeiro).toMatchObject({
      "Identificador do colaborador": "processo-ficticio-1",
      "Nome do dependente": "Dependente Um",
      "Status dos documentos": "Pendente"
    });
    expect(primeiro["Links dos documentos"]).toContain("https://drive.google.com/file/d/certidao/view");
    expect(segundo["Nome do dependente"]).toBe("Dependente Dois");
    expect(segundo["Links dos documentos"]).toBeNull();
  });

  it("mantem a preparacao independente da ordem dos cabecalhos", () => {
    const registro = mapearColaboradorParaSheets(colaborador);
    const cabecalhosReorganizados = ["CPF", "NOME COMPLETO", "SALÁRIO", "CPF (LINK DO ANEXO)"];
    const linha = cabecalhosReorganizados.map((cabecalho) => registro[cabecalho] ?? null);
    expect(linha).toEqual([
      "52998224725",
      "Pessoa de Teste",
      null,
      "https://drive.google.com/file/d/cpf-ficticio/view"
    ]);
  });

  it("detecta cabecalhos ausentes e duplicados", () => {
    expect(() => validarCabecalhos(["Nome", "CPF", "cpf"], ["Nome", "CPF", "Data"])).toThrowError(
      GoogleSheetHeaderError
    );
    try {
      validarCabecalhos(["Nome", "CPF", "cpf"], ["Nome", "CPF", "Data"]);
    } catch (error) {
      expect(error).toMatchObject({ faltantes: ["Data"], duplicados: ["cpf"] });
    }
  });

  it("reconhece RAÇA/COR e RAÇA COR como o mesmo cabeçalho", () => {
    const cabecalhos = [
      ...CABECALHOS_COLABORADOR.map((cabecalho) => (cabecalho === "RAÇA/COR" ? "RAÇA COR" : cabecalho)),
      "QUANTOS FILHOS ?",
      "STATUS DOCUMENTOS"
    ];

    expect(() => validarCabecalhosColaborador(cabecalhos)).not.toThrow();
  });

  it("mapeia o processoId para ID sem depender da posição da coluna", () => {
    const cabecalhos = ["STATUS DOCUMENTOS", "ID", "NOME COMPLETO", "RAÇA COR"];
    expect(() => validarCabecalhosColaborador(cabecalhos)).toThrowError(GoogleSheetHeaderError);

    const linha = prepararLinhaColaboradorParaSheets(
      [
        ...CABECALHOS_COLABORADOR.slice(0, 1),
        ...CABECALHOS_COLABORADOR.slice(1, -1)
          .reverse()
          .map((cabecalho) => (cabecalho === "RAÇA/COR" ? "RAÇA COR" : cabecalho)),
        "STATUS DOCUMENTOS",
        "QUANTOS FILHOS ?",
        "STATUS DOCUMENTOS"
      ],
      colaborador
    );
    expect(linha).toContain("processo-ficticio-1");
  });

  it("usa o contexto do bloco e não preenche o STATUS DOCUMENTOS dos dependentes", () => {
    const cabecalhos = [...CABECALHOS_COLABORADOR, "QUANTOS FILHOS ?", "STATUS DOCUMENTOS"];
    const linha = prepararLinhaColaboradorParaSheets(cabecalhos, colaborador);
    const status = cabecalhos
      .map((cabecalho, indice) => (cabecalho === "STATUS DOCUMENTOS" ? linha[indice] : undefined))
      .filter((valor) => valor !== undefined);

    expect(status).toEqual(["Pendente", null]);
  });

  it("usa o comprovante de escolaridade do bloco do colaborador e preserva o legado", () => {
    const cabecalhos = [
      ...CABECALHOS_COLABORADOR,
      "QUANTOS FILHOS ?",
      "COMPROVANTE ESCOLARIDADE (LINK DO ANEXO)",
      "STATUS DOCUMENTOS"
    ];
    const linha = prepararLinhaColaboradorParaSheets(cabecalhos, {
      ...colaborador,
      documentos: {
        comprovante_escolaridade: "https://drive.google.com/file/d/escolaridade-ficticia/view"
      }
    });
    const indices = cabecalhos.reduce<number[]>((resultado, cabecalho, indice) => {
      if (cabecalho === "COMPROVANTE ESCOLARIDADE (LINK DO ANEXO)") resultado.push(indice);
      return resultado;
    }, []);

    expect(indices).toHaveLength(2);
    expect(linha[indices[0]!]).toBe("https://drive.google.com/file/d/escolaridade-ficticia/view");
    expect(linha[indices[1]!]).toBeNull();
    expect(() => validarCabecalhosColaborador(cabecalhos)).not.toThrow();
  });

  it("mantem os conjuntos de cabecalhos sem colunas de dependentes no colaborador", () => {
    expect(CABECALHOS_COLABORADOR).not.toContain("Nome do dependente");
    expect(CABECALHOS_DEPENDENTE).toContain("Nome do dependente");
  });
});
