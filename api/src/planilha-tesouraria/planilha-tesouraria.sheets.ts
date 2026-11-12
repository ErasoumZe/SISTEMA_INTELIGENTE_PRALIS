// Gravacao nas abas da planilha da Tesouraria. So VALORES, a partir da coluna F, na primeira linha livre depois do
// ultimo registro; nunca sobrescreve, nunca toca colunas antes de F, formulas, cabecalhos ou outras abas.
import { normalizarData } from "@padaria/shared/planilha-tesouraria";
import { a1, type SheetsGateway } from "../google/google-sheets-gateway.js";

export type ResultadoGravacao = {
  aba: string;
  gravado: boolean;
  linhaInicial: number | null;
  linhas: number;
  mensagem: string;
};

/**
 * Le a tabela (F2 ate a ultima coluna), acha a ultima linha preenchida e grava os registros na seguinte. Se QUALQUER
 * registro novo ja existir na aba (mesma chave), nao grava nenhum: nada de envio pela metade nem duplicado.
 * Depois de gravar, rele a faixa escrita e so diz "gravado" se o que voltou bate com o que foi enviado.
 */
// Dois envios ao mesmo tempo leriam a mesma "ultima linha" e um sobrescreveria o outro. Fila por planilha+aba (a API
// roda em uma replica). O envio seguinte espera o anterior terminar (inclusive a releitura).
const filas = new Map<string, Promise<unknown>>();
function emFila<T>(chave: string, tarefa: () => Promise<T>): Promise<T> {
  const anterior = filas.get(chave) ?? Promise.resolve();
  const atual = anterior.catch(() => undefined).then(tarefa);
  filas.set(chave, atual);
  return atual.finally(() => {
    if (filas.get(chave) === atual) filas.delete(chave);
  });
}

export function gravarNaProximaLinha(input: Parameters<typeof gravarSemFila>[0]): Promise<ResultadoGravacao> {
  return emFila(`${input.planilhaId}|${input.aba}`, () => gravarSemFila(input));
}

async function gravarSemFila(input: {
  gateway: SheetsGateway;
  planilhaId: string;
  aba: string;
  ultimaColuna: "L" | "N";
  linhas: Array<Array<string | number>>;
  chave: (celulas: ReadonlyArray<string | number>) => string;
}): Promise<ResultadoGravacao> {
  const { gateway, planilhaId, aba, ultimaColuna, linhas, chave } = input;
  if (!linhas.length) return { aba, gravado: false, linhaInicial: null, linhas: 0, mensagem: "NADA PARA GRAVAR." };

  const [existentes = []] = await gateway.batchGetValues(planilhaId, [a1(aba, `F2:${ultimaColuna}`)]);
  // A API devolve a faixa ate a ultima linha com conteudo: linhas vazias no meio continuam contando.
  const ultimaPreenchida = existentes.reduce(
    (ultima, celulas, indice) => (celulas.some((c) => c.trim()) ? indice : ultima),
    -1
  );
  const linhaInicial = ultimaPreenchida + 3; // +2 da linha 2 inicial, +1 para a proxima
  const chavesExistentes = new Set(
    existentes.filter((celulas) => celulas.some((c) => c.trim())).map((celulas) => chave(comDataNormalizada(celulas)))
  );
  const repetidas = linhas.filter((celulas) => chavesExistentes.has(chave(celulas)));
  if (repetidas.length) {
    return {
      aba,
      gravado: false,
      linhaInicial: null,
      linhas: 0,
      mensagem: `JÁ ENVIADO: ${repetidas.length} REGISTRO(S) IGUAL(IS) JÁ ESTÁ(ÃO) NA ABA. NADA FOI GRAVADO.`
    };
  }

  const linhaFinal = linhaInicial + linhas.length - 1;
  const faixa = a1(aba, `F${linhaInicial}:${ultimaColuna}${linhaFinal}`);
  await gateway.batchUpdateValues(planilhaId, [{ range: faixa, values: linhas }], "USER_ENTERED");

  let conferidas: string[][];
  try {
    [conferidas = []] = await gateway.batchGetValues(planilhaId, [faixa]);
  } catch {
    return {
      aba,
      gravado: false,
      linhaInicial,
      linhas: 0,
      mensagem: `A GRAVAÇÃO FOI FEITA A PARTIR DA LINHA ${linhaInicial}, MAS NÃO FOI POSSÍVEL CONFIRMAR. CONFIRA A ABA ANTES DE ENVIAR DE NOVO.`
    };
  }
  const confirmadas = conferidas.filter((celulas, indice) => {
    const enviada = linhas[indice];
    return enviada !== undefined && chave(comDataNormalizada(celulas)) === chave(enviada);
  }).length;
  if (confirmadas !== linhas.length) {
    return {
      aba,
      gravado: false,
      linhaInicial,
      linhas: confirmadas,
      mensagem: `A GRAVAÇÃO NÃO FOI CONFIRMADA (${confirmadas} DE ${linhas.length} LINHAS). CONFIRA A ABA ANTES DE ENVIAR DE NOVO.`
    };
  }
  return {
    aba,
    gravado: true,
    linhaInicial,
    linhas: linhas.length,
    mensagem: `GRAVADO: ${linhas.length} LINHA(S) A PARTIR DA LINHA ${linhaInicial}.`
  };
}

// A data volta da planilha no formato da celula (ex.: 10/11/26); a chave compara sempre dd/mm/aaaa.
function comDataNormalizada(celulas: ReadonlyArray<string | number>): Array<string | number> {
  const [data, ...resto] = celulas;
  return [normalizarData(String(data ?? "")) ?? String(data ?? ""), ...resto];
}
