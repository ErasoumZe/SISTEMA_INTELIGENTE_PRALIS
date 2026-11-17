import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { AuditoriaDia, CaixaAuditoria } from "@padaria/shared";
import AuditoriaPdvDia from "./AuditoriaPdvDia.vue";
import AuditoriaPdvFiltros, { type FiltrosAuditoria } from "./AuditoriaPdvFiltros.vue";

const botao = { template: '<button v-bind="$attrs"><slot /></button>' };
const stubs = {
  "v-btn": botao,
  "v-chip": { template: "<span><slot /></span>" },
  "v-text-field": true,
  "v-select": true
};

const caixa = (turno: CaixaAuditoria["turno"], operador: string, vendas: number, total: number): CaixaAuditoria => ({
  caixaId: `${turno}-${operador}`,
  turno,
  operador,
  abertura: "2026-11-14T10:00:00Z",
  fechamento: "2026-11-14T16:00:00Z",
  status: "fechado",
  vendas,
  total,
  formas: [{ categoria: "pix", valor: total }]
});

function dia(caixas: CaixaAuditoria[], fora: AuditoriaDia["pdvs"][number]["fora"] = []): AuditoriaDia {
  const vendas = caixas.reduce((s, c) => s + c.vendas, 0) + fora.length;
  const total = caixas.reduce((s, c) => s + c.total, 0) + fora.reduce((s, v) => s + v.valor, 0);
  return {
    data: "2026-11-14",
    status: fora.length ? "alerta" : "ok",
    vendas,
    total,
    vendasFora: fora.length,
    valorFora: fora.reduce((s, v) => s + v.valor, 0),
    gerada: null,
    pdvs: [{ pdvId: "pdv-1", pdvNome: "PDV 1", status: fora.length ? "alerta" : "ok", vendas, total, caixas, fora }]
  };
}

const montarDia = (d: AuditoriaDia) => mount(AuditoriaPdvDia, { props: { dia: d, gerando: false }, global: { stubs } });

describe("AuditoriaPdvDia", () => {
  it("mostra Manha e Tarde lado a lado e o total do dia somado no PDV", () => {
    const tela = montarDia(dia([caixa("manha", "Ana", 4, 100), caixa("tarde", "Bia", 2, 50.5)]));
    const colunas = tela.findAll(".auditoria-turno");
    expect(colunas.map((c) => c.find(".auditoria-turno__nome").text())).toEqual(["Manhã", "Tarde"]);
    expect(colunas[0]!.text()).toContain("Ana");
    expect(colunas[1]!.text()).toContain("Bia");
    expect(tela.find(".auditoria-pdv__dia").text()).toContain("Dia (manhã + tarde): 6 vendas");
    expect(tela.find(".auditoria-pdv__dia").text()).toContain("150,50");
  });

  it("turno sem caixa aparece vazio e caixa sem turno ganha coluna propria", () => {
    const tela = montarDia(dia([caixa("manha", "Ana", 1, 10), caixa(null, "Caio", 1, 5)]));
    const colunas = tela.findAll(".auditoria-turno");
    expect(colunas.map((c) => c.find(".auditoria-turno__nome").text())).toEqual(["Manhã", "Tarde", "Sem turno"]);
    expect(colunas[1]!.text()).toContain("Sem caixa neste turno.");
    expect(colunas[2]!.text()).toContain("Caio");
  });

  it("lista as vendas fora de caixa com produtos e pede para gerar", async () => {
    const tela = montarDia(
      dia(
        [caixa("manha", "Ana", 1, 10)],
        [
          {
            vendaId: "v-1",
            hora: "2026-11-14T15:00:00Z",
            valor: 12.5,
            formas: [{ categoria: "dinheiro", valor: 12.5 }],
            produtos: [{ descricao: "Pão de queijo", quantidade: 2 }]
          }
        ]
      )
    );
    const alerta = tela.find(".auditoria-pdv__fora");
    expect(alerta.attributes("role")).toBe("alert");
    expect(alerta.text()).toContain("1 venda(s) sem caixa aberto");
    expect(alerta.text()).toContain("12:00");
    expect(alerta.text()).toContain("2× Pão de queijo");
    await tela.find('[data-teste="gerar-auditoria"]').trigger("click");
    expect(tela.emitted("gerar")).toHaveLength(1);
  });
});

describe("AuditoriaPdvFiltros", () => {
  const base: FiltrosAuditoria = {
    inicio: "2026-11-10",
    fim: "2026-11-16",
    pdvId: "pdv-1",
    turno: "manha",
    horaInicio: "08:00",
    horaFim: "",
    forma: null,
    status: null
  };
  const montar = () =>
    mount(AuditoriaPdvFiltros, {
      props: { modelValue: base, pdvs: [{ id: "pdv-1", nome: "PDV 1" }], hoje: "2026-11-16" },
      global: { stubs }
    });

  it("atalho de periodo marca o ativo e troca as datas", async () => {
    const tela = montar();
    const atalhos = tela.findAll('[role="group"] button');
    expect(atalhos.map((b) => b.text())).toEqual(["Hoje", "Ontem", "7 dias", "30 dias"]);
    expect(atalhos[2]!.attributes("aria-pressed")).toBe("true");
    await atalhos[1]!.trigger("click");
    expect(tela.emitted("update:modelValue")?.[0]?.[0]).toMatchObject({ inicio: "2026-11-15", fim: "2026-11-15" });
  });

  it("conta os filtros ativos e limpa sem mexer no periodo", async () => {
    const tela = montar();
    expect(tela.text()).toContain("3 filtro");
    // Turno escolhido: avisa que venda fora de caixa some com esse filtro.
    expect(tela.find('[data-teste="filtro-avisos"]').text()).toContain("vendas fora de caixa não aparecem");
    const limpar = tela.findAll("button").find((b) => b.text().includes("Limpar"));
    await limpar!.trigger("click");
    expect(tela.emitted("update:modelValue")?.[0]?.[0]).toEqual({
      ...base,
      pdvId: null,
      turno: null,
      horaInicio: "",
      horaFim: "",
      forma: null,
      status: null
    });
  });
});
