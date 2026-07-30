// Recorrencia de lancamento (PROJECT_BRAIN/17, D3 + PROJECT_BRAIN/14 "Bloco Recorrencia").
//
// "Recorrencia REGISTRA e cria lancamentos futuros automaticamente (como nao-pagos, vencendo na
// data)." Ou seja: ao salvar, a serie inteira nasce de uma vez — nao ha job noturno gerando depois.
// Isso e proposital: um lancamento que so aparece se um job rodou e um lancamento em que ninguem
// confia. A definicao fica gravada (a tabela lancamentos_recorrencias) para se saber DE ONDE cada
// lancamento da serie veio.
//
// Este modulo e PURO: so calcula as datas. Quem grava e o servidor.
import { z } from "zod";
import { diaDaSemanaIso, somarDias, somarMeses } from "../datas/index.js";

// "3 em 3" do desenho do Rodrigo = a cada 3 MESES (decisao do Jose, 30/07). A leitura natural em
// conta a pagar — agua, seguro, IPTU — e trimestral.
export const frequenciasRecorrencia = ["dia", "semana", "quinzena", "mes", "trimestre"] as const;
export type FrequenciaRecorrencia = (typeof frequenciasRecorrencia)[number];

// Teto duro da serie: nada e gerado depois de 12 meses da primeira data (decisao do Jose, 30/07).
// Protege dos dois lados — do engano de digitacao (repeticoes = 999 na frequencia diaria) e do
// lancamento futuro tao distante que ninguem lembra por que existe.
export const LIMITE_MESES_RECORRENCIA = 12;

// Teto do que o contrato aceita, so para o laco ser sempre finito mesmo com payload hostil. O
// corte que vale na pratica e o de 12 meses acima; 366 e o maximo que a frequencia diaria alcanca.
export const MAXIMO_REPETICOES_RECORRENCIA = 366;

export type Recorrencia = {
  frequencia: FrequenciaRecorrencia;
  // TOTAL de lancamentos da serie, JA CONTANDO o que esta sendo criado (decisao do Jose, 30/07):
  // "repetir 3 vezes" = 3 lancamentos na tela, como no Mobills. repeticoes = 1 nao gera nada alem
  // do proprio lancamento, e e um jeito valido de dizer "sem recorrencia".
  repeticoes: number;
  // Dias da semana ISO (1 = segunda ... 7 = domingo). So valem na frequencia 'semana'; nas demais
  // sao ignorados, porque "toda terca" nao significa nada numa serie mensal. O desenho do Rodrigo
  // oferece Sg..Sa (sem domingo), mas o modelo aceita 7 para nao exigir migration se ele entrar.
  diasSemana?: number[] | undefined;
};

// Contrato do bloco Recorrencia no payload do lancamento. Ausente = lancamento avulso (o caso
// normal); presente exige a permissao lancamentos_recorrencia_criar (403 no servidor, D3).
export const recorrenciaSchema = z
  .object({
    frequencia: z.enum(frequenciasRecorrencia),
    repeticoes: z.coerce.number().int().min(1).max(MAXIMO_REPETICOES_RECORRENCIA),
    diasSemana: z.array(z.coerce.number().int().min(1).max(7)).optional()
  })
  .strict();

// O que a criacao devolve quando houve recorrencia. Ausentes no lancamento avulso, entao quem ja
// consumia { id, computar } continua funcionando.
export const resultadoSerieSchema = {
  // Quantos lancamentos a serie criou DE FATO (pode ser menor que `repeticoes`, ver abaixo).
  serie: z.number().int().optional(),
  // true quando o teto de 12 meses cortou a serie — a tela avisa em vez de deixar a pessoa achar
  // que pediu 24 e recebeu 24.
  serieLimitada: z.boolean().optional()
};

export type SerieRecorrencia = {
  // Inclui a data do lancamento que esta sendo criado, na primeira posicao.
  datas: string[];
  // true quando a serie entregue e MENOR que a pedida — seja pelo teto de 12 meses, seja pelo
  // limite duro de repeticoes. A tela avisa quantos foram criados de fato, em vez de deixar a
  // pessoa achar que pediu 24 e recebeu 24.
  limitadaPeloTeto: boolean;
};

function passoFixo(frequencia: Exclude<FrequenciaRecorrencia, "semana">, inicio: string, n: number): string {
  // Sempre a partir do INICIO (nunca da data anterior): em 'mes'/'trimestre' isso e o que preserva
  // o dia 31 nos meses longos depois de passar por um mes curto. Ver somarMeses.
  if (frequencia === "dia") return somarDias(inicio, n);
  if (frequencia === "quinzena") return somarDias(inicio, 15 * n);
  if (frequencia === "mes") return somarMeses(inicio, n);
  return somarMeses(inicio, 3 * n);
}

/**
 * Datas da serie, a partir da data do lancamento que esta sendo criado.
 *
 * `dataInicial` e o VENCIMENTO do primeiro lancamento (e o vencimento que a recorrencia repete —
 * D3: "como nao-pagos, vencendo na data").
 */
export function datasDaRecorrencia(dataInicial: string, recorrencia: Recorrencia): SerieRecorrencia {
  // `pedidas` e o que a pessoa digitou (so saneado para >= 1 inteiro); `alvo` e ate onde o laco vai.
  // A diferenca entre os dois importa: se o limite duro cortasse `pedidas`, uma serie diaria de
  // 100.000 entregaria 366 e a funcao diria "nao limitei" — mentira que a tela repetiria.
  const pedidas = Math.max(Math.trunc(recorrencia.repeticoes) || 1, 1);
  const alvo = Math.min(pedidas, MAXIMO_REPETICOES_RECORRENCIA);
  const datas = [dataInicial];
  const limitada = () => ({ datas, limitadaPeloTeto: datas.length < pedidas });
  if (alvo === 1) return limitada();

  // Comparacao de "yyyy-MM-dd" como texto e cronologica — nao precisa converter para Date.
  const teto = somarMeses(dataInicial, LIMITE_MESES_RECORRENCIA);

  if (recorrencia.frequencia === "semana") {
    // Sem nenhum dia marcado, "semanal" e o proprio dia da semana da data inicial, a cada 7 dias.
    const dias = recorrencia.diasSemana?.length ? [...new Set(recorrencia.diasSemana)] : [diaDaSemanaIso(dataInicial)];
    let cursor = dataInicial;
    while (datas.length < alvo) {
      cursor = somarDias(cursor, 1);
      if (cursor > teto) break;
      if (dias.includes(diaDaSemanaIso(cursor))) datas.push(cursor);
    }
    return limitada();
  }

  for (let n = 1; datas.length < alvo; n += 1) {
    const proxima = passoFixo(recorrencia.frequencia, dataInicial, n);
    if (proxima > teto) break;
    datas.push(proxima);
  }
  return limitada();
}
