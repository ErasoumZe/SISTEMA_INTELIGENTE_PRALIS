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
    expect(texto).toContain("Abertura A-1001");
    expect(texto).toContain("Fechamento F-1001");
    expect(texto).toContain("1 bolsa");
    expect(texto).toContain("Disponível");
    expect(texto).toContain("Previsto: PDV 1");
    expect(texto).toContain("por Leo");
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

  it("as acoes seguem as mesmas permissoes de antes", () => {
    const semPermissao = montar();
    expect(semPermissao.find('[data-teste="botao-editar"]').exists()).toBe(false);
    expect(semPermissao.find('[data-teste="botao-conferir"]').exists()).toBe(false);

    const comPermissao = montar({ podeEditar: true, podeConferir: true });
    expect(comPermissao.find('[data-teste="botao-editar"]').exists()).toBe(true);
    expect(comPermissao.find('[data-teste="botao-conferir"]').exists()).toBe(true);

    const recebida = { ...base, status: "recebido" } as unknown as OperacaoResumo;
    const naoEditaRecebida = montar({ podeEditar: true, podeConferir: true }, recebida);
    expect(naoEditaRecebida.find('[data-teste="botao-editar"]').exists()).toBe(false);
    expect(naoEditaRecebida.find('[data-teste="botao-conferir"]').exists()).toBe(false);

    const comPlano = { ...base, possuiPlanejamentoRetorno: true } as unknown as OperacaoResumo;
    expect(
      montar({ podeEditar: true, podeConferir: true }, comPlano).find('[data-teste="botao-conferir"]').exists()
    ).toBe(false);
  });

  it("conferir, editar e cancelar emitem o evento com a operacao", async () => {
    const wrapper = montar({ podeEditar: true, podeConferir: true });
    await wrapper.get('[data-teste="botao-conferir"]').trigger("click");
    await wrapper.get('[data-teste="botao-editar"]').trigger("click");
    expect(wrapper.emitted("conferir")?.[0]).toEqual([base]);
    expect(wrapper.emitted("editar")?.[0]).toEqual([base]);

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
    expect(texto).toContain("Lacre DEP-9001");
    expect(texto).toContain("Pendente");
    expect(texto).not.toContain("Composição não informada");
  });
});
