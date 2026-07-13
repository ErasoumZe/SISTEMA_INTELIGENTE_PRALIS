import { XMLParser } from "fast-xml-parser";
import type { DadosExternos } from "@padaria/shared/api";
import { apenasDigitos } from "../utils.js";

// Fronteira de dados externos: o XML da NF-e e a resposta JSON do webhook chegam sem tipo.
// Navegamos com helpers que estreitam DadosExternos (unico `unknown` sancionado do dominio).
type Registro = Record<string, DadosExternos>;

function ehRegistro(valor: DadosExternos): valor is Registro {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function texto(valor: DadosExternos): string {
  if (typeof valor === "string") return valor;
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor);
  return "";
}

// Le uma tag/atributo simples de um registro; retorna null quando ausente ou vazio.
function ler(registro: DadosExternos, chave: string): string | null {
  if (!ehRegistro(registro)) return null;
  const valor = texto(registro[chave]).trim();
  return valor === "" ? null : valor;
}

function comoArray(valor: DadosExternos): DadosExternos[] {
  if (valor === null || valor === undefined) return [];
  return Array.isArray(valor) ? valor : [valor];
}

// Busca em profundidade a primeira ocorrencia de `chave` (fast-xml-parser aninha por elemento).
function buscarProfundo(valor: DadosExternos, chave: string): DadosExternos {
  if (Array.isArray(valor)) {
    for (const filho of valor) {
      const achado = buscarProfundo(filho, chave);
      if (achado !== undefined) return achado;
    }
    return undefined;
  }
  if (!ehRegistro(valor)) return undefined;
  if (Object.prototype.hasOwnProperty.call(valor, chave)) return valor[chave];
  for (const filho of Object.values(valor)) {
    const achado = buscarProfundo(filho, chave);
    if (achado !== undefined) return achado;
  }
  return undefined;
}

function subRegistro(registro: DadosExternos, chave: string): DadosExternos {
  if (!ehRegistro(registro)) return undefined;
  return registro[chave];
}

export interface NfeItemParseado {
  numeroItem: number;
  ean: string | null;
  ncm: string | null;
  cfop: string | null;
  cest: string | null;
  descricao: string | null;
  unidadeComercial: string | null;
  quantidade: string | null;
  valorUnitario: string | null;
}

export interface NfeParseada {
  chave: string; // 44 digitos, sem o prefixo "NFe"
  numero: string | null;
  serie: string | null;
  modelo: string | null;
  naturezaOperacao: string | null;
  dataEmissao: string | null; // ISO (dhEmi) ou data (dEmi)
  fornecedorCnpj: string | null;
  fornecedorNome: string | null;
  valorProdutos: string | null;
  valorDesconto: string | null;
  valorFrete: string | null;
  valorOutros: string | null;
  valorSeguro: string | null;
  valorTotal: string | null;
  dataVencimento: string | null; // primeira duplicata (cobr.dup.dVenc)
  itens: NfeItemParseado[];
}

// Extrai os campos de negocio de um XML de NF-e (procNFe/NFe). Lanca se nao houver infNFe.
export function parseNfe(xmlContent: string): NfeParseada {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseTagValue: false,
    trimValues: true
  });
  const parsed: DadosExternos = parser.parse(xmlContent);
  const infNFe = buscarProfundo(parsed, "infNFe");
  if (!ehRegistro(infNFe)) throw new Error("XML sem infNFe.");

  const ide = subRegistro(infNFe, "ide");
  const emit = subRegistro(infNFe, "emit");
  const totalRaiz = subRegistro(infNFe, "total");
  const total = subRegistro(totalRaiz, "ICMSTot");
  const cobr = subRegistro(infNFe, "cobr");
  const primeiraDup = comoArray(subRegistro(cobr, "dup"))[0];

  const idBruto = ler(infNFe, "Id") ?? "";
  const chave = idBruto.replace(/^NFe/i, "");
  const cnpjEmit = apenasDigitos(ler(emit, "CNPJ") ?? ler(emit, "CPF"));

  const itens: NfeItemParseado[] = comoArray(subRegistro(infNFe, "det")).map((item, indice) => {
    const prod = subRegistro(item, "prod");
    const numeroItem = ler(item, "nItem");
    return {
      numeroItem: numeroItem ? Number(numeroItem) : indice + 1,
      ean: ler(prod, "cEAN"),
      ncm: ler(prod, "NCM"),
      cfop: ler(prod, "CFOP"),
      cest: ler(prod, "CEST"),
      descricao: ler(prod, "xProd"),
      unidadeComercial: ler(prod, "uCom"),
      quantidade: ler(prod, "qCom"),
      valorUnitario: ler(prod, "vUnCom")
    };
  });

  return {
    chave,
    numero: ler(ide, "nNF"),
    serie: ler(ide, "serie"),
    modelo: ler(ide, "mod"),
    naturezaOperacao: ler(ide, "natOp"),
    dataEmissao: ler(ide, "dhEmi") ?? ler(ide, "dEmi"),
    fornecedorCnpj: cnpjEmit,
    fornecedorNome: ler(emit, "xNome"),
    valorProdutos: ler(total, "vProd"),
    valorDesconto: ler(total, "vDesc"),
    valorFrete: ler(total, "vFrete"),
    valorOutros: ler(total, "vOutro"),
    valorSeguro: ler(total, "vSeg"),
    valorTotal: ler(total, "vNF"),
    dataVencimento: ler(primeiraDup, "dVenc"),
    itens
  };
}

// Extrai a lista de NF-e da resposta JSON do filtro (obternfeporfiltro), em qualquer aninhamento.
export function extrairNotasDoFiltro(payload: DadosExternos): DadosExternos[] {
  const achado = buscarProfundo(payload, "Nfe") ?? buscarProfundo(payload, "NFe");
  return comoArray(achado);
}

export function notaCancelada(nfe: DadosExternos): boolean {
  if (!ehRegistro(nfe)) return false;
  return (ler(nfe, "Canceled") ?? ler(nfe, "canceled") ?? "").toUpperCase() === "TRUE";
}

// Id do arquivo XML no webhook (usado no lote de obterxmlporids).
export function fileIdDaNota(nfe: DadosExternos): string {
  return ler(nfe, "File") ?? ler(nfe, "file") ?? ler(nfe, "ID_ARQUIVO") ?? ler(nfe, "IdArquivo") ?? "";
}
