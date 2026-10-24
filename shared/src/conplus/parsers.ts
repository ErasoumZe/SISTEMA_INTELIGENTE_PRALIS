import type {
  ConplusDiagnostico,
  ConplusEvento,
  ConplusFolhaRow,
  ConplusPeriodoAquisitivo,
  ConplusRescisao,
  ConplusTabularColumn,
  ConplusTipoEvento
} from "./types.js";

const DATA_BR = /^\d{2}\/\d{2}\/\d{4}$/u;
const NUMERO_BR = /^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+|\.\d+)?$/u;

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .trim()
    .replace(/\s+/gu, " ")
    .toUpperCase();
}

function diagnostico(diagnosticos: ConplusDiagnostico[], linha: number, mensagem: string): void {
  diagnosticos.push({ linha, mensagem });
}

function parseNumero(texto: string): string {
  const valor = texto.trim();
  return NUMERO_BR.test(valor) ? valor : "";
}

function parseData(texto: string): string {
  return DATA_BR.test(texto.trim()) ? texto.trim() : "";
}

function validarDatas(valores: string[], linha: number, diagnosticos: ConplusDiagnostico[], campos: string[]): boolean {
  let valido = true;
  valores.forEach((valor, indice) => {
    if (!parseData(valor)) {
      diagnostico(diagnosticos, linha, `${campos[indice]} deve estar no formato DD/MM/YYYY`);
      valido = false;
    }
  });
  return valido;
}

function encontrarCabecalho(linhas: string[], predicado: (linha: string) => boolean): number {
  return linhas.findIndex((linha) => predicado(normalizar(linha)));
}

/**
 * Lê o relatório textual de rescisões calculadas sem tentar reconstruir datas truncadas.
 * O exportador do Questor separa as colunas por espaços alinhados; tabulação também é aceita.
 */
export function parseRescisoesCalculadas(texto: string): {
  registros: ConplusRescisao[];
  diagnosticos: ConplusDiagnostico[];
} {
  const registros: ConplusRescisao[] = [];
  const diagnosticos: ConplusDiagnostico[] = [];
  const linhas = texto.replace(/\r\n?/gu, "\n").split("\n");
  const inicio = encontrarCabecalho(
    linhas,
    (linha) => linha.includes("CONTRATO DO EMPREGADO") && linha.includes("CAUSA DEMISSAO")
  );

  if (inicio < 0) {
    diagnostico(diagnosticos, 1, "Cabeçalho de rescisões calculadas não encontrado");
    return { registros, diagnosticos };
  }

  for (let indice = inicio + 1; indice < linhas.length; indice += 1) {
    const original = linhas[indice]?.trim() ?? "";
    if (!original || /^[-=]+$/u.test(original)) continue;
    const partes = original
      .split(/\t+|\s{2,}/u)
      .map((parte) => parte.trim())
      .filter(Boolean);
    if (partes.length < 12) {
      diagnostico(diagnosticos, indice + 1, "Linha de rescisão não possui as 12 colunas esperadas");
      continue;
    }

    const [
      contratoEmpregado = "",
      admissao = "",
      avisoPrevio = "",
      demissao = "",
      sequencia = "",
      saldoFgts = "",
      salario = "",
      proventos = "",
      descontos = "",
      liquido = "",
      fgtsGrrf = "",
      causaDemissao = "",
      ...causaRestante
    ] = partes;
    const identificacao = contratoEmpregado.split(/\s+-\s+|\s{2,}/u);
    const contrato = identificacao[0] ?? "";
    const empregado = identificacao.slice(1).join(" - ").trim();
    const datasValidas = validarDatas([admissao, avisoPrevio, demissao], indice + 1, diagnosticos, [
      "Admissão",
      "Aviso prévio",
      "Demissão"
    ]);
    if (!datasValidas || !contrato || !empregado) continue;

    const numeros = [saldoFgts, salario, proventos, descontos, liquido, fgtsGrrf].map((valor) =>
      parseNumero(valor ?? "")
    );
    if (numeros.some((valor) => !valor)) {
      diagnostico(diagnosticos, indice + 1, "Valores monetários inválidos na linha de rescisão");
      continue;
    }
    registros.push({
      contrato,
      empregado,
      admissao,
      avisoPrevio,
      demissao,
      sequencia,
      saldoFgts: numeros[0]!,
      salario: numeros[1]!,
      proventos: numeros[2]!,
      descontos: numeros[3]!,
      liquido: numeros[4]!,
      fgtsGrrf: numeros[5]!,
      causaDemissao: [causaDemissao, ...causaRestante].join(" ").trim()
    });
  }
  return { registros, diagnosticos };
}

/** CSV semicolon-quoted, com aspas escapadas por duas aspas. */
export function parseCsvPontoEVirgula(texto: string): string[][] {
  const linhas: string[][] = [[]];
  let campo = "";
  let entreAspas = false;
  for (let indice = 0; indice < texto.length; indice += 1) {
    const caractere = texto[indice];
    const proximo = texto[indice + 1];
    if (caractere === '"') {
      if (entreAspas && proximo === '"') {
        campo += '"';
        indice += 1;
      } else {
        entreAspas = !entreAspas;
      }
    } else if (caractere === ";" && !entreAspas) {
      linhas[linhas.length - 1]!.push(campo);
      campo = "";
    } else if ((caractere === "\n" || caractere === "\r") && !entreAspas) {
      if (caractere === "\r" && proximo === "\n") indice += 1;
      linhas[linhas.length - 1]!.push(campo);
      campo = "";
      linhas.push([]);
    } else {
      campo += caractere;
    }
  }
  linhas[linhas.length - 1]!.push(campo);
  return linhas.filter((linha) => linha.some((valor) => valor.trim() !== ""));
}

export function parsePeriodosAquisitivos(texto: string): {
  registros: ConplusPeriodoAquisitivo[];
  diagnosticos: ConplusDiagnostico[];
} {
  const registros: ConplusPeriodoAquisitivo[] = [];
  const diagnosticos: ConplusDiagnostico[] = [];
  const linhas = parseCsvPontoEVirgula(texto);
  const indiceCabecalho = linhas.findIndex((linha) => normalizar(linha.join(" ")).includes("PERIODO (INICIAL/FINAL)"));
  if (indiceCabecalho < 0) {
    diagnostico(diagnosticos, 1, "Cabeçalho de períodos aquisitivos não encontrado");
    return { registros, diagnosticos };
  }

  for (let indice = indiceCabecalho + 1; indice < linhas.length; indice += 1) {
    const linha = linhas[indice]!;
    if (linha.length !== 10) {
      diagnostico(diagnosticos, indice + 1, "Linha de período aquisitivo ambígua: esperado exatamente 10 campos");
      continue;
    }
    const [
      contratoEmpregado = "",
      limiteSemDobra = "",
      admissao = "",
      periodo = "",
      faltas = "",
      afastamentos = "",
      saldo = "",
      pago = "",
      tipo = "",
      quantidade = ""
    ] = linha.map((valor) => valor.trim());
    const datas = periodo.split(/\s+\/\s+|\s+-\s+/u);
    if (
      datas.length !== 2 ||
      !validarDatas([admissao, datas[0] ?? "", datas[1] ?? ""], indice + 1, diagnosticos, [
        "Admissão",
        "Período inicial",
        "Período final"
      ])
    )
      continue;
    const identificacao = contratoEmpregado.split(/\s+-\s+|\s{2,}/u);
    if (!identificacao[0] || !identificacao.slice(1).join(" ").trim()) {
      diagnostico(diagnosticos, indice + 1, "Contrato/empregado ausente no período aquisitivo");
      continue;
    }
    registros.push({
      contrato: identificacao[0],
      empregado: identificacao.slice(1).join(" - ").trim(),
      limiteSemDobra,
      admissao,
      periodoInicial: datas[0]!,
      periodoFinal: datas[1]!,
      faltas,
      afastamentos,
      saldo,
      pago,
      tipo,
      quantidade
    });
  }
  return { registros, diagnosticos };
}

function eventoUnidade(
  natureza: string | null,
  referencia: string | null,
  valor: string | null
): ConplusTipoEvento | null {
  const texto = normalizar(natureza ?? "");
  if (texto === "H" || texto.includes("HORA")) return "H";
  if (texto === "R" || texto.includes("REFER")) return "R";
  if (texto === "V" || texto.includes("VALOR")) return "V";
  if (referencia && !valor) return "R";
  if (valor && !referencia) return "V";
  return null;
}

/**
 * Normaliza uma linha já extraída da planilha. O leitor XLSX permanece separado deste módulo.
 * Assim, os códigos/naturezas/referências/valores são preservados sem conversão implícita.
 */
export function parseFolhaTabular(input: { colunas: ConplusTabularColumn[]; linhas: Array<Array<string | null>> }): {
  registros: ConplusFolhaRow[];
  diagnosticos: ConplusDiagnostico[];
} {
  const diagnosticos: ConplusDiagnostico[] = [];
  const registros: ConplusFolhaRow[] = [];
  input.linhas.forEach((linha, indiceLinha) => {
    const identificacao: Record<string, string | null> = {};
    const totais: Record<string, string | null> = {};
    const bases: Record<string, string | null> = {};
    const adicionais: Record<string, string | null> = {};
    const eventos: ConplusEvento[] = [];
    input.colunas.forEach((coluna, indiceColuna) => {
      const valor = linha[indiceColuna] ?? null;
      if (coluna.codigo?.trim()) {
        const unidade = eventoUnidade(coluna.natureza ?? null, coluna.referencia ?? null, coluna.valor ?? valor);
        const referencia = coluna.referencia ?? valor;
        const valorEvento = coluna.valor ?? null;
        if (!unidade) {
          diagnostico(diagnosticos, indiceLinha + 1, `Unidade H/R/V ausente para o evento ${coluna.codigo}`);
        }
        eventos.push({
          codigo: coluna.codigo.trim(),
          natureza: coluna.natureza ?? null,
          referencia,
          valor: valorEvento,
          unidade
        });
      } else if (coluna.campo?.trim()) {
        identificacao[coluna.campo.trim()] = valor;
      }
    });
    if (eventos.length === 0 && Object.keys(identificacao).length === 0) {
      diagnostico(diagnosticos, indiceLinha + 1, "Linha tabular sem identificação ou evento");
      return;
    }
    registros.push({ identificacao, eventos, totais, bases, adicionais });
  });
  return { registros, diagnosticos };
}
