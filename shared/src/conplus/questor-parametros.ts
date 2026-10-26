import { z } from "zod";
import {
  LAYOUT_ADMISSAO_QUESTOR,
  type CampoLayoutQuestor,
  type TipoRegistroQuestor
} from "./questor-admissao-layout.js";

/**
 * E2/E3/E4 — contratos dos parâmetros Questor que o Pralís passa a guardar:
 *
 * - E2: configuração por empresa + catálogo de códigos fornecido pela Conplus;
 * - E3: código de cargo/agente nocivo na função e código de escala/jornada no turno;
 * - E4: dados contratuais que o DP preenche no processo.
 *
 * Domínios, tamanhos e tipos saem de `LAYOUT_ADMISSAO_QUESTOR` (documentação + NLI) — nada é
 * redeclarado à mão. Nenhum campo tem valor-padrão: o que a Conplus não confirmou fica nulo.
 */

function campoDoLayout(registro: TipoRegistroQuestor, nome: string): CampoLayoutQuestor {
  const campo = LAYOUT_ADMISSAO_QUESTOR[registro].find((item) => item.campo === nome);
  if (!campo) throw new Error(`Campo ${registro}.${nome} não existe no layout oficial`);
  return campo;
}

export function dominioDoCampoQuestor(registro: TipoRegistroQuestor, nome: string): readonly string[] {
  const dominio = campoDoLayout(registro, nome).dominio;
  if (!dominio) throw new Error(`Campo ${registro}.${nome} não tem lista fechada na documentação`);
  return dominio;
}

/** Limite de dígitos do campo (menor entre documentação e NLI). */
function digitosDoCampo(registro: TipoRegistroQuestor, nome: string): number {
  const campo = campoDoLayout(registro, nome);
  const limites = [campo.tamanhoDoc, campo.tamanhoNli].filter((valor): valor is number => valor !== null);
  return Math.min(...limites);
}

const codigoNumerico = (registro: TipoRegistroQuestor, campo: string) => {
  const maximo = digitosDoCampo(registro, campo);
  return z
    .string()
    .trim()
    .regex(new RegExp(`^[0-9]{1,${maximo}}$`, "u"), `Código deve ter de 1 a ${maximo} dígitos (${campo})`);
};

const opcaoDoCampo = (registro: TipoRegistroQuestor, campo: string) => {
  const dominio = dominioDoCampoQuestor(registro, campo);
  return z.string().refine((valor) => dominio.includes(valor), `Valor fora da lista oficial de ${campo}`);
};

/** Domínio oficial convertido para número (para colunas smallint). */
const opcaoNumericaDoCampo = (registro: TipoRegistroQuestor, campo: string) => {
  const dominio = dominioDoCampoQuestor(registro, campo).map(Number);
  return z
    .number()
    .int()
    .refine((valor) => dominio.includes(valor), `Valor fora da lista oficial de ${campo}`);
};

const anulavel = <T extends z.ZodTypeAny>(schema: T) =>
  schema
    .nullable()
    .optional()
    .transform((valor) => valor ?? null);

// --- E2: catálogo de códigos -----------------------------------------------------------------------

/** Cada tabela do catálogo alimenta exatamente um campo do layout. */
export const TABELAS_CODIGO_QUESTOR = {
  tipo_contrato: { registro: "A", campo: "CODIGOTIPOCONTR" },
  sindicato: { registro: "A", campo: "CODIGOSIND" },
  cargo: { registro: "A", campo: "CODIGOCARGO" },
  escala: { registro: "B", campo: "CODIGOESCALA" },
  tipo_logradouro: { registro: "B", campo: "CODIGOTIPOLOGRAD" }
} as const satisfies Record<string, { registro: TipoRegistroQuestor; campo: string }>;

export type TabelaCodigoQuestor = keyof typeof TABELAS_CODIGO_QUESTOR;
export const tabelasCodigoQuestor = Object.keys(TABELAS_CODIGO_QUESTOR) as TabelaCodigoQuestor[];

export const codigoQuestorPayloadSchema = z
  .object({
    tabela: z.enum(tabelasCodigoQuestor as [TabelaCodigoQuestor, ...TabelaCodigoQuestor[]]),
    codigo: z.string().trim(),
    descricao: z.string().trim().min(1, "Informe a descrição do código").max(120),
    ativo: z.boolean().default(true)
  })
  .strict()
  .superRefine((item, ctx) => {
    const { registro, campo } = TABELAS_CODIGO_QUESTOR[item.tabela];
    const resultado = codigoNumerico(registro, campo).safeParse(item.codigo);
    if (!resultado.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["codigo"], message: resultado.error.issues[0]!.message });
    }
  });

export type CodigoQuestorPayload = z.infer<typeof codigoQuestorPayloadSchema>;
export type CodigoQuestorCatalogo = Pick<CodigoQuestorPayload, "tabela" | "codigo" | "ativo">;

/**
 * Confere se cada código referenciado existe e está ATIVO no catálogo da mesma empresa. O banco não
 * tem FK para o catálogo (ver proposta M4); esta é a verificação que o serviço aplica ao gravar.
 */
export function verificarCodigosNoCatalogoQuestor(
  catalogo: readonly CodigoQuestorCatalogo[],
  referencias: ReadonlyArray<{ tabela: TabelaCodigoQuestor; codigo: string | null | undefined; caminho: string }>
): Array<{ caminho: string; mensagem: string }> {
  const erros: Array<{ caminho: string; mensagem: string }> = [];
  for (const { tabela, codigo, caminho } of referencias) {
    if (!codigo) continue;
    const item = catalogo.find((linha) => linha.tabela === tabela && linha.codigo === codigo);
    if (!item) erros.push({ caminho, mensagem: `Código ${codigo} não está no catálogo "${tabela}" da empresa` });
    else if (!item.ativo) erros.push({ caminho, mensagem: `Código ${codigo} do catálogo "${tabela}" está desativado` });
  }
  return erros;
}

// --- E2: configuração da empresa -------------------------------------------------------------------

/**
 * Campos do layout que aceitam valor-padrão da EMPRESA (iguais para todas as admissões dela).
 * Ficam de fora, de propósito: TERMOCONSENTIMENTO (é da pessoa, e a equivalência é a Q2) e os
 * campos de categoria/vínculo (Q4).
 */
export const CAMPOS_PADRAO_EMPRESA_QUESTOR = [
  { registro: "A", campo: "GERARPRELIMINAR" },
  { registro: "A", campo: "CODIGOTIPOCONTR" },
  { registro: "A", campo: "CODIGOSIND" },
  { registro: "B", campo: "OPTANTEFGTS" },
  { registro: "B", campo: "SINDICALIZADO" },
  { registro: "B", campo: "DESCMENSSIND" },
  { registro: "B", campo: "DESCCUSTCONFED" },
  { registro: "B", campo: "DESCTAXAASSIST" },
  { registro: "B", campo: "DESCONTAREVSAL" },
  { registro: "B", campo: "DESCANOADMISSAO" },
  { registro: "B", campo: "CLAUSULAASSEGRESC" },
  { registro: "B", campo: "RECEBEADTO" },
  { registro: "B", campo: "RECEBE13SAL" },
  { registro: "B", campo: "MODOPGTO" },
  { registro: "B", campo: "PARTICPAT" },
  { registro: "B", campo: "UTILIZAQCOLABORE" },
  { registro: "D", campo: "FORMACONTROLEIR" }
] as const satisfies ReadonlyArray<{ registro: TipoRegistroQuestor; campo: string }>;

export type CampoPadraoEmpresaQuestor = (typeof CAMPOS_PADRAO_EMPRESA_QUESTOR)[number]["campo"];

const TABELA_DO_CAMPO_PADRAO: Partial<Record<CampoPadraoEmpresaQuestor, TabelaCodigoQuestor>> = {
  CODIGOTIPOCONTR: "tipo_contrato",
  CODIGOSIND: "sindicato"
};

export const configuracaoQuestorPayloadSchema = z
  .object({
    /** Versão lida no GET. `0` = a empresa ainda não tem configuração (o PUT cria). */
    versao: z.number().int().nonnegative(),
    codigoEstabelecimento: anulavel(
      z
        .number()
        .int()
        .min(0)
        .max(10 ** digitosDoCampo("B", "CODIGOESTAB") - 1)
    ),
    classificacaoOrganograma: anulavel(z.string().trim().min(1).max(digitosDoCampo("B", "CLASSIFORGAN"))),
    utilizaHoraCentesimal: anulavel(z.boolean()),
    /** Coluna 2 do EventoVariavel.nli (inteiro de até 6 dígitos). Não é o CNPJ do TXT de admissão. */
    codigoEmpresaQuestor: anulavel(z.number().int().min(1).max(999_999)),
    /** Razão social como nos arquivos da Conplus: a identidade exigida na importação do catálogo. */
    razaoSocialQuestor: anulavel(z.string().trim().min(1).max(200)),
    padroes: z.record(z.string(), z.string()).default({})
  })
  .strict()
  .superRefine((dados, ctx) => {
    for (const [campo, valor] of Object.entries(dados.padroes)) {
      const alvo = CAMPOS_PADRAO_EMPRESA_QUESTOR.find((item) => item.campo === campo);
      if (!alvo) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["padroes", campo],
          message: `${campo} não aceita padrão da empresa`
        });
        continue;
      }
      const tabela = TABELA_DO_CAMPO_PADRAO[alvo.campo];
      const schema = tabela ? codigoNumerico(alvo.registro, alvo.campo) : opcaoDoCampo(alvo.registro, alvo.campo);
      const resultado = schema.safeParse(valor);
      if (!resultado.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["padroes", campo],
          message: resultado.error.issues[0]!.message
        });
      }
    }
  });

export type ConfiguracaoQuestorPayload = z.infer<typeof configuracaoQuestorPayloadSchema>;

/** Referências ao catálogo feitas pela configuração (para `verificarCodigosNoCatalogoQuestor`). */
export function referenciasDaConfiguracaoQuestor(configuracao: Pick<ConfiguracaoQuestorPayload, "padroes">) {
  return Object.entries(TABELA_DO_CAMPO_PADRAO).map(([campo, tabela]) => ({
    tabela,
    codigo: configuracao.padroes[campo],
    caminho: `padroes.${campo}`
  }));
}

// --- E3: função e turno ----------------------------------------------------------------------------

export const funcaoQuestorPayloadSchema = z.object({
  questorCodigoCargo: anulavel(codigoNumerico("A", "CODIGOCARGO")),
  questorAgenteNocivo: anulavel(opcaoDoCampo("B", "AGENTENOCIVO"))
});

export const turnoQuestorPayloadSchema = z.object({
  questorCodigoEscala: anulavel(codigoNumerico("B", "CODIGOESCALA")),
  questorTipoJornada: anulavel(opcaoNumericaDoCampo("B", "TIPOJORNADA")),
  questorTempoParcial: anulavel(opcaoNumericaDoCampo("B", "TEMPOPARCIAL")),
  questorRegimeJornada: anulavel(opcaoNumericaDoCampo("B", "REGIMEJOR"))
});

export type FuncaoQuestorPayload = z.infer<typeof funcaoQuestorPayloadSchema>;
export type TurnoQuestorPayload = z.infer<typeof turnoQuestorPayloadSchema>;

// --- Código do contrato do colaborador no Questor ---------------------------------------------------

/**
 * CODIGOFUNCCONTR (registro C, inteiro de até 7 dígitos): o Questor atribui na admissão e o DP
 * informa aqui. Zeros à esquerda são removidos — "0123" e "123" são o mesmo contrato no Questor e
 * gravar os dois quebraria a unicidade por empresa. Zero não é contrato.
 */
export const contratoColaboradorQuestorPayloadSchema = z.object({
  questorCodigoContrato: anulavel(
    codigoNumerico("C", "CODIGOFUNCCONTR")
      .transform((valor) => valor.replace(/^0+(?=\d)/u, ""))
      .refine((valor) => valor !== "0", "O código do contrato não pode ser zero")
  )
});

export type ContratoColaboradorQuestorPayload = z.infer<typeof contratoColaboradorQuestorPayloadSchema>;

// --- E4: dados contratuais do DP -------------------------------------------------------------------

/** VALORSAL: Numérico 16 com 2 casas — "9999999999999,99" é o maior valor que cabe. */
const SALARIO_MAXIMO_CENTAVOS = 999_999_999_999_999;

export const contratoQuestorPayloadSchema = z
  .object({
    versao: z.number().int().positive(),
    questorTipoSalario: anulavel(opcaoNumericaDoCampo("A", "TIPOSALARIO")),
    salarioCentavos: anulavel(z.number().int().min(1).max(SALARIO_MAXIMO_CENTAVOS)),
    descricaoSalario: anulavel(z.string().trim().min(1).max(digitosDoCampo("A", "DESCRSAL"))),
    diasExperiencia: anulavel(
      z
        .number()
        .int()
        .min(0)
        .max(10 ** digitosDoCampo("A", "DIACONTREXP") - 1)
    ),
    diasProrrogacao: anulavel(
      z
        .number()
        .int()
        .min(0)
        .max(10 ** digitosDoCampo("A", "DIAPRORROGCONTREXP") - 1)
    ),
    questorTipoContrato: anulavel(codigoNumerico("A", "CODIGOTIPOCONTR")),
    questorSindicato: anulavel(codigoNumerico("A", "CODIGOSIND")),
    questorTipoAdmissao: anulavel(opcaoNumericaDoCampo("B", "TIPOADM")),
    pcdCotista: anulavel(z.boolean()),
    utilizaCtpsDigital: anulavel(z.boolean()),
    possuiAlvara: anulavel(z.boolean()),
    jaExpostoAgenteNocivo: anulavel(z.boolean())
  })
  .strict()
  .superRefine((dados, ctx) => {
    // Doc A.DESCRSAL: "Obrigatório se TIPOSALARIO=(Comissão/Variável=2;Tarefa=6)".
    if ((dados.questorTipoSalario === 2 || dados.questorTipoSalario === 6) && !dados.descricaoSalario) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["descricaoSalario"],
        message: "Descrição do salário é obrigatória para Comissão/Variável ou Tarefa"
      });
    }
  });

export type ContratoQuestorPayload = z.infer<typeof contratoQuestorPayloadSchema>;

export function referenciasDoContratoQuestor(
  contrato: Pick<ContratoQuestorPayload, "questorTipoContrato" | "questorSindicato">
) {
  return [
    { tabela: "tipo_contrato" as const, codigo: contrato.questorTipoContrato, caminho: "questorTipoContrato" },
    { tabela: "sindicato" as const, codigo: contrato.questorSindicato, caminho: "questorSindicato" }
  ];
}
