import { describe, expect, it } from "vitest";
import {
  comandaCreareSchema,
  comandasConsultaSchema,
  montarLinhaDoTempo,
  retratoComandasCreareSchema,
  segundosEntre,
  situacaoComanda
} from "@padaria/shared/comandas-creare";

// R-248: situacao da comanda do CREARE e contratos do robo/S2, sem banco.
const AGORA = new Date("2026-11-25T15:00:00.000Z");
const antes = (minutos: number) => new Date(AGORA.getTime() - minutos * 60_000).toISOString();
const tempos = (status: number, abertaMin: number, ultimoMin: number | null, puxadaMin: number | null = null) => ({
  status,
  abertaEm: antes(abertaMin),
  ultimoLancamentoEm: ultimoMin === null ? null : antes(ultimoMin),
  puxadaEm: puxadaMin === null ? null : antes(puxadaMin)
});

describe("comandas do CREARE - situacao", () => {
  it("Deve_SeguirOStatusDoCreare_ParaFechadaCanceladaEStatus4", () => {
    expect(situacaoComanda(tempos(5, 10, 5), AGORA)).toBe("fechada");
    expect(situacaoComanda(tempos(3, 10, 5), AGORA)).toBe("cancelada");
    expect(situacaoComanda(tempos(4, 10, 5), AGORA)).toBe("esquecida");
  });

  it("Deve_MarcarAbertaEPuxada_DentroDosLimites", () => {
    expect(situacaoComanda(tempos(1, 30, 5), AGORA)).toBe("aberta");
    expect(situacaoComanda(tempos(2, 30, 5, 2), AGORA)).toBe("puxada");
  });

  it("Deve_MarcarAbandonada_QuandoPuxadaHaMaisDeUmaHora", () => {
    // Pelo log do CREARE (puxadaEm) e, sem ele, pelo ultimo lancamento.
    expect(situacaoComanda(tempos(2, 200, 5, 61), AGORA)).toBe("abandonada");
    expect(situacaoComanda(tempos(2, 200, 61), AGORA)).toBe("abandonada");
    expect(situacaoComanda(tempos(2, 200, 59), AGORA)).toBe("puxada");
  });

  it("Deve_MarcarEsquecida_SemLancamentoHaMaisDe24h", () => {
    expect(situacaoComanda(tempos(1, 3000, 1500), AGORA)).toBe("esquecida");
    expect(situacaoComanda(tempos(2, 3000, 1500), AGORA)).toBe("esquecida");
    // Sem lancamento nenhum: conta a abertura.
    expect(situacaoComanda(tempos(1, 1500, null), AGORA)).toBe("esquecida");
  });

  it("Deve_MarcarConta_QuandoAbertaHaDiasMasAindaRecebendoItens", () => {
    // Como as comandas 1 e 430: aberta ha 3 dias, item lancado ha 2 h. Fica fora do alerta de abandonada.
    expect(situacaoComanda(tempos(2, 4320, 120), AGORA)).toBe("conta");
    expect(situacaoComanda(tempos(1, 4320, 10), AGORA)).toBe("conta");
  });

  it("Deve_CalcularSegundos_SoComOsDoisInstantesEmOrdem", () => {
    expect(segundosEntre(antes(10), antes(5))).toBe(300);
    expect(segundosEntre(null, antes(5))).toBeNull();
    expect(segundosEntre(antes(5), antes(10))).toBeNull();
  });

  it("Deve_MontarALinhaDoTempoEmOrdem_SemPuxadaAproximada", () => {
    const itens = [
      {
        idItem: 2,
        produtoCodigo: null,
        descricao: "CAFE",
        quantidade: 1,
        valorTotalCentavos: 500,
        funcionario: "Ana",
        cancelado: true,
        motivoCancelamento: "x",
        lancadoEm: antes(20)
      },
      {
        idItem: 1,
        produtoCodigo: null,
        descricao: "PAO",
        quantidade: 1,
        valorTotalCentavos: 1250,
        funcionario: null,
        cancelado: false,
        motivoCancelamento: null,
        lancadoEm: antes(25)
      }
    ];
    const comPuxada = montarLinhaDoTempo(
      { status: 5, abertaEm: antes(30), puxadaEm: antes(6), puxadaAproximada: false, fechadaEm: antes(5) },
      itens
    );
    expect(comPuxada.map((evento) => evento.tipo)).toEqual(["abriu", "item", "item_cancelado", "puxada", "fechada"]);
    expect(comPuxada[2]?.texto).toContain("por Ana");
    const semPuxada = montarLinhaDoTempo(
      { status: 2, abertaEm: antes(30), puxadaEm: antes(20), puxadaAproximada: true, fechadaEm: null },
      itens
    );
    expect(semPuxada.map((evento) => evento.tipo)).toEqual(["abriu", "item", "item_cancelado"]);
  });
});

describe("comandas do CREARE - contratos", () => {
  it("Deve_CortarTextoLongo_E_TransformarVazioEmNulo", () => {
    const comanda = comandaCreareSchema.parse({
      idComanda: 1,
      numero: 1,
      status: 1,
      valorSubtotal: 1,
      valorDesconto: 0,
      valorTotal: 1,
      nomeCliente: "   ",
      observacao: "o".repeat(900),
      itens: []
    });
    expect(comanda.nomeCliente).toBeNull();
    expect(comanda.observacao).toHaveLength(500);
    expect(comanda.abertaEm).toBeNull();
  });

  it("Deve_RecusarLoteForaDosLimites", () => {
    expect(() => retratoComandasCreareSchema.parse({ abertasIds: [0] })).toThrow();
    expect(() =>
      retratoComandasCreareSchema.parse({ abertasIds: Array.from({ length: 20_001 }, (_, i) => i + 1) })
    ).toThrow();
    expect(() =>
      comandaCreareSchema.parse({
        idComanda: 1,
        numero: 1,
        status: 1,
        valorSubtotal: 0,
        valorDesconto: 0,
        valorTotal: 0,
        itens: [],
        abertaEm: "ontem"
      })
    ).toThrow();
  });

  it("Deve_LerAConsultaDoS2_ComPadroes", () => {
    expect(comandasConsultaSchema.parse({})).toMatchObject({ aba: "abertas", pagina: 1, porPagina: 50 });
    expect(
      comandasConsultaSchema.parse({ aba: "fechadas", dia: "2026-11-25", numero: "430", funcionario: "" })
    ).toMatchObject({
      dia: "2026-11-25",
      numero: 430,
      funcionario: undefined
    });
    expect(() => comandasConsultaSchema.parse({ dia: "2026-02-31" })).toThrow();
    expect(() => comandasConsultaSchema.parse({ porPagina: 500 })).toThrow();
  });
});
