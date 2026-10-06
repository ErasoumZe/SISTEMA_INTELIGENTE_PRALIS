import { z } from "zod";

export { empresaQuerySchema as formasPagamentoQuerySchema } from "../api/index.js";

const uuidSchema = z.string().uuid();

// Classificacao usada SOMENTE para leitura/conferencia no fechamento do Caixa. Ela nao altera
// roteamento, saldo nem liquidacao: diz ao relatorio em qual coluna operacional o recebimento
// deve aparecer. Formas antigas podem ainda nao ter a classificacao gravada; nesse caso a
// normalizacao pelo nome preserva o relatorio util ate que a forma seja revisada no cadastro.
export const categoriasFechamentoCaixa = [
  "dinheiro",
  "credito",
  "debito",
  "pix",
  "voucher",
  "crediario",
  "outros"
] as const;
export type CategoriaFechamentoCaixa = (typeof categoriasFechamentoCaixa)[number];

export function categoriaFechamentoPorNome(nome: string): CategoriaFechamentoCaixa {
  const normalizado = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
  if (/\bpix\b/u.test(normalizado)) return "pix";
  if (/\bdinheiro\b|\bespecie\b|\bcash\b/u.test(normalizado)) return "dinheiro";
  if (/\bcrediario\b/u.test(normalizado)) return "crediario";
  if (/\bvoucher\b|\bvale\b/u.test(normalizado)) return "voucher";
  if (/\bdebito\b/u.test(normalizado)) return "debito";
  if (/\bcredito\b/u.test(normalizado)) return "credito";
  return "outros";
}

// R-167/R-169 (#152): o roteamento financeiro da forma de pagamento — para onde vai o dinheiro
// DESTA forma NESTA empresa, e quando ele fica gastavel.
//
// `imediata`   -> dinheiro fisico: cai na conta do PDV e ja e saldo.
// `por_evento` -> recebivel: existe no financeiro, mas so vira saldo quando a liquidacao confirmar.
//                 Liquidacao e vertical POSTERIOR — nesta issue nada confirma sozinho.
// `null`       -> sem roteamento. E o estado de toda forma existente e de toda forma que o CREARE
//                 cria sozinho. Abre pendencia (R-168); nunca vira destino inventado.
export const disponibilidadesRoteamento = ["imediata", "por_evento"] as const;
export type DisponibilidadeRoteamento = (typeof disponibilidadesRoteamento)[number];

export type RoteamentoDaForma = {
  adquirente: string | null;
  usaContaDoPdv: boolean;
  contaRecebivelId: string | null;
  contaFinalId: string | null;
  disponibilidade: DisponibilidadeRoteamento | null;
};

// Os campos que SO o Admin com a permissao dedicada da R-176 pode gravar. A lista existe uma vez
// so: o guard do POST/PUT e a projecao do GET leem daqui, entao nao ha como um campo novo entrar
// por um caminho e ficar desprotegido no outro.
export const CAMPOS_ROTEAMENTO = [
  "adquirente",
  "usaContaDoPdv",
  "contaRecebivelId",
  "contaFinalId",
  "disponibilidade"
] as const;
export type CampoRoteamento = (typeof CAMPOS_ROTEAMENTO)[number];

const textoOpcional = z
  .string()
  .trim()
  .max(120)
  .transform((valor) => (valor === "" ? null : valor))
  .nullable();

/**
 * Os tres ramos validos do roteamento, iguais ao `formas_pagamento_roteamento_check` da 0033.
 *
 * Fica FORA do schema do payload de proposito. O PUT e parcial: um corpo que so renomeia a forma nao
 * carrega os campos de roteamento, e validar o corpo isolado recusaria o estado ja gravado. Quem
 * valida e o servico, sobre o roteamento RESULTANTE (o gravado, com os campos enviados por cima).
 */
export function roteamentoCoerente(
  roteamento: RoteamentoDaForma
): { ok: true } | { ok: false; campo: CampoRoteamento; mensagem: string } {
  const { disponibilidade, usaContaDoPdv, contaRecebivelId, contaFinalId } = roteamento;

  const semRoteamento =
    disponibilidade === null && !usaContaDoPdv && contaRecebivelId === null && contaFinalId === null;
  const contaDoPdv =
    disponibilidade === "imediata" && usaContaDoPdv && contaRecebivelId === null && contaFinalId === null;
  const recebivelProprio =
    disponibilidade === "por_evento" && !usaContaDoPdv && contaRecebivelId !== null && contaFinalId !== null;
  if (semRoteamento || contaDoPdv || recebivelProprio) return { ok: true };

  if (disponibilidade === null) {
    return {
      ok: false,
      campo: "disponibilidade",
      mensagem:
        "Forma meio-cadastrada: escolha a disponibilidade. Marcar a conta do PDV ou informar conta sem dizer quando o dinheiro fica disponivel deixaria o valor gastavel por engano"
    };
  }
  if (disponibilidade === "imediata") {
    return {
      ok: false,
      campo: "usaContaDoPdv",
      mensagem:
        "Disponibilidade imediata e dinheiro fisico: exige a conta do PDV marcada e nenhuma conta de recebivel ou final"
    };
  }
  return {
    ok: false,
    campo: "contaRecebivelId",
    mensagem: "Disponibilidade por evento exige conta de recebivel E conta final, e nao pode usar a conta do PDV"
  };
}

// Campo AUSENTE no corpo significa "nao estou mexendo nisso" — nunca "limpe". A diferenca decide se
// um PUT que so renomeia a forma preserva ou apaga o destino do dinheiro.
export function mesclarRoteamento(
  atual: RoteamentoDaForma,
  enviado: Partial<Record<CampoRoteamento, string | boolean | null | undefined>>
): RoteamentoDaForma {
  return {
    adquirente: enviado.adquirente !== undefined ? (enviado.adquirente as string | null) : atual.adquirente,
    usaContaDoPdv: enviado.usaContaDoPdv !== undefined ? Boolean(enviado.usaContaDoPdv) : atual.usaContaDoPdv,
    contaRecebivelId:
      enviado.contaRecebivelId !== undefined ? (enviado.contaRecebivelId as string | null) : atual.contaRecebivelId,
    contaFinalId: enviado.contaFinalId !== undefined ? (enviado.contaFinalId as string | null) : atual.contaFinalId,
    disponibilidade:
      enviado.disponibilidade !== undefined
        ? (enviado.disponibilidade as DisponibilidadeRoteamento | null)
        : atual.disponibilidade
  };
}

export function mesmoRoteamento(a: RoteamentoDaForma, b: RoteamentoDaForma): boolean {
  return (
    a.adquirente === b.adquirente &&
    a.usaContaDoPdv === b.usaContaDoPdv &&
    a.contaRecebivelId === b.contaRecebivelId &&
    a.contaFinalId === b.contaFinalId &&
    a.disponibilidade === b.disponibilidade
  );
}

export const SEM_ROTEAMENTO: RoteamentoDaForma = {
  adquirente: null,
  usaContaDoPdv: false,
  contaRecebivelId: null,
  contaFinalId: null,
  disponibilidade: null
};

export const formaPagamentoPayloadSchema = z.object({
  empresaId: uuidSchema,
  nome: z.string().min(1),
  categoriaFechamentoCaixa: z.enum(categoriasFechamentoCaixa).optional(),
  adquirente: textoOpcional.optional(),
  usaContaDoPdv: z.boolean().optional(),
  contaRecebivelId: uuidSchema.nullable().optional(),
  contaFinalId: uuidSchema.nullable().optional(),
  disponibilidade: z.enum(disponibilidadesRoteamento).nullable().optional()
});

export type FormaPagamentoPayload = z.infer<typeof formaPagamentoPayloadSchema>;

// Etapa de preparacao: regras sao referencia administrativa para testar taxa/prazo antes de haver
// integracao de conciliacao. Nenhum modulo financeiro pode usa-las para calcular ou movimentar valor.
export const statusRegraRecebimento = ["rascunho", "validada", "arquivada"] as const;
export type StatusRegraRecebimento = (typeof statusRegraRecebimento)[number];

const numeroOpcional = z.number().finite().nullable().optional();
const inteiroOpcional = z.number().int().nullable().optional();
const dataIsoOpcional = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();

export const regraRecebimentoPayloadSchema = z
  .object({
    empresaId: uuidSchema,
    parcelasDe: inteiroOpcional,
    parcelasAte: inteiroOpcional,
    taxaPercentual: numeroOpcional,
    taxaFixa: numeroOpcional,
    prazoDias: inteiroOpcional,
    status: z.enum(statusRegraRecebimento).optional(),
    fonteReferencia: textoOpcional.optional(),
    observacao: z
      .string()
      .trim()
      .max(1000)
      .transform((valor) => (valor === "" ? null : valor))
      .nullable()
      .optional(),
    vigenciaInicio: dataIsoOpcional,
    vigenciaFim: dataIsoOpcional
  })
  .superRefine((regra, ctx) => {
    const parcelasParciais = (regra.parcelasDe == null) !== (regra.parcelasAte == null);
    if (
      parcelasParciais ||
      (regra.parcelasDe != null && (regra.parcelasDe < 1 || regra.parcelasAte! < regra.parcelasDe))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["parcelasAte"],
        message: "Informe uma faixa de parcelas valida"
      });
    }
    if (regra.taxaPercentual != null && (regra.taxaPercentual < 0 || regra.taxaPercentual > 100)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["taxaPercentual"],
        message: "A taxa percentual deve estar entre 0 e 100"
      });
    }
    if (regra.taxaFixa != null && regra.taxaFixa < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["taxaFixa"], message: "A taxa fixa nao pode ser negativa" });
    }
    if (regra.prazoDias != null && regra.prazoDias < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["prazoDias"], message: "O prazo nao pode ser negativo" });
    }
    if (regra.vigenciaInicio && regra.vigenciaFim && regra.vigenciaFim < regra.vigenciaInicio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vigenciaFim"],
        message: "O fim da vigencia nao pode ser anterior ao inicio"
      });
    }
  });

export type RegraRecebimentoPayload = z.infer<typeof regraRecebimentoPayloadSchema>;

// A forma esta roteada quando o admin decidiu o destino. `disponibilidade` nula e o unico estado de
// "nao decidido" — os CHECKs garantem que os demais campos acompanham.
export function formaTemRoteamento(forma: Pick<RoteamentoDaForma, "disponibilidade">): boolean {
  return forma.disponibilidade !== null;
}
