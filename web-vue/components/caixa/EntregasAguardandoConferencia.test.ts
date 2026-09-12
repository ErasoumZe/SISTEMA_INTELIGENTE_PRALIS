import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import EntregasAguardandoConferencia from "~/components/caixa/EntregasAguardandoConferencia.vue";
import type { EntregaCofrePendente } from "~/types/padaria";

// G1/R-171 · o bloco existe para o operador ver a trava ANTES de clicar em fechar, com o lacre na
// mao para cobrar a conferencia. Sem SFC de Vuetify no meio: e HTML puro, monta direto.
function entrega(parcial: Partial<EntregaCofrePendente> = {}): EntregaCofrePendente {
  return {
    id: "e-1",
    tipo: "sangria",
    valor: 200,
    lacre: "LAC-9",
    contaDestinoNome: "Cofre Integracao",
    criadoEm: "2026-08-01T10:00:00.000Z",
    valorContado: null,
    recusaId: null,
    ...parcial
  };
}

describe("EntregasAguardandoConferencia", () => {
  it("nao renderiza nada quando nao ha entrega em transito", () => {
    const tela = mount(EntregasAguardandoConferencia, { props: { entregas: [] } });
    expect(tela.find('[data-teste="entregas-aguardando-conferencia"]').exists()).toBe(false);
  });

  it("mostra valor, tipo e lacre de cada entrega", () => {
    const tela = mount(EntregasAguardandoConferencia, {
      props: { entregas: [entrega(), entrega({ id: "e-2", tipo: "retorno", valor: 50, lacre: "LAC-10" })] }
    });

    const linhas = tela.findAll('[data-teste="entrega-pendente"]');
    expect(linhas).toHaveLength(2);
    // Registros historicos `sangria` continuam legiveis, mas usam a nomenclatura unica R-187.
    expect(linhas[0]?.text()).toContain("Retorno");
    expect(linhas[0]?.text()).toContain("LAC-9");
    expect(linhas[1]?.text()).toContain("Retorno");
    expect(linhas[1]?.text()).toContain("LAC-10");
  });

  it("soma o total em transito — e o numero que o operador precisa cobrar no destino", () => {
    const tela = mount(EntregasAguardandoConferencia, {
      props: { entregas: [entrega({ valor: 200 }), entrega({ id: "e-2", valor: 55.5 })] }
    });
    expect(tela.get(".transito-explica").text()).toContain("255,50");
  });

  it("entrega sem lacre diz que nao tem, em vez de sumir com a informacao", () => {
    const tela = mount(EntregasAguardandoConferencia, { props: { entregas: [entrega({ lacre: null })] } });
    expect(tela.get('[data-teste="entrega-pendente"]').text()).toContain("sem lacre");
  });

  // R-183 · a entrega que o destino JA CONTOU e outra situacao: o fechamento continua travado.
  it("mostra o valor contado quando o destino ja conferiu e ainda nao encerrou", () => {
    const tela = mount(EntregasAguardandoConferencia, {
      props: { entregas: [entrega({ valor: 200, valorContado: 180, recusaId: "r-1" })] }
    });
    expect(tela.get('[data-teste="entrega-pendente"]').text()).toContain("180,00");
    expect(tela.get(".transito-explica").text()).toMatch(/ainda n[aã]o encerrou/iu);
  });

  it("sem contagem, o texto continua mandando conferir no destino", () => {
    const tela = mount(EntregasAguardandoConferencia, { props: { entregas: [entrega()] } });
    expect(tela.get(".transito-explica").text()).toMatch(/conta destino conferir/iu);
    expect(tela.get('[data-teste="entrega-pendente"]').text()).not.toContain("destino contou");
  });

  it("e um grupo rotulado: leitor de tela chega ao bloco pelo titulo, nao por um card anonimo", () => {
    const tela = mount(EntregasAguardandoConferencia, { props: { entregas: [entrega()] } });
    const bloco = tela.get('[data-teste="entregas-aguardando-conferencia"]');
    expect(bloco.attributes("role")).toBe("group");
    expect(bloco.attributes("aria-labelledby")).toBe("transito-titulo");
    expect(tela.get("#transito-titulo").text()).toMatch(/confer[eê]ncia no destino/iu);
  });
});
