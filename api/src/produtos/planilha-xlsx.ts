import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";
import type { JsonValue } from "@padaria/shared/api";

/**
 * Leitura de XLSX sem biblioteca de planilha: o arquivo e um zip de XML. Lido como TEXTO, celula a
 * celula, com teto de tamanho descompactado (zip bomb) e caminho de aba conferido (sem `..`).
 */
// 29/10/2026: o backup do cadastro (14.613 produtos) ja descompacta em 34,8 MB; 50 MB estouraria logo.
const TAMANHO_MAXIMO_DESCOMPACTADO = 150 * 1024 * 1024;
const parserXml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  trimValues: false
});

type RegistroXml = Record<string, JsonValue>;

function registro(valor: JsonValue | undefined): RegistroXml | null {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor) ? valor : null;
}

function parseXml(xml: string): JsonValue {
  return parserXml.parse(xml) as JsonValue;
}

function lista(valor: JsonValue | undefined): JsonValue[] {
  if (valor === null || valor === undefined) return [];
  return Array.isArray(valor) ? valor : [valor];
}

function texto(valor: JsonValue | undefined): string {
  if (typeof valor === "string") return valor;
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor);
  const objeto = registro(valor);
  if (objeto && Object.hasOwn(objeto, "#text")) return texto(objeto["#text"]);
  return "";
}

function valorXml(zip: AdmZip, caminho: string): JsonValue {
  const entrada = zip.getEntry(caminho);
  if (!entrada) throw new Error(`O backup XLSX não contém ${caminho}.`);
  return parseXml(entrada.getData().toString("utf8"));
}

function stringsCompartilhadas(zip: AdmZip): string[] {
  const entrada = zip.getEntry("xl/sharedStrings.xml");
  if (!entrada) return [];
  const xml = registro(parseXml(entrada.getData().toString("utf8")));
  const raiz = registro(xml?.["sst"]);
  return lista(raiz?.["si"]).map((item) => {
    const registroString = registro(item);
    if (!registroString) return texto(item);
    if (registroString["t"] !== undefined) return texto(registroString["t"]);
    return lista(registroString["r"])
      .map((run) => texto(registro(run)?.["t"]))
      .join("");
  });
}

function indiceColuna(referencia: string): number {
  const letras = referencia.match(/^[A-Z]+/iu)?.[0]?.toUpperCase();
  if (!letras) throw new Error(`Referência de célula inválida no XLSX: ${referencia}.`);
  let indice = 0;
  for (const letra of letras) indice = indice * 26 + letra.charCodeAt(0) - 64;
  return indice - 1;
}

function caminhoPlanilha(alvo: string): string {
  const limpo = alvo.replaceAll("\\", "/").replace(/^\/+/, "");
  if (limpo.split("/").includes("..")) throw new Error("O XLSX contém um caminho de planilha inválido.");
  return limpo.startsWith("xl/") ? limpo : `xl/${limpo}`;
}

function lerPlanilhas(zip: AdmZip, strings: string[]): Map<string, string[][]> {
  const workbook = registro(valorXml(zip, "xl/workbook.xml"));
  const rels = registro(valorXml(zip, "xl/_rels/workbook.xml.rels"));
  const workbookRoot = registro(workbook?.["workbook"]);
  const relsRoot = registro(rels?.["Relationships"]);
  const relacionamentos = new Map<string, string>();
  for (const rel of lista(relsRoot?.["Relationship"])) {
    const item = registro(rel);
    const id = texto(item?.["@_Id"]);
    const alvo = texto(item?.["@_Target"]);
    if (id && alvo) relacionamentos.set(id, caminhoPlanilha(alvo));
  }

  const resultado = new Map<string, string[][]>();
  const sheets = registro(workbookRoot?.["sheets"]);
  for (const sheet of lista(sheets?.["sheet"])) {
    const item = registro(sheet);
    const nome = texto(item?.["@_name"]);
    const relationshipId = texto(item?.["@_r:id"]);
    const caminho = relacionamentos.get(relationshipId);
    if (!nome || !caminho) throw new Error("O XLSX contém uma planilha sem relacionamento válido.");
    const xml = registro(valorXml(zip, caminho));
    const sheetRoot = registro(xml?.["worksheet"]);
    const sheetData = registro(sheetRoot?.["sheetData"]);
    const linhas = lista(sheetData?.["row"]).map((linhaXml) => {
      const linha = registro(linhaXml);
      const colunas: string[] = [];
      for (const celulaXml of lista(linha?.["c"])) {
        const celula = registro(celulaXml);
        if (!celula) continue;
        const coluna = indiceColuna(texto(celula["@_r"]));
        const tipo = texto(celula["@_t"]);
        const bruto = tipo === "inlineStr" ? registro(celula["is"])?.["t"] : celula["v"];
        const valor = tipo === "s" ? (strings[Number(texto(bruto))] ?? "") : texto(bruto);
        colunas[coluna] = valor;
      }
      return colunas;
    });
    resultado.set(nome, linhas);
  }
  return resultado;
}

/** Todas as abas do XLSX, por nome, como linhas de texto. `rotulo` nomeia o arquivo nas mensagens. */
export function lerAbasXlsx(bytes: Buffer, rotulo: string): Map<string, string[][]> {
  let zip: AdmZip;
  try {
    zip = new AdmZip(bytes);
  } catch {
    throw new Error(`Não foi possível ler o ${rotulo}: não é um XLSX válido.`);
  }
  const tamanhoTotal = zip.getEntries().reduce((soma, entrada) => soma + entrada.header.size, 0);
  if (tamanhoTotal > TAMANHO_MAXIMO_DESCOMPACTADO) {
    throw new Error(`O ${rotulo} excede o limite de 150 MB descompactado.`);
  }
  return lerPlanilhas(zip, stringsCompartilhadas(zip));
}
