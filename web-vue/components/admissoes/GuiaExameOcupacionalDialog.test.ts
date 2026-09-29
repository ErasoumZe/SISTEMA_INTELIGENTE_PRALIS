import { mount } from "@vue/test-utils";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import type { ProcessoDetalheDto } from "@padaria/shared";
import GuiaExameOcupacionalDialog from "~/components/admissoes/GuiaExameOcupacionalDialog.vue";

const processo: ProcessoDetalheDto = {
  id: "processo-1",
  origem: "admissao_direta",
  status: "iniciado",
  situacao: "ativo",
  versao: 1,
  testeId: null,
  nomeCompleto: "Maria da Silva",
  cpfMascarado: "•••.•••.•••-••",
  funcaoNome: "Padeira",
  turnoEtiqueta: "M",
  turnoRotulo: "Manhã",
  turnoHoraInicio: "06:00:00",
  turnoHoraFim: "14:00:00",
  turnoDiasSemana: ["SEGUNDA"],
  jornadaHorario: null,
  fichaSituacao: "aprovada",
  efetivado: false,
  dataEfetivacao: null,
  internos: {
    versao: 1,
    dataAdmissao: "2026-10-01",
    ctpsNumero: null,
    ctpsSerie: null,
    ctpsUf: null,
    pisPasepNit: null,
    exameTipo: "admissional",
    exameClinica: "AcessaMed+",
    exameUnidade: "centro",
    exameComplementares: "nao",
    exameAgendadoPara: "2026-10-01T12:00:00.000Z",
    exameResponsavelNome: "Ana do DP",
    exameResponsavelTelefone: "3230316269",
    observacoesRh: null,
    exameSituacao: "agendado",
    exameExigeAtencao: true,
    exameAtualizadoPorNome: "Ana do DP",
    exameAtualizadoEm: "2026-09-29T12:00:00.000Z"
  },
  criadoPorNome: "Ana do DP",
  criadoEm: "2026-09-29T12:00:00.000Z",
  atualizadoPorNome: "Ana do DP",
  atualizadoEm: "2026-09-29T12:00:00.000Z",
  canceladoPorNome: null,
  canceladoEm: null
};

beforeAll(() => {
  class ObservadorInerte {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal("ResizeObserver", ObservadorInerte);
  vi.stubGlobal("IntersectionObserver", ObservadorInerte);
  vi.stubGlobal("visualViewport", {
    width: 1280,
    height: 800,
    offsetLeft: 0,
    offsetTop: 0,
    scale: 1,
    addEventListener() {},
    removeEventListener() {}
  });
});

beforeEach(() => {
  document.body.innerHTML = "";
});

function montar(cpf: string | null) {
  return mount(GuiaExameOcupacionalDialog, {
    attachTo: document.body,
    global: { plugins: [createVuetify({ components, directives })], stubs: { transition: false } },
    props: {
      aberto: true,
      processo,
      cpf,
      empresaNome: "TNP Central",
      empresaCnpj: "12345678000199"
    }
  });
}

describe("GuiaExameOcupacionalDialog", () => {
  it("mostra somente os dados conferidos e bloqueia impressao sem CPF revelado", () => {
    const tela = montar(null);
    expect(document.body.textContent).toContain("CPF não foi revelado");
    const imprimir = [...document.querySelectorAll("button")].find((botao) => botao.textContent?.includes("Imprimir"));
    expect(imprimir?.hasAttribute("disabled")).toBe(true);
    expect(document.body.textContent).toContain("AcessaMed+");
    expect(document.body.textContent).toContain("Nascimento, RG, setor e CBO");
    tela.unmount();
  });

  it("libera a impressao depois da revelacao auditada do CPF", () => {
    const tela = montar("12345678901");
    const imprimir = [...document.querySelectorAll("button")].find((botao) => botao.textContent?.includes("Imprimir"));
    expect(imprimir?.hasAttribute("disabled")).toBe(false);
    expect(document.body.textContent).toContain("12345678901");
    tela.unmount();
  });
});
