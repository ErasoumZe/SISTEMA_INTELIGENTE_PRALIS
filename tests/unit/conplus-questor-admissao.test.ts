import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  LAYOUT_ADMISSAO_QUESTOR,
  lerLinhaQuestor,
  montarArquivoAdmissaoQuestor,
  montarLinhaQuestor,
  totalDeCamposQuestor,
  type ContratoAdmissaoQuestor,
  type TipoRegistroQuestor
} from "../../shared/src/conplus/index.js";

/**
 * Comparação contra os arquivos ORIGINAIS enviados pela Conplus (pasta "API Rodrigo", 07/10/2026):
 * quatro layouts .nli e cinco exemplos .txt, guardados byte a byte em tests/fixtures/conplus-oficial.
 */
const oficial = (caminho: string) =>
  readFileSync(fileURLToPath(new URL(`../fixtures/conplus-oficial/admissao/${caminho}`, import.meta.url)), "utf8");
const gerado = (caminho: string) =>
  readFileSync(fileURLToPath(new URL(`../fixtures/conplus-gerados/${caminho}`, import.meta.url)), "utf8");

const NLI: Record<TipoRegistroQuestor, string> = {
  A: "layout/A_FunContratoPre.nli",
  B: "layout/B_DadosObrigatoriosAdmissao.nli",
  C: "layout/C_DadosNaoObrigatoriosAdmissao.nli",
  D: "layout/D_DependenteRascunho.nli"
};

type CampoNli = { FieldName: string; Coluna: number; Tamanho: number; Tipo: string };

function lerNli(texto: string): { cabecalho: Record<string, string>; campos: CampoNli[] } {
  const cabecalho: Record<string, string> = {};
  const campos: CampoNli[] = [];
  let atual: Record<string, string> | null = null;
  for (const linha of texto.split(/\r?\n/u)) {
    const recuo = /^ */u.exec(linha)?.[0].length ?? 0;
    const conteudo = linha.trim();
    if (conteudo === "object TnCursorLayoutField") atual = {};
    else if (conteudo === "end" && atual) {
      campos.push({
        FieldName: atual["FieldName"]!,
        Coluna: Number(atual["Coluna"]),
        Tamanho: Number(atual["Tamanho"]),
        Tipo: atual["Tipo"]!
      });
      atual = null;
    } else {
      const par = /^(\w+) = '?(.*?)'?$/u.exec(conteudo);
      if (par && atual && recuo >= 4) atual[par[1]!] = par[2]!;
      else if (par && recuo === 2) cabecalho[par[1]!] = par[2]!;
    }
  }
  return { cabecalho, campos };
}

const TIPOS: TipoRegistroQuestor[] = ["A", "B", "C", "D"];
const CNPJ_FICTICIO = "11.222.333/0001-81";
const CPF_FICTICIO = "123.456.789-09";

describe("layout de admissão x NLI oficial", () => {
  it.each(TIPOS)("registro %s: cabeçalho do NLI confirma separador, data e decimal", (tipo) => {
    const { cabecalho } = lerNli(oficial(NLI[tipo]));
    expect(cabecalho).toMatchObject({
      IdentificadorRegistro: tipo,
      Separador: ";",
      SeparadorDecimal: ",",
      FormatoData: "DD/MM/YYYY",
      EhVariavel: "True"
    });
  });

  it.each(TIPOS)("registro %s: todo campo lido pelo NLI existe no layout com a mesma coluna e tamanho", (tipo) => {
    const { campos } = lerNli(oficial(NLI[tipo]));
    const layout = LAYOUT_ADMISSAO_QUESTOR[tipo];
    for (const campo of campos.filter((item) => item.Tipo === "itCampo")) {
      const nosso = layout.find((item) => item.campoNli === campo.FieldName);
      expect(nosso, `${tipo}.${campo.FieldName}`).toBeDefined();
      expect(nosso!.colunaNli).toBe(campo.Coluna);
      expect(nosso!.tamanhoNli).toBe(campo.Tamanho);
    }
  });

  it("as únicas divergências de coluna entre documentação e NLI são as bloqueadas", () => {
    const divergentes = TIPOS.flatMap((tipo) =>
      LAYOUT_ADMISSAO_QUESTOR[tipo]
        .filter((campo) => campo.colunaNli !== null && campo.colunaNli !== campo.coluna)
        .map((campo) => `${tipo}.${campo.campo}: doc ${campo.coluna} / NLI ${campo.colunaNli}`)
    );
    expect(divergentes).toEqual(["C.INDAPREND: doc 67 / NLI 64", "D.ENTREGACERT: doc 32 / NLI 4"]);
  });

  it("quantidade fixa de campos por registro bate com os exemplos oficiais", () => {
    expect(TIPOS.map(totalDeCamposQuestor)).toEqual([21, 85, 67, 32]);
    for (const tipo of TIPOS) {
      expect(oficial(`exemplo/admissao_${tipo}.txt`).split(";")).toHaveLength(totalDeCamposQuestor(tipo));
    }
  });
});

describe("exemplos oficiais da Conplus", () => {
  const unificado = oficial("exemplo/admissao_unificado.txt");

  it("o unificado é a concatenação A, B, C, D dos exemplos isolados, com CRLF", () => {
    const esperado = TIPOS.map((tipo) => oficial(`exemplo/admissao_${tipo}.txt`)).join("\r\n");
    expect(unificado).toBe(esperado);
  });

  it.each(TIPOS)("registro %s: ler e remontar reproduz a linha oficial byte a byte", (tipo) => {
    const linha = oficial(`exemplo/admissao_${tipo}.txt`);
    const lida = lerLinhaQuestor(linha);
    expect(lida.tipo).toBe(tipo);
    expect(lida.diagnosticos.filter((item) => item.codigo === "ESTRUTURA")).toEqual([]);
    expect(montarLinhaQuestor(tipo, lida.valores).linha).toBe(linha);
  });

  it("aponta onde o próprio exemplo oficial não cumpre a documentação", () => {
    const resumo = Object.fromEntries(
      TIPOS.map((tipo) => [
        tipo,
        lerLinhaQuestor(oficial(`exemplo/admissao_${tipo}.txt`)).diagnosticos.map(
          (item) => `${item.codigo}:${item.campo}`
        )
      ])
    );
    expect(resumo).toEqual({
      A: ["FORMATO:CODIGOEMPRESA", "FORMATO:CPFFUNC"],
      B: [
        "FORMATO:CODIGOEMPRESA",
        "OBRIGATORIO:PISFUNC",
        "FORMATO:CEPFUNC",
        "TAMANHO:NUMEROENDER",
        "TIPO:NUMEROENDER",
        "TAMANHO:SIGLAESTADO",
        "TAMANHO:SIGLAESTADONASC",
        "TAMANHO:SIGLAESTADOCTPS"
      ],
      C: ["FORMATO:CODIGOEMPRESA"],
      D: [
        "FORMATO:CODIGOEMPRESA",
        "TAMANHO:CPFFUNC",
        "OBRIGATORIO:NOMEDEPEND",
        "OBRIGATORIO:PARENTESCO",
        "TAMANHO:SEXO",
        "DOMINIO:SEXO",
        "TAMANHO:GRAUINSTR",
        "DOMINIO:GRAUINSTR",
        "DOMINIO:FORMACONTROLEIR",
        "OBRIGATORIO:NACIONALIDADE",
        "OBRIGATORIO:FUMANTE",
        "OBRIGATORIO:CONSOMEALCOOL",
        "BLOQUEADO:ENTREGACERT"
      ]
    });
  });

  it("no unificado, o dependente não aponta para a admissão do registro A", () => {
    const [a, b, c, d] = unificado.split("\r\n").map((linha) => lerLinhaQuestor(linha).valores);
    const { diagnosticos } = montarArquivoAdmissaoQuestor([{ A: a!, B: b!, C: c!, dependentes: [d!] }]);
    // CPF é placeholder nos dois (sem dígitos); a divergência verificável é a data: 27/03/2025 x 17/01/2025.
    expect(diagnosticos.filter((item) => item.codigo === "VINCULO").map((item) => item.campo)).toEqual(["DATAADM"]);
  });
});

/** O exemplo oficial com os placeholders trocados por fictícios válidos — nada além disso. */
function contratoFicticio(): { contrato: ContratoAdmissaoQuestor; trocas: Record<TipoRegistroQuestor, string[]> } {
  const [a, b, c, d] = oficial("exemplo/admissao_unificado.txt")
    .split("\r\n")
    .map((linha) => lerLinhaQuestor(linha).valores);
  const trocasA = { CODIGOEMPRESA: CNPJ_FICTICIO, CPFFUNC: CPF_FICTICIO };
  const trocasB = {
    CODIGOEMPRESA: CNPJ_FICTICIO,
    PISFUNC: "123.45678.90.1",
    CEPFUNC: "36.037-467",
    NUMEROENDER: "54",
    SIGLAESTADO: "MG",
    SIGLAESTADONASC: "MG",
    SIGLAESTADOCTPS: "MG"
  };
  const trocasC = { CODIGOEMPRESA: CNPJ_FICTICIO };
  const trocasD = {
    CODIGOEMPRESA: CNPJ_FICTICIO,
    CPFFUNC: "12345678909",
    DATAADM: a!["DATAADM"]!,
    NOMEDEPEND: "Dependente Ficticio",
    PARENTESCO: "01",
    SEXO: "1",
    GRAUINSTR: "9",
    FORMACONTROLEIR: "1",
    NACIONALIDADE: "10",
    FUMANTE: "0",
    CONSOMEALCOOL: "0",
    ENTREGACERT: ""
  };
  return {
    contrato: {
      A: { ...a, ...trocasA },
      B: { ...b, ...trocasB },
      C: { ...c, ...trocasC },
      dependentes: [{ ...d, ...trocasD }]
    },
    trocas: { A: Object.keys(trocasA), B: Object.keys(trocasB), C: Object.keys(trocasC), D: Object.keys(trocasD) }
  };
}

describe("arquivo fictício gerado pelo Pralís", () => {
  it("é válido e só difere do exemplo oficial nos placeholders substituídos", () => {
    const { contrato, trocas } = contratoFicticio();
    const arquivo = montarArquivoAdmissaoQuestor([contrato]);
    expect(arquivo.diagnosticos).toEqual([]);
    expect(arquivo.valido).toBe(true);

    const oficiais = oficial("exemplo/admissao_unificado.txt").split("\r\n");
    arquivo.linhas.forEach((linha, indice) => {
      const tipo = TIPOS[indice]!;
      const nossa = linha.split(";");
      const deles = oficiais[indice]!.split(";");
      expect(nossa).toHaveLength(deles.length);
      const diferentes = LAYOUT_ADMISSAO_QUESTOR[tipo]
        .filter((campo) => nossa[campo.coluna - 1] !== deles[campo.coluna - 1])
        .map((campo) => campo.campo);
      expect(trocas[tipo]).toEqual(expect.arrayContaining(diferentes));
    });
  });

  it("termina toda linha em CRLF e confere com o arquivo fictício versionado", () => {
    const { conteudo } = montarArquivoAdmissaoQuestor([contratoFicticio().contrato]);
    expect(conteudo.endsWith("\r\n")).toBe(true);
    expect(conteudo.split("\r\n")).toHaveLength(5);
    expect(conteudo).toBe(gerado("admissao_ficticio_pralis.txt"));
  });
});

describe("regras de validação da documentação", () => {
  const base = () => contratoFicticio().contrato;

  it("recusa campo que não existe no layout, em vez de mandar à Conplus", () => {
    const { diagnosticos } = montarLinhaQuestor("A", { ...base().A, MATRICULA_PRALIS: "TNP0001" });
    expect(diagnosticos.map((item) => item.codigo)).toEqual(["CAMPO_DESCONHECIDO"]);
  });

  it("recusa ';' e quebra de linha dentro do valor", () => {
    const { diagnosticos } = montarLinhaQuestor("A", { ...base().A, NOMEFUNC: "Nome; deslocado" });
    expect(diagnosticos.map((item) => item.codigo)).toEqual(["CARACTERE_PROIBIDO"]);
  });

  it("valida data real em DD/MM/AAAA e valor com vírgula decimal", () => {
    const { diagnosticos } = montarLinhaQuestor("A", { ...base().A, DATAADM: "31/02/2025", VALORSAL: "1.518,00" });
    expect(diagnosticos.map((item) => `${item.codigo}:${item.campo}`)).toEqual(["DATA:DATAADM", "TIPO:VALORSAL"]);
    expect(montarLinhaQuestor("A", { ...base().A, VALORSAL: "1518,00" }).diagnosticos).toEqual([]);
  });

  it("aplica as condicionais de DESCRSAL e CODIGOTIPOFATO", () => {
    const comissao = montarLinhaQuestor("A", { ...base().A, TIPOSALARIO: "2" });
    expect(comissao.diagnosticos.map((item) => `${item.codigo}:${item.campo}`)).toEqual(["CONDICIONAL:DESCRSAL"]);
    const fato = montarLinhaQuestor("A", { ...base().A, CODIGOTIPOFATO: "3" });
    expect(fato.diagnosticos.map((item) => `${item.codigo}:${item.campo}`)).toEqual(["CONDICIONAL:CODIGOTIPOFATO"]);
  });

  it("bloqueia os campos de coluna ambígua no NLI", () => {
    const c = montarLinhaQuestor("C", { ...base().C, ORGAOEMISSORRNE: "SSP" });
    expect(c.diagnosticos.map((item) => item.codigo)).toEqual(["BLOQUEADO"]);
  });

  it("ordena A, B, C e dependentes por contrato", () => {
    const um = base();
    const dois = { ...base(), C: null, dependentes: [] };
    const { linhas } = montarArquivoAdmissaoQuestor([um, dois]);
    expect(linhas.map((linha) => linha[0])).toEqual(["A", "B", "C", "D", "A", "B"]);
  });
});
