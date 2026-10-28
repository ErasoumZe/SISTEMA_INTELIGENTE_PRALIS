import { flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RelatorioFechamentoTransferencias from "./RelatorioFechamentoTransferencias.vue";

const itens = [
  {
    id: "t-2",
    status: "pendente",
    tipoMovimento: "retorno",
    situacaoMalote: null,
    valorOriginal: "180.00",
    valorEspecieDeclarado: 150,
    valorMoedasDeclarado: 30,
    nLacreDoc: null,
    criadoEm: "2026-10-27T17:14:54.000Z"
  },
  {
    id: "t-1",
    status: "recebido",
    tipoMovimento: "abertura",
    situacaoMalote: "usado",
    valorOriginal: "300.00",
    valorEspecieDeclarado: 250,
    valorMoedasDeclarado: 50,
    nLacreDoc: "A-1001",
    criadoEm: "2026-10-27T14:13:01.000Z"
  }
];
const apiGetPaginado = vi.fn();
const apiPost = vi.fn();

beforeEach(() => {
  apiGetPaginado.mockReset();
  apiPost.mockReset();
  apiPost.mockResolvedValue({});
  apiGetPaginado.mockResolvedValue({ itens, total: 2 });
  vi.stubGlobal("useApi", () => ({ apiGetPaginado, apiPost }));
});

function montar(podeConferir: boolean, lacreFechamentoInformado: string | null = null) {
  return shallowMount(RelatorioFechamentoTransferencias, {
    props: { empresaId: "e-1", caixaId: "cx-1", podeConferir, lacreFechamentoInformado },
    global: {
      stubs: {
        SituacaoMalote: true,
        "v-chip": { template: "<span><slot /></span>" },
        "v-btn": { template: '<button v-bind="$attrs"><slot /></button>' },
        "v-alert": { template: "<div><slot /></div>" },
        "v-progress-linear": true
      }
    }
  });
}

describe("RelatorioFechamentoTransferencias", () => {
  it("busca as transferencias deste caixa e lista em ordem cronologica", async () => {
    const wrapper = montar(true);
    await flushPromises();
    expect(apiGetPaginado).toHaveBeenCalledWith(expect.stringContaining("caixaId=cx-1"));
    const ids = wrapper.findAll("[data-transferencia-id]").map((linha) => linha.attributes("data-transferencia-id"));
    expect(ids).toEqual(["t-1", "t-2"]);
    expect(wrapper.emitted("estado")?.at(-1)).toEqual([{ pendentes: 1, lacreDiferente: false }]);
  });

  it("nao tem botao Conferir na linha: a acao fica no painel unico", async () => {
    const wrapper = montar(true);
    await flushPromises();
    expect(wrapper.find('[data-teste="botao-conferir-transferencia"]').exists()).toBe(false);
  });

  it("so conta como pendente para conferir quem tem a permissao", async () => {
    const sem = montar(false);
    await flushPromises();
    expect(sem.emitted("estado")?.at(-1)).toEqual([{ pendentes: 0, lacreDiferente: false }]);
  });

  it("receberComoDeclarado confirma cada pendente com os valores e o lacre do proprio registro", async () => {
    apiGetPaginado.mockResolvedValue({
      itens: [{ ...itens[0], ehCaixaParaCofre: true, contaDestinoId: "c-cofre", nLacreDoc: "S-9" }, itens[1]],
      total: 2
    });
    const wrapper = montar(true);
    await flushPromises();
    const resultado = await (
      wrapper.vm as unknown as { receberComoDeclarado: () => Promise<string | null> }
    ).receberComoDeclarado();
    expect(resultado).toBeNull();
    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(apiPost).toHaveBeenCalledWith("/api/transferencias/t-2/confirmar", {
      contaDestinoId: "c-cofre",
      nLacreDoc: "S-9",
      valorRecebido: 180,
      valorEspecieContado: 150,
      valorMoedasContado: 30
    });
  });

  it("receberComoDeclarado para no primeiro erro e devolve a mensagem do servidor", async () => {
    apiPost.mockRejectedValueOnce(new Error("Lacre nao confere"));
    const wrapper = montar(true);
    await flushPromises();
    const resultado = await (
      wrapper.vm as unknown as { receberComoDeclarado: () => Promise<string | null> }
    ).receberComoDeclarado();
    expect(resultado).toContain("Lacre não confere");
  });

  it("avisa o painel quando o lacre de fechamento difere do reservado", async () => {
    apiGetPaginado.mockResolvedValue({
      itens: [
        {
          ...itens[1],
          lacres: [{ tipo: "fechamento", numero: "F-1001", situacao: "usado", usadoEmTransferenciaId: null }]
        }
      ],
      total: 1
    });
    const wrapper = montar(false, "F-9999");
    await flushPromises();
    expect(wrapper.emitted("estado")?.at(-1)).toEqual([{ pendentes: 0, lacreDiferente: true }]);
  });

  describe("fatos do caixa", () => {
    const comLacres = [
      {
        ...itens[1],
        lacres: [
          { tipo: "abertura", numero: "A-1001", situacao: "usado", usadoEmTransferenciaId: null },
          { tipo: "fechamento", numero: "F-1001", situacao: "usado", usadoEmTransferenciaId: null },
          { tipo: "sangria", numero: "S-1", situacao: "conferida", usadoEmTransferenciaId: "t-3" },
          { tipo: "sangria", numero: "S-2", situacao: "disponivel", usadoEmTransferenciaId: null }
        ]
      },
      { ...itens[0], id: "t-3", valorOriginal: "120.00", nLacreDoc: "S-1", criadoEm: "2026-10-27T15:00:00.000Z" },
      itens[0]
    ];

    it("conta as sangrias, soma o valor e resume as bolsas do malote", async () => {
      apiGetPaginado.mockResolvedValue({ itens: comLacres, total: 3 });
      const wrapper = montar(false, "F-1001");
      await flushPromises();
      expect(wrapper.get('[data-teste="fato-sangrias"]').text()).toContain("1");
      expect(wrapper.get('[data-teste="fato-sangrias"]').text()).toContain("120,00");
      expect(wrapper.get('[data-teste="fato-bolsas"]').text()).toContain("2 bolsas");
    });

    it("o lacre de fechamento confere com o reservado, ou aparece como diferente", async () => {
      apiGetPaginado.mockResolvedValue({ itens: comLacres, total: 3 });
      const confere = montar(false, "F-1001");
      await flushPromises();
      expect(confere.get('[data-teste="fato-fechamento"]').attributes("data-estado")).toBe("confere");

      const diferente = montar(false, "F-9999");
      await flushPromises();
      expect(diferente.get('[data-teste="fato-fechamento"]').attributes("data-estado")).toBe("diferente");
      expect(diferente.get('[data-teste="fato-fechamento"]').text()).toContain("F-1001");
    });

    it("o retorno final aparece lacrado com o lacre de fechamento, e a sangria com o proprio lacre", async () => {
      apiGetPaginado.mockResolvedValue({ itens: comLacres, total: 3 });
      const wrapper = montar(false, "F-1001");
      await flushPromises();
      expect(wrapper.get('[data-transferencia-id="t-3"]').text()).toContain("Sangria");
      expect(wrapper.get('[data-transferencia-id="t-2"]').text()).toContain("Retorno final");
      expect(wrapper.get('[data-transferencia-id="t-2"]').text()).toContain("Lacre de fechamento F-1001");
    });
  });

  it("avisa quando ha mais transferencias do que as mostradas, para nao subcontar sangrias", async () => {
    apiGetPaginado.mockResolvedValue({ itens, total: 51 });
    const wrapper = montar(false);
    await flushPromises();
    expect(wrapper.get('[data-teste="aviso-truncada"]').text()).toContain("2 de 51");
  });

  it("resposta antiga nao sobrescreve a do caixa atual", async () => {
    let liberarAntiga: (valor: unknown) => void = () => undefined;
    apiGetPaginado.mockReturnValueOnce(new Promise((resolve) => (liberarAntiga = resolve)));
    const wrapper = montar(true);
    apiGetPaginado.mockResolvedValueOnce({ itens: [itens[1]], total: 1 });
    await wrapper.setProps({ caixaId: "cx-2" });
    await flushPromises();
    liberarAntiga({ itens, total: 2 });
    await flushPromises();
    expect(
      wrapper.findAll("[data-transferencia-id]").map((linha) => linha.attributes("data-transferencia-id"))
    ).toEqual(["t-1"]);
  });
});
