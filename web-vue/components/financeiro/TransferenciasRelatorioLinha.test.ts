import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { OperacaoResumo } from "~/types/padaria";
import TransferenciasRelatorioLinha from "./TransferenciasRelatorioLinha.vue";

const base = {
  id: "t-1",
  empresaId: "e-1",
  dataReferencia: "2026-10-27",
  descricao: "Malote PDV 1",
  valorOriginal: "300.00",
  computar: true,
  status: "pendente",
  contaOrigemNome: "Cofre",
  contaDestinoNome: "Conta PDV 1",
  nLacreDoc: "A-1001",
  criadoEm: "2026-10-27T14:32:00.000Z",
  criadoPorNome: "Leo",
  valorEspecieDeclarado: 250,
  valorMoedasDeclarado: 50,
  tipoMovimento: "suprimento",
  situacaoMalote: "disponivel",
  pdvsDestino: ["PDV 1"],
  caixa: null,
  lacres: [
    { tipo: "abertura", numero: "A-1001", situacao: "disponivel", usadoEmTransferenciaId: null },
    { tipo: "fechamento", numero: "F-1001", situacao: "reservado", usadoEmTransferenciaId: null },
    { tipo: "sangria", numero: "S-1", situacao: "disponivel", usadoEmTransferenciaId: null }
  ]
} as unknown as OperacaoResumo;

function montar(props: Record<string, unknown> = {}, operacao: OperacaoResumo = base) {
  return mount(TransferenciasRelatorioLinha, {
    props: { operacao, ...props },
    global: {
      stubs: {
        "v-icon": { template: "<i />" },
        "v-menu": { template: '<div><slot name="activator" :props="{}" /><slot /></div>' },
        "v-btn": { template: '<button v-bind="$attrs"><slot /></button>' }
      }
    }
  });
}

describe("TransferenciasRelatorioLinha", () => {
  it("mostra o malote disponivel com valor, composicao, lacres, situacao e PDV previsto", () => {
    const texto = montar().text();
    expect(texto).toContain("Malote");
    expect(texto).toContain("Cofre → Conta PDV 1");
    expect(texto).toContain("300,00");
    expect(texto).toContain("Dinheiro");
    expect(texto).toContain("Moedas");
    expect(texto).toContain("Lacres");
    expect(texto).toContain("Disponível");
    expect(texto).toContain("Previsto: PDV 1");
    expect(texto).toContain("por Leo");
  });

  it("a coluna Lacres e um botao; os numeros ficam no popup, agrupados por tipo e com o estado", () => {
    const wrapper = montar();
    expect(wrapper.get('[data-teste="botao-lacres"]').text()).toContain("3");
    const popup = wrapper.get('[data-teste="popup-lacres"]').text();
    expect(popup).toContain("Abertura");
    expect(popup).toContain("A-1001");
    expect(popup).toContain("F-1001");
    expect(popup).toContain("S-1");
    expect(popup).toContain("Reservado");
  });

  it("numero oculto vira 'Oculto' no popup, nunca vazio", () => {
    const oculto = {
      ...base,
      lacres: [{ tipo: "fechamento", numero: null, situacao: "reservado", usadoEmTransferenciaId: null }]
    } as unknown as OperacaoResumo;
    expect(montar({}, oculto).get('[data-teste="popup-lacres"]').text()).toContain("Oculto");
  });

  it("composicao nao informada aparece como texto, nunca como zero", () => {
    const sem = { ...base, valorEspecieDeclarado: null, valorMoedasDeclarado: null } as unknown as OperacaoResumo;
    expect(montar({}, sem).text()).toContain("Composição não informada");
  });

  it("malote usado mostra PDV e turno do caixa na linha de contexto", () => {
    const usado = {
      ...base,
      status: "recebido",
      tipoMovimento: "abertura",
      situacaoMalote: "usado",
      caixa: {
        id: "cx",
        status: "aberto",
        pdvNome: "PDV 1",
        turnoNome: "Manhã",
        operadorNome: "Ana",
        supervisorNome: "Marcos",
        abertoEm: "2026-10-27T11:00:00.000Z"
      }
    } as unknown as OperacaoResumo;
    const texto = montar({}, usado).text();
    expect(texto).toContain("Usado");
    expect(texto).toContain("PDV 1 · Manhã");
  });

  it("nao existe mais Conferir na tela: a conferencia fica no Relatorio de fechamento", () => {
    const wrapper = montar({ podeEditar: true });
    expect(wrapper.find('[data-teste="botao-conferir"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Conferir");
  });

  it("editar segue a mesma regra de antes e emite a operacao", async () => {
    expect(montar().find('[data-teste="botao-editar"]').exists()).toBe(false);

    const wrapper = montar({ podeEditar: true });
    await wrapper.get('[data-teste="botao-editar"]').trigger("click");
    expect(wrapper.emitted("editar")?.[0]).toEqual([base]);

    const recebida = { ...base, status: "recebido" } as unknown as OperacaoResumo;
    expect(montar({ podeEditar: true }, recebida).find('[data-teste="botao-editar"]').exists()).toBe(false);
  });

  it("cancelar planejamento emite o evento com a operacao", async () => {
    const plano = { ...base, status: "agendada", ehPlanejamentoRetorno: true } as unknown as OperacaoResumo;
    const cancelavel = montar({ podeCancelarPlanejamento: true }, plano);
    await cancelavel.get('[data-teste="cancelar-planejamento-retorno"]').trigger("click");
    expect(cancelavel.emitted("cancelar-planejamento")?.[0]).toEqual([plano]);
  });

  it("o botao de expandir tem aria-expanded e aria-controls, e so o botao emite 'alternar'", async () => {
    const fechada = montar();
    const botao = fechada.get('[data-teste="botao-expandir"]');
    expect(botao.attributes("aria-expanded")).toBe("false");
    expect(botao.attributes("aria-controls")).toBe("detalhe-t-1");
    expect(botao.attributes("aria-label")).toContain("Ver detalhes");
    await botao.trigger("click");
    expect(fechada.emitted("alternar")?.[0]).toEqual(["t-1"]);

    const aberta = montar({ aberta: true });
    expect(aberta.get('[data-teste="botao-expandir"]').attributes("aria-expanded")).toBe("true");
    expect(aberta.find("#detalhe-t-1").exists()).toBe(true);
    expect(aberta.text()).toContain("Ninguém abriu caixa com este malote ainda");
  });

  it("transferencia comum, sem malote, mostra o lacre simples e nenhuma situacao de malote", () => {
    const comum = {
      ...base,
      tipoMovimento: "suprimento",
      situacaoMalote: null,
      pdvsDestino: [],
      lacres: [],
      nLacreDoc: "DEP-9001",
      valorEspecieDeclarado: null,
      valorMoedasDeclarado: null
    } as unknown as OperacaoResumo;
    const texto = montar({}, comum).text();
    expect(texto).toContain("Transferência");
    expect(texto).toContain("Lacres");
    expect(montar({}, comum).get('[data-teste="popup-lacres"]').text()).toContain("DEP-9001");
    expect(texto).toContain("Pendente");
    expect(texto).not.toContain("Composição não informada");
  });
});
