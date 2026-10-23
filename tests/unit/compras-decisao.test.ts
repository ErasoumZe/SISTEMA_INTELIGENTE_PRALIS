import { describe, expect, it } from "vitest";
import {
  aprovarExcecaoPayloadSchema,
  motivoDecisao,
  motivosDecisao,
  statusSolicitacaoAposFechamento,
  type PropostaParaMotivo
} from "@padaria/shared/compras";

/**
 * Fase 2 / E6 — regras puras do fechamento e da fila de decisao (R-221 decisoes 6 e 1). Cada caso diz
 * a regra, para quem ler discordar dela e nao so do resultado.
 */
describe("statusSolicitacaoAposFechamento", () => {
  it("todos os itens comprados -> comprada", () => {
    expect(statusSolicitacaoAposFechamento(3, 3)).toBe("comprada");
  });

  it("sobrou item sem vencedor -> parcialmente_comprada (decisao 6)", () => {
    expect(statusSolicitacaoAposFechamento(3, 2)).toBe("parcialmente_comprada");
  });

  it("nada comprado tambem fica parcialmente_comprada: o contrato nao tem outro status para isso", () => {
    expect(statusSolicitacaoAposFechamento(3, 0)).toBe("parcialmente_comprada");
  });
});

describe("motivoDecisao", () => {
  const preco = (custoFinalUnitario: number | null, indisponivel = false): PropostaParaMotivo => ({
    indisponivel,
    custoFinalUnitario
  });

  it("nenhuma proposta -> sem_resposta", () => {
    expect(motivoDecisao([], 10)).toBe("sem_resposta");
  });

  it("todos disseram que nao tem -> indisponivel", () => {
    expect(motivoDecisao([preco(null, true), preco(null, true)], 10)).toBe("indisponivel");
  });

  it("proposta sem custo gravado (falha da compra automatica) -> custo_nao_calculado", () => {
    expect(motivoDecisao([preco(null)], 10)).toBe("custo_nao_calculado");
  });

  it("sem base, qualquer preco vai para o comprador -> sem_base", () => {
    expect(motivoDecisao([preco(8)], null)).toBe("sem_base");
  });

  it("menor custo acima da base -> acima_da_base", () => {
    expect(motivoDecisao([preco(12), preco(11)], 10)).toBe("acima_da_base");
  });

  it("custo ate a base que nao foi comprado so pode ter sido barrado pelo teto da rodada -> teto", () => {
    expect(motivoDecisao([preco(10)], 10)).toBe("teto");
    expect(motivoDecisao([preco(12), preco(9)], 10)).toBe("teto");
  });

  it("indisponivel de um fornecedor nao esconde o preco de outro", () => {
    expect(motivoDecisao([preco(null, true), preco(12)], 10)).toBe("acima_da_base");
  });

  it("decide pelo MENOR custo entre todos os fornecedores (um barato basta para nao ser acima da base)", () => {
    expect(motivoDecisao([preco(30), preco(12), preco(10.5)], 10)).toBe("acima_da_base");
    expect(motivoDecisao([preco(30), preco(12), preco(9.99)], 10)).toBe("teto");
  });

  it("proposta sem custo ao lado de uma com custo: decide pela que tem custo", () => {
    expect(motivoDecisao([preco(null), preco(8)], null)).toBe("sem_base");
    expect(motivoDecisao([preco(null), preco(12)], 10)).toBe("acima_da_base");
  });

  it("todo motivo possivel tem um caso acima (nenhum motivo novo entra sem teste)", () => {
    const cobertos = new Set([
      motivoDecisao([], 10),
      motivoDecisao([preco(null, true)], 10),
      motivoDecisao([preco(null)], 10),
      motivoDecisao([preco(8)], null),
      motivoDecisao([preco(12)], 10),
      motivoDecisao([preco(10)], 10)
    ]);
    expect([...cobertos].sort()).toEqual([...motivosDecisao].sort());
  });
});

describe("aprovarExcecaoPayloadSchema", () => {
  const uuid = "11111111-1111-4111-8111-111111111111";

  it("aceita empresa e item de proposta", () => {
    expect(aprovarExcecaoPayloadSchema.safeParse({ empresaId: uuid, propostaItemId: uuid }).success).toBe(true);
  });

  it("recusa sem o item de proposta: o comprador escolhe QUAL proposta aprova", () => {
    expect(aprovarExcecaoPayloadSchema.safeParse({ empresaId: uuid }).success).toBe(false);
  });

  it("recusa id que nao e uuid e descarta campo extra (quem aprova vem da sessao, nunca do corpo)", () => {
    expect(aprovarExcecaoPayloadSchema.safeParse({ empresaId: uuid, propostaItemId: "1' or '1'='1" }).success).toBe(
      false
    );
    const lido = aprovarExcecaoPayloadSchema.parse({ empresaId: uuid, propostaItemId: uuid, aprovadoPor: "outra" });
    // Doc 58 §4: reajustar a referencia e escolha explicita; sem ela, aceitar nao mexe na referencia.
    expect(lido).toEqual({ empresaId: uuid, propostaItemId: uuid, reajustarReferencia: false });
  });
});
