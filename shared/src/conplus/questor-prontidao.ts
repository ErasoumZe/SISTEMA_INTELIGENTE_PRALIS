import { z } from "zod";
import { CAMPOS_BLOQUEADOS_QUESTOR, validarRegistroQuestor, type DiagnosticoQuestor } from "./questor-admissao.js";
import { LAYOUT_ADMISSAO_QUESTOR, type TipoRegistroQuestor } from "./questor-admissao-layout.js";
import { montarContratoQuestor, type PendenciaDeParaQuestor, type SnapshotAdmissaoPralis } from "./questor-contrato.js";
import { camposComFonteQuestor } from "./questor-contrato-parametros.js";
import { camposComFonteE5 } from "./questor-candidato.js";

/**
 * Prévia de prontidão Questor de UM processo de admissão — somente leitura.
 *
 * Responde "o que já está pronto e o que falta, e com quem está a pendência". Reaproveita a
 * montagem da E1 e o validador do layout; não preenche nada que a E1 não preenche.
 *
 * O DTO NÃO carrega valores: só situação e origem por campo. CPF, PIS, nomes e endereço continuam
 * nas telas que já têm regra própria de exibição (ex.: CPF mascarado).
 */

export const origensPendenciaQuestor = ["candidato", "dp", "empresa", "codigo_questor", "externo"] as const;
export type OrigemPendenciaQuestor = (typeof origensPendenciaQuestor)[number];

export const situacoesCampoQuestor = ["pronto", "pendente", "invalido", "bloqueado"] as const;
export type SituacaoCampoQuestor = (typeof situacoesCampoQuestor)[number];

/**
 * De quem é cada campo (plano de implementação, seção 1). `externo` = depende de resposta da
 * Conplus ou de decisão fora do Pralís antes de qualquer coleta.
 */
const ORIGEM_DO_CAMPO: Record<TipoRegistroQuestor, Readonly<Record<string, OrigemPendenciaQuestor>>> = {
  A: {
    TERMOCONSENTIMENTO: "externo",
    GERARPRELIMINAR: "externo",
    CODIGOEMPRESA: "empresa",
    CODIGOTIPOCONTR: "codigo_questor",
    CPFFUNC: "dp",
    NOMEFUNC: "dp",
    DATANASC: "candidato",
    DATAADM: "dp",
    CATEGESOCIAL: "externo",
    CATEGORIA: "externo",
    CODIGOSIND: "codigo_questor",
    DIACONTREXP: "dp",
    DIAPRORROGCONTREXP: "dp",
    CODIGOTIPOFATO: "dp",
    CODIGOCARGO: "codigo_questor",
    TIPOSALARIO: "dp",
    VALORSAL: "dp",
    DESCRSAL: "dp"
  },
  B: {
    CODIGOEMPRESA: "empresa",
    PISFUNC: "dp",
    CEPFUNC: "candidato",
    CODIGOTIPOLOGRAD: "codigo_questor",
    ENDERFUNC: "candidato",
    NUMEROENDER: "candidato",
    COMPLENDER: "candidato",
    BAIRROFUNC: "candidato",
    SIGLAESTADO: "candidato",
    CODIGOMUNIC: "externo",
    SIGLAESTADONASC: "candidato",
    CODIGOMUNICNASC: "externo",
    SEXO: "candidato",
    RACACOR: "candidato",
    DEFFISICA: "candidato",
    DEFVISUAL: "candidato",
    DEFAUDITIVA: "candidato",
    DEFINTELECTUAL: "candidato",
    DEFMENTAL: "candidato",
    DEFCOTA: "dp",
    DEFREABILITADO: "candidato",
    ESTADOCIVIL: "candidato",
    GRAUINSTR: "candidato",
    NACIONALIDADE: "candidato",
    UTILIZACARTEIRADIGITAL: "dp",
    NUMEROCTPS: "dp",
    SERIECTPS: "dp",
    SIGLAESTADOCTPS: "dp",
    OPTANTEFGTS: "empresa",
    TIPOVINCULO: "externo",
    CODIGOESTAB: "codigo_questor",
    CLASSIFORGAN: "codigo_questor",
    TIPOADMRAIS: "candidato",
    TIPOADMCAGED: "candidato",
    RECEBSEGURODESEMPREGO: "candidato",
    SINDICALIZADO: "empresa",
    DESCMENSSIND: "empresa",
    DESCCUSTCONFED: "empresa",
    DESCTAXAASSIST: "empresa",
    DESCONTAREVSAL: "empresa",
    DESCANOADMISSAO: "empresa",
    CLAUSULAASSEGRESC: "empresa",
    RECEBEADTO: "empresa",
    RECEBE13SAL: "empresa",
    MODOPGTO: "empresa",
    PARTICPAT: "empresa",
    POSSUIALVARA: "dp",
    CODIGOESCALA: "codigo_questor",
    REGIMEJOR: "empresa",
    TIPOJORNADA: "empresa",
    TEMPOPARCIAL: "empresa",
    AGENTENOCIVO: "empresa",
    JAEXPOSTO: "dp",
    PAI: "candidato",
    MAE: "candidato",
    TIPOADM: "dp",
    INDICATPRIMEMP: "candidato",
    UTILIZAQCOLABORE: "empresa"
  },
  C: {
    CODIGOEMPRESA: "empresa",
    NOMESOCIAL: "candidato",
    ENDERELETRE: "candidato",
    NUMERORG: "candidato",
    SIGLAESTADORG: "candidato",
    EMISSRG: "candidato",
    TITELEIT: "candidato",
    ZONATITELEIT: "candidato",
    SECAOTITELEIT: "candidato"
  },
  D: {
    CODIGOEMPRESA: "empresa",
    CPFFUNC: "dp",
    DATAADM: "dp",
    NOMEDEPEND: "candidato",
    DATANASC: "candidato",
    PARENTESCO: "candidato",
    CPFDEPEND: "candidato",
    SEXO: "candidato",
    ESTADOCIVIL: "candidato",
    GRAUINSTR: "candidato",
    FORMACONTROLEIR: "empresa",
    NACIONALIDADE: "candidato",
    FUMANTE: "candidato",
    CONSOMEALCOOL: "candidato"
  }
};

/** Campos que a E1 já sabe montar a partir de dados existentes: se vazios, é só preencher. */
const CAMPOS_COM_ORIGEM_NO_PRALIS: Record<TipoRegistroQuestor, ReadonlySet<string>> = {
  A: new Set(["CODIGOEMPRESA", "CPFFUNC", "NOMEFUNC", "DATANASC", "DATAADM"]),
  B: new Set([
    "CODIGOEMPRESA",
    "PISFUNC",
    "CEPFUNC",
    "ENDERFUNC",
    "NUMEROENDER",
    "BAIRROFUNC",
    "SIGLAESTADO",
    "SEXO",
    "RACACOR",
    "ESTADOCIVIL",
    "NACIONALIDADE",
    "NUMEROCTPS",
    "SERIECTPS",
    "SIGLAESTADOCTPS",
    "MAE"
  ]),
  C: new Set(["CODIGOEMPRESA"]),
  D: new Set(["CODIGOEMPRESA", "CPFFUNC", "DATAADM", "NOMEDEPEND", "DATANASC", "PARENTESCO"])
};

/** Por que o campo `externo` ainda não pode ser preenchido (perguntas do plano, seção 8). */
const MOTIVO_EXTERNO: Record<string, string> = {
  TERMOCONSENTIMENTO: "Aguardando a Conplus confirmar se equivale ao aceite do aviso de privacidade (Q2)",
  GERARPRELIMINAR: "Aguardando o valor definido pela Conplus (Q3)",
  CATEGESOCIAL: "Aguardando as modalidades de contratação e seus códigos (Q4)",
  CATEGORIA: "Aguardando as modalidades de contratação e seus códigos (Q4)",
  TIPOVINCULO: "Aguardando as modalidades de contratação e seus códigos (Q4)",
  CODIGOMUNIC: "Aguardando a Conplus confirmar se o município usa o código IBGE (Q5)",
  CODIGOMUNICNASC: "Aguardando a Conplus confirmar se o município usa o código IBGE (Q5)"
};

/** E5 — campos do candidato com motivo próprio (antes do motivo genérico da origem). */
const SENSIVEL_Q11 = "Dado de saúde (LGPD art. 5º, II): a coleta depende de base legal e aviso aprovados (Q11)";
const MOTIVO_E5: Record<string, string> = {
  "B.DEFFISICA": SENSIVEL_Q11,
  "B.DEFVISUAL": SENSIVEL_Q11,
  "B.DEFAUDITIVA": SENSIVEL_Q11,
  "B.DEFINTELECTUAL": SENSIVEL_Q11,
  "B.DEFMENTAL": SENSIVEL_Q11,
  "B.DEFREABILITADO": SENSIVEL_Q11,
  "D.FUMANTE": SENSIVEL_Q11,
  "D.CONSOMEALCOOL": SENSIVEL_Q11,
  "B.TIPOADMRAIS":
    "Derivado do primeiro emprego quando o tipo de admissão é 1; em transferência ou reintegração, o DP escolhe",
  "B.TIPOADMCAGED":
    "Derivado do primeiro emprego quando o tipo de admissão é 1; em transferência ou reintegração, o DP escolhe"
};

const MOTIVO_POR_ORIGEM: Record<Exclude<OrigemPendenciaQuestor, "externo">, string> = {
  candidato: "A ficha do candidato ainda não coleta este dado",
  dp: "O Pralís ainda não registra este dado do contrato",
  empresa: "Depende da configuração Questor da empresa, ainda não disponível no Pralís",
  codigo_questor: "Depende de código do Questor da empresa, que precisa ser fornecido pela Conplus"
};

export type CampoProntidaoQuestor = {
  coluna: number;
  campo: string;
  nomeCurto: string;
  requerido: boolean;
  situacao: SituacaoCampoQuestor;
  origem: OrigemPendenciaQuestor | null;
  motivo: string | null;
};

export type RegistroProntidaoQuestor = {
  registro: TipoRegistroQuestor;
  /** Posição do dependente (0…) no registro D; `null` nos demais. */
  dependente: number | null;
  campos: CampoProntidaoQuestor[];
};

export type ProntidaoQuestorDto = z.infer<typeof prontidaoQuestorDtoSchema>;

const campoProntidaoSchema = z.object({
  coluna: z.number().int().positive(),
  campo: z.string(),
  nomeCurto: z.string(),
  requerido: z.boolean(),
  situacao: z.enum(situacoesCampoQuestor),
  origem: z.enum(origensPendenciaQuestor).nullable(),
  motivo: z.string().nullable()
});

export const prontidaoQuestorDtoSchema = z.object({
  processoId: z.string().uuid(),
  geradoEm: z.string(),
  /** Sempre false nesta etapa: não existe exportação operacional. */
  exportacaoDisponivel: z.literal(false),
  /** Verdadeiro só quando não há pendência nem invalidez em campo nenhum. */
  aptoParaExportacao: z.boolean(),
  motivoBloqueio: z.string(),
  resumo: z.object({
    requeridos: z.number().int().nonnegative(),
    requeridosProntos: z.number().int().nonnegative(),
    pendentes: z.number().int().nonnegative(),
    invalidos: z.number().int().nonnegative(),
    bloqueados: z.number().int().nonnegative(),
    porOrigem: z.object(
      Object.fromEntries(origensPendenciaQuestor.map((origem) => [origem, z.number().int().nonnegative()])) as Record<
        OrigemPendenciaQuestor,
        z.ZodNumber
      >
    )
  }),
  registros: z.array(
    z.object({
      registro: z.enum(["A", "B", "C", "D"]),
      dependente: z.number().int().nonnegative().nullable(),
      campos: z.array(campoProntidaoSchema)
    })
  )
});

export function origemDoCampoQuestor(registro: TipoRegistroQuestor, campo: string): OrigemPendenciaQuestor | null {
  return ORIGEM_DO_CAMPO[registro][campo] ?? null;
}

const CODIGOS_DE_FALTA = new Set<DiagnosticoQuestor["codigo"]>(["OBRIGATORIO", "CONDICIONAL"]);

function avaliarRegistro(
  registro: TipoRegistroQuestor,
  dependente: number | null,
  valores: Readonly<Record<string, string | null | undefined>>,
  pendencias: readonly PendenciaDeParaQuestor[],
  fontesQuestor: ReadonlySet<string>
): RegistroProntidaoQuestor {
  const diagnosticos = validarRegistroQuestor(registro, valores);
  const campos: CampoProntidaoQuestor[] = [];
  for (const campo of LAYOUT_ADMISSAO_QUESTOR[registro]) {
    const base = { coluna: campo.coluna, campo: campo.campo, nomeCurto: campo.nomeCurto, requerido: campo.requerido };
    const origemCampo = origemDoCampoQuestor(registro, campo.campo);
    if (CAMPOS_BLOQUEADOS_QUESTOR[registro].includes(campo.campo)) {
      campos.push({
        ...base,
        situacao: "bloqueado",
        origem: "externo",
        motivo: "Documentação e NLI divergem na coluna deste campo; bloqueado até a Conplus confirmar (Q14)"
      });
      continue;
    }
    const pendencia = pendencias.find((item) => item.campo === campo.campo);
    const doCampo = diagnosticos.filter((item) => item.campo === campo.campo);
    const falta = doCampo.find((item) => CODIGOS_DE_FALTA.has(item.codigo));
    const invalido = doCampo.find((item) => !CODIGOS_DE_FALTA.has(item.codigo));
    if (pendencia) {
      campos.push({
        ...base,
        situacao: "pendente",
        origem: pendencia.natureza === "equivalencia" ? "externo" : origemCampo,
        motivo: pendencia.motivo
      });
    } else if (falta) {
      const chave = `${registro}.${campo.campo}`;
      const motivoE5 = MOTIVO_E5[chave];
      const motivo =
        origemCampo === "externo"
          ? (MOTIVO_EXTERNO[campo.campo] ?? "Depende de resposta da Conplus")
          : motivoE5 && !fontesQuestor.has(chave)
            ? motivoE5
            : CAMPOS_COM_ORIGEM_NO_PRALIS[registro].has(campo.campo) || fontesQuestor.has(chave)
              ? "Não preenchido no Pralís para este processo"
              : MOTIVO_POR_ORIGEM[origemCampo ?? "dp"];
      campos.push({ ...base, situacao: "pendente", origem: origemCampo, motivo });
    } else if (invalido) {
      campos.push({ ...base, situacao: "invalido", origem: origemCampo, motivo: invalido.mensagem });
    } else if (valores[campo.campo]) {
      campos.push({ ...base, situacao: "pronto", origem: origemCampo, motivo: null });
    }
  }
  return { registro, dependente, campos };
}

export function avaliarProntidaoQuestor(input: {
  processoId: string;
  snapshot: SnapshotAdmissaoPralis;
  geradoEm: Date;
}): ProntidaoQuestorDto {
  const { contrato, pendencias } = montarContratoQuestor(input.snapshot);
  const pendenciasDe = (registro: TipoRegistroQuestor, dependente: number | null) =>
    pendencias.filter((item) => item.registro === registro && item.dependente === dependente);

  const fontes = new Set([...camposComFonteQuestor(input.snapshot.questor), ...camposComFonteE5(input.snapshot.e5)]);

  const registros: RegistroProntidaoQuestor[] = [
    avaliarRegistro("A", null, contrato.A, pendenciasDe("A", null), fontes),
    avaliarRegistro("B", null, contrato.B, pendenciasDe("B", null), fontes),
    avaliarRegistro("C", null, contrato.C ?? {}, pendenciasDe("C", null), fontes),
    ...(contrato.dependentes ?? []).map((valores, indice) =>
      avaliarRegistro("D", indice, valores, pendenciasDe("D", indice), fontes)
    )
  ];

  const campos = registros.flatMap((registro) => registro.campos);
  const porOrigem = Object.fromEntries(origensPendenciaQuestor.map((origem) => [origem, 0])) as Record<
    OrigemPendenciaQuestor,
    number
  >;
  for (const campo of campos) {
    if ((campo.situacao === "pendente" || campo.situacao === "invalido") && campo.origem) porOrigem[campo.origem] += 1;
  }
  const pendentes = campos.filter((campo) => campo.situacao === "pendente").length;
  const invalidos = campos.filter((campo) => campo.situacao === "invalido").length;
  const aptoParaExportacao = pendentes === 0 && invalidos === 0;

  return {
    processoId: input.processoId,
    geradoEm: input.geradoEm.toISOString(),
    exportacaoDisponivel: false,
    aptoParaExportacao,
    motivoBloqueio: aptoParaExportacao
      ? "A exportação de TXT para o Questor ainda não está disponível no Pralís"
      : `Há ${pendentes + invalidos} campo(s) pendente(s) ou inválido(s); a exportação permanece bloqueada`,
    resumo: {
      requeridos: campos.filter((campo) => campo.requerido).length,
      requeridosProntos: campos.filter((campo) => campo.requerido && campo.situacao === "pronto").length,
      pendentes,
      invalidos,
      bloqueados: campos.filter((campo) => campo.situacao === "bloqueado").length,
      porOrigem
    },
    registros
  };
}
