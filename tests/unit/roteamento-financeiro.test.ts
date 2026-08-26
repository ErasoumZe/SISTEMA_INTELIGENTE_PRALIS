// R-167/R-168/R-169/R-173 (#152) — a decisao de para onde vai o dinheiro da venda integrada.
//
// Tudo aqui e puro: sem banco, sem HTTP, sem CREARE. Se um dia alguem "simplificar" a decisao e
// reintroduzir um fallback, e aqui que estoura primeiro — e barato.
import { describe, expect, it } from "vitest";
import {
  resolverRoteamentoDoPagamento,
  somaDosPagamentosFecha,
  vendaAceitaRoteamento,
  type StatusRoteamento
} from "@padaria/shared/integracoes";
import { formaPagamentoPayloadSchema, type RoteamentoDaForma } from "@padaria/shared/formas-pagamento";
import { liquidoCentavos, paraCentavos } from "@padaria/shared/dinheiro";

const CONTA_PDV = "11111111-1111-4111-8111-111111111111";
const CONTA_RECEBIVEL = "22222222-2222-4222-8222-222222222222";
const CONTA_FINAL = "33333333-3333-4333-8333-333333333333";
const EMPRESA = "44444444-4444-4444-8444-444444444444";
const AGORA = new Date("2026-08-26T13:00:00.000Z");

const dinheiro: RoteamentoDaForma = {
  adquirente: null,
  usaContaDoPdv: true,
  contaRecebivelId: null,
  contaFinalId: null,
  disponibilidade: "imediata"
};

const cartao: RoteamentoDaForma = {
  adquirente: "Cielo",
  usaContaDoPdv: false,
  contaRecebivelId: CONTA_RECEBIVEL,
  contaFinalId: CONTA_FINAL,
  disponibilidade: "por_evento"
};

const semRoteamento: RoteamentoDaForma = {
  adquirente: null,
  usaContaDoPdv: false,
  contaRecebivelId: null,
  contaFinalId: null,
  disponibilidade: null
};

describe("resolverRoteamentoDoPagamento — dinheiro fisico", () => {
  it("cai na conta do PDV e ja fica disponivel", () => {
    const decisao = resolverRoteamentoDoPagamento({
      roteamento: dinheiro,
      contaDoPdvId: CONTA_PDV,
      dataVenda: AGORA
    });
    expect(decisao.status).toBe("roteado");
    expect(decisao.contaRecebivelId).toBe(CONTA_PDV);
    expect(decisao.contaFinalId).toBe(CONTA_PDV);
    expect(decisao.disponivelEm).toEqual(AGORA);
  });

  // Sem PDV resolvido nao existe "conta mais provavel". Este e o fallback silencioso que a R-168
  // proibe, e o caso que o mata.
  it("sem PDV resolvido vira PENDENTE, nunca a conta do PDV por omissao", () => {
    const decisao = resolverRoteamentoDoPagamento({ roteamento: dinheiro, contaDoPdvId: null, dataVenda: AGORA });
    expect(decisao.status).toBe("pendente");
    expect(decisao.motivo).toBe("pdv_nao_resolvido");
    expect(decisao.contaFinalId).toBeNull();
    expect(decisao.disponivelEm).toBeNull();
  });

  it("sem data da venda vira PENDENTE em vez de inventar o instante", () => {
    const decisao = resolverRoteamentoDoPagamento({ roteamento: dinheiro, contaDoPdvId: CONTA_PDV, dataVenda: null });
    expect(decisao.status).toBe("pendente");
    expect(decisao.motivo).toBe("venda_sem_data");
  });
});

describe("resolverRoteamentoDoPagamento — cartao, Pix e voucher", () => {
  // R-169: recebivel e saldo disponivel sao estados DIFERENTES. Roteado, sim; gastavel, nao.
  it("cria recebivel e NAO fica disponivel", () => {
    const decisao = resolverRoteamentoDoPagamento({ roteamento: cartao, contaDoPdvId: CONTA_PDV, dataVenda: AGORA });
    expect(decisao.status).toBe("roteado");
    expect(decisao.contaRecebivelId).toBe(CONTA_RECEBIVEL);
    expect(decisao.contaFinalId).toBe(CONTA_FINAL);
    expect(decisao.disponivelEm).toBeNull();
    expect(decisao.adquirente).toBe("Cielo");
  });

  // O PDV existir nao pode "promover" o cartao para dinheiro do caixa.
  it("ter conta de PDV resolvida nao torna o cartao disponivel", () => {
    const comPdv = resolverRoteamentoDoPagamento({ roteamento: cartao, contaDoPdvId: CONTA_PDV, dataVenda: AGORA });
    const semPdv = resolverRoteamentoDoPagamento({ roteamento: cartao, contaDoPdvId: null, dataVenda: AGORA });
    expect(comPdv.disponivelEm).toBeNull();
    expect(semPdv.disponivelEm).toBeNull();
    expect(semPdv.contaFinalId).toBe(CONTA_FINAL);
  });
});

describe("resolverRoteamentoDoPagamento — sem cadastro", () => {
  it("forma desconhecida vira PENDENTE sem destino", () => {
    const decisao = resolverRoteamentoDoPagamento({ roteamento: null, contaDoPdvId: CONTA_PDV, dataVenda: AGORA });
    expect(decisao.status).toBe("pendente");
    expect(decisao.motivo).toBe("forma_sem_cadastro");
  });

  it("forma cadastrada mas sem roteamento vira PENDENTE", () => {
    const decisao = resolverRoteamentoDoPagamento({
      roteamento: semRoteamento,
      contaDoPdvId: CONTA_PDV,
      dataVenda: AGORA
    });
    expect(decisao.status).toBe("pendente");
    expect(decisao.motivo).toBe("forma_sem_roteamento");
  });

  // A varredura completa: NENHUMA entrada produz destino sem cadastro explicito.
  it("nenhum caminho sem cadastro produz conta de destino", () => {
    const entradas = [
      { roteamento: null, contaDoPdvId: CONTA_PDV, dataVenda: AGORA },
      { roteamento: null, contaDoPdvId: null, dataVenda: AGORA },
      { roteamento: semRoteamento, contaDoPdvId: CONTA_PDV, dataVenda: AGORA },
      { roteamento: semRoteamento, contaDoPdvId: null, dataVenda: null }
    ];
    for (const entrada of entradas) {
      const decisao = resolverRoteamentoDoPagamento(entrada);
      expect(decisao.contaRecebivelId, JSON.stringify(entrada)).toBeNull();
      expect(decisao.contaFinalId, JSON.stringify(entrada)).toBeNull();
      expect(decisao.disponivelEm, JSON.stringify(entrada)).toBeNull();
    }
  });
});

describe("somaDosPagamentosFecha — R-173, tolerancia ZERO", () => {
  it("soma exata fecha", () => {
    const liquido = liquidoCentavos({ valorOriginal: 100, valorDesconto: 0, valorAcrescimo: 0 });
    const resultado = somaDosPagamentosFecha({
      liquidoCentavos: liquido,
      pagamentosCentavos: [paraCentavos(40), paraCentavos(60)]
    });
    expect(resultado.fecha).toBe(true);
    expect(resultado.diferencaCentavos).toBe(0);
  });

  // UM centavo ja e divergencia. O TOLERANCIA_CONCILIACAO_CENTAVOS = 1 e de outra pergunta
  // (conferencia de totais do dia por PDV) e reusa-lo aqui inventaria tolerancia onde a R-170
  // escreveu R$ 0,00.
  it("um centavo a menos NAO fecha", () => {
    const resultado = somaDosPagamentosFecha({ liquidoCentavos: 10_000, pagamentosCentavos: [9_999] });
    expect(resultado.fecha).toBe(false);
    expect(resultado.diferencaCentavos).toBe(-1);
  });

  it("um centavo a mais NAO fecha", () => {
    const resultado = somaDosPagamentosFecha({ liquidoCentavos: 10_000, pagamentosCentavos: [10_001] });
    expect(resultado.fecha).toBe(false);
    expect(resultado.diferencaCentavos).toBe(1);
  });

  // A fórmula do liquido e UMA so: original - desconto + acrescimo.
  it("usa o liquido, nao o valor original", () => {
    const liquido = liquidoCentavos({ valorOriginal: 100, valorDesconto: 10, valorAcrescimo: 5 });
    expect(liquido).toBe(9_500);
    expect(somaDosPagamentosFecha({ liquidoCentavos: liquido, pagamentosCentavos: [9_500] }).fecha).toBe(true);
    expect(somaDosPagamentosFecha({ liquidoCentavos: liquido, pagamentosCentavos: [10_000] }).fecha).toBe(false);
  });

  it("venda sem pagamento nenhum nao fecha quando ha liquido", () => {
    expect(somaDosPagamentosFecha({ liquidoCentavos: 10_000, pagamentosCentavos: [] }).fecha).toBe(false);
  });
});

describe("vendaAceitaRoteamento — corte historico da R-166", () => {
  it("venda sendo criada agora e sempre aplicavel", () => {
    expect(vendaAceitaRoteamento({ criando: true, statusExistentes: [] })).toBe(true);
  });

  // O reenvio de venda ANTIGA nao pode ativar roteamento: seria regularizacao de historico.
  it("reenvio de venda historica continua nao aplicavel", () => {
    const historicos: StatusRoteamento[] = ["nao_aplicavel", "nao_aplicavel"];
    expect(vendaAceitaRoteamento({ criando: false, statusExistentes: historicos })).toBe(false);
  });

  it("reenvio de venda nova preserva o roteamento", () => {
    expect(vendaAceitaRoteamento({ criando: false, statusExistentes: ["roteado", "pendente"] })).toBe(true);
    expect(vendaAceitaRoteamento({ criando: false, statusExistentes: ["pendente"] })).toBe(true);
  });

  // Borda resolvida para o lado seguro: sem pagamento gravado nao ha como provar que a venda nasceu
  // do codigo novo, entao ela e tratada como historica. Custa uma pendencia; nunca credita a mais.
  it("venda existente sem pagamento nenhum e tratada como historica", () => {
    expect(vendaAceitaRoteamento({ criando: false, statusExistentes: [] })).toBe(false);
  });
});

describe("formaPagamentoPayloadSchema — o cadastro recusa o meio-caminho", () => {
  const base = { empresaId: EMPRESA, nome: "Cartao" };

  it("aceita forma sem roteamento nenhum", () => {
    expect(formaPagamentoPayloadSchema.safeParse(base).success).toBe(true);
  });

  it("aceita dinheiro na conta do PDV", () => {
    const resultado = formaPagamentoPayloadSchema.safeParse({
      ...base,
      disponibilidade: "imediata",
      usaContaDoPdv: true
    });
    expect(resultado.success).toBe(true);
  });

  it("aceita recebivel com as duas contas", () => {
    const resultado = formaPagamentoPayloadSchema.safeParse({
      ...base,
      disponibilidade: "por_evento",
      contaRecebivelId: CONTA_RECEBIVEL,
      contaFinalId: CONTA_FINAL
    });
    expect(resultado.success).toBe(true);
  });

  // O estado perigoso: checkbox marcado e disponibilidade em branco. Sem esta recusa, o dinheiro
  // viraria saldo GASTAVEL na conta do PDV por uma forma que ninguem terminou de cadastrar.
  it("recusa a forma meio-cadastrada (conta do PDV sem disponibilidade)", () => {
    const resultado = formaPagamentoPayloadSchema.safeParse({ ...base, usaContaDoPdv: true });
    expect(resultado.success).toBe(false);
    expect(JSON.stringify(resultado.error?.issues)).toContain("disponibilidade");
  });

  it("recusa por_evento sem as contas", () => {
    expect(formaPagamentoPayloadSchema.safeParse({ ...base, disponibilidade: "por_evento" }).success).toBe(false);
  });

  it("recusa por_evento com apenas uma das contas", () => {
    const resultado = formaPagamentoPayloadSchema.safeParse({
      ...base,
      disponibilidade: "por_evento",
      contaFinalId: CONTA_FINAL
    });
    expect(resultado.success).toBe(false);
  });

  it("recusa imediata com conta explicita (contradicao)", () => {
    const resultado = formaPagamentoPayloadSchema.safeParse({
      ...base,
      disponibilidade: "imediata",
      usaContaDoPdv: true,
      contaFinalId: CONTA_FINAL
    });
    expect(resultado.success).toBe(false);
  });

  it("recusa disponibilidade fora do dominio", () => {
    const resultado = formaPagamentoPayloadSchema.safeParse({ ...base, disponibilidade: "quando_der" });
    expect(resultado.success).toBe(false);
  });
});
