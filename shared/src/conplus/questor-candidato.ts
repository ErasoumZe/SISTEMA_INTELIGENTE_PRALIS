import { z } from "zod";
import {
  converterRotuloQuestor,
  GRAUS_INSTRUCAO_QUESTOR,
  NACIONALIDADES_QUESTOR,
  TABELAS_DE_PARA_QUESTOR
} from "./questor-de-para.js";

/**
 * E5 — campos do candidato e dos dependentes que o layout Questor exige e a ficha ainda não coleta.
 *
 * Dois grupos, porque a decisão de coletar é diferente:
 *
 * - COMUNS: dado pessoal comum. Podem entrar na ficha assim que houver coluna (migrations M1a/M2a).
 * - SENSÍVEIS: dado de saúde (LGPD art. 5º, II) — deficiência, reabilitação, fumo e álcool.
 *   Exigem base legal e texto do aviso de privacidade aprovados (Q11) ANTES de qualquer coleta.
 *   O contrato fica pronto aqui; a coleta, não.
 *
 * Nada aqui inventa equivalência: listas de opção são os rótulos da documentação (ou os do Pralís
 * já comprovados na E1), e a conversão para código passa pelas tabelas de `questor-de-para.ts`.
 */

const uf = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/u, "UF precisa ter duas letras");
/** Código IBGE do município (7 dígitos). Guardado sem converter: se o Questor usa IBGE é a Q5. */
const ibge = z
  .string()
  .trim()
  .regex(/^[0-9]{7}$/u, "Código IBGE do município tem 7 dígitos");
const opcao = (opcoes: readonly string[], rotulo: string) =>
  z.string().refine((valor) => opcoes.includes(valor), `${rotulo} fora da lista`);
const anulavel = <T extends z.ZodTypeAny>(schema: T) =>
  schema
    .nullable()
    .optional()
    .transform((valor) => valor ?? null);

/** Listas de seleção para a tela. A tela não redeclara opções: usa estas. */
/** As 27 unidades da federação (siglas oficiais do IBGE). */
const UFS = [
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO"
] as const;

export const OPCOES_E5_QUESTOR = {
  uf: UFS,
  /** Perguntas Sim/Não da ficha; a tela converte para booleano. */
  simNao: ["Sim", "Não"],
  /** Nacionalidade específica para quem marcou "Estrangeira": a lista oficial sem as brasileiras. */
  nacionalidadeEstrangeira: NACIONALIDADES_QUESTOR.filter((rotulo) => !/brasileir/iu.test(rotulo)),
  /** Mesmos rótulos do campo sexo atual da ficha. */
  sexo: ["Masculino", "Feminino"],
  /** Mesmos rótulos do estado civil atual da ficha ("União estável" segue pendente na Q13). */
  estadoCivil: ["Solteiro(a)", "Casado(a)", "Divorciado(a)", "Separado(a) judicialmente", "Viúvo(a)", "União estável"],
  grauInstrucao: GRAUS_INSTRUCAO_QUESTOR,
  nacionalidade: NACIONALIDADES_QUESTOR,
  tiposDeficiencia: ["fisica", "visual", "auditiva", "intelectual", "mental"]
} as const;

export type TipoDeficienciaQuestor = (typeof OPCOES_E5_QUESTOR.tiposDeficiencia)[number];

// --- Titular -----------------------------------------------------------------------------------------

export const fichaE5ComunsSchema = z
  .object({
    /** B.SIGLAESTADONASC. Complementa a `naturalidade` em texto, que fica como está. */
    naturalidadeUf: anulavel(uf),
    /** Captura para B.CODIGOMUNICNASC; a CONVERSÃO depende da Q5. */
    naturalidadeMunicipioIbge: anulavel(ibge),
    /** Captura (vem do ViaCEP) para B.CODIGOMUNIC; a CONVERSÃO depende da Q5. */
    municipioIbge: anulavel(ibge),
    /** B.GRAUINSTR — grava na coluna `grau_instrucao` que JÁ existe na ficha (a E1 converte). */
    grauInstrucao: anulavel(opcao(GRAUS_INSTRUCAO_QUESTOR, "Grau de instrução")),
    /** Nacionalidade específica quando a ficha diz "Estrangeira" (lista da documentação). */
    nacionalidadeEspecifica: anulavel(opcao(NACIONALIDADES_QUESTOR, "Nacionalidade")),
    /** B.INDICATPRIMEMP — "é seu primeiro emprego com carteira assinada?" */
    primeiroEmprego: anulavel(z.boolean()),
    /** B.RECEBSEGURODESEMPREGO — "está recebendo seguro-desemprego?" */
    recebeSeguroDesemprego: anulavel(z.boolean())
  })
  .strict();

/** BLOQUEADO até a Q11 (base legal + aviso). Contrato pronto; coleta não autorizada. */
export const fichaE5SensiveisSchema = z
  .object({
    possuiDeficiencia: anulavel(z.boolean()),
    deficiencias: z.array(z.enum(OPCOES_E5_QUESTOR.tiposDeficiencia)).max(5).default([]),
    reabilitado: anulavel(z.boolean())
  })
  .strict()
  .superRefine((dados, ctx) => {
    if (dados.possuiDeficiencia !== true && dados.deficiencias.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deficiencias"],
        message: 'Tipos de deficiência só com "possui deficiência" = sim'
      });
    }
    if (dados.possuiDeficiencia === true && dados.deficiencias.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deficiencias"],
        message: "Informe ao menos um tipo de deficiência"
      });
    }
    if (new Set(dados.deficiencias).size !== dados.deficiencias.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["deficiencias"], message: "Tipo de deficiência repetido" });
    }
  });

export type FichaE5Comuns = z.infer<typeof fichaE5ComunsSchema>;
export type FichaE5Sensiveis = z.infer<typeof fichaE5SensiveisSchema>;

// --- Dependente -------------------------------------------------------------------------------------

export const dependenteE5ComunsSchema = z
  .object({
    sexo: anulavel(opcao(OPCOES_E5_QUESTOR.sexo, "Sexo")),
    estadoCivil: anulavel(opcao(OPCOES_E5_QUESTOR.estadoCivil, "Estado civil")),
    grauInstrucao: anulavel(opcao(GRAUS_INSTRUCAO_QUESTOR, "Grau de instrução")),
    nacionalidade: anulavel(opcao(NACIONALIDADES_QUESTOR, "Nacionalidade"))
  })
  .strict();

/** BLOQUEADO até a Q11. */
export const dependenteE5SensiveisSchema = z
  .object({
    fumante: anulavel(z.boolean()),
    consomeAlcool: anulavel(z.boolean())
  })
  .strict();

export type DependenteE5Comuns = z.infer<typeof dependenteE5ComunsSchema>;
export type DependenteE5Sensiveis = z.infer<typeof dependenteE5SensiveisSchema>;

// --- Mapeamento para o TXT --------------------------------------------------------------------------

type Valores = Record<string, string>;
export type PendenciaE5 = {
  registro: "B" | "D";
  campo: string;
  dependente: number | null;
  natureza: "equivalencia" | "fora_da_lista";
  motivo: string;
};

const logico = (valor: boolean | null | undefined) =>
  valor === null || valor === undefined ? null : valor ? "1" : "0";
const definir = (destino: Valores, campo: string, valor: string | null | undefined) => {
  if (valor) destino[campo] = valor;
};

function rotulo(
  destino: Valores,
  campo: keyof typeof TABELAS_DE_PARA_QUESTOR,
  valor: string | null | undefined,
  pendencias: PendenciaE5[],
  registro: "B" | "D",
  dependente: number | null
) {
  if (!valor) return;
  const resultado = converterRotuloQuestor(TABELAS_DE_PARA_QUESTOR[campo], valor);
  if (resultado.ok) destino[campo] = resultado.codigo;
  else
    pendencias.push({
      registro,
      campo,
      dependente,
      natureza: resultado.declarada ? "equivalencia" : "fora_da_lista",
      motivo: resultado.motivo
    });
}

/**
 * Aplica os campos E5 aos registros já montados. Regras documentadas:
 * - Lógico: "Sim=1; Não=0".
 * - TIPOADMRAIS/TIPOADMCAGED: "1 - … primeiro emprego"=1 / "2 - … reemprego"=2 e
 *   "Primeiro emprego=10" / "Reemprego=20" — SÓ quando o DP marcou TIPOADM = 1 (Admissão). Em
 *   transferência ou reintegração os códigos são outros (3/4/5 e 35/70) e a escolha é do DP.
 * - Deficiência: "não possui" → os cinco tipos = 0; "possui" → 1 nos tipos marcados, 0 nos demais.
 *   Reabilitado é pergunta própria, sem derivação.
 * - Município (IBGE) NÃO é convertido: depende da Q5.
 */
export function aplicarCamposE5Questor(
  entrada: {
    titular: Partial<FichaE5Comuns & FichaE5Sensiveis> | null;
    dependentes: ReadonlyArray<Partial<DependenteE5Comuns & DependenteE5Sensiveis> | null>;
    tipoAdmissao: number | null;
  },
  registros: { B: Valores; dependentes: Valores[] }
): PendenciaE5[] {
  const pendencias: PendenciaE5[] = [];
  const { titular } = entrada;
  if (titular) {
    const b = registros.B;
    definir(b, "SIGLAESTADONASC", titular.naturalidadeUf);
    // GRAUINSTR do titular NÃO é tratado aqui: sai da coluna `grau_instrucao` que a ficha já tem, e a
    // E1 já o converte. Um segundo caminho para o mesmo dado seria a regra-mãe quebrada.
    // Só preenche quando a ficha diz "Estrangeira": nunca troca uma nacionalidade já convertida.
    if (!b["NACIONALIDADE"]) rotulo(b, "NACIONALIDADE", titular.nacionalidadeEspecifica, pendencias, "B", null);
    definir(b, "INDICATPRIMEMP", logico(titular.primeiroEmprego));
    definir(b, "RECEBSEGURODESEMPREGO", logico(titular.recebeSeguroDesemprego));
    if (entrada.tipoAdmissao === 1 && titular.primeiroEmprego !== null && titular.primeiroEmprego !== undefined) {
      definir(b, "TIPOADMRAIS", titular.primeiroEmprego ? "1" : "2");
      definir(b, "TIPOADMCAGED", titular.primeiroEmprego ? "10" : "20");
    }
    if (titular.possuiDeficiencia === false || titular.possuiDeficiencia === true) {
      const marcadas = new Set(titular.possuiDeficiencia ? (titular.deficiencias ?? []) : []);
      for (const [tipo, campo] of [
        ["fisica", "DEFFISICA"],
        ["visual", "DEFVISUAL"],
        ["auditiva", "DEFAUDITIVA"],
        ["intelectual", "DEFINTELECTUAL"],
        ["mental", "DEFMENTAL"]
      ] as const) {
        b[campo] = marcadas.has(tipo) ? "1" : "0";
      }
    }
    definir(b, "DEFREABILITADO", logico(titular.reabilitado));
  }
  entrada.dependentes.forEach((dependente, indice) => {
    const d = registros.dependentes[indice];
    if (!dependente || !d) return;
    rotulo(d, "SEXO", dependente.sexo, pendencias, "D", indice);
    rotulo(d, "ESTADOCIVIL", dependente.estadoCivil, pendencias, "D", indice);
    rotulo(d, "GRAUINSTR", dependente.grauInstrucao, pendencias, "D", indice);
    rotulo(d, "NACIONALIDADE", dependente.nacionalidade, pendencias, "D", indice);
    definir(d, "FUMANTE", logico(dependente.fumante));
    definir(d, "CONSOMEALCOOL", logico(dependente.consomeAlcool));
  });
  return pendencias;
}

/**
 * Campos do layout que passam a ter fonte no Pralís quando os dados E5 existem no snapshot — para a
 * prévia dizer "não preenchido" em vez de "ainda não coletado". Os sensíveis só contam quando a
 * coleta existir (resposta presente, ainda que nula).
 */
export function camposComFonteE5(
  e5: { titular: object | null; dependentes: ReadonlyArray<object | null> } | undefined
): ReadonlySet<string> {
  const campos = new Set<string>();
  if (!e5) return campos;
  if (e5.titular) {
    const titular = e5.titular;
    for (const campo of ["SIGLAESTADONASC", "INDICATPRIMEMP", "RECEBSEGURODESEMPREGO"]) campos.add(`B.${campo}`);
    if ("possuiDeficiencia" in titular) {
      for (const campo of ["DEFFISICA", "DEFVISUAL", "DEFAUDITIVA", "DEFINTELECTUAL", "DEFMENTAL"])
        campos.add(`B.${campo}`);
    }
    if ("reabilitado" in titular) campos.add("B.DEFREABILITADO");
  }
  if (e5.dependentes.some(Boolean)) {
    for (const campo of ["SEXO", "ESTADOCIVIL", "GRAUINSTR", "NACIONALIDADE"]) campos.add(`D.${campo}`);
    if (e5.dependentes.some((dependente) => dependente && "fumante" in dependente))
      campos.add("D.FUMANTE").add("D.CONSOMEALCOOL");
  }
  return campos;
}
