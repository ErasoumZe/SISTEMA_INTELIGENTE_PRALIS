import { z } from "zod";

const uuidSchema = z.string().uuid();
const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Data deve estar no formato AAAA-MM-DD");

export const statusCampanhaSchema = z.enum(["rascunho", "ativa", "encerrada", "cancelada"]);
export const bonificacaoTipoSchema = z.enum(["dinheiro", "percentual", "recompensa"]);

export const campanhaPayloadSchema = z
  .object({
    empresaId: uuidSchema,
    titulo: z.string().trim().min(1).max(120),
    mensagem: z.string().trim().min(1).max(2000),
    // Dia de negocio (R-197): comparado com `vendas.data_referencia`, nunca com `data_venda`.
    inicio: dataSchema,
    fim: dataSchema,
    metaValor: z.number().positive(),
    bonificacaoTipo: bonificacaoTipoSchema,
    bonificacaoValor: z.number().positive().nullable().optional(),
    bonificacaoTexto: z.string().trim().min(1).max(500).nullable().optional(),
    pdvIds: z.array(uuidSchema).min(1)
  })
  .refine((campanha) => campanha.fim >= campanha.inicio, {
    message: "O fim da campanha nao pode ser anterior ao inicio",
    path: ["fim"]
  })
  // Espelha `campanhas_bonificacao_check` no banco. As duas camadas existem de proposito: o Zod da
  // a mensagem que a tela mostra, o CHECK impede que qualquer outro caminho grave incoerente.
  .refine(
    (campanha) =>
      campanha.bonificacaoTipo === "recompensa"
        ? Boolean(campanha.bonificacaoTexto) && campanha.bonificacaoValor == null
        : campanha.bonificacaoValor != null && !campanha.bonificacaoTexto,
    {
      message: "Bonificacao em dinheiro ou percentual exige valor; recompensa exige texto",
      path: ["bonificacaoValor"]
    }
  )
  .refine((campanha) => campanha.bonificacaoTipo !== "percentual" || (campanha.bonificacaoValor ?? 0) <= 100, {
    message: "Percentual nao pode passar de 100",
    path: ["bonificacaoValor"]
  });

export const campanhaParamsSchema = z.object({ campanhaId: uuidSchema });
export const campanhaStatusPayloadSchema = z.object({ status: statusCampanhaSchema });

export const pdvDaCampanhaSchema = z.object({
  pdvId: uuidSchema,
  pdvNome: z.string().nullable(),
  // Soma AO VIVO das vendas do PDV na janela da campanha (R-199). Nao existe coluna de progresso.
  vendidoNoPeriodo: z.number()
});

export const campanhaSchema = z.object({
  id: uuidSchema,
  empresaId: uuidSchema,
  titulo: z.string(),
  mensagem: z.string(),
  inicio: z.string(),
  fim: z.string(),
  metaValor: z.number(),
  bonificacaoTipo: bonificacaoTipoSchema,
  bonificacaoValor: z.number().nullable(),
  bonificacaoTexto: z.string().nullable(),
  status: statusCampanhaSchema,
  criadoPor: z.string(),
  criadoEm: z.string()
});

export const campanhaComProgressoSchema = campanhaSchema.extend({
  pdvs: z.array(pdvDaCampanhaSchema),
  totalVendido: z.number(),
  percentualDaMeta: z.number(),
  // Vendas do periodo, das empresas da campanha, SEM pdv_id. Ficam visiveis para auditoria e
  // NUNCA entram em `totalVendido` (R-198) — venda que ninguem sabe de onde veio nao paga premio.
  naoAtribuido: z.number()
});

export type StatusCampanha = z.infer<typeof statusCampanhaSchema>;
export type BonificacaoTipo = z.infer<typeof bonificacaoTipoSchema>;
export type CampanhaPayload = z.infer<typeof campanhaPayloadSchema>;
export type PdvDaCampanha = z.infer<typeof pdvDaCampanhaSchema>;
export type Campanha = z.infer<typeof campanhaSchema>;
export type CampanhaComProgresso = z.infer<typeof campanhaComProgressoSchema>;

/**
 * Percentual da meta, em centavos inteiros como todo dinheiro deste projeto.
 *
 * Passa de 100 quando a campanha e superada, de proposito: truncar em 100 esconderia exatamente o
 * resultado que a campanha existe para mostrar. Meta zero nunca chega aqui — `campanhas_meta_check`
 * exige `meta_valor > 0` — mas o guarda permanece porque esta funcao tambem roda no cliente.
 */
export function percentualDaMetaCentavos(vendidoCentavos: number, metaCentavos: number): number {
  if (metaCentavos <= 0) return 0;
  return Math.round((vendidoCentavos / metaCentavos) * 1000) / 10;
}

/**
 * A campanha so aparece para o operador e so acumula progresso quando esta ATIVA e o dia de negocio
 * cai dentro da janela. Comparacao de string funciona porque as datas sao sempre AAAA-MM-DD.
 */
export function campanhaVigenteNoDia(
  campanha: { status: StatusCampanha; inicio: string; fim: string },
  diaNegocio: string
): boolean {
  return campanha.status === "ativa" && diaNegocio >= campanha.inicio && diaNegocio <= campanha.fim;
}
