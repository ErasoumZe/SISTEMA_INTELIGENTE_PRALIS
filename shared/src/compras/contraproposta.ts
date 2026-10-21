import { z } from "zod";

const uuid = z.string().uuid();

// Contraproposta versionada (R-221 decisao 7, PROJECT_BRAIN/54). NAO e tabela nova: e uma versao do
// livro de propostas do convite com `autor_tipo='comprador'`. Fornecedor e comprador escrevem na MESMA
// sequencia de versoes; nada sobrescreve. Aqui mora so a regra pura, para ser testada sem banco.

export const contrapropostaItemSchema = z.object({
  rodadaItemId: uuid,
  // Centavos inteiros e >= 0,01: o banco guarda numeric(14,2); 0,004 viraria "0.00" e, depois do aceite,
  // compraria de graca. Limitado porque infinito/enorme estouraria como 500.
  valorUnitario: z.coerce
    .number()
    .min(0.01)
    .max(9_999_999)
    .refine((valor) => Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-6, "Use no maximo 2 casas decimais")
});

export const contrapropostaPayloadSchema = z
  .object({
    empresaId: uuid,
    itens: z.array(contrapropostaItemSchema).min(1).max(200)
  })
  .refine((payload) => new Set(payload.itens.map((item) => item.rodadaItemId)).size === payload.itens.length, {
    message: "Item repetido na mesma contraproposta",
    path: ["itens"]
  });

export type ContrapropostaPayload = z.infer<typeof contrapropostaPayloadSchema>;

/** Uma versao do livro do convite, de quem for. Valores em texto (numeric do banco). */
export type VersaoDoConvite = {
  versao: number;
  autorTipo: "fornecedor" | "comprador";
  itens: Array<{ conviteItemId: string; indisponivel: boolean; valorUnitario: string | null }>;
};

export type ItemContraproposto = { conviteItemId: string; valorUnitario: string };

/**
 * A contraproposta PENDENTE: o que o comprador mandou depois da ultima versao do fornecedor. Resposta
 * nova do fornecedor supera tudo (ele ja respondeu ao que estava na mesa). Varias contrapropostas
 * seguidas se somam por item, e a mais recente vence no mesmo item — assim o comprador pode propor
 * item a item sem uma apagar a outra do ponto de vista do fornecedor. Sem versao do fornecedor, nao
 * ha o que contrapor.
 */
export function contrapropostaVigente(versoes: VersaoDoConvite[]): ItemContraproposto[] {
  const ordenadas = [...versoes].sort((a, b) => a.versao - b.versao);
  const versoesDoFornecedor = ordenadas.filter((versao) => versao.autorTipo === "fornecedor");
  const ultimaDoFornecedor = versoesDoFornecedor[versoesDoFornecedor.length - 1];
  if (!ultimaDoFornecedor) return [];
  const porItem = new Map<string, string>();
  for (const versao of ordenadas) {
    if (versao.autorTipo !== "comprador" || versao.versao <= ultimaDoFornecedor.versao) continue;
    for (const item of versao.itens) {
      if (!item.indisponivel && item.valorUnitario !== null) porItem.set(item.conviteItemId, item.valorUnitario);
    }
  }
  return [...porItem].map(([conviteItemId, valorUnitario]) => ({ conviteItemId, valorUnitario }));
}

/**
 * Os itens da versao N+1 do FORNECEDOR quando ele aceita: o valor da contraproposta onde houver, e o
 * que ele ja tinha dito nos demais itens (aceitar um item nao some com os outros). A versao nova
 * atravessa o mesmo portao da compra automatica que qualquer resposta.
 */
export function itensDoAceite(
  ultimaDoFornecedor: VersaoDoConvite,
  contraproposta: ItemContraproposto[]
): VersaoDoConvite["itens"] {
  const contraposto = new Map(contraproposta.map((item) => [item.conviteItemId, item.valorUnitario]));
  const jaTinha = new Set(ultimaDoFornecedor.itens.map((item) => item.conviteItemId));
  const itens = ultimaDoFornecedor.itens.map((item) => {
    const valor = contraposto.get(item.conviteItemId);
    return valor === undefined
      ? { ...item }
      : { conviteItemId: item.conviteItemId, indisponivel: false, valorUnitario: valor };
  });
  for (const [conviteItemId, valorUnitario] of contraposto) {
    if (!jaTinha.has(conviteItemId)) itens.push({ conviteItemId, indisponivel: false, valorUnitario });
  }
  return itens;
}

// O que o fornecedor ve de cada item dele (decisao 8): so isto, nunca quem venceu, por quanto, nem a base.
export const situacoesItemPublica = ["comprado", "em_analise", "nao_cotado"] as const;
export type SituacaoItemPublica = (typeof situacoesItemPublica)[number];

/**
 * `em_analise` cobre "acima da base" E "sem base": o fornecedor nao pode inferir a direcao da base pelo
 * rotulo. `comprado` vale para qualquer vencedor.
 */
export function situacaoDoItemParaFornecedor(entrada: {
  comprado: boolean;
  ofereceuPreco: boolean;
}): SituacaoItemPublica {
  if (entrada.comprado) return "comprado";
  return entrada.ofereceuPreco ? "em_analise" : "nao_cotado";
}
