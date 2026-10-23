import type { TipoRegistroQuestor } from "./questor-admissao-layout.js";
import {
  CAMPOS_PADRAO_EMPRESA_QUESTOR,
  type ContratoQuestorPayload,
  type FuncaoQuestorPayload,
  type TurnoQuestorPayload
} from "./questor-parametros.js";

/**
 * E2/E3/E4 → campos do TXT. Só conversões documentadas:
 * - Lógico: "Sim=1; Não=0" (coluna Observação da documentação);
 * - valor: NLI `SeparadorDecimal = ','`, sem separador de milhar;
 * - códigos e opções: copiados como estão (já validados contra o layout no Zod).
 *
 * Campo cujo parâmetro está nulo fica vazio — e a prévia de prontidão o mostra pendente.
 */

export type ParametrosQuestorSnapshot = {
  configuracao: {
    codigoEstabelecimento: number | null;
    classificacaoOrganograma: string | null;
    padroes: Readonly<Record<string, string>>;
  } | null;
  contrato: Omit<ContratoQuestorPayload, "versao"> | null;
  funcao: FuncaoQuestorPayload | null;
  turno: TurnoQuestorPayload | null;
};

type Valores = Record<string, string>;

/** Centavos → "1518,00". */
export function formatarValorQuestor(centavos: number): string {
  const inteiro = Math.floor(centavos / 100);
  const resto = centavos % 100;
  return `${inteiro},${String(resto).padStart(2, "0")}`;
}

const logico = (valor: boolean | null | undefined) =>
  valor === null || valor === undefined ? null : valor ? "1" : "0";

function definir(destino: Valores, campo: string, valor: string | number | null | undefined) {
  if (valor === null || valor === undefined || valor === "") return;
  destino[campo] = String(valor);
}

export function aplicarParametrosQuestor(
  parametros: ParametrosQuestorSnapshot,
  registros: { A: Valores; B: Valores; dependentes: Valores[] }
): void {
  const { configuracao, contrato, funcao, turno } = parametros;
  const destinoDo = (registro: TipoRegistroQuestor) =>
    registro === "A" ? [registros.A] : registro === "B" ? [registros.B] : registros.dependentes;

  // 1) Padrões da empresa (E2).
  if (configuracao) {
    definir(registros.B, "CODIGOESTAB", configuracao.codigoEstabelecimento);
    definir(registros.B, "CLASSIFORGAN", configuracao.classificacaoOrganograma);
    for (const { registro, campo } of CAMPOS_PADRAO_EMPRESA_QUESTOR) {
      for (const destino of destinoDo(registro)) definir(destino, campo, configuracao.padroes[campo]);
    }
  }

  // 2) Cadastros auxiliares (E3).
  if (funcao) {
    definir(registros.A, "CODIGOCARGO", funcao.questorCodigoCargo);
    definir(registros.B, "AGENTENOCIVO", funcao.questorAgenteNocivo);
  }
  if (turno) {
    definir(registros.B, "CODIGOESCALA", turno.questorCodigoEscala);
    definir(registros.B, "TIPOJORNADA", turno.questorTipoJornada);
    definir(registros.B, "TEMPOPARCIAL", turno.questorTempoParcial);
    definir(registros.B, "REGIMEJOR", turno.questorRegimeJornada);
  }

  // 3) Contrato do DP (E4) — por último: o que o DP escolheu prevalece sobre o padrão da empresa.
  if (contrato) {
    definir(registros.A, "TIPOSALARIO", contrato.questorTipoSalario);
    definir(
      registros.A,
      "VALORSAL",
      contrato.salarioCentavos === null ? null : formatarValorQuestor(contrato.salarioCentavos)
    );
    definir(registros.A, "DESCRSAL", contrato.descricaoSalario);
    definir(registros.A, "DIACONTREXP", contrato.diasExperiencia);
    definir(registros.A, "DIAPRORROGCONTREXP", contrato.diasProrrogacao);
    definir(registros.A, "CODIGOTIPOCONTR", contrato.questorTipoContrato);
    definir(registros.A, "CODIGOSIND", contrato.questorSindicato);
    definir(registros.B, "TIPOADM", contrato.questorTipoAdmissao);
    definir(registros.B, "DEFCOTA", logico(contrato.pcdCotista));
    definir(registros.B, "UTILIZACARTEIRADIGITAL", logico(contrato.utilizaCtpsDigital));
    definir(registros.B, "POSSUIALVARA", logico(contrato.possuiAlvara));
    definir(registros.B, "JAEXPOSTO", logico(contrato.jaExpostoAgenteNocivo));
  }
}

/** Campos que passam a ter fonte no Pralís quando a parte correspondente existe no snapshot. */
export function camposComFonteQuestor(parametros: ParametrosQuestorSnapshot | undefined): ReadonlySet<string> {
  const campos = new Set<string>();
  if (!parametros) return campos;
  if (parametros.configuracao) {
    campos.add("B.CODIGOESTAB").add("B.CLASSIFORGAN");
    for (const { registro, campo } of CAMPOS_PADRAO_EMPRESA_QUESTOR) campos.add(`${registro}.${campo}`);
  }
  if (parametros.funcao) campos.add("A.CODIGOCARGO").add("B.AGENTENOCIVO");
  if (parametros.turno)
    for (const campo of ["CODIGOESCALA", "TIPOJORNADA", "TEMPOPARCIAL", "REGIMEJOR"]) campos.add(`B.${campo}`);
  if (parametros.contrato) {
    for (const campo of [
      "TIPOSALARIO",
      "VALORSAL",
      "DESCRSAL",
      "DIACONTREXP",
      "DIAPRORROGCONTREXP",
      "CODIGOTIPOCONTR",
      "CODIGOSIND"
    ]) {
      campos.add(`A.${campo}`);
    }
    for (const campo of ["TIPOADM", "DEFCOTA", "UTILIZACARTEIRADIGITAL", "POSSUIALVARA", "JAEXPOSTO"])
      campos.add(`B.${campo}`);
  }
  return campos;
}
