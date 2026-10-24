import { describe, expect, it } from "vitest";
import {
  ROTAS_QUESTOR,
  codigoQuestorAtualizacaoSchema,
  codigosQuestorQuerySchema,
  configuracaoQuestorDtoSchema,
  configuracaoQuestorPayloadSchema,
  contratoQuestorDtoSchema,
  funcaoQuestorRequisicaoSchema,
  turnoQuestorRequisicaoSchema
} from "../../shared/src/conplus/index.js";

const LIDO = "2026-10-22T12:00:00.000Z";

describe("contratos HTTP Questor (E2/E3/E4)", () => {
  it("nenhuma rota recebe a empresa pela URL", () => {
    for (const rota of Object.values(ROTAS_QUESTOR)) expect(rota).not.toMatch(/empresa/iu);
  });

  it("corpo com empresaId ou campo desconhecido é recusado", () => {
    expect(funcaoQuestorRequisicaoSchema.safeParse({ atualizadoEmLido: LIDO, empresaId: "x" }).success).toBe(false);
    expect(turnoQuestorRequisicaoSchema.safeParse({ atualizadoEmLido: LIDO, questorCodigoEscalaX: "1" }).success).toBe(
      false
    );
    expect(codigoQuestorAtualizacaoSchema.safeParse({ descricao: "Nova", empresaId: "x" }).success).toBe(false);
  });

  it("função e turno exigem o atualizadoEm lido (concorrência otimista)", () => {
    expect(funcaoQuestorRequisicaoSchema.safeParse({ questorCodigoCargo: "904" }).success).toBe(false);
    expect(funcaoQuestorRequisicaoSchema.parse({ atualizadoEmLido: LIDO })).toEqual({
      atualizadoEmLido: LIDO,
      questorCodigoCargo: null,
      questorAgenteNocivo: null
    });
  });

  it("PATCH do catálogo não troca código nem tabela", () => {
    expect(codigoQuestorAtualizacaoSchema.safeParse({ codigo: "1" }).success).toBe(false);
    expect(codigoQuestorAtualizacaoSchema.safeParse({ tabela: "cargo" }).success).toBe(false);
    expect(codigoQuestorAtualizacaoSchema.safeParse({}).success).toBe(false);
    expect(codigoQuestorAtualizacaoSchema.safeParse({ ativo: false }).success).toBe(true);
  });

  it("filtro do catálogo aceita só tabelas conhecidas", () => {
    expect(codigosQuestorQuerySchema.parse({ tabela: "cargo", incluirInativos: "true" })).toEqual({
      tabela: "cargo",
      incluirInativos: true
    });
    expect(codigosQuestorQuerySchema.safeParse({ tabela: "evento" }).success).toBe(false);
  });

  it("configuração: versão 0 cria; DTO vazio representa empresa sem configuração", () => {
    expect(configuracaoQuestorPayloadSchema.safeParse({ versao: 0 }).success).toBe(true);
    expect(configuracaoQuestorPayloadSchema.safeParse({ versao: -1 }).success).toBe(false);
    expect(
      configuracaoQuestorDtoSchema.safeParse({
        versao: 0,
        codigoEstabelecimento: null,
        classificacaoOrganograma: null,
        utilizaHoraCentesimal: null,
        codigoEmpresaQuestor: null,
        razaoSocialQuestor: null,
        padroes: {},
        atualizadoEm: null,
        atualizadoPorNome: null
      }).success
    ).toBe(true);
  });

  it("DTO do contrato aceita tudo pendente (nulo)", () => {
    const vazio = Object.fromEntries(Object.keys(contratoQuestorDtoSchema.shape).map((chave) => [chave, null]));
    expect(
      contratoQuestorDtoSchema.safeParse({ ...vazio, processoId: "11111111-1111-4111-8111-111111119f20", versao: 1 })
        .success
    ).toBe(true);
  });
});
