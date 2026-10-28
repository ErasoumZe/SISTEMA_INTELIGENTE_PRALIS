import {
  catalogoDoDeParaSia,
  CONFIRMACAO_DEPARA_SIA,
  lerCsvDoSia,
  lerDeParaSia,
  recusaDoDeParaSia,
  temColunasDoSia,
  type CatalogoDeParaSia
} from "@padaria/shared/produtos";
import { lerAbasXlsx } from "./planilha-xlsx.js";
import { situacaoDoDeParaRepository, substituirDeParaRepository } from "./produtos-sia-depara.repository.js";
import { contextoDaEmpresaFiscalRepository } from "./produtos-fiscal.repository.js";
import { invalidarTabelasFiscais, lojaFiscalDaEmpresa } from "./produtos-fiscal.service.js";

/**
 * Importacao do de-para do SIA pela tela — igual ao `DeParaUploadService` do app oficial (R-222): a
 * previa confere sem gravar; aplicar SUBSTITUI o de-para da loja inteiro, com frase de confirmacao e as
 * mesmas recusas (barras ambiguas, coditem repetido, so entrega, balanca incompleta). So o administrador.
 */
export class DeParaSiaError extends Error {
  constructor(
    mensagem: string,
    readonly status: 400 | 403 | 409 | 422,
    readonly code: string
  ) {
    super(mensagem);
    this.name = "DeParaSiaError";
  }
}

export interface ArquivoDoSia {
  nome: string;
  bytes: Buffer;
}

/** U+FFFD: o que o Node poe no lugar de byte que nao e UTF-8. */
const CARACTERE_INVALIDO = String.fromCharCode(0xfffd);

/** CSV de exportacao pode vir em UTF-8 ou Latin-1 (Windows): sem caractere invalido, e UTF-8. */
function textoDoCsv(bytes: Buffer): string {
  const utf8 = bytes.toString("utf8");
  return utf8.includes(CARACTERE_INVALIDO) ? bytes.toString("latin1") : utf8;
}

/** A tabela de uma exportacao do SIA (.xlsx ou .csv); `escolher` acha a aba certa numa planilha de trabalho. */
export function tabelaDoArquivoDoSia(
  arquivo: ArquivoDoSia,
  escolher: (aba: string[][]) => boolean = temColunasDoSia
): string[][] {
  if (/\.csv$/iu.test(arquivo.nome)) return lerCsvDoSia(textoDoCsv(arquivo.bytes));
  if (/\.xlsx$/iu.test(arquivo.nome)) {
    const abas = [...lerAbasXlsx(arquivo.bytes, "arquivo do SIA").values()];
    // A exportacao tem uma aba; a planilha de trabalho (BASE SIA FULL) divide espaco com outras.
    return abas.find(escolher) ?? abas[0] ?? [];
  }
  if (/\.xls$/iu.test(arquivo.nome)) {
    throw new DeParaSiaError(
      "O ERP ainda não lê o .xls antigo do SIA Supervisor. Abra o arquivo no Excel e salve como .xlsx ou .csv.",
      422,
      "SIA_FORMATO_XLS"
    );
  }
  throw new DeParaSiaError("Envie a exportação do SIA em .xlsx ou .csv.", 422, "SIA_FORMATO");
}

function lerCatalogo(arquivo: ArquivoDoSia): CatalogoDeParaSia {
  let tabela: string[][];
  try {
    tabela = tabelaDoArquivoDoSia(arquivo);
  } catch (erro) {
    if (erro instanceof DeParaSiaError) throw erro;
    throw new DeParaSiaError(
      `Não consegui ler o arquivo (${erro instanceof Error ? erro.message : "formato desconhecido"}).`,
      422,
      "SIA_ARQUIVO_ILEGIVEL"
    );
  }
  try {
    return catalogoDoDeParaSia(lerDeParaSia(tabela));
  } catch (erro) {
    throw new DeParaSiaError(
      `O arquivo não tem as colunas do SIA (${erro instanceof Error ? erro.message : "cabeçalho não reconhecido"}).`,
      422,
      "SIA_COLUNAS"
    );
  }
}

async function lojaDaEmpresa(empresaId: string, ator: { administrador: boolean; empresasPermitidas: string[] }) {
  if (!ator.administrador) {
    throw new DeParaSiaError("Apenas o administrador importa o de-para do SIA.", 403, "FORBIDDEN");
  }
  if (!ator.empresasPermitidas.includes(empresaId)) {
    throw new DeParaSiaError("Empresa não permitida.", 403, "FORBIDDEN_COMPANY");
  }
  const contexto = await contextoDaEmpresaFiscalRepository(empresaId);
  const loja = lojaFiscalDaEmpresa(contexto?.matriculaPrefixo);
  // De-para so serve a TNP, LI e HORA: gravado em empresa sem loja, nunca seria lido pelo fiscal.
  if (!["TNP", "LI", "HORA"].includes(loja)) {
    throw new DeParaSiaError(
      `Esta empresa não é uma loja com SIA (${loja}). Confira o prefixo de matrícula da empresa.`,
      422,
      "SIA_EMPRESA_SEM_LOJA"
    );
  }
  return loja;
}

/** Confere sem gravar (o equivalente ao script sem `--apply` do oficial). */
export async function previaDeParaSia(
  empresaId: string,
  arquivo: ArquivoDoSia,
  ator: { administrador: boolean; empresasPermitidas: string[] }
) {
  const loja = await lojaDaEmpresa(empresaId, ator);
  const catalogo = lerCatalogo(arquivo);
  const situacao = await situacaoDoDeParaRepository(empresaId);
  return {
    loja,
    arquivo: arquivo.nome,
    linhas: catalogo.linhas.length,
    semBarras: catalogo.semBarras,
    semDadosBalanca: catalogo.semDadosBalanca,
    teclaAssumida: catalogo.teclaAssumida,
    atuais: situacao.total,
    ultimaImportacao: situacao.importadoEm,
    barrasAmbiguas: catalogo.barrasAmbiguas.slice(0, 20),
    coditensRepetidos: catalogo.coditensRepetidos.slice(0, 20),
    faixa: catalogo.faixa,
    entrega: catalogo.entrega,
    confirmacao: CONFIRMACAO_DEPARA_SIA
  };
}

/** Substitui o de-para da loja inteiro e faz o fiscal reler o SIA na proxima classificacao. */
export async function aplicarDeParaSia(
  empresaId: string,
  arquivo: ArquivoDoSia,
  confirmacao: string,
  ator: { administrador: boolean; empresasPermitidas: string[] }
) {
  const loja = await lojaDaEmpresa(empresaId, ator);
  if (confirmacao.trim().toUpperCase() !== CONFIRMACAO_DEPARA_SIA) {
    throw new DeParaSiaError(
      `Frase de confirmação inválida. Digite "${CONFIRMACAO_DEPARA_SIA}" para gravar.`,
      400,
      "SIA_CONFIRMACAO"
    );
  }
  const catalogo = lerCatalogo(arquivo);
  const recusa = recusaDoDeParaSia(catalogo);
  if (recusa) throw new DeParaSiaError(recusa, 422, "SIA_RECUSADO");
  const substituidas = await substituirDeParaRepository(empresaId, catalogo.linhas);
  invalidarTabelasFiscais();
  return {
    loja,
    gravadas: catalogo.linhas.length,
    substituidas,
    semBarras: catalogo.semBarras,
    entrega: catalogo.entrega
  };
}
