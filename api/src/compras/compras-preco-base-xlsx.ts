import { createHash } from "node:crypto";
import { abrirPlanilhaBuffer, ErroPlanilha } from "@padaria/db/planilha-xlsx";
import { LIMITE_LINHAS_PRECO_BASE, normalizarDescricaoPrecoBase } from "@padaria/shared/compras";
import { erroValidacao } from "../erros.js";

const CABECALHOS_CUSTO = new Set(["ULTIMO MENOR CUSTO", "ULTIMO CUSTO MENOR"]);
const CABECALHOS_DESCRICAO = new Set(["DESCRICAO", "PRODUTO", "NOME DO PRODUTO"]);
const CABECALHOS_CODIGO = new Set(["CODIGO", "CODIGO INTERNO", "COD PRODUTO"]);
const CABECALHOS_EAN = new Set(["EAN", "CODIGO DE BARRAS", "COD BARRAS"]);
// Quantas linhas invalidas sao nomeadas na mensagem. O operador precisa corrigir a planilha num
// passo so; listar 2.000 linhas num alert nao ajuda ninguem.
const LINHAS_INVALIDAS_NA_MENSAGEM = 10;

function indiceCabecalho(cabecalho: string[], nomes: Set<string>): number {
  return cabecalho.findIndex((celula) => nomes.has(normalizarDescricaoPrecoBase(celula)));
}

function amostraDeLinhas(numeros: number[]): string {
  const amostra = numeros.slice(0, LINHAS_INVALIDAS_NA_MENSAGEM).join(", ");
  const resto =
    numeros.length > LINHAS_INVALIDAS_NA_MENSAGEM ? ` e outras ${numeros.length - LINHAS_INVALIDAS_NA_MENSAGEM}` : "";
  return `${amostra}${resto}`;
}

/**
 * Converte o texto da celula em numero. Aceita "1234,56", "1.234,56" e "R$ 1.234,56".
 *
 * Duas decisoes explicitas, porque este numero vira preco-base e o preco-base e a referencia da
 * compra automatica (R-218):
 *
 * 1. Sem virgula, um unico ponto seguido de EXATAMENTE 3 digitos e separador de milhar, nao decimal:
 *    "1.250" na coluna de custo e mil duzentos e cinquenta, e `Number("1.250")` devolveria 1,25 —
 *    erro de mil vezes. Casos assim param a importacao em vez de entrar calados.
 * 2. COM virgula, a leitura e pt-BR: a virgula e o separador decimal, entao "1,250" e 1,25 (custo com
 *    tres casas, que `numeric(14,4)` suporta). Uma planilha exportada em locale US escreveria mil
 *    duzentos e cinquenta exatamente assim, e nesse caso a leitura erraria por mil — PENDENTE de
 *    confirmacao de Rodrigo sobre o locale de exportacao da planilha de discriminacao. Nao inverti o
 *    criterio por conta propria: trocar a regra sem a confirmacao erraria os custos legitimos de tres
 *    casas, que hoje funcionam.
 *
 * O teto de magnitude existe porque a coluna e `numeric(14,4)`: 10 digitos inteiros. Acima disso o
 * banco responde 22003 e a rota devolveria 500 por um zero digitado a mais na planilha.
 */
const TETO_VALOR_PRECO_BASE = 1e10;

export function numeroPlanilha(valor: string): number | null {
  const limpo = valor
    .trim()
    .replace(/^R\$\s*/i, "")
    .replace(/\s/g, "");
  if (!limpo) return null;
  if (!limpo.includes(",") && /^-?\d+\.\d{3}$/.test(limpo)) return null;
  const normalizado = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const numero = Number(normalizado);
  // Zero nao e base valida (R-220): a compra automatica da R-218 compra quando o custo final e menor
  // ou igual a base, entao base zero reprovaria toda proposta para sempre. Celula zerada e campo nao
  // preenchido, e campo nao preenchido vira pendencia para o operador corrigir.
  if (!Number.isFinite(numero) || numero <= 0 || numero >= TETO_VALOR_PRECO_BASE) return null;
  return numero;
}

export function linhasDePrecoBaseDoXlsx(buffer: Buffer) {
  // O leitor sinaliza arquivo malformado com `ErroPlanilha` — inclusive estouro do teto de inflacao
  // (zip bomb). Tudo isso e 400: o arquivo e invalido, o sistema esta bem. Sem esta conversao, uma
  // planilha corrompida respondia 500 "Erro interno" e abria alerta no Sentry.
  let planilha;
  try {
    planilha = abrirPlanilhaBuffer(buffer);
  } catch (erro) {
    if (erro instanceof ErroPlanilha) throw erroValidacao(erro.message, "PRICE_BASE_FILE_INVALID");
    throw erro;
  }

  for (const nomeAba of planilha.abas) {
    let aba;
    try {
      // O teto vai para DENTRO do leitor: aplicado so depois do parse, ele protegia o INSERT e o
      // casamento linha x produto, mas nao a memoria gasta para montar as linhas.
      aba = planilha.ler(nomeAba, { maxLinhas: LIMITE_LINHAS_PRECO_BASE + 1 });
    } catch (erro) {
      if (erro instanceof ErroPlanilha) throw erroValidacao(erro.message, "PRICE_BASE_FILE_INVALID");
      throw erro;
    }
    const indiceCabecalhoLinha = aba.linhas.findIndex((linha) => indiceCabecalho(linha, CABECALHOS_CUSTO) >= 0);
    if (indiceCabecalhoLinha < 0) continue;
    const cabecalho = aba.linhas[indiceCabecalhoLinha] ?? [];
    const colunaCusto = indiceCabecalho(cabecalho, CABECALHOS_CUSTO);
    const colunaDescricao = indiceCabecalho(cabecalho, CABECALHOS_DESCRICAO);
    const colunaCodigo = indiceCabecalho(cabecalho, CABECALHOS_CODIGO);
    const colunaEan = indiceCabecalho(cabecalho, CABECALHOS_EAN);
    if (colunaDescricao < 0)
      throw erroValidacao(
        'A planilha precisa ter uma coluna "DESCRIÇÃO" ou "PRODUTO"',
        "PRICE_BASE_DESCRIPTION_MISSING"
      );

    const invalidas: number[] = [];
    const semDescricao: number[] = [];
    const linhas = aba.linhas.slice(indiceCabecalhoLinha + 1).flatMap((linha, indice) => {
      // Numero que a PLANILHA declara, nao a posicao: o Excel omite a linha totalmente vazia, e
      // contando por posicao a mensagem "corrija a linha 40" apontava a linha 38 na tela do operador.
      const numeroLinha = aba.numeros[indiceCabecalhoLinha + 1 + indice] ?? indiceCabecalhoLinha + indice + 2;
      const descricao = linha[colunaDescricao]?.trim() ?? "";
      const custoTexto = linha[colunaCusto]?.trim() ?? "";
      if (!descricao && !custoTexto) return [];
      // Custo sem descricao nao da para parear com produto nenhum, e o contrato da analise exige
      // descricao. Antes essa linha seguia com descricao vazia e so morria no Zod (ou gravava "").
      if (!descricao) {
        semDescricao.push(numeroLinha);
        return [];
      }
      const custo = numeroPlanilha(custoTexto);
      // Custo ilegivel para a planilha inteira, nao so para a primeira ocorrencia: o operador
      // corrige tudo de uma vez em vez de descobrir uma linha por tentativa.
      if (custo === null) {
        invalidas.push(numeroLinha);
        return [];
      }
      return [
        {
          numeroLinha,
          codigo: colunaCodigo >= 0 ? linha[colunaCodigo]?.trim() || null : null,
          ean: colunaEan >= 0 ? linha[colunaEan]?.trim() || null : null,
          descricao,
          ultimoMenorCusto: custo
        }
      ];
    });

    if (invalidas.length)
      throw erroValidacao(
        `Custo invalido em ${invalidas.length} linha(s): ${amostraDeLinhas(invalidas)}. Corrija a coluna de custo e envie novamente.`,
        "PRICE_BASE_INVALID_COST"
      );
    if (semDescricao.length)
      throw erroValidacao(
        `Linha com custo e sem descricao em ${semDescricao.length} linha(s): ${amostraDeLinhas(semDescricao)}. Preencha a descricao e envie novamente.`,
        "PRICE_BASE_DESCRIPTION_MISSING"
      );
    if (!linhas.length) throw erroValidacao("A planilha nao possui linhas de preco-base", "PRICE_BASE_EMPTY_FILE");
    // Mesmo teto do contrato da rota JSON (`analisarImportacaoPrecoBaseSchema`). A rota de arquivo
    // montava o payload a mao e escapava dele: um .xlsx com centenas de milhares de linhas entrava
    // no casamento O(N) e num unico INSERT, estourando o limite de parametros do Postgres com 500.
    if (linhas.length > LIMITE_LINHAS_PRECO_BASE)
      throw erroValidacao(
        `A planilha tem ${linhas.length} linhas e o limite por importacao e ${LIMITE_LINHAS_PRECO_BASE}`,
        "PRICE_BASE_TOO_MANY_ROWS"
      );
    return { nomeAba, linhas, hashArquivo: createHash("sha256").update(buffer).digest("hex") };
  }
  throw erroValidacao('Nenhuma aba possui a coluna "ÚLTIMO MENOR CUSTO"', "PRICE_BASE_COST_COLUMN_MISSING");
}
