import {
  LAYOUT_ADMISSAO_QUESTOR,
  type CampoLayoutQuestor,
  type TipoRegistroQuestor
} from "./questor-admissao-layout.js";

/**
 * Arquivo TXT de admissão para o Questor (ERP Parceiro x Questor Folha — enviar dados).
 *
 * Regras que vêm da documentação oficial, e não de escolha nossa:
 * - um registro por linha, identificado pela letra na 1ª posição, sem aspas, seguida de `;`;
 * - quantidade de `;` fixa por tipo de registro (registro incompleto é rejeitado pelo Questor);
 * - cada linha termina com ASC 13 + ASC 10;
 * - datas DD/MM/AAAA e separador decimal `,` (cabeçalho dos NLI).
 *
 * Este módulo só MONTA e CONFERE texto. Ele não busca dados, não grava e não envia: a origem dos
 * códigos do Questor (tipo de contrato, sindicato, cargo, escala, município) ainda não existe no
 * Pralís, e mandar valor inventado ao Questor é pior que não mandar.
 */

export const SEPARADOR_QUESTOR = ";";
export const FIM_DE_LINHA_QUESTOR = "\r\n";

export type ValoresRegistroQuestor = Readonly<Record<string, string | null | undefined>>;

export type CodigoDiagnosticoQuestor =
  | "ESTRUTURA"
  | "CAMPO_DESCONHECIDO"
  | "CARACTERE_PROIBIDO"
  | "TAMANHO"
  | "TIPO"
  | "DATA"
  | "DOMINIO"
  | "FORMATO"
  | "OBRIGATORIO"
  | "CONDICIONAL"
  | "BLOQUEADO"
  | "VINCULO";

export type DiagnosticoQuestor = {
  registro: TipoRegistroQuestor | null;
  campo: string | null;
  coluna: number | null;
  codigo: CodigoDiagnosticoQuestor;
  mensagem: string;
};

/**
 * Campos em que a documentação e o NLI apontam colunas diferentes. Enquanto a Conplus não disser qual
 * vale, enviar valor neles é apostar: o NLI de C lê INDAPREND e ORGAOEMISSORRNE da MESMA coluna 64,
 * e o NLI de D lê ENTREGACERT da coluna 4, que é a DATAADM.
 */
export const CAMPOS_BLOQUEADOS_QUESTOR: Readonly<Record<TipoRegistroQuestor, readonly string[]>> = {
  A: [],
  B: [],
  C: ["INDAPREND", "ORGAOEMISSORRNE"],
  D: ["ENTREGACERT"]
};

const MASCARA_CNPJ = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/u;

/** Máscaras que a documentação exige explicitamente, campo a campo. */
const FORMATOS_DOCUMENTADOS: Partial<Record<TipoRegistroQuestor, Record<string, { regex: RegExp; exemplo: string }>>> =
  {
    A: {
      CODIGOEMPRESA: { regex: MASCARA_CNPJ, exemplo: "99.999.999/0009-99" },
      CPFFUNC: { regex: /^\d{3}\.\d{3}\.\d{3}-\d{2}$/u, exemplo: "999.999.999-99" }
    },
    B: {
      CODIGOEMPRESA: { regex: MASCARA_CNPJ, exemplo: "99.999.999/0009-99" },
      PISFUNC: { regex: /^\d{3}\.\d{5}\.\d{2}\.\d$/u, exemplo: "999.99999.99.9" },
      CEPFUNC: { regex: /^\d{2}\.\d{3}-\d{3}$/u, exemplo: "99.999-999" }
    },
    C: { CODIGOEMPRESA: { regex: MASCARA_CNPJ, exemplo: "99.999.999/0009-99" } },
    D: { CODIGOEMPRESA: { regex: MASCARA_CNPJ, exemplo: "99.999.999/0009-99" } }
  };

const TIPOS: readonly TipoRegistroQuestor[] = ["A", "B", "C", "D"];

export function totalDeCamposQuestor(tipo: TipoRegistroQuestor): number {
  return LAYOUT_ADMISSAO_QUESTOR[tipo].length + 1;
}

function dataValida(texto: string): boolean {
  const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/u.exec(texto);
  if (!partes) return false;
  const [dia, mes, ano] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

function limiteDeTamanho(campo: CampoLayoutQuestor): number | null {
  const limites = [campo.tamanhoDoc, campo.tamanhoNli].filter((valor): valor is number => valor !== null);
  return limites.length ? Math.min(...limites) : null;
}

function validarCampo(
  tipo: TipoRegistroQuestor,
  campo: CampoLayoutQuestor,
  valor: string,
  diagnosticos: DiagnosticoQuestor[]
): void {
  const registrar = (codigo: CodigoDiagnosticoQuestor, mensagem: string) =>
    diagnosticos.push({ registro: tipo, campo: campo.campo, coluna: campo.coluna, codigo, mensagem });

  if (/[;\r\n]/u.test(valor)) {
    registrar("CARACTERE_PROIBIDO", "Valor contém ';' ou quebra de linha, o que desloca as colunas do registro");
    return;
  }
  if (valor === "") {
    if (campo.requerido) registrar("OBRIGATORIO", `${campo.campo} é requerido pela documentação`);
    return;
  }
  if (CAMPOS_BLOQUEADOS_QUESTOR[tipo].includes(campo.campo)) {
    registrar("BLOQUEADO", `${campo.campo}: documentação e NLI divergem na coluna; aguardar confirmação da Conplus`);
    return;
  }
  const limite = limiteDeTamanho(campo);
  if (limite !== null && valor.length > limite) {
    registrar("TAMANHO", `${campo.campo} aceita até ${limite} caracteres`);
  }
  if (campo.tipo === "data" && !dataValida(valor)) {
    registrar("DATA", `${campo.campo} deve estar em DD/MM/AAAA`);
  } else if (campo.precisaoNli > 0 || campo.tipo === "numerico") {
    const casas = campo.precisaoNli;
    const regex = casas > 0 ? new RegExp(`^-?\\d+(,\\d{1,${casas}})?$`, "u") : /^-?\d+$/u;
    if (!regex.test(valor))
      registrar("TIPO", `${campo.campo} deve ser número com vírgula decimal (até ${casas} casas)`);
  } else if (campo.tipo === "inteiro" && !/^-?\d+$/u.test(valor)) {
    registrar("TIPO", `${campo.campo} deve ser inteiro`);
  }
  if (campo.dominio && !campo.dominio.includes(valor)) {
    registrar("DOMINIO", `${campo.campo} aceita apenas: ${campo.dominio.join(", ")}`);
  }
  const formato = FORMATOS_DOCUMENTADOS[tipo]?.[campo.campo];
  if (formato && !formato.regex.test(valor)) {
    registrar("FORMATO", `${campo.campo} deve seguir o formato ${formato.exemplo}`);
  }
}

/** Regras condicionais escritas na coluna "Observação" da documentação. */
function validarCondicionais(
  tipo: TipoRegistroQuestor,
  valores: Record<string, string>,
  diagnosticos: DiagnosticoQuestor[]
) {
  if (tipo !== "A") return;
  if (["2", "6"].includes(valores["TIPOSALARIO"] ?? "") && !valores["DESCRSAL"]) {
    diagnosticos.push({
      registro: "A",
      campo: "DESCRSAL",
      coluna: 21,
      codigo: "CONDICIONAL",
      mensagem: "DESCRSAL é obrigatório quando TIPOSALARIO é Comissão/Variável (2) ou Tarefa (6)"
    });
  }
  const fato = valores["CODIGOTIPOFATO"] ?? "";
  if (fato !== "" && fato !== "0" && valores["CATEGESOCIAL"] !== "105") {
    diagnosticos.push({
      registro: "A",
      campo: "CODIGOTIPOFATO",
      coluna: 17,
      codigo: "CONDICIONAL",
      mensagem: "CODIGOTIPOFATO só pode ser preenchido quando CATEGESOCIAL = 105"
    });
  }
}

export function validarRegistroQuestor(
  tipo: TipoRegistroQuestor,
  valores: ValoresRegistroQuestor
): DiagnosticoQuestor[] {
  const diagnosticos: DiagnosticoQuestor[] = [];
  const layout = LAYOUT_ADMISSAO_QUESTOR[tipo];
  const conhecidos = new Set(layout.map((campo) => campo.campo));
  for (const nome of Object.keys(valores)) {
    if (!conhecidos.has(nome)) {
      diagnosticos.push({
        registro: tipo,
        campo: nome,
        coluna: null,
        codigo: "CAMPO_DESCONHECIDO",
        mensagem: `${nome} não existe no registro ${tipo} do layout oficial`
      });
    }
  }
  const normalizados: Record<string, string> = {};
  for (const campo of layout) {
    const valor = valores[campo.campo] ?? "";
    normalizados[campo.campo] = valor;
    validarCampo(tipo, campo, valor, diagnosticos);
  }
  validarCondicionais(tipo, normalizados, diagnosticos);
  return diagnosticos;
}

/** Monta UMA linha, sem o fim de linha. A linha sai mesmo com diagnósticos, para conferência. */
export function montarLinhaQuestor(
  tipo: TipoRegistroQuestor,
  valores: ValoresRegistroQuestor
): { linha: string; diagnosticos: DiagnosticoQuestor[] } {
  const campos = LAYOUT_ADMISSAO_QUESTOR[tipo].map((campo) => valores[campo.campo] ?? "");
  return { linha: [tipo, ...campos].join(SEPARADOR_QUESTOR), diagnosticos: validarRegistroQuestor(tipo, valores) };
}

/** Lê uma linha do TXT (inclusive os exemplos oficiais) de volta para campos nomeados. */
export function lerLinhaQuestor(linha: string): {
  tipo: TipoRegistroQuestor | null;
  valores: Record<string, string>;
  diagnosticos: DiagnosticoQuestor[];
} {
  const partes = linha.replace(/\r?\n$/u, "").split(SEPARADOR_QUESTOR);
  const identificador = partes[0] ?? "";
  const tipo = TIPOS.find((item) => item === identificador) ?? null;
  if (!tipo) {
    const mensagem = identificador.includes('"')
      ? "O identificador do registro não pode vir entre aspas"
      : `Identificador de registro desconhecido: ${identificador}`;
    return {
      tipo: null,
      valores: {},
      diagnosticos: [{ registro: null, campo: null, coluna: 1, codigo: "ESTRUTURA", mensagem }]
    };
  }
  const layout = LAYOUT_ADMISSAO_QUESTOR[tipo];
  const valores: Record<string, string> = {};
  layout.forEach((campo) => {
    valores[campo.campo] = partes[campo.coluna - 1] ?? "";
  });
  const diagnosticos = validarRegistroQuestor(tipo, valores);
  if (partes.length !== layout.length + 1) {
    diagnosticos.unshift({
      registro: tipo,
      campo: null,
      coluna: null,
      codigo: "ESTRUTURA",
      mensagem: `Registro ${tipo} deve ter ${layout.length + 1} campos e tem ${partes.length}`
    });
  }
  return { tipo, valores, diagnosticos };
}

export type ContratoAdmissaoQuestor = {
  A: ValoresRegistroQuestor;
  B: ValoresRegistroQuestor;
  /** Opcional: a documentação diz que a composição do arquivo depende das configurações. */
  C?: ValoresRegistroQuestor | null;
  dependentes?: readonly ValoresRegistroQuestor[];
};

const somenteDigitos = (texto: string | null | undefined) => (texto ?? "").replace(/\D/gu, "");

/**
 * B e C são DETALHE do A anterior (NLI: `itMaster FuncContratoPreAreaTrab.CodigoFuncContr`), e o D
 * acha o contrato por CODIGOEMPRESA + CPFFUNC + DATAADM (índice do NLI). Por isso a ordem A, B, C, D
 * por contrato não é estética: trocar a ordem pendura o detalhe no contrato errado.
 */
function validarVinculos(contrato: ContratoAdmissaoQuestor, indice: number): DiagnosticoQuestor[] {
  const diagnosticos: DiagnosticoQuestor[] = [];
  const empresa = contrato.A["CODIGOEMPRESA"] ?? "";
  const vinculo = (registro: TipoRegistroQuestor, campo: string, mensagem: string) =>
    diagnosticos.push({
      registro,
      campo,
      coluna: null,
      codigo: "VINCULO",
      mensagem: `Contrato ${indice + 1}: ${mensagem}`
    });

  for (const [tipo, valores] of [
    ["B", contrato.B],
    ["C", contrato.C]
  ] as const) {
    if (valores && (valores["CODIGOEMPRESA"] ?? "") !== empresa)
      vinculo(tipo, "CODIGOEMPRESA", `CNPJ do registro ${tipo} difere do A`);
  }
  for (const dependente of contrato.dependentes ?? []) {
    if ((dependente["CODIGOEMPRESA"] ?? "") !== empresa)
      vinculo("D", "CODIGOEMPRESA", "CNPJ do dependente difere do A");
    if (somenteDigitos(dependente["CPFFUNC"]) !== somenteDigitos(contrato.A["CPFFUNC"])) {
      vinculo("D", "CPFFUNC", "CPF do titular no dependente difere do A");
    }
    if ((dependente["DATAADM"] ?? "") !== (contrato.A["DATAADM"] ?? ""))
      vinculo("D", "DATAADM", "DATAADM do dependente difere do A");
  }
  return diagnosticos;
}

export function montarArquivoAdmissaoQuestor(contratos: readonly ContratoAdmissaoQuestor[]): {
  conteudo: string;
  linhas: string[];
  diagnosticos: DiagnosticoQuestor[];
  valido: boolean;
} {
  const linhas: string[] = [];
  const diagnosticos: DiagnosticoQuestor[] = [];
  contratos.forEach((contrato, indice) => {
    type Registro = [TipoRegistroQuestor, ValoresRegistroQuestor];
    const registros: Registro[] = [
      ["A", contrato.A],
      ["B", contrato.B],
      ...(contrato.C ? [["C", contrato.C] satisfies Registro] : []),
      ...(contrato.dependentes ?? []).map((dependente): Registro => ["D", dependente])
    ];
    for (const [tipo, valores] of registros) {
      const montado = montarLinhaQuestor(tipo, valores);
      linhas.push(montado.linha);
      diagnosticos.push(...montado.diagnosticos);
    }
    diagnosticos.push(...validarVinculos(contrato, indice));
  });
  // Documentação: "Cada linha deve terminar com os caracteres ASC 13 + ASC 10" — inclusive a última.
  const conteudo = linhas.map((linha) => linha + FIM_DE_LINHA_QUESTOR).join("");
  return { conteudo, linhas, diagnosticos, valido: diagnosticos.length === 0 };
}
