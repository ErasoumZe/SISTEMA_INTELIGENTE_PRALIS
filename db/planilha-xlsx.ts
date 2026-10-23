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
 *
 * ATENCAO — este leitor deixou de ser so de seeding: a importacao de preco-base do modulo Compras o
 * alimenta com upload de usuario autenticado. Por isso toda entrada malformada agora vira
 * `ErroPlanilha` (que a API converte em 400) em vez de `Error` cru virando 500, e a inflacao tem
 * teto: 10 MB comprimidos de deflate chegam a ~10 GB inflados, e `inflateRawSync` sem
 * `maxOutputLength` derrubaria o processo inteiro da padaria por falta de memoria.
 */
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

type EntradaZip = { nome: string; metodo: number; inicioDados: number; tamanhoComprimido: number };

/** Arquivo invalido/malformado — culpa do arquivo, nunca do codigo. A API responde 400. */
export class ErroPlanilha extends Error {}

// Assinatura do "end of central directory" (EOCD) do ZIP.
const FIM_DIRETORIO = 0x06054b50;
const ENTRADA_DIRETORIO = 0x02014b50;
// Teto por entrada inflada. A planilha de discriminacao da padaria tem alguns MB de XML; 64 MiB
// deixa folga de uma ordem de grandeza e ainda assim nao permite transformar um upload de 10 MB em
// gigabytes de memoria.
const TETO_INFLADO_BYTES = 64 * 1024 * 1024;
// Orcamento AGREGADO do arquivo. O teto acima e por entrada: sozinho, ele deixava passar um workbook
// com muitas entradas grandes.
const TETO_INFLADO_TOTAL_BYTES = 192 * 1024 * 1024;
// XFD e a ultima coluna do formato (16.384).
const LIMITE_COLUNAS = 16_384;
// 1.048.576 e o maximo de linhas de uma aba do Excel. Vale como teto de sanidade para quem le sem
// passar limite proprio (os scripts de seeding); quem recebe upload passa um teto bem menor.
const LIMITE_LINHAS_PADRAO = 1_048_576;
// Uma planilha de verdade tem poucas abas. O limite existe porque o numero de abas multiplica o
// trabalho de procurar a coluna de custo.
const LIMITE_ABAS = 64;
// Comentario do ZIP tem no maximo 65.535 bytes, logo o EOCD nunca esta mais longe que isso do fim.
// Sem este limite, um arquivo grande sem EOCD fazia a varredura percorrer o buffer inteiro.
const JANELA_EOCD = 22 + 0xffff;

function acharFimDoDiretorio(buffer: Buffer): number {
  // O EOCD fica no fim do arquivo, mas pode ter comentario depois: varre de tras para frente.
  const limite = Math.max(0, buffer.length - JANELA_EOCD);
  for (let posicao = buffer.length - 22; posicao >= limite; posicao -= 1) {
    if (buffer.readUInt32LE(posicao) === FIM_DIRETORIO) return posicao;
  }
  throw new ErroPlanilha("Arquivo nao parece um .xlsx (fim do diretorio ZIP nao encontrado)");
}

// Todo offset lido do proprio arquivo e suspeito: um ZIP truncado ou forjado aponta para fora do
// buffer e `readUInt32LE` lancaria RangeError — erro tecnico, logado como bug do sistema.
function exigirDentro(buffer: Buffer, posicao: number, tamanho: number): number {
  if (!Number.isInteger(posicao) || posicao < 0 || posicao + tamanho > buffer.length) {
    throw new ErroPlanilha("Arquivo .xlsx corrompido (estrutura do ZIP aponta para fora do arquivo)");
  }
  return posicao;
}

function lerDiretorio(buffer: Buffer): Map<string, EntradaZip> {
  if (buffer.length < 22) throw new ErroPlanilha("Arquivo .xlsx vazio ou truncado");
  const fim = acharFimDoDiretorio(buffer);
  const totalEntradas = buffer.readUInt16LE(fim + 10);
  let posicao = buffer.readUInt32LE(fim + 16);
  const entradas = new Map<string, EntradaZip>();

  for (let indice = 0; indice < totalEntradas; indice += 1) {
    exigirDentro(buffer, posicao, 46);
    if (buffer.readUInt32LE(posicao) !== ENTRADA_DIRETORIO) break;
    const metodo = buffer.readUInt16LE(posicao + 10);
    const tamanhoComprimido = buffer.readUInt32LE(posicao + 20);
    const tamanhoNome = buffer.readUInt16LE(posicao + 28);
    const tamanhoExtra = buffer.readUInt16LE(posicao + 30);
    const tamanhoComentario = buffer.readUInt16LE(posicao + 32);
    const deslocamentoLocal = buffer.readUInt32LE(posicao + 42);
    exigirDentro(buffer, posicao + 46, tamanhoNome);
    const nome = buffer.toString("utf8", posicao + 46, posicao + 46 + tamanhoNome);

    // O cabecalho LOCAL repete nome/extra com tamanhos proprios — os dados comecam depois dele.
    exigirDentro(buffer, deslocamentoLocal, 30);
    const tamanhoNomeLocal = buffer.readUInt16LE(deslocamentoLocal + 26);
    const tamanhoExtraLocal = buffer.readUInt16LE(deslocamentoLocal + 28);
    const inicioDados = deslocamentoLocal + 30 + tamanhoNomeLocal + tamanhoExtraLocal;
    exigirDentro(buffer, inicioDados, tamanhoComprimido);

    entradas.set(nome, { nome, metodo, inicioDados, tamanhoComprimido });
    posicao += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario;
  }
  return entradas;
}

function extrair(buffer: Buffer, entrada: EntradaZip): string {
  const dados = buffer.subarray(entrada.inicioDados, entrada.inicioDados + entrada.tamanhoComprimido);
  if (entrada.metodo === 0) return dados.toString("utf8");
  if (entrada.metodo === 8) {
    try {
      return inflateRawSync(dados, { maxOutputLength: TETO_INFLADO_BYTES }).toString("utf8");
    } catch (erro) {
      // Estouro do teto e dado corrompido chegam aqui do mesmo jeito: nos dois casos o arquivo e
      // inaceitavel, e nenhum dos dois e falha do sistema.
      throw new ErroPlanilha(
        `Nao foi possivel ler "${entrada.nome.slice(0, 120)}": conteudo invalido ou acima do limite de ${Math.round(
          TETO_INFLADO_BYTES / (1024 * 1024)
        )} MB descomprimidos`,
        { cause: erro }
      );
    }
  }
  throw new ErroPlanilha(`Metodo de compressao ${entrada.metodo} nao suportado (${entrada.nome})`);
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function desescapar(texto: string): string {
  return texto.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (inteiro, corpo: string) => {
    // Codepoint fora da faixa Unicode faz `String.fromCodePoint` lancar RangeError. Num arquivo que
    // chegou por upload isso e arquivo invalido, nao defeito do sistema: devolve o texto cru.
    const codigo =
      corpo.startsWith("#x") || corpo.startsWith("#X")
        ? parseInt(corpo.slice(2), 16)
        : corpo.startsWith("#")
          ? Number(corpo.slice(1))
          : null;
    if (codigo !== null)
      return Number.isInteger(codigo) && codigo >= 0 && codigo <= 0x10ffff ? String.fromCodePoint(codigo) : inteiro;
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

// Caracteres de controle que o Postgres recusa em coluna `text` (NUL) ou que nao tem sentido numa
// celula. Vinham de `&#0;` na planilha e viravam 23502/22021 no INSERT, ou seja, 500 por culpa do
// arquivo.
// A regra `no-control-regex` existe para pegar controle ACIDENTAL; aqui eles sao exatamente o alvo.
// eslint-disable-next-line no-control-regex
const CONTROLES_PROIBIDOS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;

/**
 * `numeros[i]` e o numero REAL da linha na planilha (atributo `r` do `<row>`), e nao a posicao no
 * array. Importa porque o Excel OMITE a linha totalmente vazia: contando por posicao, a mensagem
 * "custo invalido na linha 4" apontava a linha 3 na tela do operador. Fica num array paralelo para
 * nao mudar a forma de `linhas`, que os scripts de seeding ja consomem.
 */
export type Aba = { nome: string; linhas: string[][]; numeros: number[] };

/** Tetos de leitura de UMA aba. Quem le decide; o default protege os scripts de seeding. */
export type LimitesDaAba = { maxLinhas?: number };

export type Planilha = {
  abas: string[];
  ler: (nomeDaAba: string, limites?: LimitesDaAba) => Aba;
};

export function abrirPlanilha(caminho: string): Planilha {
  return abrirPlanilhaBuffer(readFileSync(caminho));
}

/** Mesma leitura minima para uploads mantidos em memoria; nao grava arquivo temporario. */
export function abrirPlanilhaBuffer(buffer: Buffer): Planilha {
  const entradas = lerDiretorio(buffer);
  // Memoizado e com orcamento AGREGADO. Sem o cache, `texto()` re-inflava a mesma entrada a cada
  // chamada: um workbook declarando 200 mil abas apontando para o mesmo sheet fazia 200 mil
  // inflates do mesmo XML e prendia o event loop por horas — o processo inteiro da padaria parado
  // com um upload de poucos KB. O teto por entrada nao via isso, porque cada inflate caberia nele.
  const extraidos = new Map<string, string>();
  let bytesInflados = 0;
  const texto = (nome: string) => {
    const emCache = extraidos.get(nome);
    if (emCache !== undefined) return emCache;
    const entrada = entradas.get(nome);
    if (!entrada) return undefined;
    const conteudo = extrair(buffer, entrada);
    bytesInflados += conteudo.length;
    if (bytesInflados > TETO_INFLADO_TOTAL_BYTES)
      throw new ErroPlanilha(
        `Planilha acima do limite de ${Math.round(TETO_INFLADO_TOTAL_BYTES / (1024 * 1024))} MB descomprimidos`
      );
    extraidos.set(nome, conteudo);
    return conteudo;
  };

  const workbook = texto("xl/workbook.xml");
  if (!workbook) throw new ErroPlanilha("xl/workbook.xml ausente — arquivo nao e um .xlsx valido");
  const rels = texto("xl/_rels/workbook.xml.rels") ?? "";

  const alvoPorRel = new Map<string, string>();
  for (const achado of rels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)) {
    alvoPorRel.set(achado[1] ?? "", (achado[2] ?? "").replace(/^\/?xl\//, ""));
  }

  const arquivoPorAba = new Map<string, string>();
  for (const achado of workbook.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="(rId\d+)"/g)) {
    const alvo = alvoPorRel.get(achado[2] ?? "");
    if (alvo) arquivoPorAba.set(desescapar(achado[1] ?? ""), `xl/${alvo}`);
    if (arquivoPorAba.size > LIMITE_ABAS) throw new ErroPlanilha(`Planilha com mais de ${LIMITE_ABAS} abas`);
  }

  const compartilhados = lerTextosCompartilhados(texto("xl/sharedStrings.xml"));

  function ler(nomeDaAba: string, limites?: LimitesDaAba): Aba {
    const arquivo = arquivoPorAba.get(nomeDaAba);
    if (!arquivo)
      throw new ErroPlanilha(
        `Aba "${nomeDaAba}" nao existe. Abas: ${[...arquivoPorAba.keys()].slice(0, 10).join(" | ")}`
      );
    const xml = texto(arquivo);
    if (!xml) throw new ErroPlanilha(`Aba "${nomeDaAba}" aponta para ${arquivo}, que nao esta no arquivo`);
    const maxLinhas = limites?.maxLinhas ?? LIMITE_LINHAS_PADRAO;

    const linhas: string[][] = [];
    const numeros: number[] = [];
    // Varredura com `indexOf` em vez de `split("<row ")`, e com teto de linhas.
    //
    // O teto de bytes inflados nao protegia a MEMORIA DEPOIS do inflate: um sheet de 64 MB feito de
    // `"<row "` repetido virava ~13 milhoes de strings mais 13 milhoes de arrays, ou seja mais de um
    // giga de heap a partir de um upload de poucos KB — o processo da API morria e a padaria perdia o
    // Caixa junto. `split` materializava a lista inteira ANTES de qualquer checagem; aqui a leitura
    // para na linha excedente.
    let posicao = xml.indexOf("<row ");
    while (posicao >= 0) {
      const proxima = xml.indexOf("<row ", posicao + 5);
      const linhaXml = proxima >= 0 ? xml.slice(posicao + 5, proxima) : xml.slice(posicao + 5);
      posicao = proxima;
      if (linhas.length >= maxLinhas) throw new ErroPlanilha(`A aba "${nomeDaAba}" tem mais de ${maxLinhas} linhas`);
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
        const coluna = indiceDaColuna(referencia);
        // Uma unica celula `r="ZZZZZZ1"` dava indice 308.915.775: o array crescia para esse tamanho e
        // o laco de densificacao abaixo escrevia os 308 milhoes de posicoes — gigas de heap e minutos
        // de event loop travado, a partir de um arquivo de poucas centenas de bytes. XFD (16.384) e o
        // limite real do formato, entao acima disso o arquivo e invalido, nao grande.
        if (coluna < 0 || coluna >= LIMITE_COLUNAS)
          throw new ErroPlanilha(`Referencia de celula invalida na aba "${nomeDaAba}": ${referencia}`);
        celulas[coluna] = valor.trim().replace(CONTROLES_PROIBIDOS, "");
      }
      // Celulas ausentes viram "" para a linha ser indexavel por coluna sem buracos.
      for (let indice = 0; indice < celulas.length; indice += 1) celulas[indice] ??= "";
      // Numero DECLARADO pela planilha. Sem o atributo (planilha gerada por outra ferramenta), cai
      // para a posicao, que e o comportamento antigo.
      const declarado = Number(/^r="(\d+)"/.exec(linhaXml)?.[1] ?? "");
      numeros.push(Number.isInteger(declarado) && declarado > 0 ? declarado : linhas.length + 1);
      linhas.push(celulas);
    }
    return { nome: nomeDaAba, linhas, numeros };
  }

  return { abas: [...arquivoPorAba.keys()], ler };
}
