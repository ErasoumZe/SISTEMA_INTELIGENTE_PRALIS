import { z } from "zod";
import type { CreareStoreConfig } from "@padaria/shared/produtos";

/**
 * Configuracao do TXT por loja (`CREARE_STORE_CONFIG_JSON`) — mesmo formato e mesma validacao estrita do
 * app oficial (`creare.config.ts`, R-222), para o mesmo JSON do Coolify servir aos dois.
 */
const simNao = z.enum(["S", "N"]);
const configDaLoja = z
  .object({
    groupCodes: z.record(z.string(), z.string()),
    categoryCodes: z.record(z.string(), z.string()),
    units: z.record(z.string(), z.string()),
    // Legado: o grupo comercial nao determina a aliquota do ECF (vem do SIA). Opcional.
    ecfTaxCodesByGroup: z.record(z.string(), z.string()).optional(),
    // Padroes das duas chaves estrangeiras do SIA que zero nao satisfaz: decisao fiscal de quem configura.
    ecfTaxCodePadrao: z
      .string()
      .regex(/^\d{1,2}$/u)
      .optional(),
    pisCofinsCstPadrao: z
      .string()
      .regex(/^\d{1,2}$/u)
      .optional(),
    decimalPlaces: z
      .object({
        unitPrice: z.union([z.literal(2), z.literal(3)]),
        cost: z.number().int().min(0).max(6).default(3),
        icmsReduction: z.number().int().min(0).max(6),
        fullTaxRate: z.number().int().min(0).max(6),
        fcpRate: z.number().int().min(0).max(6),
        pisRate: z.number().int().min(0).max(6),
        cofinsRate: z.number().int().min(0).max(6),
        maximumQuantity: z.number().int().min(0).max(6),
        minimumQuantity: z.number().int().min(0).max(6)
      })
      .strict(),
    barcodeField: z.enum(["short", "extended", "automatic"]),
    lineEnding: z.enum(["CRLF", "LF"]),
    noPromotionDate: z.string().regex(/^\d{2}\/\d{2}\/\d{2}$/u),
    iat: z.enum(["A", "T"]),
    ipptByProductType: z.object({ revenda: z.enum(["P", "T"]), transformacao: z.enum(["P", "T"]) }),
    // Legado aceito do Coolify; nunca usado para inferir Pesavel.
    weighableByMeasure: z.object({ UN: simNao, KG: simNao, G: simNao, LT: simNao, ML: simNao }).optional(),
    stockControlledByProductType: z.object({ revenda: simNao, transformacao: simNao })
  })
  .strict();

const configDasLojas = z
  .object({ TNP: configDaLoja.optional(), LI: configDaLoja.optional(), HORA: configDaLoja.optional() })
  .strict()
  .refine((valor) => Object.values(valor).some(Boolean), { message: "Informe ao menos uma loja." });

export type LojaCreare = "TNP" | "LI" | "HORA";
export const LOJAS_CREARE: readonly LojaCreare[] = ["TNP", "LI", "HORA"];

/** Nunca lanca nem devolve o JSON recebido no erro: configuracao nao vaza em log nem resposta. */
export function lerConfiguracaoCreare(bruto: string): {
  configs: Partial<Record<LojaCreare, CreareStoreConfig>>;
  erros: string[];
} {
  if (!bruto.trim()) return { configs: {}, erros: ["CREARE_STORE_CONFIG_JSON"] };
  let json: string | number | boolean | object | null;
  try {
    json = JSON.parse(bruto) as string | number | boolean | object | null;
  } catch {
    return { configs: {}, erros: ["CREARE_STORE_CONFIG_JSON_INVALID_JSON"] };
  }
  const lido = configDasLojas.safeParse(json);
  if (!lido.success) {
    const caminhos = [...new Set(lido.error.issues.map((issue) => issue.path.join(".") || "root"))];
    return { configs: {}, erros: caminhos.map((caminho) => `CREARE_STORE_CONFIG_JSON:${caminho}`) };
  }
  return { configs: lido.data as Partial<Record<LojaCreare, CreareStoreConfig>>, erros: [] };
}
