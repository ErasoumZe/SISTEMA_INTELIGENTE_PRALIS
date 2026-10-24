/**
 * Eventos Variáveis do Questor — layout OFICIAL enviado pela Conplus em 22/10/2026:
 * `EventoVariavel.nli` + "Manual – Importação de Eventos Variáveis no Questor" (cópias byte a byte em
 * `tests/fixtures/conplus-oficial/eventos/`).
 *
 * - Um evento por linha, para um contrato num período de cálculo. SEM linha de cabeçalho.
 * - 13 colunas separadas por `;`; toda linha termina com `;`. Decimal com vírgula, sem milhar.
 * - Registro `E` (`IdentificadorRegistro = 'E'`). Chave do Questor (`Indice` do NLI):
 *   empresa + período de cálculo + sequência + contrato — não pode repetir.
 * - Exemplo oficial: `E;510;2505;99;1;318;8,00;0,00;;;;;0;`
 *
 * Substitui o layout anterior (planilha com 3 linhas de cabeçalho e uma coluna por evento), que vinha da
 * documentação pública do Questor e NÃO é o que a Conplus importa.
 *
 * Códigos de empresa, período, contrato e evento são do Questor de cada empresa: este módulo não conhece
 * nenhum e não deve conhecer.
 */

export type UnidadeEventoVariavel = "H" | "R" | "V";
export const UNIDADES_EVENTO_VARIAVEL: readonly UnidadeEventoVariavel[] = ["H", "R", "V"];

/** Colunas do `EventoVariavel.nli` (Coluna, Tamanho, Precisao), na ordem do arquivo. */
export const LAYOUT_EVENTO_VARIAVEL = [
  { coluna: 1, campo: "IDENTIFICADOR", tamanho: 1, precisao: 0 },
  { coluna: 2, campo: "codigoempresa", tamanho: 6, precisao: 0 },
  { coluna: 3, campo: "codigopercalculo", tamanho: 11, precisao: 0 },
  { coluna: 4, campo: "seq", tamanho: 10, precisao: 0 },
  { coluna: 5, campo: "codigofunccontr", tamanho: 10, precisao: 0 },
  { coluna: 6, campo: "codigoevento", tamanho: 5, precisao: 0 },
  { coluna: 7, campo: "referevento", tamanho: 18, precisao: 2 },
  { coluna: 8, campo: "valorevento", tamanho: 16, precisao: 2 },
  { coluna: 9, campo: "codigobenef", tamanho: 3, precisao: 0 },
  { coluna: 10, campo: "codigooutemp", tamanho: 6, precisao: 0 },
  { coluna: 11, campo: "codigocentrocusto", tamanho: 11, precisao: 0 },
  { coluna: 12, campo: "codigoproftipoaula", tamanho: 11, precisao: 0 },
  { coluna: 13, campo: "buscarultvalorcalc", tamanho: 1, precisao: 0 }
] as const;

export const FIM_DE_LINHA_EVENTO_VARIAVEL = "\r\n";

export type LinhaEventoVariavelQuestor = {
  codigoEmpresa: string;
  codigoPeriodoCalculo: string;
  sequencia: number;
  codigoContrato: string;
  codigoEvento: string;
  /** Coluna 7: quantidade (horas, dias…), texto com vírgula e 2 casas. */
  referencia: string;
  /** Coluna 8: valor em reais, texto com vírgula e 2 casas. */
  valor: string;
  /** Colunas 9–12: vazias, salvo pensão, outra empresa, centro de custo, professor. */
  beneficiario?: string;
  outraEmpresa?: string;
  centroCusto?: string;
  tipoAula?: string;
  /** Coluna 13: 0 = não, 1 = sim. */
  buscarUltimoValor: "0" | "1";
};

export type DiagnosticoEventoVariavel = {
  linha: number;
  coluna: number | null;
  codigo: "ESTRUTURA" | "OBRIGATORIO" | "FORMATO" | "TAMANHO" | "DUPLICIDADE";
  mensagem: string;
};

const DECIMAL_2 = /^\d+,\d{2}$/u;

/** Monta a linha exatamente como o exemplo oficial: 13 colunas e `;` final. */
export function montarLinhaEventoVariavel(linha: LinhaEventoVariavelQuestor): string {
  return [
    "E",
    linha.codigoEmpresa,
    linha.codigoPeriodoCalculo,
    String(linha.sequencia),
    linha.codigoContrato,
    linha.codigoEvento,
    linha.referencia,
    linha.valor,
    linha.beneficiario ?? "",
    linha.outraEmpresa ?? "",
    linha.centroCusto ?? "",
    linha.tipoAula ?? "",
    linha.buscarUltimoValor,
    ""
  ].join(";");
}

/** Confere uma linha (já separada em colunas) contra o NLI e o manual. */
function validarColunas(colunas: readonly string[], numero: number, diagnosticos: DiagnosticoEventoVariavel[]) {
  const erro = (coluna: number | null, codigo: DiagnosticoEventoVariavel["codigo"], mensagem: string) =>
    diagnosticos.push({ linha: numero, coluna, codigo, mensagem });
  // 13 colunas + o vazio depois do `;` final.
  if (colunas.length !== 14 || colunas[13] !== "") {
    erro(null, "ESTRUTURA", `Esperadas 13 colunas terminadas em ';' (recebidas ${colunas.length - 1})`);
    return;
  }
  if (colunas[0] !== "E") erro(1, "FORMATO", 'Coluna 1 deve ser "E"');
  for (const { coluna, campo, tamanho, precisao } of LAYOUT_EVENTO_VARIAVEL.slice(1)) {
    const valor = colunas[coluna - 1] ?? "";
    const obrigatoria = coluna <= 8 || coluna === 13;
    if (!valor) {
      if (obrigatoria) erro(coluna, "OBRIGATORIO", `Coluna ${coluna} (${campo}) é obrigatória`);
      continue;
    }
    if (precisao === 0) {
      if (!/^\d+$/u.test(valor)) erro(coluna, "FORMATO", `Coluna ${coluna} (${campo}) deve ser número inteiro`);
      else if (valor.length > tamanho)
        erro(coluna, "TAMANHO", `Coluna ${coluna} (${campo}) passa de ${tamanho} dígitos`);
    } else if (!DECIMAL_2.test(valor)) {
      erro(coluna, "FORMATO", `Coluna ${coluna} (${campo}) deve ter vírgula e 2 casas decimais, sem milhar`);
    } else if (valor.length > tamanho) {
      erro(coluna, "TAMANHO", `Coluna ${coluna} (${campo}) passa de ${tamanho} caracteres`);
    }
  }
  if (colunas[3] === "0" || /^0+$/u.test(colunas[3] ?? "")) erro(4, "FORMATO", "Sequência deve ser maior que zero");
  if (colunas[12] && colunas[12] !== "0" && colunas[12] !== "1") erro(13, "FORMATO", "Coluna 13 aceita 0 ou 1");
}

const chaveQuestor = (colunas: readonly string[]) => [colunas[1], colunas[2], colunas[3], colunas[4]].join("|");

/**
 * Valida um arquivo inteiro (gerado pelo Pralís ou recebido): estrutura, tamanhos, decimais, CR+LF e a
 * chave do Questor sem repetição.
 */
export function validarArquivoEventosVariaveis(texto: string): DiagnosticoEventoVariavel[] {
  const diagnosticos: DiagnosticoEventoVariavel[] = [];
  if (!texto) return [{ linha: 1, coluna: null, codigo: "ESTRUTURA", mensagem: "Arquivo vazio" }];
  if (/[^\r]\n|^\n/u.test(texto) || /\r(?!\n)/u.test(texto)) {
    diagnosticos.push({ linha: 1, coluna: null, codigo: "ESTRUTURA", mensagem: "Linhas devem terminar com CR+LF" });
  }
  if (/[^\x20-\x7e\r\n]/u.test(texto)) {
    diagnosticos.push({
      linha: 1,
      coluna: null,
      codigo: "FORMATO",
      mensagem: "Arquivo deve conter só caracteres ASCII"
    });
  }
  const linhas = texto.replace(/\r\n$/u, "").split("\r\n");
  const vistas = new Map<string, number>();
  linhas.forEach((linha, indice) => {
    const numero = indice + 1;
    const colunas = linha.split(";");
    validarColunas(colunas, numero, diagnosticos);
    const chave = chaveQuestor(colunas);
    const anterior = vistas.get(chave);
    if (anterior) {
      diagnosticos.push({
        linha: numero,
        coluna: 4,
        codigo: "DUPLICIDADE",
        mensagem: `Empresa, período, sequência e contrato repetem a linha ${anterior}`
      });
    } else vistas.set(chave, numero);
  });
  return diagnosticos;
}

export function lerArquivoEventosVariaveis(texto: string): LinhaEventoVariavelQuestor[] {
  return texto
    .replace(/\r\n$/u, "")
    .split("\r\n")
    .filter(Boolean)
    .map((linha) => {
      const c = linha.split(";");
      return {
        codigoEmpresa: c[1] ?? "",
        codigoPeriodoCalculo: c[2] ?? "",
        sequencia: Number(c[3]),
        codigoContrato: c[4] ?? "",
        codigoEvento: c[5] ?? "",
        referencia: c[6] ?? "",
        valor: c[7] ?? "",
        beneficiario: c[8] ?? "",
        outraEmpresa: c[9] ?? "",
        centroCusto: c[10] ?? "",
        tipoAula: c[11] ?? "",
        buscarUltimoValor: c[12] === "1" ? "1" : "0"
      };
    });
}

// --- Lançamentos do Pralís → arquivo -----------------------------------------------------------------

export type LancamentoParaArquivoQuestor = {
  id: string;
  competencia: string;
  colaboradorNome: string;
  matricula: string;
  questorCodigoContrato: string | null;
  eventoCodigo: string;
  eventoAtivo: boolean;
  eventoUnidades: readonly string[];
  unidade: UnidadeEventoVariavel;
  /** Como o PostgreSQL devolve `numeric(18,4)`: ponto decimal ("8.0000"). */
  valor: string;
};

/**
 * Valor do banco → texto do arquivo, com vírgula e exatamente 2 casas ("8.0000" → "8,00").
 * `null` = tem mais de 2 casas significativas: o Questor guarda só 2 (Precisao = 2) e arredondar seria
 * mudar o número que o DP lançou.
 */
export function formatarDecimalQuestor(valor: string): string | null {
  const [inteiro = "0", fracao = ""] = valor.trim().split(".");
  const significativa = fracao.replace(/0+$/u, "");
  if (significativa.length > 2) return null;
  return `${inteiro.replace(/^0+(?=\d)/u, "")},${significativa.padEnd(2, "0")}`;
}

export type ParametrosArquivoEventos = {
  /** Coluna 2: código da empresa no Questor (configuração da empresa no Pralís). */
  codigoEmpresa: string | null;
  /** Coluna 3: código do período de cálculo, consultado no Questor (não é derivado do mês). */
  codigoPeriodoCalculo: string;
  /** Primeira sequência a usar por contrato quando ele ainda não tem nenhuma neste período. */
  sequenciaInicial: number;
  /** Maior sequência já usada pelo Pralís, por contrato, em arquivos oficiais deste período. */
  sequenciasUsadas: ReadonlyMap<string, number>;
  /** "Utiliza Hora Centesimal" da empresa: valida minutos das horas quando falso. */
  utilizaHoraCentesimal: boolean | null;
};

export type LinhaGeradaEventoVariavel = { lancamentoId: string; codigoContrato: string; sequencia: number };

/**
 * Lançamentos → arquivo oficial. Uma linha por lançamento. H (horas) e R (referência: dias etc.) vão na
 * coluna 7 com 0,00 na 8; V (valor) vai na 8 com 0,00 na 7 — como no exemplo oficial.
 *
 * A sequência é por contrato: começa em `sequenciaInicial` ou logo depois da maior já usada pelo Pralís
 * neste período, e cresce lançamento a lançamento (ordem estável: evento, letra). Sequências lançadas
 * direto no Questor o Pralís não enxerga — por isso o DP escolhe a inicial.
 */
export function prepararArquivoEventosVariaveis(
  competencia: string,
  lancamentos: readonly LancamentoParaArquivoQuestor[],
  parametros: ParametrosArquivoEventos
): {
  conteudo: string;
  valido: boolean;
  linhas: LinhaGeradaEventoVariavel[];
  pendencias: string[];
  diagnosticos: DiagnosticoEventoVariavel[];
  quantidadeContratos: number;
} {
  const pendencias: string[] = [];
  if (!lancamentos.length) pendencias.push("Selecione ao menos um lançamento");
  if (!parametros.codigoEmpresa) {
    pendencias.push("Informe o código da empresa no Questor em Configuração Questor");
  }
  if (parametros.utilizaHoraCentesimal === null && lancamentos.some((item) => item.unidade === "H")) {
    pendencias.push('Configure "Utiliza Hora Centesimal" da empresa em Configuração Questor');
  }
  const ordenados = [...lancamentos].sort(
    (a, b) =>
      Number(a.questorCodigoContrato ?? 0) - Number(b.questorCodigoContrato ?? 0) ||
      Number(a.eventoCodigo) - Number(b.eventoCodigo) ||
      a.unidade.localeCompare(b.unidade) ||
      a.id.localeCompare(b.id)
  );
  const proxima = new Map<string, number>();
  const linhas: LinhaGeradaEventoVariavel[] = [];
  const textos: string[] = [];
  for (const lancamento of ordenados) {
    const quem = `${lancamento.colaboradorNome} (${lancamento.matricula})`;
    const contrato = lancamento.questorCodigoContrato;
    if (lancamento.competencia !== competencia) {
      pendencias.push(`${quem}: lançamento de outra competência (${lancamento.competencia})`);
    }
    if (!contrato) {
      pendencias.push(`${quem}: sem código de contrato Questor (Configuração Questor → Contratos no Questor)`);
    }
    if (!lancamento.eventoAtivo) pendencias.push(`${quem}: evento ${lancamento.eventoCodigo} está desativado`);
    if (!lancamento.eventoUnidades.includes(lancamento.unidade)) {
      pendencias.push(`${quem}: evento ${lancamento.eventoCodigo} não aceita a letra ${lancamento.unidade}`);
    }
    const numero = formatarDecimalQuestor(lancamento.valor);
    if (numero === null) pendencias.push(`${quem}: valor ${lancamento.valor} tem mais de 2 casas decimais`);
    else if (lancamento.unidade === "H" && parametros.utilizaHoraCentesimal === false) {
      const minutos = Number(numero.split(",")[1]);
      if (minutos >= 60) pendencias.push(`${quem}: ${numero} h tem minutos ≥ 60 (a empresa não usa hora centesimal)`);
    }
    if (!contrato || numero === null) continue;
    const sequencia =
      proxima.get(contrato) ??
      Math.max(parametros.sequenciaInicial, (parametros.sequenciasUsadas.get(contrato) ?? 0) + 1);
    proxima.set(contrato, sequencia + 1);
    linhas.push({ lancamentoId: lancamento.id, codigoContrato: contrato, sequencia });
    textos.push(
      montarLinhaEventoVariavel({
        codigoEmpresa: parametros.codigoEmpresa ?? "",
        codigoPeriodoCalculo: parametros.codigoPeriodoCalculo,
        sequencia,
        codigoContrato: contrato,
        codigoEvento: lancamento.eventoCodigo,
        referencia: lancamento.unidade === "V" ? "0,00" : numero,
        valor: lancamento.unidade === "V" ? numero : "0,00",
        buscarUltimoValor: "0"
      })
    );
  }
  const unicas = [...new Set(pendencias)];
  const conteudo = textos.map((texto) => texto + FIM_DE_LINHA_EVENTO_VARIAVEL).join("");
  const diagnosticos = textos.length ? validarArquivoEventosVariaveis(conteudo) : [];
  const valido = unicas.length === 0 && diagnosticos.length === 0 && textos.length > 0;
  return {
    conteudo: valido ? conteudo : "",
    valido,
    linhas: valido ? linhas : [],
    pendencias: unicas,
    diagnosticos,
    quantidadeContratos: new Set(linhas.map((linha) => linha.codigoContrato)).size
  };
}

// --- Catálogo oficial por empresa --------------------------------------------------------------------

/**
 * Compara razões sociais dos arquivos da Conplus com a configurada no Pralís: sem acento, maiúsculas,
 * espaços simples. Não remove palavras (LTDA, Matriz…): nomes diferentes continuam diferentes.
 */
export function normalizarRazaoSocialQuestor(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/\s+/gu, " ")
    .trim();
}

export type EventoCatalogoConplus = {
  empresa: string;
  codigo: string;
  descricao: string;
  sequencia: number;
  filial: number;
  referencia: string;
  unidade: UnidadeEventoVariavel;
  natureza: "Provento" | "Desconto";
};

const CABECALHO_CATALOGO = "Empresa;Evento;Descrição;Sequência;Filial;Referência (Questor);Tipo (H/R/V);Natureza";

/**
 * Lê o catálogo consolidado da Conplus (`eventos_variaveis_por_empresa.csv`, UTF-8 com BOM). É o único
 * dos catálogos enviados que traz a letra H/R/V; os arquivos por empresa não têm o tipo.
 */
export function lerCatalogoEventosConplus(texto: string): {
  eventos: EventoCatalogoConplus[];
  erros: string[];
} {
  const linhas = (texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto)
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .filter((linha) => linha.trim());
  if (linhas[0]?.trim() !== CABECALHO_CATALOGO) {
    return { eventos: [], erros: [`Cabeçalho esperado: ${CABECALHO_CATALOGO}`] };
  }
  const eventos: EventoCatalogoConplus[] = [];
  const erros: string[] = [];
  linhas.slice(1).forEach((linha, indice) => {
    const numero = indice + 2;
    const [
      empresa = "",
      codigo = "",
      descricao = "",
      sequencia = "",
      filial = "",
      referencia = "",
      tipo = "",
      natureza = ""
    ] = linha.split(";").map((parte) => parte.trim());
    if (linha.split(";").length !== 8) {
      erros.push(`Linha ${numero}: esperadas 8 colunas separadas por ';'`);
      return;
    }
    if (!empresa || !/^\d{1,5}$/u.test(codigo) || /^0+$/u.test(codigo) || !descricao) {
      erros.push(`Linha ${numero}: empresa, evento (1 a 5 dígitos, não zero) e descrição são obrigatórios`);
      return;
    }
    if (descricao.length > 200) {
      erros.push(`Linha ${numero}: descrição passa de 200 caracteres`);
      return;
    }
    if (!UNIDADES_EVENTO_VARIAVEL.includes(tipo as UnidadeEventoVariavel)) {
      erros.push(`Linha ${numero}: tipo "${tipo}" não é H, R ou V`);
      return;
    }
    if (natureza !== "Provento" && natureza !== "Desconto") {
      erros.push(`Linha ${numero}: natureza "${natureza}" não é Provento ou Desconto`);
      return;
    }
    if (!/^\d{1,9}$/u.test(sequencia) || !/^\d{1,9}$/u.test(filial) || !Number(sequencia) || !Number(filial)) {
      erros.push(`Linha ${numero}: sequência e filial devem ser números maiores que zero`);
      return;
    }
    eventos.push({
      empresa,
      // "035" e "35" são o mesmo evento no Questor.
      codigo: codigo.replace(/^0+(?=\d)/u, ""),
      descricao,
      sequencia: Number(sequencia),
      filial: Number(filial),
      referencia,
      unidade: tipo as UnidadeEventoVariavel,
      natureza
    });
  });
  return { eventos, erros };
}
