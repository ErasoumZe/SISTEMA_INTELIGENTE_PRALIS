import { z } from "zod";

// Recorrencia do agendamento de pedido (PROJECT_BRAIN/56 §3). O Calendario da Apple grava a repeticao no
// padrao iCalendar (RFC 5545, RRULE); aqui esta o mesmo modelo, com o que o iPhone e o Mac oferecem, mais
// "datas avulsas" (RDATE). Tudo e calculado em DATA LOCAL do fuso da empresa e so no fim vira instante.
//
// Regras do padrao que valem aqui (e os testes cobrem):
// - a data de inicio e SEMPRE a primeira ocorrencia e conta para "depois de N vezes" (RFC 5545 3.8.5.3);
// - data que nao existe (dia 31 em mes de 30, 5a sexta que nao ha) e PULADA, nunca vira outro dia;
// - a semana comeca no domingo (como no calendario em portugues do Brasil).

export const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"] as const;
export const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro"
] as const;

const diaSemana = z.number().int().min(0).max(6);
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

/** "No(a)": 1o..5o ou ultimo (-1) + dia da semana, qualquer dia, dia util ou fim de semana. */
export const posicaoRecorrenciaSchema = z.object({
  ordinal: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(-1)]),
  dia: z.union([diaSemana, z.enum(["dia", "dia_util", "fim_de_semana"])])
});

const unicos = <T>(lista: T[]) => new Set(lista).size === lista.length;

export const regraRecorrenciaSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("nunca") }),
  z
    .object({
      tipo: z.literal("padrao"),
      frequencia: z.enum(["diaria", "semanal", "mensal", "anual"]),
      intervalo: z.number().int().min(1).max(999),
      diasSemana: z.array(diaSemana).min(1).max(7).refine(unicos, "Dia repetido").optional(),
      diasMes: z.array(z.number().int().min(1).max(31)).min(1).max(31).refine(unicos, "Dia repetido").optional(),
      posicao: posicaoRecorrenciaSchema.optional(),
      meses: z.array(z.number().int().min(1).max(12)).min(1).max(12).refine(unicos, "Mês repetido").optional()
    })
    .superRefine((regra, contexto) => {
      const erro = (mensagem: string) => contexto.addIssue({ code: "custom", message: mensagem });
      if (regra.diasSemana && regra.frequencia !== "semanal") erro("Dias da semana só valem na repetição semanal");
      if (regra.diasMes && regra.frequencia !== "mensal") erro("Dias do mês só valem na repetição mensal");
      if (regra.meses && regra.frequencia !== "anual") erro("Meses só valem na repetição anual");
      if (regra.posicao && regra.frequencia !== "mensal" && regra.frequencia !== "anual")
        erro("“No(a)” só vale na repetição mensal ou anual");
      if (regra.diasMes && regra.posicao) erro("Escolha “Cada” (dias do mês) ou “No(a)”, não os dois");
    }),
  z.object({
    tipo: z.literal("datas"),
    datas: z.array(dataIso).min(1).max(366).refine(unicos, "Data repetida")
  })
]);

export type PosicaoRecorrencia = z.infer<typeof posicaoRecorrenciaSchema>;
export type RegraRecorrencia = z.infer<typeof regraRecorrenciaSchema>;

export const terminoRecorrenciaSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("nunca") }),
  z.object({ tipo: z.literal("data"), data: dataIso }),
  z.object({ tipo: z.literal("quantidade"), quantidade: z.number().int().min(1).max(999) })
]);
export type TerminoRecorrencia = z.infer<typeof terminoRecorrenciaSchema>;

// --- calendario em datas locais (sem fuso) ---------------------------------------------------------

type Dia = { ano: number; mes: number; dia: number }; // mes 1..12

function paraNumero(dia: Dia): number {
  return Date.UTC(dia.ano, dia.mes - 1, dia.dia) / 86_400_000;
}
function deNumero(numero: number): Dia {
  const data = new Date(numero * 86_400_000);
  return { ano: data.getUTCFullYear(), mes: data.getUTCMonth() + 1, dia: data.getUTCDate() };
}
function lerIso(texto: string): Dia {
  const [ano, mes, dia] = texto.split("-").map(Number) as [number, number, number];
  return { ano, mes, dia };
}
export function isoDoDia(dia: Dia): string {
  return `${dia.ano}-${String(dia.mes).padStart(2, "0")}-${String(dia.dia).padStart(2, "0")}`;
}
function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}
function diaDaSemana(numero: number): number {
  // 01/01/1970 foi quinta-feira (4).
  return (((numero + 4) % 7) + 7) % 7;
}
function somarMeses(ano: number, mes: number, meses: number): { ano: number; mes: number } {
  const total = ano * 12 + (mes - 1) + meses;
  return { ano: Math.floor(total / 12), mes: (total % 12) + 1 };
}

function casaPosicao(numero: number, alvo: PosicaoRecorrencia["dia"]): boolean {
  const semana = diaDaSemana(numero);
  if (alvo === "dia") return true;
  if (alvo === "dia_util") return semana >= 1 && semana <= 5;
  if (alvo === "fim_de_semana") return semana === 0 || semana === 6;
  return semana === alvo;
}

/** O N-esimo (ou ultimo) dia do mes que casa com o alvo; `null` quando nao existe (5a sexta, por ex.). */
function diaPorPosicao(ano: number, mes: number, posicao: PosicaoRecorrencia): number | null {
  const candidatos: number[] = [];
  const primeiro = paraNumero({ ano, mes, dia: 1 });
  for (let deslocamento = 0; deslocamento < diasNoMes(ano, mes); deslocamento += 1)
    if (casaPosicao(primeiro + deslocamento, posicao.dia)) candidatos.push(primeiro + deslocamento);
  const escolhido = posicao.ordinal === -1 ? candidatos.at(-1) : candidatos[posicao.ordinal - 1];
  return escolhido ?? null;
}

/** Datas (em ordem) que a regra gera dentro de um periodo, sem olhar inicio nem termino. */
function datasDoPeriodo(regra: Extract<RegraRecorrencia, { tipo: "padrao" }>, inicio: Dia, periodo: number): number[] {
  const numeroInicio = paraNumero(inicio);
  if (regra.frequencia === "diaria") return [numeroInicio + periodo * regra.intervalo];
  if (regra.frequencia === "semanal") {
    const domingo = numeroInicio - diaDaSemana(numeroInicio) + periodo * regra.intervalo * 7;
    const dias = regra.diasSemana ?? [diaDaSemana(numeroInicio)];
    return [...dias].sort((a, b) => a - b).map((dia) => domingo + dia);
  }
  if (regra.frequencia === "mensal") {
    const { ano, mes } = somarMeses(inicio.ano, inicio.mes, periodo * regra.intervalo);
    if (regra.posicao) {
      const dia = diaPorPosicao(ano, mes, regra.posicao);
      return dia === null ? [] : [dia];
    }
    return [...(regra.diasMes ?? [inicio.dia])]
      .sort((a, b) => a - b)
      .filter((dia) => dia <= diasNoMes(ano, mes))
      .map((dia) => paraNumero({ ano, mes, dia }));
  }
  const ano = inicio.ano + periodo * regra.intervalo;
  const datas: number[] = [];
  for (const mes of [...(regra.meses ?? [inicio.mes])].sort((a, b) => a - b)) {
    if (regra.posicao) {
      const dia = diaPorPosicao(ano, mes, regra.posicao);
      if (dia !== null) datas.push(dia);
    } else if (inicio.dia <= diasNoMes(ano, mes)) datas.push(paraNumero({ ano, mes, dia: inicio.dia }));
  }
  return datas;
}

// Teto de seguranca: uma regra que nunca casa (ex.: 5a segunda a cada 999 anos) nao pode girar para sempre.
const PERIODOS_MAXIMOS = 20_000;

/**
 * Datas LOCAIS (AAAA-MM-DD) da serie, em ordem, do inicio ate `ate` (inclusive), respeitando o termino.
 * A data de inicio entra sempre como a primeira.
 */
export function datasDoAgendamento(
  regra: RegraRecorrencia,
  inicioIso: string,
  termino: TerminoRecorrencia,
  ateIso: string,
  limite = 1_000
): string[] {
  const inicio = lerIso(inicioIso);
  const numeroInicio = paraNumero(inicio);
  const ate = Math.min(
    paraNumero(lerIso(ateIso)),
    termino.tipo === "data" ? paraNumero(lerIso(termino.data)) : Number.POSITIVE_INFINITY
  );
  const maximo = Math.min(limite, termino.tipo === "quantidade" ? termino.quantidade : Number.POSITIVE_INFINITY);
  if (numeroInicio > ate || maximo < 1) return [];

  const resultado: number[] = [numeroInicio];
  const adicionar = (numero: number) => {
    if (numero > numeroInicio && numero <= ate && resultado.length < maximo) resultado.push(numero);
  };
  if (regra.tipo === "nunca") return resultado.map((numero) => isoDoDia(deNumero(numero)));
  if (regra.tipo === "datas") {
    for (const numero of [...new Set(regra.datas.map((data) => paraNumero(lerIso(data))))].sort((a, b) => a - b))
      adicionar(numero);
    return resultado.map((numero) => isoDoDia(deNumero(numero)));
  }
  for (let periodo = 0; periodo < PERIODOS_MAXIMOS && resultado.length < maximo; periodo += 1) {
    const datas = datasDoPeriodo(regra, inicio, periodo);
    // Periodo inteiro depois do limite: as datas so crescem daqui em diante.
    if (datas.length && Math.min(...datas) > ate) break;
    for (const numero of datas) adicionar(numero);
  }
  return resultado.map((numero) => isoDoDia(deNumero(numero)));
}

// --- fuso: data local + hora -> instante, e o caminho de volta ------------------------------------

function partesNoFuso(instante: Date, fuso: string) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: fuso,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    })
      .formatToParts(instante)
      .map((parte) => [parte.type, parte.value])
  ) as Record<string, string>;
  return {
    data: `${partes["year"]}-${partes["month"]}-${partes["day"]}`,
    hora: `${partes["hour"]}:${partes["minute"]}`,
    utc: Date.UTC(
      Number(partes["year"]),
      Number(partes["month"]) - 1,
      Number(partes["day"]),
      Number(partes["hour"]),
      Number(partes["minute"]),
      Number(partes["second"])
    )
  };
}

/** Instante da data local `AAAA-MM-DD` as `HH:MM` no fuso (ex.: America/Sao_Paulo). */
export function instanteLocal(dataIsoLocal: string, hora: string, fuso: string): Date {
  const { ano, mes, dia } = lerIso(dataIsoLocal);
  const [h, m] = hora.split(":").map(Number) as [number, number];
  const comoUtc = Date.UTC(ano, mes - 1, dia, h, m);
  // Duas passadas resolvem qualquer deslocamento fixo e a virada de horario de verao.
  let instante = comoUtc - (partesNoFuso(new Date(comoUtc), fuso).utc - comoUtc);
  instante = comoUtc - (partesNoFuso(new Date(instante), fuso).utc - instante);
  return new Date(instante);
}

/** Data local e hora (HH:MM) de um instante no fuso. */
export function localDoInstante(instante: Date, fuso: string): { data: string; hora: string } {
  const { data, hora } = partesNoFuso(instante, fuso);
  return { data, hora };
}

// --- resumo em portugues, como a frase do topo do editor da Apple ---------------------------------

function lista(itens: string[]): string {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`;
}
const ORDINAIS: Record<string, string> = { "1": "1º", "2": "2º", "3": "3º", "4": "4º", "5": "5º", "-1": "último" };
function textoPosicao(posicao: PosicaoRecorrencia): string {
  const dia =
    posicao.dia === "dia"
      ? "dia"
      : posicao.dia === "dia_util"
        ? "dia útil"
        : posicao.dia === "fim_de_semana"
          ? "dia de fim de semana"
          : DIAS_SEMANA[posicao.dia];
  return `no(a) ${ORDINAIS[String(posicao.ordinal)]} ${dia}`;
}

export function resumoRecorrencia(regra: RegraRecorrencia, inicioIso: string, termino: TerminoRecorrencia): string {
  const inicio = lerIso(inicioIso);
  const dataBr = (iso: string) => iso.split("-").reverse().join("/");
  let base: string;
  if (regra.tipo === "nunca") base = `Uma vez, em ${dataBr(inicioIso)}`;
  else if (regra.tipo === "datas")
    base = `Em ${regra.datas.length + 1} data(s): ${lista([inicioIso, ...regra.datas].sort().map(dataBr))}`;
  else {
    const singular = { diaria: "Todo dia", semanal: "Toda semana", mensal: "Todo mês", anual: "Todo ano" }[
      regra.frequencia
    ];
    const plural = { diaria: "dias", semanal: "semanas", mensal: "meses", anual: "anos" }[regra.frequencia];
    const cada = regra.intervalo === 1 ? singular : `A cada ${regra.intervalo} ${plural}`;
    let detalhe = "";
    if (regra.frequencia === "semanal")
      detalhe = ` na(s) ${lista(
        (regra.diasSemana ?? [diaDaSemana(paraNumero(inicio))])
          .slice()
          .sort((a, b) => a - b)
          .map((dia) => DIAS_SEMANA[dia] ?? "")
      )}`;
    if (regra.frequencia === "mensal")
      detalhe = regra.posicao
        ? ` ${textoPosicao(regra.posicao)}`
        : ` no(s) dia(s) ${lista(
            (regra.diasMes ?? [inicio.dia])
              .slice()
              .sort((a, b) => a - b)
              .map(String)
          )}`;
    if (regra.frequencia === "anual") {
      const meses = lista(
        (regra.meses ?? [inicio.mes])
          .slice()
          .sort((a, b) => a - b)
          .map((mes) => MESES[mes - 1] ?? "")
      );
      detalhe = regra.posicao ? ` em ${meses}, ${textoPosicao(regra.posicao)}` : ` em ${meses}, dia ${inicio.dia}`;
    }
    base = `${cada}${detalhe}`;
  }
  if (regra.tipo !== "padrao" || termino.tipo === "nunca") return base;
  return termino.tipo === "data" ? `${base}, até ${dataBr(termino.data)}` : `${base}, ${termino.quantidade} vez(es)`;
}
