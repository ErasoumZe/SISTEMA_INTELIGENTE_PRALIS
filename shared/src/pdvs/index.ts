import { z } from "zod";

export { empresaQuerySchema as pdvsQuerySchema } from "../api/index.js";

const uuidSchema = z.string().uuid();

// R-229 · turnos do caixa deste PDV (postos: PDV 1 · Manha, PDV 1 · Tarde). Sem default na edicao: ausente =
// manter o que esta gravado (renomear o PDV nao religa um turno desmarcado).
export const turnoCaixaSchema = z.enum(["manha", "tarde"]);
export type TurnoCaixa = z.infer<typeof turnoCaixaSchema>;
export const rotuloTurnoCaixa: Record<TurnoCaixa, string> = { manha: "Manhã", tarde: "Tarde" };

export const pdvPayloadSchema = z.object({
  empresaId: uuidSchema,
  nome: z.string().min(1),
  contaId: uuidSchema,
  ativo: z.boolean().optional().default(true),
  turnosCaixa: z
    .array(turnoCaixaSchema)
    .min(1, "Marque ao menos um turno do caixa")
    .transform((turnos) => [...new Set(turnos)])
    .optional()
});

export type PdvPayload = z.infer<typeof pdvPayloadSchema>;

// "Excluir" PDV (Marco, 13/11/2026) = desativar e marcar o nome. A marca separa o EXCLUIDO (some do cadastro, nao e
// editado) do simplesmente INATIVO (continua no cadastro e pode ser reativado), sem coluna nova.
export const MARCA_PDV_EXCLUIDO = " (excluido ";

export function nomePdvExcluido(nome: string, dia: string): string {
  return `${nome}${MARCA_PDV_EXCLUIDO}${dia})`;
}

export function pdvFoiExcluido(pdv: { ativo?: boolean | null; nome?: string | null }): boolean {
  return pdv.ativo === false && Boolean(pdv.nome?.includes(MARCA_PDV_EXCLUIDO));
}
