import { z } from "zod";

export { empresaQuerySchema as formasPagamentoQuerySchema } from "../api/index.js";

const uuidSchema = z.string().uuid();

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

export const formaPagamentoPayloadSchema = z
  .object({
    empresaId: uuidSchema,
    nome: z.string().min(1),
    adquirente: textoOpcional.optional(),
    usaContaDoPdv: z.boolean().optional(),
    contaRecebivelId: uuidSchema.nullable().optional(),
    contaFinalId: uuidSchema.nullable().optional(),
    disponibilidade: z.enum(disponibilidadesRoteamento).nullable().optional()
  })
  .superRefine((dados, ctx) => {
    // Mesmo dominio do `formas_pagamento_roteamento_check` da migration 0033, em tres ramos
    // mutuamente exclusivos. Existe aqui TAMBEM, e nao so no banco, para o cadastro responder 400
    // apontando o campo errado em vez de 503 com um 23514 sanitizado.
    //
    // Se um dia os dois divergirem, o banco vence — ele e a ultima porta. Ha teste amarrando os
    // dois: o mesmo payload recusado aqui tem de ser recusado la.
    const disponibilidade = dados.disponibilidade ?? null;
    const usaContaDoPdv = dados.usaContaDoPdv ?? false;
    const recebivel = dados.contaRecebivelId ?? null;
    const final = dados.contaFinalId ?? null;

    const semRoteamento = disponibilidade === null && !usaContaDoPdv && recebivel === null && final === null;
    const contaDoPdv = disponibilidade === "imediata" && usaContaDoPdv && recebivel === null && final === null;
    const recebivelProprio = disponibilidade === "por_evento" && !usaContaDoPdv && recebivel !== null && final !== null;

    if (semRoteamento || contaDoPdv || recebivelProprio) return;

    if (disponibilidade === null) {
      ctx.addIssue({
        code: "custom",
        path: ["disponibilidade"],
        message:
          "Forma meio-cadastrada: escolha a disponibilidade. Marcar a conta do PDV ou informar conta sem dizer quando o dinheiro fica disponivel deixaria o valor gastavel por engano"
      });
      return;
    }
    if (disponibilidade === "imediata") {
      ctx.addIssue({
        code: "custom",
        path: ["usaContaDoPdv"],
        message:
          "Disponibilidade imediata e dinheiro fisico: exige a conta do PDV marcada e nenhuma conta de recebivel ou final"
      });
      return;
    }
    ctx.addIssue({
      code: "custom",
      path: ["contaRecebivelId"],
      message: "Disponibilidade por evento exige conta de recebivel E conta final, e nao pode usar a conta do PDV"
    });
  });

export type FormaPagamentoPayload = z.infer<typeof formaPagamentoPayloadSchema>;

// A forma esta roteada quando o admin decidiu o destino. `disponibilidade` nula e o unico estado de
// "nao decidido" — os CHECKs garantem que os demais campos acompanham.
export function formaTemRoteamento(forma: Pick<RoteamentoDaForma, "disponibilidade">): boolean {
  return forma.disponibilidade !== null;
}
