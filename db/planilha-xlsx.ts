/**
 * Leitor MINIMO de .xlsx, sem dependencia externa.
 *
 * Por que nao usar uma biblioteca: a candidata natural (exceljs) traz 20 vulnerabilidades
 * transitivas — o `npm audit` do repositorio sai de 23 para 43 — e isto aqui e um script de
 * SEEDING que roda uma vez, fora do runtime da API. Trocar a superficie de ataque do projeto
 * inteiro por conveniencia num script nao paga.
 *
 * O que este leitor faz: xlsx e um ZIP de XML. Lemos o diretorio central do ZIP, inflamos as
 * entradas necessarias (`zlib` e nativo) e extraimos as celulas como TEXTO. Nada de formulas,
 * formatacao, datas tipadas ou streaming: a planilha da padaria cabe na memoria e o seeding so
 * precisa de texto.
 *
 * Limites conhecidos (explicitos de proposito):
 *   - le apenas ZIP com deflate (metodo 8) ou store (0) — o que o Excel e o Google Sheets geram;
 *   - devolve o texto da celula; numero vem como o texto do numero, data vem como serial.
 */
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

type EntradaZip = { nome: string; metodo: number; inicioDados: number; tamanhoComprimido: number };

// Assinatura do "end of central directory" (EOCD) do ZIP.
const FIM_DIRETORIO = 0x06054b50;
const ENTRADA_DIRETORIO = 0x02014b50;

function acharFimDoDiretorio(buffer: Buffer): number {
  // O EOCD fica no fim do arquivo, mas pode ter comentario depois: varre de tras para frente.
  for (let posicao = buffer.length - 22; posicao >= 0; posicao -= 1) {
    if (buffer.readUInt32LE(posicao) === FIM_DIRETORIO) return posicao;
  }
  throw new Error("Arquivo nao parece um .xlsx (fim do diretorio ZIP nao encontrado)");
}

function lerDiretorio(buffer: Buffer): Map<string, EntradaZip> {
  const fim = acharFimDoDiretorio(buffer);
  const totalEntradas = buffer.readUInt16LE(fim + 10);
  let posicao = buffer.readUInt32LE(fim + 16);
  const entradas = new Map<string, EntradaZip>();

  for (let indice = 0; indice < totalEntradas; indice += 1) {
    if (buffer.readUInt32LE(posicao) !== ENTRADA_DIRETORIO) break;
    const metodo = buffer.readUInt16LE(posicao + 10);
    const tamanhoComprimido = buffer.readUInt32LE(posicao + 20);
    const tamanhoNome = buffer.readUInt16LE(posicao + 28);
    const tamanhoExtra = buffer.readUInt16LE(posicao + 30);
    const tamanhoComentario = buffer.readUInt16LE(posicao + 32);
    const deslocamentoLocal = buffer.readUInt32LE(posicao + 42);
    const nome = buffer.toString("utf8", posicao + 46, posicao + 46 + tamanhoNome);

    // O cabecalho LOCAL repete nome/extra com tamanhos proprios — os dados comecam depois dele.
    const tamanhoNomeLocal = buffer.readUInt16LE(deslocamentoLocal + 26);
    const tamanhoExtraLocal = buffer.readUInt16LE(deslocamentoLocal + 28);
    const inicioDados = deslocamentoLocal + 30 + tamanhoNomeLocal + tamanhoExtraLocal;

    entradas.set(nome, { nome, metodo, inicioDados, tamanhoComprimido });
    posicao += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario;
  }
  return entradas;
}

function extrair(buffer: Buffer, entrada: EntradaZip): string {
  const dados = buffer.subarray(entrada.inicioDados, entrada.inicioDados + entrada.tamanhoComprimido);
  if (entrada.metodo === 0) return dados.toString("utf8");
  if (entrada.metodo === 8) return inflateRawSync(dados).toString("utf8");
  throw new Error(`Metodo de compressao ${entrada.metodo} nao suportado (${entrada.nome})`);
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function desescapar(texto: string): string {
  return texto.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (inteiro, corpo: string) => {
    if (corpo.startsWith("#x") || corpo.startsWith("#X")) return String.fromCodePoint(parseInt(corpo.slice(2), 16));
    if (corpo.startsWith("#")) return String.fromCodePoint(Number(corpo.slice(1)));
    return ENTIDADES[corpo] ?? inteiro;
  });
}

// sharedStrings guarda o texto de todas as celulas de texto; a celula referencia o INDICE.
function lerTextosCompartilhados(xml: string | undefined): string[] {
  if (!xml) return [];
  const textos: string[] = [];
  for (const item of xml.split("<si>").slice(1)) {
    // Um <si> pode ter varios <t> (texto com formatacao mista): concatena todos.
    const pedacos = [...item.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((achado) => desescapar(achado[1] ?? ""));
    textos.push(pedacos.join(""));
  }
  return textos;
}

/** Coluna "BC12" -> indice 0-based da coluna (BC = 54). */
function indiceDaColuna(referencia: string): number {
  const letras = referencia.replace(/[0-9]/g, "");
  let indice = 0;
  for (const letra of letras) indice = indice * 26 + (letra.charCodeAt(0) - 64);
  return indice - 1;
}

export type Aba = { nome: string; linhas: string[][] };

export type Planilha = {
  abas: string[];
  ler: (nomeDaAba: string) => Aba;
};

export function abrirPlanilha(caminho: string): Planilha {
  const buffer = readFileSync(caminho);
  const entradas = lerDiretorio(buffer);
  const texto = (nome: string) => {
    const entrada = entradas.get(nome);
    return entrada ? extrair(buffer, entrada) : undefined;
  };

  const workbook = texto("xl/workbook.xml");
  if (!workbook) throw new Error("xl/workbook.xml ausente — arquivo nao e um .xlsx valido");
  const rels = texto("xl/_rels/workbook.xml.rels") ?? "";

  const alvoPorRel = new Map<string, string>();
  for (const achado of rels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)) {
    alvoPorRel.set(achado[1] ?? "", (achado[2] ?? "").replace(/^\/?xl\//, ""));
  }

  const arquivoPorAba = new Map<string, string>();
  for (const achado of workbook.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="(rId\d+)"/g)) {
    const alvo = alvoPorRel.get(achado[2] ?? "");
    if (alvo) arquivoPorAba.set(desescapar(achado[1] ?? ""), `xl/${alvo}`);
  }

  const compartilhados = lerTextosCompartilhados(texto("xl/sharedStrings.xml"));

  function ler(nomeDaAba: string): Aba {
    const arquivo = arquivoPorAba.get(nomeDaAba);
    if (!arquivo) throw new Error(`Aba "${nomeDaAba}" nao existe. Abas: ${[...arquivoPorAba.keys()].join(" | ")}`);
    const xml = texto(arquivo);
    if (!xml) throw new Error(`Aba "${nomeDaAba}" aponta para ${arquivo}, que nao esta no arquivo`);

    const linhas: string[][] = [];
    for (const linhaXml of xml.split("<row ").slice(1)) {
      const celulas: string[] = [];
      // A alternativa `\/>` vem ANTES do corpo de proposito: celula vazia e escrita self-closing
      // (`<c r="D14" s="603"/>`). Sem tratar isso, o `<\/c>` mais proximo e o da celula SEGUINTE — a
      // vazia engolia a proxima, gravando o valor na coluna errada e perdendo o `t="s"` no caminho
      // (o indice do sharedStrings vazava como numero cru: "860", "870"). Era silencioso e deslocava
      // colunas inteiras — exatamente o erro que faz um seed gravar cadastro com nome trocado.
      for (const achado of linhaXml.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const referencia = achado[1] ?? "";
        const atributos = achado[2] ?? "";
        const corpo = achado[3] ?? "";
        const tipo = /t="([^"]+)"/.exec(atributos)?.[1];
        let valor: string;
        if (tipo === "s") {
          // Texto compartilhado: <v> guarda o indice.
          const indice = Number(/<v>([\s\S]*?)<\/v>/.exec(corpo)?.[1] ?? "-1");
          valor = compartilhados[indice] ?? "";
        } else if (tipo === "inlineStr") {
          valor = [...corpo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => desescapar(t[1] ?? "")).join("");
        } else {
          valor = desescapar(/<v>([\s\S]*?)<\/v>/.exec(corpo)?.[1] ?? "");
        }
        celulas[indiceDaColuna(referencia)] = valor.trim();
      }
      // Celulas ausentes viram "" para a linha ser indexavel por coluna sem buracos.
      for (let indice = 0; indice < celulas.length; indice += 1) celulas[indice] ??= "";
      linhas.push(celulas);
    }
    return { nome: nomeDaAba, linhas };
  }

  return { abas: [...arquivoPorAba.keys()], ler };
}
